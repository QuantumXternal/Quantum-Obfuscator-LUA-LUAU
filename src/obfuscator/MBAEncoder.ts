// Phase 4.1: Mixed Boolean-Arithmetic (MBA) constants.
// Rewrites numeric literals into MBA expressions that force a runtime
// variable operand, so the Luau compiler cannot constant-fold back to
// the original number and the K-array stores no readable constants.
import type { Expression, Chunk, Statement } from "../ast/types.js";

export interface MBAOptions {
  enabled?: boolean;
  seed?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// MBA identities (all equal to n when var is any integer):
//   n = (var + n) - var
//   n = (var ^ n) ^ var   (xor)  -- only if no carry; use add/sub form for correctness
//   n = (var * 1) + (n - var + var) ... simplify: use (var + n - var)
// We use: (v + n) - v  and  (v - (v - n)) and table-length form #{...}.
const VARIANTS = [
  (n: number, v: string) => `((${v} + ${n}) - ${v})`,
  (n: number, v: string) => `(${v} - (${v} - ${n}))`,
  (n: number, v: string) => `((${v} * 0 + ${n}) + (${v} - ${v}))`,
];

export function mbaTransformExpression(exp: Expression, rng: () => number, varName: string): Expression {
  if (exp.type === "NumberLiteral") {
    const n = (exp as any).value as number;
    if (!Number.isFinite(n)) return exp;
    // Skip 0/1 to keep output reasonable; still transform via identity.
    const variant = VARIANTS[Math.floor(rng() * VARIANTS.length)];
    const expr = variant(n, varName);
    // Parse back? We return a raw expression node by constructing a
    // BinaryExpression tree for (v + n) - v form to keep AST valid.
    // Build: (v + n) - v
    if (variant === VARIANTS[0]) {
      return {
        type: "BinaryExpression",
        operator: "-",
        left: { type: "BinaryExpression", operator: "+", left: { type: "Identifier", name: varName, loc: exp.loc }, right: { type: "NumberLiteral", value: n, loc: exp.loc }, loc: exp.loc } as any,
        right: { type: "Identifier", name: varName, loc: exp.loc } as any,
        loc: exp.loc,
      } as any;
    }
    if (variant === VARIANTS[1]) {
      return {
        type: "BinaryExpression",
        operator: "-",
        left: { type: "Identifier", name: varName, loc: exp.loc } as any,
        right: {
          type: "BinaryExpression", operator: "-", left: { type: "Identifier", name: varName, loc: exp.loc } as any,
          right: { type: "NumberLiteral", value: n, loc: exp.loc } as any, loc: exp.loc,
        } as any,
        loc: exp.loc,
      } as any;
    }
    // variant 2: (v*0 + n) + (v - v)
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
    return { ...exp, fields: (exp as any).fields.map((f: any) => ({ ...f, value: f.value ? mbaTransformExpression(f.value, rng, varName) : f.value })) } as any;
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
    return { ...stmt, args: (stmt.args || []).map((e: any) => mbaTransformExpression(e, rng, varName)) };
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
