import type {
  AssignmentStatement,
  Chunk,
  Expression,
  FunctionExpression,
  FunctionStatement,
  Identifier,
  LastStatement,
  LocalFunctionStatement,
  LocalStatement,
  MacroTier,
  Param,
  Statement,
} from "../ast/types.js";
import { lex } from "../lexer/Lexer.js";
import type { SourceComment } from "../lexer/Lexer.js";
import { parseWithErrors } from "../parser/Parser.js";
import type { Token } from "../tokens.js";

export interface MacroScanResult {
  turbos: string[];
  maximums: string[];
  /** Tagged functions that need the nested/native bridge extractor (all depths). */
  nestedTurbos: number;
  warnings: string[];
}

interface DirectiveHit {
  tier: MacroTier;
  line: number;
}

interface DirectiveLookup {
  present: boolean;
  conflict: boolean;
  tier: MacroTier | null;
  line: number | null;
}

interface FunctionSite {
  node: FunctionStatement | LocalFunctionStatement | FunctionExpression;
  name: string | null;
  topLevel: boolean;
  ownerLine: number;
}

function directiveTier(comment: SourceComment): MacroTier | null {
  if (comment.long) return null;
  const body = comment.text.startsWith("--") ? comment.text.slice(2) : comment.text;
  const match = /^@quantum\s*:\s*(turbo|maximum)\b/i.exec(body.trim());
  return match ? (match[1]!.toLowerCase() as MacroTier) : null;
}

export function applyFunctionMacroTiers(
  code: string,
  ast: Chunk,
  comments: SourceComment[],
  tokens: Token[],
  onWarning?: (message: string) => void,
): MacroScanResult {
  const warnings: string[] = [];
  const turbos: string[] = [];
  const maximums: string[] = [];
  let nestedTurbos = 0;
  const report = (message: string) => {
    warnings.push(message);
    onWarning?.(message);
  };

  const sourceLines = code.split(/\r?\n/);
  const codeLines = new Set<number>();
  for (const token of tokens) {
    if (token.type !== "EOF") codeLines.add(token.loc.start.line);
  }

  const directiveLines = new Map<number, DirectiveHit[]>();
  for (const comment of comments) {
    if (comment.long) continue;
    const line = comment.loc.start.line;
    const before = (sourceLines[line - 1] ?? "").slice(0, Math.max(0, comment.loc.start.column - 1));
    if (before.trim().length > 0) continue;
    if (codeLines.has(line)) continue;
    const tier = directiveTier(comment);
    if (!tier) continue;
    const hits = directiveLines.get(line) ?? [];
    hits.push({ tier, line });
    directiveLines.set(line, hits);
  }

  const lookup = (line: number): DirectiveLookup => {
    let present = false;
    let nearest: DirectiveHit | null = null;
    const tiers = new Set<MacroTier>();
    for (let current = line - 1; current >= 1; current--) {
      if (codeLines.has(current)) break;
      const hits = directiveLines.get(current);
      if (!hits) continue;
      present = true;
      for (const hit of hits) {
        tiers.add(hit.tier);
        if (!nearest) nearest = hit;
      }
    }
    if (!present) return { present: false, conflict: false, tier: null, line: null };
    if (tiers.size > 1) {
      return { present: true, conflict: true, tier: null, line: nearest?.line ?? null };
    }
    return { present: true, conflict: false, tier: nearest!.tier, line: nearest!.line };
  };

  const sites: FunctionSite[] = [];
  const siteNodes = new Set<object>();
  const supportedTopLevelLines = new Set<number>();
  const addSite = (
    node: FunctionStatement | LocalFunctionStatement | FunctionExpression,
    name: string | null,
    topLevel: boolean,
    ownerLine: number,
  ) => {
    if (siteNodes.has(node)) return;
    siteNodes.add(node);
    sites.push({ node, name, topLevel, ownerLine });
    if (topLevel) supportedTopLevelLines.add(ownerLine);
  };

  const visitNode = (node: AnyNode, topLevel: boolean): void => {
    switch (node.type) {
      case "FunctionStatement": {
        const stmt = node as unknown as FunctionStatement;
        const named =
          stmt.name.base.type === "Identifier" && !stmt.name.method
            ? (stmt.name.base as Identifier).name
            : null;
        addSite(stmt, named, topLevel, stmt.loc.start.line);
        for (const child of stmt.body) visitNode(child as unknown as AnyNode, false);
        return;
      }
      case "LocalFunctionStatement": {
        const stmt = node as unknown as LocalFunctionStatement;
        addSite(stmt, stmt.name, topLevel, stmt.loc.start.line);
        for (const child of stmt.body) visitNode(child as unknown as AnyNode, false);
        return;
      }
      case "LocalStatement": {
        const stmt = node as unknown as LocalStatement;
        if (
          topLevel &&
          stmt.vars.length === 1 &&
          stmt.values?.length === 1 &&
          stmt.values[0]!.type === "FunctionExpression"
        ) {
          const fn = stmt.values[0] as FunctionExpression;
          addSite(fn, stmt.vars[0]!.name, true, stmt.loc.start.line);
          for (const child of fn.body) visitNode(child as unknown as AnyNode, false);
          return;
        }
        for (const value of stmt.values ?? []) visitNode(value as unknown as AnyNode, false);
        return;
      }
      case "AssignmentStatement": {
        const stmt = node as unknown as AssignmentStatement;
        const target = stmt.vars[0];
        if (
          topLevel &&
          stmt.vars.length === 1 &&
          stmt.values.length === 1 &&
          target?.type === "Identifier" &&
          stmt.values[0]!.type === "FunctionExpression"
        ) {
          const fn = stmt.values[0] as FunctionExpression;
          addSite(fn, target.name, true, stmt.loc.start.line);
          for (const child of fn.body) visitNode(child as unknown as AnyNode, false);
          return;
        }
        for (const value of stmt.values) visitNode(value as unknown as AnyNode, false);
        return;
      }
      case "FunctionExpression": {
        const fn = node as unknown as FunctionExpression;
        addSite(fn, null, topLevel, fn.loc.start.line);
        for (const child of fn.body) visitNode(child as unknown as AnyNode, false);
        return;
      }
      default:
        forEachChild(node, (child) => visitNode(child, false));
    }
  };

  for (const stmt of ast.body) visitNode(stmt as unknown as AnyNode, true);

  for (const site of sites) {
    const found = lookup(site.node.loc.start.line);
    if (!found.present) continue;
    const label = site.name ? `'${site.name}'` : "this function";
    if (found.conflict) {
      report(
        `--@quantum: conflicting tier comments before ${label} at line ${site.node.loc.start.line}; directive ignored`,
      );
      continue;
    }
    const tier = found.tier!;
    const isMethod =
      site.node.type === "FunctionStatement" &&
      ((site.node as FunctionStatement).name.method !== undefined ||
        (site.node as FunctionStatement).name.base.type !== "Identifier");
    if (tier === "turbo") {
      if (site.topLevel && !isMethod && site.name) {
        site.node.tier = tier;
        turbos.push(site.name);
      } else {
        site.node.tier = tier;
        nestedTurbos++;
        supportedTopLevelLines.add(site.node.loc.start.line);
      }
      continue;
    }
    if (!site.topLevel) {
      report(
        `--@quantum:${tier} (line ${found.line}): nested ${label} is not supported; stays in the VM`,
      );
      continue;
    }
    if (isMethod || !site.name) {
      report(
        `--@quantum:${tier} (line ${found.line}): table/method functions are not supported; stays in the VM`,
      );
      continue;
    }
    site.node.tier = tier;
    maximums.push(site.name);
  }

  for (const stmt of ast.body) {
    if (supportedTopLevelLines.has(stmt.loc.start.line)) continue;
    const found = lookup(stmt.loc.start.line);
    if (!found.present) continue;
    if (found.conflict) {
      report(`--@quantum: conflicting tier comments before line ${stmt.loc.start.line}; directive ignored`);
    } else {
      report(
        `--@quantum:${found.tier} (line ${found.line}): only a top-level function declaration can be tagged; directive ignored`,
      );
    }
  }

  return { turbos, maximums, nestedTurbos, warnings };
}

export function scanFunctionMacros(
  code: string,
  onWarning?: (message: string) => void,
): MacroScanResult {
  const lexed = lex(code);
  const parsed = parseWithErrors(lexed.tokens);
  return applyFunctionMacroTiers(code, parsed.ast, lexed.comments, lexed.tokens, onWarning);
}

export type Mangler = (sourceName: string, index: number) => string;

export function makeSeedMangler(seed: number | string, prefix: string = "qmv"): Mangler {
  let h = 0;
  if (typeof seed === "number") {
    h = seed | 0;
  } else {
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const base = (Math.abs(h) >>> 0).toString(36);
  return (_source, index) => `__${prefix}_${base}_${index.toString(36)}`;
}

export interface ExtractedFunction {
  source: string;
  mangled: string;
}

export interface NativeExtraction {
  ast: Chunk;
  prefixStatements: Statement[];
  extracted: ExtractedFunction[];
  vetoed: { name: string; reason: string }[];
  warnings: string[];
}

type AnyNode = { type: string; [key: string]: unknown };

function isNode(value: unknown): value is AnyNode {
  return !!value && typeof value === "object" && typeof (value as AnyNode).type === "string";
}

function forEachChild(node: AnyNode, cb: (child: AnyNode) => void): void {
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "type") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!item || typeof item !== "object") continue;
        if (isNode(item)) cb(item);
        else forEachChild(item as AnyNode, cb);
      }
    } else if (isNode(value)) {
      cb(value);
    }
  }
}

export function isShadowed(name: string, scopes: Set<string>[]): boolean {
  for (const s of scopes) if (s.has(name)) return true;
  return false;
}

type IdHandler = (id: Identifier, scopes: Set<string>[]) => void;

export function paramNames(params: Param[]): Set<string> {
  const s = new Set<string>();
  for (const p of params) s.add(p.name);
  return s;
}

// `function obj:method(...)` has an implicit `self` parameter that is not
// present in `params`. Every scope analysis must treat it as a local, or a
// nested method's `self` leaks out to an outer binding and gets rewritten by
// the local renamer.
export function functionScopeNames(node: FunctionStatement): Set<string> {
  const s = paramNames(node.params ?? []);
  if (node.name?.method) s.add("self");
  return s;
}

function walkBlock(body: (Statement | LastStatement)[], scopes: Set<string>[], onId: IdHandler): void {
  for (const stmt of body) walkStatement(stmt, scopes, onId);
}

function walkStatement(node: Statement | LastStatement | Expression, scopes: Set<string>[], onId: IdHandler): void {
  switch (node.type) {
    case "DoStatement":
      walkBlock(node.body, [...scopes, new Set<string>()], onId);
      return;
    case "WhileStatement":
      walkExpression(node.condition, scopes, onId);
      walkBlock(node.body, [...scopes, new Set<string>()], onId);
      return;
    case "RepeatStatement": {
      const inner = [...scopes, new Set<string>()];
      walkBlock(node.body, inner, onId);
      walkExpression(node.condition, inner, onId);
      return;
    }
    case "IfStatement": {
      walkExpression(node.condition, scopes, onId);
      walkBlock(node.thenBody, [...scopes, new Set<string>()], onId);
      for (const clause of node.elseifClauses) {
        walkExpression(clause.condition, scopes, onId);
        walkBlock(clause.body, [...scopes, new Set<string>()], onId);
      }
      if (node.elseBody) walkBlock(node.elseBody, [...scopes, new Set<string>()], onId);
      return;
    }
    case "ForNumericStatement":
      walkExpression(node.start, scopes, onId);
      walkExpression(node.end, scopes, onId);
      if (node.step) walkExpression(node.step, scopes, onId);
      walkBlock(node.body, [...scopes, new Set([node.var.name])], onId);
      return;
    case "ForInStatement": {
      for (const e of node.iter) walkExpression(e, scopes, onId);
      const frame = new Set<string>();
      for (const v of node.vars) frame.add(v.name);
      walkBlock(node.body, [...scopes, frame], onId);
      return;
    }
    case "FunctionStatement":
      walkExpression(node.name.base as Expression, scopes, onId);
      walkBlock(node.body, [...scopes, functionScopeNames(node)], onId);
      return;
    case "LocalFunctionStatement": {
      const frame = paramNames(node.params);
      frame.add(node.name);
      walkBlock(node.body, [...scopes, frame], onId);
      scopes[scopes.length - 1]!.add(node.name);
      return;
    }
    case "LocalStatement": {
      if (node.values) for (const v of node.values) walkExpression(v, scopes, onId);
      const frame = scopes[scopes.length - 1]!;
      for (const v of node.vars) frame.add(v.name);
      return;
    }
    case "AssignmentStatement":
      for (const v of node.vars) walkExpression(v, scopes, onId);
      for (const v of node.values) walkExpression(v, scopes, onId);
      return;
    case "CompoundAssignmentStatement":
      walkExpression(node.var, scopes, onId);
      walkExpression(node.value, scopes, onId);
      return;
    case "FunctionCallStatement":
      walkExpression(node.call, scopes, onId);
      return;
    case "ReturnStatement":
      if (node.values) for (const v of node.values) walkExpression(v, scopes, onId);
      return;
    case "BreakStatement":
    case "ContinueStatement":
      return;
    case "FunctionExpression":
      walkBlock(node.body, [...scopes, paramNames(node.params)], onId);
      return;
    default:
      if (node.type === "Identifier") {
        onId(node as Identifier, scopes);
        return;
      }
      forEachChild(node as unknown as AnyNode, (child) => walkStatement(child as unknown as Statement, scopes, onId));
      return;
  }
}

function walkExpression(expr: Expression, scopes: Set<string>[], onId: IdHandler): void {
  walkStatement(expr as unknown as Statement, scopes, onId);
}

export function freeVariables(fn: FunctionExpression): Set<string> {
  const free = new Set<string>();
  walkBlock(fn.body, [paramNames(fn.params)], (id, scopes) => {
    if (!isShadowed(id.name, scopes)) free.add(id.name);
  });
  return free;
}

interface RawCandidate {
  name: string;
  fn: FunctionExpression;
  index: number;
  loc: Chunk["loc"];
}

function candidateFor(stmt: Statement, names: Set<string>): RawCandidate | null {
  if (stmt.type === "LocalFunctionStatement") {
    const s = stmt as LocalFunctionStatement;
    if (!names.has(s.name)) return null;
    return {
      name: s.name,
      index: -1,
      loc: s.loc,
      fn: {
        type: "FunctionExpression",
        loc: s.loc,
        params: s.params,
        body: s.body,
        ...(s.attributes ? { attributes: s.attributes } : {}),
        ...(s.generics ? { generics: s.generics } : {}),
        ...(s.returnType ? { returnType: s.returnType } : {}),
      } as FunctionExpression,
    };
  }
  if (stmt.type === "FunctionStatement") {
    const base = stmt.name.base;
    if (base.type !== "Identifier") return null;
    if (!names.has(base.name)) return null;
    return {
      name: base.name,
      index: -1,
      loc: stmt.loc,
      fn: {
        type: "FunctionExpression",
        loc: stmt.loc,
        params: stmt.params,
        body: stmt.body,
        ...(stmt.attributes ? { attributes: stmt.attributes } : {}),
        ...(stmt.generics ? { generics: stmt.generics } : {}),
        ...(stmt.returnType ? { returnType: stmt.returnType } : {}),
      } as FunctionExpression,
    };
  }
  if (stmt.type === "LocalStatement") {
    const s = stmt as LocalStatement;
    if (s.vars.length !== 1 || s.values?.length !== 1) return null;
    if (!names.has(s.vars[0]!.name)) return null;
    const value = s.values[0]!;
    if (value.type !== "FunctionExpression") return null;
    return { name: s.vars[0]!.name, index: -1, loc: s.loc, fn: value };
  }
  if (stmt.type === "AssignmentStatement") {
    const s = stmt as AssignmentStatement;
    if (s.vars.length !== 1 || s.values.length !== 1) return null;
    const target = s.vars[0]!;
    if (target.type !== "Identifier") return null;
    if (!names.has(target.name)) return null;
    const value = s.values[0]!;
    if (value.type !== "FunctionExpression") return null;
    return { name: target.name, index: -1, loc: s.loc, fn: value };
  }
  return null;
}

export function extractNativeFunctions(
  ast: Chunk,
  names: Iterable<string>,
  mangle: Mangler,
  onWarning?: (message: string) => void,
): NativeExtraction {
  const wanted = new Set(names);
  const warnings: string[] = [];
  const vetoed: { name: string; reason: string }[] = [];
  const warn = (msg: string) => {
    warnings.push(msg);
    onWarning?.(msg);
  };

  if (wanted.size === 0) {
    return { ast, prefixStatements: [], extracted: [], vetoed: [], warnings };
  }

  const raw: RawCandidate[] = [];
  const occurrenceCount = new Map<string, number>();
  for (let i = 0; i < ast.body.length; i++) {
    const stmt = ast.body[i]!;
    const c = candidateFor(stmt as Statement, wanted);
    if (c) {
      c.index = i;
      raw.push(c);
      occurrenceCount.set(c.name, (occurrenceCount.get(c.name) ?? 0) + 1);
    }
    if (stmt.type === "FunctionStatement" && stmt.name.base.type !== "Identifier" && stmt.tier !== "turbo") {
      let leftmost: string | null = null;
      let base: unknown = stmt.name.base;
      while (isNode(base) && base.type === "MemberExpression") base = (base as unknown as { object: unknown }).object;
      if (isNode(base) && base.type === "Identifier") leftmost = (base as unknown as Identifier).name;
      if (leftmost && wanted.has(leftmost) && !occurrenceCount.has(`dotted:${leftmost}`)) {
        occurrenceCount.set(`dotted:${leftmost}`, 1);
        warn(`native macro: '${leftmost}.…' is a table/method function and stays in the VM`);
      }
    }
  }

  const duplicates = new Set<string>();
  for (const [name, count] of occurrenceCount) {
    if (!name.startsWith("dotted:") && count > 1) duplicates.add(name);
  }
  for (const name of duplicates) {
    warn(`native macro: '${name}' is declared more than once and stays in the VM`);
  }

  const eligible = raw.filter((c) => !duplicates.has(c.name));

  const outerLocals = new Set<string>();
  const localSnapshots = new Map<number, Set<string>>();
  for (let i = 0; i < ast.body.length; i++) {
    localSnapshots.set(i, new Set(outerLocals));
    const stmt = ast.body[i]!;
    if (stmt.type === "LocalStatement") {
      for (const v of (stmt as LocalStatement).vars) outerLocals.add(v.name);
    } else if (stmt.type === "LocalFunctionStatement") {
      outerLocals.add((stmt as LocalFunctionStatement).name);
    }
  }

  let extractedNames = new Set(eligible.map((c) => c.name));
  const vetoes = new Map<string, string>();
  for (let round = 0; round < eligible.length + 1; round++) {
    let changed = false;
    for (const c of eligible) {
      if (vetoes.has(c.name)) continue;
      const snapshot = localSnapshots.get(c.index)!;
      const free = freeVariables(c.fn);
      const captured: string[] = [];
      for (const f of free) {
        if (f === c.name) continue;
        if (extractedNames.has(f)) continue;
        if (snapshot.has(f)) captured.push(f);
      }
      if (captured.length > 0) {
        const reason = `captures outer local(s): ${captured.sort().join(", ")}`;
        vetoes.set(c.name, reason);
        vetoed.push({ name: c.name, reason });
        extractedNames = new Set([...extractedNames].filter((n) => n !== c.name));
        warn(`native macro: '${c.name}' ${reason}; stays in the VM`);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const extractedCandidates = eligible.filter((c) => !vetoes.has(c.name));
  if (extractedCandidates.length === 0) {
    return { ast, prefixStatements: [], extracted: [], vetoed, warnings };
  }

  const targets = new Map<string, string>();
  extractedCandidates.forEach((c, idx) => targets.set(c.name, mangle(c.name, idx)));

  const extractedSet = new Set(extractedCandidates.map((c) => c.name));
  const bound = new Set<string>();
  const topFrame = new Set<string>();
  const prefixStatements: Statement[] = [];
  const extracted: ExtractedFunction[] = [];

  const renameIds = (node: Statement | LastStatement, scopes: Set<string>[], active: Set<string>) => {
    walkStatement(node, scopes, (id, scopesAt) => {
      if (!active.has(id.name)) return;
      if (isShadowed(id.name, scopesAt)) return;
      id.name = targets.get(id.name)!;
    });
  };

  const newBody: (Statement | LastStatement)[] = [];
  for (let i = 0; i < ast.body.length; i++) {
    const stmt = ast.body[i]!;
    const candidate = candidateFor(stmt as Statement, wanted);
    if (candidate && extractedSet.has(candidate.name)) {
      const mangled = targets.get(candidate.name)!;
      const selfActive = new Set(bound);
      selfActive.add(candidate.name);
      const scopes = [paramNames(candidate.fn.params)];
      walkStatement(candidate.fn as unknown as Statement, scopes, (id, scopesAt) => {
        if (!selfActive.has(id.name)) return;
        if (isShadowed(id.name, scopesAt)) return;
        id.name = targets.get(id.name)!;
      });
      const varNode: Identifier = { type: "Identifier", name: mangled, loc: candidate.loc };
      prefixStatements.push({
        type: "AssignmentStatement",
        loc: candidate.loc,
        vars: [varNode],
        values: [candidate.fn],
      } as AssignmentStatement);
      extracted.push({ source: candidate.name, mangled });
      bound.add(candidate.name);
      continue;
    }
    renameIds(stmt as Statement, [topFrame], bound);
    newBody.push(stmt);
  }

  return {
    ast: { type: "Chunk", loc: ast.loc, body: newBody },
    prefixStatements,
    extracted,
    vetoed,
    warnings,
  };
}

export interface NestedNativeExtraction {
  ast: Chunk;
  prefixStatements: Statement[];
  extracted: ExtractedFunction[];
  warnings: string[];
}

interface NestedCandidate {
  node: FunctionStatement | LocalFunctionStatement | FunctionExpression;
  fn: FunctionExpression;
  name: string | null;
  isMethod: boolean;
  outerLocals: Set<string>;
}

interface CaptureBridge {
  getter: string;
  setter: string;
}

function functionExpressionFor(
  node: FunctionStatement | LocalFunctionStatement | FunctionExpression,
): FunctionExpression {
  if (node.type === "FunctionExpression") return node;
  return {
    type: "FunctionExpression",
    loc: node.loc,
    params: node.params,
    body: node.body,
    ...(node.attributes ? { attributes: node.attributes } : {}),
    ...(node.generics ? { generics: node.generics } : {}),
    ...(node.returnType ? { returnType: node.returnType } : {}),
  } as FunctionExpression;
}

function methodFunction(node: FunctionStatement): boolean {
  return node.name.method !== undefined || node.name.base.type !== "Identifier";
}

function funcPath(node: FunctionStatement): string {
  const base = node.name.base;
  let path = base.type === "Identifier" ? base.name : "";
  if (base.type === "MemberExpression") {
    const parts: string[] = [];
    let current: unknown = base;
    while (isNode(current) && current.type === "MemberExpression") {
      parts.unshift(String((current as unknown as { property: string }).property));
      current = (current as unknown as { object: unknown }).object;
    }
    if (isNode(current) && current.type === "Identifier") {
      path = [String((current as unknown as Identifier).name), ...parts].join(".");
    }
  }
  if (node.name.method) path += `:${node.name.method}`;
  return path;
}

function localFrameNames(params: Param[], self: boolean): Set<string> {
  const names = paramNames(params);
  if (self) names.add("self");
  return names;
}

function collectNestedCandidates(ast: Chunk): NestedCandidate[] {
  const candidates: NestedCandidate[] = [];

  const visitExpression = (
    node: AnyNode,
    scope: Set<string>,
    topLevel: boolean,
    insideTagged: boolean,
  ): void => {
    if (node.type === "FunctionExpression") {
      const fn = node as unknown as FunctionExpression;
      if (!insideTagged && fn.tier === "turbo") {
        if (!topLevel) {
          candidates.push({
            node: fn,
            fn,
            name: null,
            isMethod: false,
            outerLocals: new Set(scope),
          });
          return;
        }
      }
      const names = new Set(scope);
      for (const name of paramNames(fn.params)) names.add(name);
      scanBlock(fn.body, names, false, insideTagged || (fn.tier === "turbo" && !topLevel));
      return;
    }
    forEachChild(node, (child) => visitExpression(child, scope, false, insideTagged));
  };

  const scanBlock = (
    body: (Statement | LastStatement)[],
    inherited: Set<string>,
    topLevel: boolean,
    insideTagged: boolean,
  ): Set<string> => {
    const scope = new Set(inherited);
    for (const stmt of body) visitStatement(stmt as unknown as AnyNode, scope, topLevel, insideTagged);
    return scope;
  };

  const visitFunctionCandidate = (
    node: FunctionStatement | LocalFunctionStatement | FunctionExpression,
    scope: Set<string>,
    topLevel: boolean,
    insideTagged: boolean,
  ): boolean => {
    const isMethod = node.type === "FunctionStatement" && methodFunction(node);
    const topLevelDeclaration = topLevel && !(node.type === "FunctionStatement" && isMethod);
    if (!insideTagged && node.tier === "turbo" && !topLevelDeclaration) {
      const fn = functionExpressionFor(node);
      const ownName = node.type === "LocalFunctionStatement" ? node.name : null;
      const outerLocals = new Set(scope);
      if (ownName) outerLocals.add(ownName);
      let name: string | null = null;
      if (node.type === "LocalFunctionStatement") name = node.name;
      else if (node.type === "FunctionStatement") name = funcPath(node);
      candidates.push({
        node,
        fn,
        name,
        isMethod,
        outerLocals,
      });
      return true;
    }
    return false;
  };

  const visitStatement = (
    stmt: AnyNode,
    scope: Set<string>,
    topLevel: boolean,
    insideTagged: boolean,
  ): void => {
    switch (stmt.type) {
      case "LocalStatement": {
        const local = stmt as unknown as LocalStatement;
        const onlyNamedDeclaration =
          topLevel &&
          local.vars.length === 1 &&
          local.values?.length === 1 &&
          local.values[0]!.type === "FunctionExpression";
        for (const value of local.values ?? []) {
          visitExpression(value as unknown as AnyNode, scope, onlyNamedDeclaration, insideTagged);
        }
        for (const v of local.vars) scope.add(v.name);
        return;
      }
      case "AssignmentStatement": {
        const assignment = stmt as unknown as AssignmentStatement;
        const onlyNamedDeclaration =
          topLevel &&
          assignment.vars.length === 1 &&
          assignment.values.length === 1 &&
          assignment.vars[0]!.type === "Identifier" &&
          assignment.values[0]!.type === "FunctionExpression";
        for (const value of assignment.values) {
          visitExpression(value as unknown as AnyNode, scope, onlyNamedDeclaration, insideTagged);
        }
        for (const v of assignment.vars) {
          if (!(v.type === "Identifier")) visitExpression(v as unknown as AnyNode, scope, false, insideTagged);
        }
        return;
      }
      case "CompoundAssignmentStatement": {
        const compound = stmt as AnyNode;
        visitExpression(compound.var as AnyNode, scope, false, insideTagged);
        visitExpression(compound.value as AnyNode, scope, false, insideTagged);
        return;
      }
      case "FunctionCallStatement":
        visitExpression((stmt as AnyNode).call as AnyNode, scope, false, insideTagged);
        return;
      case "ReturnStatement": {
        for (const value of ((stmt as AnyNode).values ?? []) as AnyNode[]) {
          visitExpression(value, scope, false, insideTagged);
        }
        return;
      }
      case "LocalFunctionStatement": {
        const fn = stmt as unknown as LocalFunctionStatement;
        const added = visitFunctionCandidate(fn, scope, topLevel, insideTagged);
        scope.add(fn.name);
        if (added) return;
        const names = new Set(scope);
        for (const name of paramNames(fn.params)) names.add(name);
        names.add(fn.name);
        scanBlock(fn.body, names, false, insideTagged);
        return;
      }
      case "FunctionStatement": {
        const fn = stmt as unknown as FunctionStatement;
        const added = visitFunctionCandidate(fn, scope, topLevel, insideTagged);
        if (added) return;
        if (fn.name.base.type === "MemberExpression") {
          visitExpression(fn.name.base.object as unknown as AnyNode, scope, false, insideTagged);
        }
        const names = new Set(scope);
        for (const name of paramNames(fn.params)) names.add(name);
        if (fn.name.method) names.add("self");
        scanBlock(fn.body, names, false, insideTagged);
        return;
      }
      case "FunctionExpression":
        visitExpression(stmt, scope, false, insideTagged);
        return;
      case "DoStatement":
        scanBlock((stmt as AnyNode).body as (Statement | LastStatement)[], scope, false, insideTagged);
        return;
      case "WhileStatement":
        visitExpression((stmt as AnyNode).condition as AnyNode, scope, false, insideTagged);
        scanBlock((stmt as AnyNode).body as (Statement | LastStatement)[], scope, false, insideTagged);
        return;
      case "RepeatStatement": {
        const inner = scanBlock(
          (stmt as AnyNode).body as (Statement | LastStatement)[],
          scope,
          false,
          insideTagged,
        );
        visitExpression((stmt as AnyNode).condition as AnyNode, inner, false, insideTagged);
        return;
      }
      case "IfStatement": {
        const conditional = stmt as AnyNode;
        visitExpression(conditional.condition as AnyNode, scope, false, insideTagged);
        scanBlock(conditional.thenBody as (Statement | LastStatement)[], scope, false, insideTagged);
        for (const clause of (conditional.elseifClauses ?? []) as AnyNode[]) {
          visitExpression(clause.condition as AnyNode, scope, false, insideTagged);
          scanBlock(clause.body as (Statement | LastStatement)[], scope, false, insideTagged);
        }
        if (Array.isArray(conditional.elseBody)) {
          scanBlock(conditional.elseBody as (Statement | LastStatement)[], scope, false, insideTagged);
        }
        return;
      }
      case "ForNumericStatement": {
        const loop = stmt as AnyNode;
        visitExpression(loop.start as AnyNode, scope, false, insideTagged);
        visitExpression(loop.end as AnyNode, scope, false, insideTagged);
        if (loop.step) visitExpression(loop.step as AnyNode, scope, false, insideTagged);
        const inner = new Set(scope);
        inner.add((loop["var"] as Identifier).name);
        scanBlock(loop.body as (Statement | LastStatement)[], inner, false, insideTagged);
        return;
      }
      case "ForInStatement": {
        const loop = stmt as AnyNode;
        for (const value of (loop.iter ?? []) as AnyNode[]) {
          visitExpression(value, scope, false, insideTagged);
        }
        const inner = new Set(scope);
        for (const v of (loop.vars ?? []) as Identifier[]) inner.add(v.name);
        scanBlock(loop.body as (Statement | LastStatement)[], inner, false, insideTagged);
        return;
      }
      default:
        forEachChild(stmt, (child) => {
          if (
            child.type === "FunctionStatement" ||
            child.type === "LocalFunctionStatement" ||
            child.type === "FunctionExpression"
          ) {
            if (child.type === "FunctionExpression") visitExpression(child, scope, false, insideTagged);
            else visitStatement(child, scope, false, insideTagged);
          } else {
            visitExpression(child, scope, false, insideTagged);
          }
        });
        return;
    }
  };

  scanBlock(ast.body, new Set<string>(), true, false);
  return candidates;
}

function cloneParam(name: string, loc: Chunk["loc"]): Param {
  return { type: "Param", name, loc };
}

function bridgeFunction(name: string, loc: Chunk["loc"]): FunctionExpression {
  return {
    type: "FunctionExpression",
    loc,
    params: [],
    body: [
      {
        type: "ReturnStatement",
        loc,
        values: [{ type: "Identifier", name, loc }],
      },
    ],
  };
}

function setterFunction(setterName: string, name: string, loc: Chunk["loc"]): FunctionExpression {
  return {
    type: "FunctionExpression",
    loc,
    params: [cloneParam(setterName, loc)],
    body: [
      {
        type: "AssignmentStatement",
        loc,
        vars: [{ type: "Identifier", name, loc }],
        values: [{ type: "Identifier", name: setterName, loc }],
      },
    ],
  };
}

function nestedSelfName(params: Param[]): string {
  return paramNames(params).has("self") ? "__qmn_self" : "self";
}

export function extractNestedTurboFunctions(
  ast: Chunk,
  mangle: Mangler,
): NestedNativeExtraction {
  const candidates = collectNestedCandidates(ast);
  if (candidates.length === 0) {
    return { ast, prefixStatements: [], extracted: [], warnings: [] };
  }

  const prefixStatements: Statement[] = [];
  const extracted: ExtractedFunction[] = [];

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]!;
    const fnName = candidate.name ?? "nested";
    const mangled = mangle(fnName, index);
    const loc = candidate.node.loc;
    const selfName = candidate.isMethod ? nestedSelfName(candidate.fn.params) : null;
    const free = freeVariables(candidate.fn);
    const captured: string[] = [];
    for (const name of free) {
      if (name === "self" && candidate.isMethod) continue;
      if (candidate.outerLocals.has(name)) captured.push(name);
    }
    captured.sort();

    const bridges = new Map<string, CaptureBridge>();
    const bridgeParams: Param[] = [];
    for (let captureIndex = 0; captureIndex < captured.length; captureIndex++) {
      const name = captured[captureIndex]!;
      const getter = `${mangled}_g${captureIndex.toString(36)}`;
      const setter = `${mangled}_s${captureIndex.toString(36)}`;
      bridges.set(name, { getter, setter });
      bridgeParams.push(cloneParam(getter, loc), cloneParam(setter, loc));
    }

    const bodyScope = localFrameNames(candidate.fn.params, candidate.isMethod);
    const nativeBody = rewriteNestedBlock(candidate.fn.body, [bodyScope], bridges, `${mangled}_t`);
    const nativeParams: Param[] = [...bridgeParams];
    if (selfName) nativeParams.push(cloneParam(selfName, loc));
    nativeParams.push(...candidate.fn.params);

    const nativeFn: FunctionExpression = {
      type: "FunctionExpression",
      loc,
      ...(candidate.fn.attributes ? { attributes: candidate.fn.attributes } : {}),
      ...(candidate.fn.generics ? { generics: candidate.fn.generics } : {}),
      params: nativeParams,
      ...(candidate.fn.returnType ? { returnType: candidate.fn.returnType } : {}),
      body: nativeBody,
    };

    prefixStatements.push({
      type: "AssignmentStatement",
      loc,
      vars: [{ type: "Identifier", name: mangled, loc }],
      values: [nativeFn],
    } as AssignmentStatement);

    const callArgs: Expression[] = [];
    for (const name of captured) {
      const bridge = bridges.get(name)!;
      callArgs.push(bridgeFunction(name, loc));
      callArgs.push(setterFunction(bridge.setter, name, loc));
    }
    if (selfName) {
      callArgs.push({ type: "Identifier", name: selfName, loc });
    }
    for (const param of candidate.fn.params) {
      if (param.variadic || param.name === "...") {
        callArgs.push({ type: "VarargExpression", loc });
      } else {
        callArgs.push({ type: "Identifier", name: param.name, loc });
      }
    }

    candidate.node.body = [
      {
        type: "ReturnStatement",
        loc,
        values: [
          {
            type: "CallExpression",
            loc,
            callee: { type: "Identifier", name: mangled, loc },
            args: callArgs,
          },
        ],
      },
    ];
    extracted.push({ source: fnName, mangled });
  }

  return { ast, prefixStatements, extracted, warnings: [] };
}

function rewriteNestedBlock(
  body: (Statement | LastStatement)[],
  scopes: Set<string>[],
  bridges: Map<string, CaptureBridge>,
  tempPrefix: string,
): (Statement | LastStatement)[] {
  let tempCounter = 0;
  const isCapture = (name: string, at: Set<string>[]): boolean =>
    bridges.has(name) && !isShadowed(name, at);
  const nextTemp = (): string => `${tempPrefix}${(tempCounter++).toString(36)}`;

  const read = (node: AnyNode, at: Set<string>[]): Expression => {
    if (!node) return node as unknown as Expression;
    switch (node.type) {
      case "Identifier": {
        const id = node as unknown as Identifier;
        if (!isCapture(id.name, at)) return id;
        const bridge = bridges.get(id.name)!;
        return {
          type: "CallExpression",
          loc: id.loc,
          callee: { type: "Identifier", name: bridge.getter, loc: id.loc },
          args: [],
        } as Expression;
      }
      case "BinaryExpression":
        return {
          ...(node as AnyNode),
          left: read(node.left as AnyNode, at),
          right: read(node.right as AnyNode, at),
        } as unknown as Expression;
      case "UnaryExpression":
        return {
          ...(node as AnyNode),
          argument: read(node.argument as AnyNode, at),
        } as unknown as Expression;
      case "CallExpression":
        return {
          ...(node as AnyNode),
          callee: read(node.callee as AnyNode, at),
          args: ((node.args ?? []) as AnyNode[]).map((arg) => read(arg, at)),
        } as unknown as Expression;
      case "MethodCallExpression":
        return {
          ...(node as AnyNode),
          object: read(node.object as AnyNode, at),
          args: ((node.args ?? []) as AnyNode[]).map((arg) => read(arg, at)),
        } as unknown as Expression;
      case "IndexExpression":
        return {
          ...(node as AnyNode),
          object: read(node.object as AnyNode, at),
          index: read(node.index as AnyNode, at),
        } as unknown as Expression;
      case "MemberExpression":
        return {
          ...(node as AnyNode),
          object: read(node.object as AnyNode, at),
        } as unknown as Expression;
      case "ParenExpression":
        return { ...(node as AnyNode), expression: read(node.expression as AnyNode, at) } as unknown as Expression;
      case "TypeAssertion":
        return { ...(node as AnyNode), expression: read(node.expression as AnyNode, at) } as unknown as Expression;
      case "IfElseExpression": {
        const inner = { ...(node as AnyNode) };
        inner.condition = read(inner.condition as AnyNode, at);
        inner.thenExp = read(inner.thenExp as AnyNode, at);
        inner.elseExp = read(inner.elseExp as AnyNode, at);
        inner.elseifClauses = ((inner.elseifClauses ?? []) as AnyNode[]).map((clause) => ({
          ...clause,
          condition: read(clause.condition as AnyNode, at),
          value: read(clause.value as AnyNode, at),
        }));
        return inner as unknown as Expression;
      }
      case "TableConstructor": {
        const inner = { ...(node as AnyNode) };
        inner.fields = ((inner.fields ?? []) as AnyNode[]).map((field) => {
          if (field.kind === "index") {
            return { ...field, index: read(field.index as AnyNode, at), value: read(field.value as AnyNode, at) };
          }
          return { ...field, value: read(field.value as AnyNode, at) };
        });
        return inner as unknown as Expression;
      }
      case "FunctionExpression": {
        const fn = node as unknown as FunctionExpression;
        const inner = new Set<string>();
        for (const name of paramNames(fn.params)) inner.add(name);
        return {
          ...(node as AnyNode),
          body: rewriteNestedBlock(fn.body, [...at, inner], bridges, tempPrefix),
        } as unknown as Expression;
      }
      case "StringInterpolation": {
        const inner = { ...(node as AnyNode) };
        inner.parts = ((inner.parts ?? []) as unknown[]).map((part) =>
          typeof part === "string" ? part : read(part as AnyNode, at),
        );
        return inner as unknown as Expression;
      }
      default:
        return node as unknown as Expression;
    }
  };

  const rewriteTarget = (target: AnyNode, at: Set<string>[]): AnyNode => {
    if (target.type === "Identifier") return target;
    return read(target, at) as unknown as AnyNode;
  };

  const rewriteStatements = (node: AnyNode, at: Set<string>[]): (Statement | LastStatement)[] => {
    switch (node.type) {
      case "LocalStatement": {
        const stmt = node as unknown as LocalStatement;
        const values = (stmt.values ?? []).map((value) => read(value as unknown as AnyNode, at));
        const result = { ...stmt, values } as LocalStatement;
        for (const v of stmt.vars) at[at.length - 1]!.add(v.name);
        return [result];
      }
      case "LocalFunctionStatement": {
        const stmt = node as unknown as LocalFunctionStatement;
        at[at.length - 1]!.add(stmt.name);
        const inner = new Set<string>(paramNames(stmt.params));
        inner.add(stmt.name);
        const result = {
          ...stmt,
          body: rewriteNestedBlock(stmt.body, [...at, inner], bridges, tempPrefix),
        } as LocalFunctionStatement;
        return [result];
      }
      case "FunctionStatement": {
        const stmt = node as unknown as FunctionStatement;
        const inner = new Set<string>(paramNames(stmt.params));
        if (stmt.name.method) inner.add("self");
        const rewrittenBody = rewriteNestedBlock(stmt.body, [...at, inner], bridges, tempPrefix);
        const root = leftmostIdentifier(stmt.name.base);
        if (root && isCapture(root.name, at)) {
          const params = [...stmt.params];
          if (stmt.name.method) params.unshift(cloneParam("self", stmt.loc));
          const fnValue: FunctionExpression = {
            type: "FunctionExpression",
            loc: stmt.loc,
            params,
            body: rewrittenBody,
          };
          if (stmt.name.base.type === "Identifier" && !stmt.name.method) {
            return [
              {
                type: "FunctionCallStatement",
                loc: stmt.loc,
                call: {
                  type: "CallExpression",
                  loc: stmt.loc,
                  callee: {
                    type: "Identifier",
                    name: bridges.get(root.name)!.setter,
                    loc: stmt.loc,
                  },
                  args: [fnValue],
                },
              } as Statement,
            ];
          }
          const target = read(stmt.name.base as unknown as AnyNode, at);
          const memberTarget: AnyNode = stmt.name.method
            ? {
                type: "MemberExpression",
                loc: stmt.loc,
                object: target,
                property: stmt.name.method,
              }
            : (target as unknown as AnyNode);
          return [
            {
              type: "AssignmentStatement",
              loc: stmt.loc,
              vars: [memberTarget],
              values: [fnValue],
            } as unknown as AssignmentStatement,
          ];
        }
        return [{ ...stmt, body: rewrittenBody } as FunctionStatement];
      }
      case "AssignmentStatement": {
        const stmt = node as unknown as AssignmentStatement;
        const targets = stmt.vars.map((v) => rewriteTarget(v as unknown as AnyNode, at));
        const values = stmt.values.map((value) => read(value as unknown as AnyNode, at));
        const capturedTargets = stmt.vars.map((v, i) => {
          if (v.type !== "Identifier") return null;
          if (!isCapture(v.name, at)) return null;
          return { index: i, bridge: bridges.get(v.name)! };
        });
        if (capturedTargets.every((x) => x === null)) {
          return [{ ...stmt, vars: targets as never, values } as AssignmentStatement];
        }
        if (stmt.vars.length === 1 && capturedTargets[0]) {
          return [
            {
              type: "FunctionCallStatement",
              loc: stmt.loc,
              call: {
                type: "CallExpression",
                loc: stmt.loc,
                callee: {
                  type: "Identifier",
                  name: capturedTargets[0].bridge.setter,
                  loc: stmt.loc,
                },
                args: values,
              },
            } as Statement,
          ];
        }
        const temps = stmt.vars.map(() => nextTemp());
        const tempLocals: LocalStatement = {
          type: "LocalStatement",
          loc: stmt.loc,
          vars: temps.map((name) => ({ name })),
          values,
        };
        const nonCaptured: { target: AnyNode; temp: string }[] = [];
        const setters: Statement[] = [];
        for (let i = 0; i < stmt.vars.length; i++) {
          const capturedTarget = capturedTargets[i];
          if (capturedTarget) {
            setters.push({
              type: "FunctionCallStatement",
              loc: stmt.loc,
              call: {
                type: "CallExpression",
                loc: stmt.loc,
                callee: {
                  type: "Identifier",
                  name: capturedTarget.bridge.setter,
                  loc: stmt.loc,
                },
                args: [{ type: "Identifier", name: temps[i]!, loc: stmt.loc }],
              },
            } as Statement);
          } else {
            nonCaptured.push({ target: targets[i]!, temp: temps[i]! });
          }
        }
        const out: (Statement | LastStatement)[] = [tempLocals];
        if (nonCaptured.length > 0) {
          out.push({
            type: "AssignmentStatement",
            loc: stmt.loc,
            vars: nonCaptured.map((entry) => entry.target),
            values: nonCaptured.map((entry) => ({ type: "Identifier", name: entry.temp, loc: stmt.loc })),
          } as unknown as AssignmentStatement);
        }
        out.push(...setters);
        return out;
      }
      case "CompoundAssignmentStatement": {
        const stmt = node as unknown as AnyNode;
        const target = stmt.var as AnyNode;
        if (target.type === "Identifier" && isCapture(String(target.name), at)) {
          const bridge = bridges.get(String(target.name))!;
          const loc = stmt.loc as Chunk["loc"];
          const getter: Expression = {
            type: "CallExpression",
            loc,
            callee: { type: "Identifier", name: bridge.getter, loc },
            args: [],
          };
          const operator = String(stmt.operator ?? "");
          const binaryOp = operator.endsWith("=") ? operator.slice(0, -1) : operator;
          return [
            {
              type: "FunctionCallStatement",
              loc: stmt.loc,
              call: {
                type: "CallExpression",
                loc: stmt.loc,
                callee: { type: "Identifier", name: bridge.setter, loc: stmt.loc },
                args: [
                  {
                    type: "BinaryExpression",
                    loc: stmt.loc,
                    operator: binaryOp,
                    left: getter,
                    right: read(stmt.value as AnyNode, at),
                  },
                ],
              },
            } as Statement,
          ];
        }
        return [
          {
            ...stmt,
            ["var"]: rewriteTarget(target, at),
            value: read(stmt.value as AnyNode, at),
          } as unknown as Statement,
        ];
      }
      case "FunctionCallStatement":
        return [
          { ...node, call: read(node.call as unknown as AnyNode, at) } as unknown as Statement,
        ];
      case "ReturnStatement": {
        const values = ((node.values ?? []) as AnyNode[]).map((value) => read(value, at));
        return [{ ...node, values } as unknown as LastStatement];
      }
      case "DoStatement": {
        const block = rewriteNestedBlock(
          node.body as (Statement | LastStatement)[],
          [...at, new Set<string>()],
          bridges,
          tempPrefix,
        );
        return [{ ...node, body: block } as unknown as Statement];
      }
      case "WhileStatement":
        return [
          {
            ...node,
            condition: read(node.condition as AnyNode, at),
            body: rewriteNestedBlock(
              node.body as (Statement | LastStatement)[],
              [...at, new Set<string>()],
              bridges,
              tempPrefix,
            ),
          } as unknown as Statement,
        ];
      case "RepeatStatement": {
        const frame = new Set<string>();
        const block = rewriteNestedBlock(
          node.body as (Statement | LastStatement)[],
          [...at, frame],
          bridges,
          tempPrefix,
        );
        return [
          {
            ...node,
            body: block,
            condition: read(node.condition as AnyNode, [...at, frame]),
          } as unknown as Statement,
        ];
      }
      case "IfStatement": {
        const thenBody = rewriteNestedBlock(
          node.thenBody as (Statement | LastStatement)[],
          [...at, new Set<string>()],
          bridges,
          tempPrefix,
        );
        const elseifClauses = ((node.elseifClauses ?? []) as AnyNode[]).map((clause) => ({
          ...clause,
          condition: read(clause.condition as AnyNode, at),
          body: rewriteNestedBlock(
            clause.body as (Statement | LastStatement)[],
            [...at, new Set<string>()],
            bridges,
            tempPrefix,
          ),
        }));
        const elseBody = Array.isArray(node.elseBody)
          ? rewriteNestedBlock(
              node.elseBody as (Statement | LastStatement)[],
              [...at, new Set<string>()],
              bridges,
              tempPrefix,
            )
          : undefined;
        return [
          {
            ...node,
            condition: read(node.condition as AnyNode, at),
            thenBody,
            elseifClauses,
            ...(elseBody ? { elseBody } : {}),
          } as unknown as Statement,
        ];
      }
      case "ForNumericStatement": {
        const frame = new Set<string>([String((node["var"] as AnyNode).name)]);
        return [
          {
            ...node,
            start: read(node.start as AnyNode, at),
            end: read(node.end as AnyNode, at),
            ...(node.step ? { step: read(node.step as AnyNode, at) } : {}),
            body: rewriteNestedBlock(
              node.body as (Statement | LastStatement)[],
              [...at, frame],
              bridges,
              tempPrefix,
            ),
          } as unknown as Statement,
        ];
      }
      case "ForInStatement": {
        const frame = new Set<string>();
        for (const v of ((node.vars ?? []) as AnyNode[])) frame.add(String(v.name));
        return [
          {
            ...node,
            iter: ((node.iter ?? []) as AnyNode[]).map((value) => read(value, at)),
            body: rewriteNestedBlock(
              node.body as (Statement | LastStatement)[],
              [...at, frame],
              bridges,
              tempPrefix,
            ),
          } as unknown as Statement,
        ];
      }
      case "BreakStatement":
      case "ContinueStatement":
        return [node as unknown as LastStatement];
      default:
        return [node as unknown as Statement];
    }
  };

  const output: (Statement | LastStatement)[] = [];
  for (const stmt of body) {
    output.push(...rewriteStatements(stmt as unknown as AnyNode, scopes));
  }
  return output;
}

function leftmostIdentifier(expr: unknown): Identifier | null {
  let current: unknown = expr;
  while (isNode(current) && current.type === "MemberExpression") {
    current = (current as unknown as { object: unknown }).object;
  }
  return isNode(current) && current.type === "Identifier" ? (current as unknown as Identifier) : null;
}

export function rootCopyLua(mangledNames: string[]): string {
  if (mangledNames.length === 0) return "";
  const assigns = mangledNames.map((n) => `r[${JSON.stringify(n)}]=${n}`).join(" ");
  return (
    `pcall(function() local r if getgenv then r=getgenv() end ` +
    `if type(r)~="table" and getfenv then r=select(2,pcall(getfenv,0)) end ` +
    `if type(r)~="table" then r=_G end ` +
    `if type(r)=="table" then ${assigns} end end)`
  );
}
