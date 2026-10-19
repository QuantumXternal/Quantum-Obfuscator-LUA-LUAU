// Phase 3.2: --@quantum source directives.
//
//   --@quantum:no-vm      (line-directive) next `function name` / `local function
//                         name` is extracted from the VM'd chunk, AST-obfuscated,
//                         and hoisted as a plain function behind a mangled global
//                         that is also mirrored into the resolved root env.
//   --@quantum:light-vm   (file-directive) stack VM, normal level.
//   --@quantum:secure     (file-directive) register VM, max level + Intense
//                         Structure feature set. Wins over light-vm.
//
// Extraction contract (deliberately conservative):
//   - only top-level, single-name function declarations are candidates
//     (`local function F`, `function F`, `local F = function`, `F = function`);
//   - candidates whose bodies capture an OUTER LOCAL (upvalue) are vetoed and
//     left inside the VM (advisory emitted through opts.onWarning);
//   - duplicate candidate names are vetoed outright;
//   - references are renamed position-aware: a reference is only rewritten at
//     or after its declaration point, and never under a shadowing local;
//   - inside extracted bodies only self-recursion and candidates declared
//     earlier are rewritten (strict lexical-order semantics).
//
// The pipeline prepends the extracted definitions (plus one root-mirror pcall)
// before the VM artifact, so the artifact still sees fully populated globals
// even when its runtime resolves globals through a divergent environment root.

import type {
  AssignmentStatement,
  Chunk,
  Expression,
  FunctionExpression,
  Identifier,
  LastStatement,
  LocalFunctionStatement,
  LocalStatement,
  Param,
  Statement,
} from "../ast/types.js";

export type FileDirective = "light-vm" | "secure";

export interface MacroDirectives {
  noVmFunctions: string[];
  fileDirective: FileDirective | null;
}

const NO_VM_LINE = /--@\s*quantum\s*:\s*no-vm/i;
const SECURE_LINE = /--@\s*quantum\s*:\s*secure\b/i;
const LIGHT_VM_LINE = /--@\s*quantum\s*:\s*light-vm\b/i;
const FUNC_AFTER = /(?:local\s+)?function\s+([A-Za-z_]\w*)/;
const FUNC_ASSIGN_AFTER = /(?:local\s+)?([A-Za-z_]\w*)\s*=\s*function\b/;

export function scanMacroDirectives(code: string): MacroDirectives {
  const lines = code.split(/\r?\n/);
  const noVmFunctions: string[] = [];
  let fileDirective: FileDirective | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (NO_VM_LINE.test(line) && i + 1 < lines.length) {
      const next = lines[i + 1]!;
      const m = next.match(FUNC_AFTER) ?? next.match(FUNC_ASSIGN_AFTER);
      if (m) noVmFunctions.push(m[1]!);
    }
    if (SECURE_LINE.test(line)) fileDirective = "secure";
    else if (LIGHT_VM_LINE.test(line) && fileDirective !== "secure") fileDirective = "light-vm";
  }
  return { noVmFunctions, fileDirective };
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

export interface NoVmExtraction {
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
      walkBlock(node.body, [...scopes, paramNames(node.params)], onId);
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

export function extractNoVmFunctions(
  ast: Chunk,
  names: Iterable<string>,
  mangle: Mangler,
  onWarning?: (message: string) => void,
): NoVmExtraction {
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
        warn(`--@quantum:no-vm: '${leftmost}.…' is a table/method function and stays in the VM`);
      }
    }
  }

  const duplicates = new Set<string>();
  for (const [name, count] of occurrenceCount) {
    if (!name.startsWith("dotted:") && count > 1) duplicates.add(name);
  }
  for (const name of duplicates) {
    warn(`--@quantum:no-vm: '${name}' is declared more than once and stays in the VM`);
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
        warn(`--@quantum:no-vm: '${c.name}' ${reason}; stays in the VM`);
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
