import type { Chunk, Expression, LastStatement, Statement } from "../ast/types.js";

// Conservative static method renamer.
//
// Only methods declared on a local-table path with `function path:name()` or
// `path.name = function()` are considered. A path is renamed only when every
// statically-resolved use agrees on the same path (or is a `self` call inside
// the owning method). Escaped tables, aliases through unresolved receivers,
// dynamic string lookups, and method reassignment all veto the rename. This
// keeps Roblox/external API names and dropped method references intact.

export interface LocalMethodRenamerOptions {
  onWarning?: (message: string) => void;
  // Lifted render callbacks receive captured tables by reference. Treat these
  // internal factory calls as non-escaping so their methods can be renamed.
  internalCallees?: Iterable<string>;
}

export interface LocalMethodRenameResult {
  chunks: Chunk[];
  renamed: number;
  skipped: string[];
}

interface Scope {
  parent: Scope | null;
  vars: Set<string>;
  selfPath?: string;
}

interface PathInfo {
  path: string;
  localRoot: boolean;
}

interface Candidate {
  key: string;
  path: string;
  method: string;
  safe: boolean;
  newName?: string;
  reason?: string;
}

interface DefSite {
  candidate: Candidate;
  kind: "function" | "assignment";
  node: any;
}

interface ExpressionUse {
  method: string;
  receiverPath: string | null;
  localRoot: boolean;
  write: boolean;
}

const KEYWORDS = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
  "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true",
  "until", "while", "continue", "export", "type",
]);

function newScope(parent: Scope | null, vars: string[] = [], selfPath?: string): Scope {
  const s: Scope = { parent, vars: new Set(vars), selfPath: parent?.selfPath };
  if (selfPath !== undefined) s.selfPath = selfPath;
  return s;
}

function declare(scope: Scope, name: string): void {
  if (!name || name === "...") return;
  scope.vars.add(name);
  if (name === "self") scope.selfPath = undefined;
}

function lookup(scope: Scope | null, name: string): boolean {
  for (let s = scope; s; s = s.parent) {
    if (s.vars.has(name)) return true;
  }
  return false;
}

function leftmostName(exp: any): string | null {
  let node = exp;
  while (node?.type === "MemberExpression") node = node.object;
  return node?.type === "Identifier" ? node.name : null;
}

function pathOf(exp: any, scope: Scope): PathInfo | null {
  if (!exp) return null;
  if (exp.type === "Identifier") {
    if (exp.name === "self") {
      return scope.selfPath ? { path: scope.selfPath, localRoot: true } : null;
    }
    return { path: exp.name, localRoot: lookup(scope, exp.name) };
  }
  if (exp.type === "MemberExpression") {
    const base = pathOf(exp.object, scope);
    return base ? { path: `${base.path}.${exp.property}`, localRoot: base.localRoot } : null;
  }
  if (exp.type === "ParenExpression") return pathOf(exp.expression, scope);
  return null;
}

function methodKey(path: string, method: string): string {
  return `${path}\u0000${method}`;
}

function isPathOrAncestor(ancestor: string, path: string): boolean {
  return path === ancestor || path.startsWith(`${ancestor}.`);
}

function collectNames(node: any, names: Set<string>): void {
  if (!node || typeof node !== "object") return;
  if (typeof node.name === "string") names.add(node.name);
  if (typeof node.property === "string") names.add(node.property);
  if (typeof node.method === "string") names.add(node.method);
  if (node.type === "StringLiteral" && typeof node.value === "string") names.add(node.value);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) collectNames(item, names);
    } else if (value && typeof value === "object") {
      collectNames(value, names);
    }
  }
}

function makeName(index: number, used: Set<string>): string {
  let i = index;
  while (true) {
    const name = `_0x${i.toString(16)}`;
    if (!KEYWORDS.has(name) && !used.has(name)) {
      used.add(name);
      return name;
    }
    i++;
  }
}

function pathValues(exp: any, scope: Scope): PathInfo[] {
  if (!exp) return [];
  if (exp.type === "Identifier" || exp.type === "MemberExpression" || exp.type === "ParenExpression") {
    const p = pathOf(exp, scope);
    return p ? [p] : [];
  }
  if (exp.type === "IfElseExpression") {
    const out = [...pathValues(exp.thenExp, scope), ...pathValues(exp.elseExp, scope)];
    for (const c of exp.elseifClauses ?? []) out.push(...pathValues(c.value, scope));
    return out;
  }
  if (exp.type === "BinaryExpression" && (exp.operator === "and" || exp.operator === "or")) {
    return [...pathValues(exp.left, scope), ...pathValues(exp.right, scope)];
  }
  return [];
}

export function renameLocalMethods(
  chunks: Chunk[],
  options: LocalMethodRenamerOptions = {},
): LocalMethodRenameResult {
  const candidates = new Map<string, Candidate>();
  const defs: DefSite[] = [];
  const uses: ExpressionUse[] = [];
  const escapes: PathInfo[] = [];
  const dynamicNames = new Set<string>();
  const reassigned = new Set<string>();
  const reassignedSelf = new Set<string>();
  const skipped = new Set<string>();
  const internalCallees = new Set(options.internalCallees ?? []);

  const addCandidate = (path: string, method: string, kind: DefSite["kind"], node: any): void => {
    const key = methodKey(path, method);
    let candidate = candidates.get(key);
    if (!candidate) {
      candidate = { key, path, method, safe: true };
      candidates.set(key, candidate);
    }
    defs.push({ candidate, kind, node });
  };

  // Pass 1: collect definitions and lexical scopes.
  function collectStmt(stmt: any, scope: Scope): void {
    if (!stmt || typeof stmt !== "object") return;
    switch (stmt.type) {
      case "LocalStatement": {
        for (const value of stmt.values ?? []) collectExpr(value, scope);
        for (const v of stmt.vars ?? []) declare(scope, v.name);
        return;
      }
      case "LocalFunctionStatement": {
        declare(scope, stmt.name);
        const params = (stmt.params ?? []).map((p: any) => p.name);
        const inner = newScope(scope, params);
        for (const p of stmt.params ?? []) if (p.name === "self") inner.selfPath = undefined;
        for (const s of stmt.body ?? []) collectStmt(s, inner);
        return;
      }
      case "FunctionStatement": {
        const root = leftmostName(stmt.name?.base);
        if (stmt.name?.method && root && root !== "self" && lookup(scope, root)) {
          const p = pathOf(stmt.name.base, scope);
          if (p) addCandidate(p.path, stmt.name.method, "function", stmt);
        }
        if (stmt.name?.base) collectExpr(stmt.name.base, scope);
        const inner = newScope(scope, (stmt.params ?? []).map((p: any) => p.name));
        if (stmt.name?.method) {
          inner.vars.add("self");
          inner.selfPath = pathOf(stmt.name.base, scope)?.path;
        }
        for (const p of stmt.params ?? []) if (p.name === "self") inner.selfPath = undefined;
        for (const s of stmt.body ?? []) collectStmt(s, inner);
        return;
      }
      case "AssignmentStatement": {
        const vars = stmt.vars ?? [];
        const values = stmt.values ?? [];
        if (vars.length === 1 && values.length === 1 &&
            vars[0]?.type === "MemberExpression" && values[0]?.type === "FunctionExpression") {
          const root = leftmostName(vars[0].object);
          if (root && root !== "self" && lookup(scope, root)) {
            const p = pathOf(vars[0].object, scope);
            if (p) addCandidate(p.path, vars[0].property, "assignment", stmt);
          }
          collectExpr(vars[0].object, scope);
          const inner = newScope(scope, (values[0].params ?? []).map((p: any) => p.name));
          const owner = pathOf(vars[0].object, scope)?.path;
          if (owner) inner.selfPath = owner;
          for (const p of values[0].params ?? []) if (p.name === "self") inner.selfPath = undefined;
          for (const s of values[0].body ?? []) collectStmt(s, inner);
          return;
        }
        for (const v of vars) collectExpr(v, scope);
        for (const v of values) collectExpr(v, scope);
        return;
      }
      case "IfStatement": {
        collectExpr(stmt.condition, scope);
        const thenScope = newScope(scope);
        for (const s of stmt.thenBody ?? []) collectStmt(s, thenScope);
        for (const c of stmt.elseifClauses ?? []) {
          collectExpr(c.condition, scope);
          const inner = newScope(scope);
          for (const s of c.body ?? []) collectStmt(s, inner);
        }
        const elseScope = newScope(scope);
        for (const s of stmt.elseBody ?? []) collectStmt(s, elseScope);
        return;
      }
      case "ForNumericStatement": {
        collectExpr(stmt.start, scope);
        collectExpr(stmt.end, scope);
        if (stmt.step) collectExpr(stmt.step, scope);
        const inner = newScope(scope, [stmt.var?.name].filter(Boolean));
        for (const s of stmt.body ?? []) collectStmt(s, inner);
        return;
      }
      case "ForInStatement": {
        for (const e of stmt.iter ?? []) collectExpr(e, scope);
        const inner = newScope(scope, (stmt.vars ?? []).map((v: any) => v.name));
        for (const s of stmt.body ?? []) collectStmt(s, inner);
        return;
      }
      case "DoStatement":
      case "WhileStatement":
      case "RepeatStatement": {
        if (stmt.type === "WhileStatement") collectExpr(stmt.condition, scope);
        const inner = newScope(scope);
        for (const s of stmt.body ?? []) collectStmt(s, inner);
        if (stmt.type === "RepeatStatement") collectExpr(stmt.condition, inner);
        return;
      }
      case "ReturnStatement": {
        for (const e of stmt.values ?? []) collectExpr(e, scope);
        return;
      }
      case "FunctionCallStatement": {
        collectExpr(stmt.call, scope);
        return;
      }
      case "CompoundAssignmentStatement": {
        collectExpr(stmt.var, scope);
        collectExpr(stmt.value, scope);
        return;
      }
      default:
        return;
    }
  }

  function collectExpr(exp: any, scope: Scope): void {
    if (!exp || typeof exp !== "object") return;
    switch (exp.type) {
      case "FunctionExpression": {
        const inner = newScope(scope, (exp.params ?? []).map((p: any) => p.name));
        for (const p of exp.params ?? []) if (p.name === "self") inner.selfPath = undefined;
        for (const s of exp.body ?? []) collectStmt(s, inner);
        return;
      }
      case "BinaryExpression":
        collectExpr(exp.left, scope);
        collectExpr(exp.right, scope);
        return;
      case "UnaryExpression":
      case "ParenExpression":
      case "TypeAssertion":
        collectExpr(exp.argument ?? exp.expression, scope);
        return;
      case "CallExpression":
        collectExpr(exp.callee, scope);
        for (const a of exp.args ?? []) collectExpr(a, scope);
        return;
      case "MethodCallExpression":
        collectExpr(exp.object, scope);
        for (const a of exp.args ?? []) collectExpr(a, scope);
        return;
      case "IndexExpression":
        collectExpr(exp.object, scope);
        collectExpr(exp.index, scope);
        return;
      case "MemberExpression":
        collectExpr(exp.object, scope);
        return;
      case "TableConstructor":
        for (const f of exp.fields ?? []) collectExpr(f.value, scope);
        return;
      case "IfElseExpression":
        collectExpr(exp.condition, scope);
        collectExpr(exp.thenExp, scope);
        collectExpr(exp.elseExp, scope);
        for (const c of exp.elseifClauses ?? []) {
          collectExpr(c.condition, scope);
          collectExpr(c.value, scope);
        }
        return;
      case "StringInterpolation":
        for (const p of exp.parts ?? []) if (typeof p !== "string") collectExpr(p, scope);
        return;
      default:
        return;
    }
  }

  // Pass 2: collect uses/escapes and veto unsafe candidates.
  const candidatePaths = new Set<string>();
  const byMethod = new Map<string, Candidate[]>();

  function markMethodUnsafe(method: string, reason: string): void {
    for (const c of byMethod.get(method) ?? []) {
      c.safe = false;
      if (!c.reason) c.reason = reason;
    }
  }

  function markPathUnsafe(path: string, reason: string): void {
    for (const c of candidates.values()) {
      if (isPathOrAncestor(path, c.path)) {
        c.safe = false;
        if (!c.reason) c.reason = reason;
      }
    }
  }

  function noteEscape(p: PathInfo): void {
    escapes.push(p);
  }

  function noteUse(method: string, receiver: PathInfo | null, write: boolean): void {
    uses.push({ method, receiverPath: receiver?.path ?? null, localRoot: receiver?.localRoot ?? false, write });
  }

  function walkExpr(exp: any, scope: Scope): void {
    if (!exp || typeof exp !== "object") return;
    switch (exp.type) {
      case "FunctionExpression": {
        const inner = newScope(scope, (exp.params ?? []).map((p: any) => p.name));
        for (const p of exp.params ?? []) if (p.name === "self") inner.selfPath = undefined;
        for (const s of exp.body ?? []) walkStmt(s, inner);
        return;
      }
      case "BinaryExpression":
        walkValue(exp.left, scope);
        walkValue(exp.right, scope);
        return;
      case "UnaryExpression":
        walkValue(exp.argument, scope);
        return;
      case "CallExpression": {
        const callee = exp.callee;
        if (callee?.type === "MemberExpression") {
          noteUse(callee.property, pathOf(callee.object, scope), false);
          walkReceiver(callee.object, scope);
        } else {
          walkExpr(callee, scope);
        }
        const internal = callee?.type === "Identifier" && internalCallees.has(callee.name);
        for (const a of exp.args ?? []) {
          if (internal) walkExpr(a, scope);
          else walkValue(a, scope);
        }
        return;
      }
      case "MethodCallExpression":
        noteUse(exp.method, pathOf(exp.object, scope), false);
        walkReceiver(exp.object, scope);
        for (const a of exp.args ?? []) walkValue(a, scope);
        return;
      case "IndexExpression":
        walkReceiver(exp.object, scope);
        if (exp.index?.type === "StringLiteral") dynamicNames.add(exp.index.value);
        else walkValue(exp.index, scope);
        return;
      case "MemberExpression":
        noteUse(exp.property, pathOf(exp.object, scope), false);
        walkReceiver(exp.object, scope);
        return;
      case "TableConstructor":
        for (const f of exp.fields ?? []) walkValue(f.value, scope);
        return;
      case "ParenExpression":
      case "TypeAssertion":
        walkValue(exp.expression, scope);
        return;
      case "IfElseExpression":
        walkCondition(exp.condition, scope);
        walkValue(exp.thenExp, scope);
        walkValue(exp.elseExp, scope);
        for (const c of exp.elseifClauses ?? []) {
          walkCondition(c.condition, scope);
          walkValue(c.value, scope);
        }
        return;
      case "StringInterpolation":
        for (const p of exp.parts ?? []) if (typeof p !== "string") walkValue(p, scope);
        return;
      default:
        return;
    }
  }

  function walkReceiver(exp: any, scope: Scope): void {
    if (!exp) return;
    if (exp.type === "MemberExpression") {
      walkReceiver(exp.object, scope);
      return;
    }
    if (exp.type === "ParenExpression") {
      walkReceiver(exp.expression, scope);
      return;
    }
    if (exp.type === "Identifier") return;
    walkExpr(exp, scope);
  }

  function walkValue(exp: any, scope: Scope): void {
    for (const p of pathValues(exp, scope)) noteEscape(p);
    walkExpr(exp, scope);
  }

  // Truthiness checks (`if not table then`) do not hand the table to
  // external code. Traverse conditions without treating their path operands
  // as escaped values; calls inside a condition still use walkExpr.
  function walkCondition(exp: any, scope: Scope): void {
    if (!exp || typeof exp !== "object") return;
    if (exp.type === "Identifier" || exp.type === "MemberExpression") return;
    if (exp.type === "UnaryExpression") return walkCondition(exp.argument, scope);
    if (exp.type === "ParenExpression") return walkCondition(exp.expression, scope);
    if (exp.type === "BinaryExpression") {
      walkCondition(exp.left, scope);
      walkCondition(exp.right, scope);
      return;
    }
    if (exp.type === "IfElseExpression") {
      walkCondition(exp.condition, scope);
      walkCondition(exp.thenExp, scope);
      walkCondition(exp.elseExp, scope);
      for (const c of exp.elseifClauses ?? []) {
        walkCondition(c.condition, scope);
        walkCondition(c.value, scope);
      }
      return;
    }
    walkExpr(exp, scope);
  }

  function walkStmt(stmt: any, scope: Scope): void {
    if (!stmt || typeof stmt !== "object") return;
    switch (stmt.type) {
      case "LocalStatement": {
        for (const v of stmt.values ?? []) walkValue(v, scope);
        for (const v of stmt.vars ?? []) declare(scope, v.name);
        return;
      }
      case "LocalFunctionStatement": {
        declare(scope, stmt.name);
        const inner = newScope(scope, (stmt.params ?? []).map((p: any) => p.name));
        for (const p of stmt.params ?? []) if (p.name === "self") inner.selfPath = undefined;
        for (const s of stmt.body ?? []) walkStmt(s, inner);
        return;
      }
      case "FunctionStatement": {
        if (stmt.name?.base) walkReceiver(stmt.name.base, scope);
        const inner = newScope(scope, (stmt.params ?? []).map((p: any) => p.name));
        if (stmt.name?.method) {
          inner.vars.add("self");
          inner.selfPath = pathOf(stmt.name.base, scope)?.path;
        }
        for (const p of stmt.params ?? []) if (p.name === "self") inner.selfPath = undefined;
        for (const s of stmt.body ?? []) walkStmt(s, inner);
        return;
      }
      case "AssignmentStatement": {
        const vars = stmt.vars ?? [];
        const values = stmt.values ?? [];
        if (vars.length === 1 && values.length === 1 &&
            vars[0]?.type === "MemberExpression" && values[0]?.type === "FunctionExpression") {
          walkReceiver(vars[0].object, scope);
          const inner = newScope(scope, (values[0].params ?? []).map((p: any) => p.name));
          const owner = pathOf(vars[0].object, scope)?.path;
          if (owner) inner.selfPath = owner;
          for (const p of values[0].params ?? []) if (p.name === "self") inner.selfPath = undefined;
          for (const s of values[0].body ?? []) walkStmt(s, inner);
          return;
        }
        for (const v of vars) {
          if (v?.type === "MemberExpression") {
            const receiver = pathOf(v.object, scope);
            if (receiver) noteUse(v.property, receiver, true);
            if (receiver) reassigned.add(methodKey(receiver.path, v.property));
            walkReceiver(v.object, scope);
          } else if (v?.type === "IndexExpression") {
            if (v.index?.type === "StringLiteral") dynamicNames.add(v.index.value);
            walkReceiver(v.object, scope);
          } else if (v?.type === "Identifier") {
            const inner = v.name === "self" ? scope.selfPath : undefined;
            if (inner) reassignedSelf.add(inner);
            walkExpr(v, scope);
          }
        }
        for (const value of values) walkValue(value, scope);
        return;
      }
      case "IfStatement": {
        walkCondition(stmt.condition, scope);
        const thenScope = newScope(scope);
        for (const s of stmt.thenBody ?? []) walkStmt(s, thenScope);
        for (const c of stmt.elseifClauses ?? []) {
          walkCondition(c.condition, scope);
          const inner = newScope(scope);
          for (const s of c.body ?? []) walkStmt(s, inner);
        }
        const elseScope = newScope(scope);
        for (const s of stmt.elseBody ?? []) walkStmt(s, elseScope);
        return;
      }
      case "ForNumericStatement": {
        walkValue(stmt.start, scope);
        walkValue(stmt.end, scope);
        if (stmt.step) walkValue(stmt.step, scope);
        const inner = newScope(scope, [stmt.var?.name].filter(Boolean));
        for (const s of stmt.body ?? []) walkStmt(s, inner);
        return;
      }
      case "ForInStatement": {
        for (const e of stmt.iter ?? []) walkValue(e, scope);
        const inner = newScope(scope, (stmt.vars ?? []).map((v: any) => v.name));
        for (const s of stmt.body ?? []) walkStmt(s, inner);
        return;
      }
      case "DoStatement":
      case "WhileStatement":
      case "RepeatStatement": {
        if (stmt.type === "WhileStatement") walkCondition(stmt.condition, scope);
        const inner = newScope(scope);
        for (const s of stmt.body ?? []) walkStmt(s, inner);
        if (stmt.type === "RepeatStatement") walkCondition(stmt.condition, inner);
        return;
      }
      case "ReturnStatement":
        for (const e of stmt.values ?? []) walkValue(e, scope);
        return;
      case "FunctionCallStatement":
        walkExpr(stmt.call, scope);
        return;
      case "CompoundAssignmentStatement":
        walkExpr(stmt.var, scope);
        walkValue(stmt.value, scope);
        return;
      default:
        return;
    }
  }

  for (const chunk of chunks) {
    const root = newScope(null);
    for (const s of chunk.body ?? []) collectStmt(s, root);
  }

  for (const c of candidates.values()) {
    candidatePaths.add(c.path);
    const list = byMethod.get(c.method) ?? [];
    list.push(c);
    byMethod.set(c.method, list);
  }

  for (const chunk of chunks) {
    const root = newScope(null);
    for (const s of chunk.body ?? []) walkStmt(s, root);
  }

  for (const d of dynamicNames) markMethodUnsafe(d, "dynamic string lookup");
  for (const p of escapes) markPathUnsafe(p.path, `table ${p.path} escapes`);
  for (const path of reassignedSelf) markPathUnsafe(path, `self reassigned on ${path}`);
  for (const key of reassigned) {
    const c = candidates.get(key);
    if (c) {
      c.safe = false;
      if (!c.reason) c.reason = "method property reassigned";
    }
  }

  // A method use on a different local path is not a collision: aliases and
  // parameters that could receive a candidate table are recorded as escapes
  // when the table is assigned or passed. Keeping this check path-specific
  // avoids vetoing every `update`/`enable` method because an unrelated local
  // object happens to use the same method name.

  const usedNames = new Set<string>();
  for (const chunk of chunks) collectNames(chunk, usedNames);
  let nextName = 1;
  let renamed = 0;
  for (const c of candidates.values()) {
    if (!c.safe) {
      skipped.add(c.key);
      continue;
    }
    c.newName = makeName(nextName++, usedNames);
    renamed++;
  }

  if (renamed === 0) {
    return { chunks, renamed: 0, skipped: [...skipped].sort() };
  }

  function applyStmt(stmt: any, scope: Scope): void {
    if (!stmt || typeof stmt !== "object") return;
    switch (stmt.type) {
      case "LocalStatement": {
        for (const v of stmt.values ?? []) applyExpr(v, scope);
        for (const v of stmt.vars ?? []) declare(scope, v.name);
        return;
      }
      case "LocalFunctionStatement": {
        declare(scope, stmt.name);
        const inner = newScope(scope, (stmt.params ?? []).map((p: any) => p.name));
        for (const p of stmt.params ?? []) if (p.name === "self") inner.selfPath = undefined;
        for (const s of stmt.body ?? []) applyStmt(s, inner);
        return;
      }
      case "FunctionStatement": {
        const p = stmt.name?.base ? pathOf(stmt.name.base, scope) : null;
        if (stmt.name?.method && p) {
          const c = candidates.get(methodKey(p.path, stmt.name.method));
          if (c?.newName) stmt.name.method = c.newName;
        }
        if (stmt.name?.base) applyReceiver(stmt.name.base, scope);
        const inner = newScope(scope, (stmt.params ?? []).map((p2: any) => p2.name));
        if (stmt.name?.method) {
          inner.vars.add("self");
          inner.selfPath = p?.path;
        }
        for (const p2 of stmt.params ?? []) if (p2.name === "self") inner.selfPath = undefined;
        for (const s of stmt.body ?? []) applyStmt(s, inner);
        return;
      }
      case "AssignmentStatement": {
        const vars = stmt.vars ?? [];
        const values = stmt.values ?? [];
        if (vars.length === 1 && values.length === 1 &&
            vars[0]?.type === "MemberExpression" && values[0]?.type === "FunctionExpression") {
          const p = pathOf(vars[0].object, scope);
          if (p) {
            const c = candidates.get(methodKey(p.path, vars[0].property));
            if (c?.newName) vars[0].property = c.newName;
          }
          applyReceiver(vars[0].object, scope);
          const inner = newScope(scope, (values[0].params ?? []).map((p2: any) => p2.name));
          const owner = p?.path;
          if (owner) inner.selfPath = owner;
          for (const p2 of values[0].params ?? []) if (p2.name === "self") inner.selfPath = undefined;
          for (const s of values[0].body ?? []) applyStmt(s, inner);
          return;
        }
        for (const v of vars) applyExpr(v, scope);
        for (const value of values) applyExpr(value, scope);
        return;
      }
      case "IfStatement":
        applyExpr(stmt.condition, scope);
        for (const s of stmt.thenBody ?? []) applyStmt(s, newScope(scope));
        for (const c of stmt.elseifClauses ?? []) {
          applyExpr(c.condition, scope);
          const inner = newScope(scope);
          for (const s of c.body ?? []) applyStmt(s, inner);
        }
        for (const s of stmt.elseBody ?? []) applyStmt(s, newScope(scope));
        return;
      case "ForNumericStatement": {
        applyExpr(stmt.start, scope);
        applyExpr(stmt.end, scope);
        if (stmt.step) applyExpr(stmt.step, scope);
        const inner = newScope(scope, [stmt.var?.name].filter(Boolean));
        for (const s of stmt.body ?? []) applyStmt(s, inner);
        return;
      }
      case "ForInStatement": {
        for (const e of stmt.iter ?? []) applyExpr(e, scope);
        const inner = newScope(scope, (stmt.vars ?? []).map((v: any) => v.name));
        for (const s of stmt.body ?? []) applyStmt(s, inner);
        return;
      }
      case "DoStatement":
      case "WhileStatement":
      case "RepeatStatement": {
        if (stmt.type === "WhileStatement") applyExpr(stmt.condition, scope);
        const inner = newScope(scope);
        for (const s of stmt.body ?? []) applyStmt(s, inner);
        if (stmt.type === "RepeatStatement") applyExpr(stmt.condition, inner);
        return;
      }
      case "ReturnStatement":
        for (const e of stmt.values ?? []) applyExpr(e, scope);
        return;
      case "FunctionCallStatement":
        applyExpr(stmt.call, scope);
        return;
      case "CompoundAssignmentStatement":
        applyExpr(stmt.var, scope);
        applyExpr(stmt.value, scope);
        return;
      default:
        return;
    }
  }

  function applyExpr(exp: any, scope: Scope): void {
    if (!exp || typeof exp !== "object") return;
    switch (exp.type) {
      case "FunctionExpression": {
        const inner = newScope(scope, (exp.params ?? []).map((p: any) => p.name));
        for (const p of exp.params ?? []) if (p.name === "self") inner.selfPath = undefined;
        for (const s of exp.body ?? []) applyStmt(s, inner);
        return;
      }
      case "BinaryExpression":
        applyExpr(exp.left, scope);
        applyExpr(exp.right, scope);
        return;
      case "UnaryExpression":
        applyExpr(exp.argument, scope);
        return;
      case "CallExpression": {
        const callee = exp.callee;
        if (callee?.type === "MemberExpression") {
          const p = pathOf(callee.object, scope);
          if (p) {
            const c = candidates.get(methodKey(p.path, callee.property));
            if (c?.newName) callee.property = c.newName;
          }
          applyReceiver(callee.object, scope);
        } else {
          applyExpr(callee, scope);
        }
        for (const a of exp.args ?? []) applyExpr(a, scope);
        return;
      }
      case "MethodCallExpression": {
        const p = pathOf(exp.object, scope);
        if (p) {
          const c = candidates.get(methodKey(p.path, exp.method));
          if (c?.newName) exp.method = c.newName;
        }
        applyReceiver(exp.object, scope);
        for (const a of exp.args ?? []) applyExpr(a, scope);
        return;
      }
      case "IndexExpression":
        applyReceiver(exp.object, scope);
        applyExpr(exp.index, scope);
        return;
      case "MemberExpression": {
        const p = pathOf(exp.object, scope);
        if (p) {
          const c = candidates.get(methodKey(p.path, exp.property));
          if (c?.newName) exp.property = c.newName;
        }
        applyReceiver(exp.object, scope);
        return;
      }
      case "TableConstructor":
        for (const f of exp.fields ?? []) applyExpr(f.value, scope);
        return;
      case "ParenExpression":
      case "TypeAssertion":
        applyExpr(exp.expression, scope);
        return;
      case "IfElseExpression":
        applyExpr(exp.condition, scope);
        applyExpr(exp.thenExp, scope);
        applyExpr(exp.elseExp, scope);
        for (const c of exp.elseifClauses ?? []) {
          applyExpr(c.condition, scope);
          applyExpr(c.value, scope);
        }
        return;
      case "StringInterpolation":
        for (const p of exp.parts ?? []) if (typeof p !== "string") applyExpr(p, scope);
        return;
      default:
        return;
    }
  }

  function applyReceiver(exp: any, scope: Scope): void {
    if (!exp) return;
    if (exp.type === "MemberExpression") {
      applyReceiver(exp.object, scope);
      return;
    }
    if (exp.type === "ParenExpression") {
      applyReceiver(exp.expression, scope);
      return;
    }
    if (exp.type === "Identifier") return;
    applyExpr(exp, scope);
  }

  for (const chunk of chunks) {
    const root = newScope(null);
    for (const s of chunk.body ?? []) applyStmt(s, root);
  }

  for (const key of skipped) {
    const c = candidates.get(key);
    const label = key.replace("\u0000", ":");
    options.onWarning?.(`method rename skipped: ${label}${c?.reason ? ` (${c.reason})` : ""}`);
  }

  return { chunks, renamed, skipped: [...skipped].sort() };
}


