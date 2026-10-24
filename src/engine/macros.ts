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
    if (!site.topLevel) {
      report(
        `--@quantum:${tier} (line ${found.line}): nested ${label} is not supported; stays in the VM`,
      );
      continue;
    }
    if (!site.name) {
      report(
        `--@quantum:${tier} (line ${found.line}): table/method functions are not supported; stays in the VM`,
      );
      continue;
    }
    site.node.tier = tier;
    if (tier === "turbo") turbos.push(site.name);
    else maximums.push(site.name);
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

  return { turbos, maximums, warnings };
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
    if (stmt.type === "FunctionStatement" && stmt.name.base.type !== "Identifier") {
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
