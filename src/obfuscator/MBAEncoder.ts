// Phase 4.1: Mixed Boolean-Arithmetic (MBA) constants.
// Rewrites numeric literals into MBA expressions that force a runtime
// variable operand, so the Luau compiler cannot constant-fold back to
// the original number and the K-array stores no readable constants.
import type { Expression, Chunk, Statement } from "../ast/types.js";

export interface MBAOptions {
  enabled?: boolean;
  seed?: number;
}

/**
 * Tables with more fields than this skip MBA number expansion (see the
 * TableConstructor case). Expanding every number in large static data
 * tables (UI property maps, lookup arrays) multiplies node count ~3-6x per
 * number with no logic-protection value; nested functions inside such
 * tables are still fully transformed.
 */
export const MBA_TABLE_FIELD_BUDGET = 50;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// MBA identities (FP-exact for every finite n and runtime v):
//   n = (v - v) + n        (v - v is exactly +0)
//   n = n - (v - v)
//   n = (v * 0 + n) + (v - v)
// Every canceling subexpression evaluates to an exact +0, so the rounding
// error of additive cancellation forms like (v + n) - v never occurs
// (observed as 63.2 -> 63.20000000001164 before this was fixed).
const VARIANTS = [
  (n: number, v: string) => `((${v} - ${v}) + ${n})`,
  (n: number, v: string) => `(${n} - (${v} - ${v}))`,
  (n: number, v: string) => `((${v} * 0 + ${n}) + (${v} - ${v}))`,
];

/**
 * Walk a skipped (large-table) subtree without transforming numbers, but
 * apply full MBA to nested FunctionExpression bodies (callbacks and
 * metamethods carry logic, unlike the bulk data around them). Mutates child
 * references in place; the pass is single-shot per build.
 */
function transformFunctionsOnly(node: any, rng: () => number, varName: string): any {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = transformFunctionsOnly(node[i], rng, varName);
    return node;
  }
  if (node.type === "FunctionExpression") {
    node.body = (node.body || []).map((s: any) => transformStatement(s, rng, varName));
    return node;
  }
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "type") continue;
    const v = node[k];
    if (v && typeof v === "object") node[k] = transformFunctionsOnly(v, rng, varName);
  }
  return node;
}

export function mbaTransformExpression(exp: Expression, rng: () => number, varName: string): Expression {
  if (exp.type === "NumberLiteral") {
    const n = (exp as any).value as number;
    if (!Number.isFinite(n)) return exp;
    const variant = VARIANTS[Math.floor(rng() * VARIANTS.length)];
    if (variant === VARIANTS[0]) {
      // ((v - v) + n)
      return {
        type: "BinaryExpression",
        operator: "+",
        left: { type: "BinaryExpression", operator: "-", left: { type: "Identifier", name: varName, loc: exp.loc }, right: { type: "Identifier", name: varName, loc: exp.loc }, loc: exp.loc } as any,
        right: { type: "NumberLiteral", value: n, loc: exp.loc } as any,
        loc: exp.loc,
      } as any;
    }
    if (variant === VARIANTS[1]) {
      // (n - (v - v))
      return {
        type: "BinaryExpression",
        operator: "-",
        left: { type: "NumberLiteral", value: n, loc: exp.loc } as any,
        right: { type: "BinaryExpression", operator: "-", left: { type: "Identifier", name: varName, loc: exp.loc }, right: { type: "Identifier", name: varName, loc: exp.loc }, loc: exp.loc } as any,
        loc: exp.loc,
      } as any;
    }
    return {
      type: "BinaryExpression",
      operator: "+",
      left: { type: "BinaryExpression", operator: "+", left: { type: "BinaryExpression", operator: "*", left: { type: "Identifier", name: varName, loc: exp.loc } as any, right: { type: "NumberLiteral", value: 0, loc: exp.loc } as any, loc: exp.loc } as any, right: { type: "NumberLiteral", value: n, loc: exp.loc } as any, loc: exp.loc } as any,
      right: { type: "BinaryExpression", operator: "-", left: { type: "Identifier", name: varName, loc: exp.loc } as any, right: { type: "Identifier", name: varName, loc: exp.loc } as any, loc: exp.loc } as any,
      loc: exp.loc,
    } as any;
  }
  if (exp.type === "BinaryExpression") {
    return { ...exp, left: mbaTransformExpression(exp.left, rng, varName), right: mbaTransformExpression(exp.right, rng, varName) } as any;
  }
  if (exp.type === "UnaryExpression") {
    return { ...exp, argument: mbaTransformExpression(exp.argument, rng, varName) } as any;
  }
  if (exp.type === "CallExpression") {
    return { ...exp, callee: mbaTransformExpression(exp.callee, rng, varName), args: exp.args.map((a: any) => mbaTransformExpression(a, rng, varName)) } as any;
  }
  if (exp.type === "MethodCallExpression") {
    return { ...exp, object: mbaTransformExpression(exp.object, rng, varName), args: exp.args.map((a: any) => mbaTransformExpression(a, rng, varName)) } as any;
  }
  if (exp.type === "IndexExpression") {
    return { ...exp, object: mbaTransformExpression(exp.object, rng, varName), index: mbaTransformExpression(exp.index, rng, varName) } as any;
  }
  if (exp.type === "TableConstructor") {
    const fields = (exp as any).fields as any[];
    if (fields.length > MBA_TABLE_FIELD_BUDGET) {
      // Large static table: skip number transforms for its data subtree, but
      // keep transforming nested functions (see transformFunctionsOnly).
      for (const f of fields) {
        if (f.value) f.value = transformFunctionsOnly(f.value, rng, varName);
      }
      return exp;
    }
    return { ...exp, fields: fields.map((f: any) => ({ ...f, value: f.value ? mbaTransformExpression(f.value, rng, varName) : f.value })) } as any;
  }
  return exp;
}

function transformStatement(stmt: any, rng: () => number, varName: string): any {
  if (stmt.type === "LocalStatement") {
    return { ...stmt, values: (stmt.values || []).map((e: any) => mbaTransformExpression(e, rng, varName)) };
  }
  if (stmt.type === "AssignmentStatement") {
    return { ...stmt, values: (stmt.values || []).map((e: any) => mbaTransformExpression(e, rng, varName)) };
  }
  if (stmt.type === "ReturnStatement") {
    return { ...stmt, values: (stmt.values || []).map((e: any) => mbaTransformExpression(e, rng, varName)) };
  }
  if (stmt.type === "IfStatement") {
    return { ...stmt, condition: mbaTransformExpression(stmt.condition, rng, varName), thenBody: (stmt.thenBody || []).map((s: any) => transformStatement(s, rng, varName)), elseifClauses: (stmt.elseifClauses || []).map((c: any) => ({ ...c, condition: mbaTransformExpression(c.condition, rng, varName), body: (c.body || []).map((s: any) => transformStatement(s, rng, varName)) })), elseBody: (stmt.elseBody || []).map((s: any) => transformStatement(s, rng, varName)) };
  }
  if (stmt.type === "WhileStatement") {
    return { ...stmt, condition: mbaTransformExpression(stmt.condition, rng, varName), body: (stmt.body || []).map((s: any) => transformStatement(s, rng, varName)) };
  }
  if (stmt.type === "ForNumericStatement") {
    return { ...stmt, start: mbaTransformExpression(stmt.start, rng, varName), end: mbaTransformExpression(stmt.end, rng, varName), step: stmt.step ? mbaTransformExpression(stmt.step, rng, varName) : stmt.step, body: (stmt.body || []).map((s: any) => transformStatement(s, rng, varName)) };
  }
  if (stmt.type === "FunctionStatement" || stmt.type === "LocalFunctionStatement" || stmt.type === "FunctionDeclaration") {
    return { ...stmt, body: (stmt.body || []).map((s: any) => transformStatement(s, rng, varName)) };
  }
  if (stmt.type === "RepeatStatement") {
    return { ...stmt, body: (stmt.body || []).map((s: any) => transformStatement(s, rng, varName)), condition: mbaTransformExpression(stmt.condition, rng, varName) };
  }
  if (stmt.type === "ExpressionStatement") {
    return { ...stmt, expression: mbaTransformExpression(stmt.expression, rng, varName) };
  }
  if (stmt.type === "FunctionDeclaration") {
    return { ...stmt, body: { ...stmt.body, body: stmt.body.body.map((s: any) => transformStatement(s, rng, varName)) } };
  }
  return stmt;
}

export function applyMBA(ast: Chunk, options: MBAOptions = {}): Chunk {
  if (options.enabled === false) return ast;
  const rng = mulberry32(options.seed ?? 0);
  // Inject a seed variable declaration at the top of the chunk.
  const varName = "_mba";
  const seedVal = Math.floor(rng() * 1000000);
  const seedDecl: Statement = { type: "LocalStatement", vars: [{ name: varName }], values: [{ type: "NumberLiteral", value: seedVal, loc: ast.loc } as any], loc: ast.loc } as any;
  const newBody = ast.body.map((s) => transformStatement(s, rng, varName));
  return { ...ast, body: [seedDecl, ...newBody] } as any;
}
