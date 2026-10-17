import type {
  Chunk,
  Statement,
  LastStatement,
  Expression,
  BinaryExpression,
  IfStatement,
  WhileStatement,
  RepeatStatement,
} from "../ast/types.js";
import type { SourceLocation } from "../tokens.js";

const OPAQUE_PREDICATES: [number, string, number, number][] = [
  [7, "*", 7, 49],
  [1, "+", 1, 2],
  [15, "*", 15, 225],
  [100, "%", 7, 2],
  [12, "*", 12, 144],
  [3, "^", 2, 9],
];

function makeLoc(start: SourceLocation["start"], end: SourceLocation["end"]): SourceLocation {
  return { start, end };
}

function createOpaquePredicate(index: number, loc: SourceLocation): BinaryExpression {
  const [a, op, b, c] = OPAQUE_PREDICATES[index % OPAQUE_PREDICATES.length]!;
  return {
    type: "BinaryExpression",
    operator: "==",
    left: {
      type: "BinaryExpression",
      operator: op,
      left: { type: "NumberLiteral", value: a, loc },
      right: { type: "NumberLiteral", value: b, loc },
      loc,
    },
    right: { type: "NumberLiteral", value: c, loc },
    loc,
  };
}

function wrapWithOpaque(condition: Expression, loc: SourceLocation, seed: number): Expression {
  const opaque = createOpaquePredicate(seed, loc);
  return {
    type: "BinaryExpression",
    operator: "and",
    left: opaque,
    right: condition,
    loc,
  };
}

// Large-input memory: these transforms used to rebuild every node via object
// spread, allocating a full parallel AST (2x live nodes plus garbage per
// pass) before the old tree became unreachable. They now mutate nodes in
// place and return the same object. Traversal order and every seed-counter
// increment are preserved exactly, so generated output is byte-identical for
// an unchanged input.
function transformExpression(exp: Expression, seed: { value: number }): Expression {
  if (exp.type === "BinaryExpression") {
    exp.left = transformExpression(exp.left, seed);
    exp.right = transformExpression(exp.right, seed);
    return exp;
  }
  if (exp.type === "UnaryExpression") {
    exp.argument = transformExpression(exp.argument, seed);
    return exp;
  }
  if (exp.type === "CallExpression") {
    exp.callee = transformExpression(exp.callee, seed);
    const args = exp.args;
    for (let i = 0; i < args.length; i++) args[i] = transformExpression(args[i]!, seed);
    return exp;
  }
  if (exp.type === "MethodCallExpression") {
    exp.object = transformExpression(exp.object, seed);
    const args = exp.args;
    for (let i = 0; i < args.length; i++) args[i] = transformExpression(args[i]!, seed);
    return exp;
  }
  if (exp.type === "IndexExpression") {
    exp.object = transformExpression(exp.object, seed);
    exp.index = transformExpression(exp.index, seed);
    return exp;
  }
  if (exp.type === "MemberExpression") {
    exp.object = transformExpression(exp.object, seed);
    return exp;
  }
  if (exp.type === "TableConstructor") {
    for (const f of exp.fields) {
      if (f.kind === "index") {
        f.index = transformExpression(f.index, seed);
        f.value = transformExpression(f.value, seed);
      } else {
        f.value = transformExpression(f.value, seed);
      }
    }
    return exp;
  }
  if (exp.type === "FunctionExpression") {
    const body = exp.body;
    for (let i = 0; i < body.length; i++) body[i] = transformStatement(body[i]!, seed);
    return exp;
  }
  if (exp.type === "ParenExpression") {
    exp.expression = transformExpression(exp.expression, seed);
    return exp;
  }
  if (exp.type === "TypeAssertion") {
    exp.expression = transformExpression(exp.expression, seed);
    return exp;
  }
  if (exp.type === "IfElseExpression") {
    exp.condition = transformExpression(exp.condition, seed);
    exp.thenExp = transformExpression(exp.thenExp, seed);
    const clauses = exp.elseifClauses;
    for (let i = 0; i < clauses.length; i++) {
      const c = clauses[i]!;
      c.condition = transformExpression(c.condition, seed);
      c.value = transformExpression(c.value, seed);
    }
    exp.elseExp = transformExpression(exp.elseExp, seed);
    return exp;
  }
  if (exp.type === "StringInterpolation") {
    const parts = exp.parts;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!;
      if (typeof p !== "string") parts[i] = transformExpression(p, seed);
    }
    return exp;
  }
  return exp;
}

function transformStatement(
  stmt: Statement | LastStatement,
  seed: { value: number }
): Statement | LastStatement {
  switch (stmt.type) {
    case "IfStatement": {
      seed.value++;
      stmt.condition = wrapWithOpaque(
        transformExpression(stmt.condition, seed),
        stmt.condition.loc,
        seed.value
      );
      const thenBody = stmt.thenBody;
      for (let i = 0; i < thenBody.length; i++) thenBody[i] = transformStatement(thenBody[i]!, seed);
      const clauses = stmt.elseifClauses;
      for (let i = 0; i < clauses.length; i++) {
        const c = clauses[i]!;
        seed.value++;
        c.condition = wrapWithOpaque(
          transformExpression(c.condition, seed),
          c.condition.loc,
          seed.value
        );
        for (let j = 0; j < c.body.length; j++) c.body[j] = transformStatement(c.body[j]!, seed);
      }
      clauses.push({
        condition: { type: "BooleanLiteral", value: false, loc: stmt.loc } as any,
        body: [{ type: "ExpressionStatement", expression: { type: "CallExpression", callee: { type: "Identifier", name: "print", loc: stmt.loc } as any, args: [], loc: stmt.loc } as any, loc: stmt.loc } as any],
      });
      if (stmt.elseBody) {
        const elseBody = stmt.elseBody;
        for (let i = 0; i < elseBody.length; i++) elseBody[i] = transformStatement(elseBody[i]!, seed);
      }
      return stmt;
    }
    case "WhileStatement": {
      seed.value++;
      stmt.condition = wrapWithOpaque(
        transformExpression(stmt.condition, seed),
        stmt.condition.loc,
        seed.value
      );
      const body = stmt.body;
      for (let i = 0; i < body.length; i++) body[i] = transformStatement(body[i]!, seed);
      return stmt;
    }
    case "RepeatStatement": {
      seed.value++;
      const body = stmt.body;
      for (let i = 0; i < body.length; i++) body[i] = transformStatement(body[i]!, seed);
      stmt.condition = wrapWithOpaque(
        transformExpression(stmt.condition, seed),
        stmt.condition.loc,
        seed.value
      );
      return stmt;
    }
    case "LocalStatement": {
      if (stmt.values) {
        const values = stmt.values;
        for (let i = 0; i < values.length; i++) values[i] = transformExpression(values[i]!, seed);
      }
      return stmt;
    }
    case "AssignmentStatement": {
      const vars = stmt.vars;
      for (let i = 0; i < vars.length; i++) {
        const v = vars[i]!;
        if (v.type === "Identifier") continue;
        if (v.type === "IndexExpression") {
          v.object = transformExpression(v.object, seed);
          v.index = transformExpression(v.index, seed);
        } else {
          v.object = transformExpression(v.object, seed);
        }
      }
      const values = stmt.values;
      for (let i = 0; i < values.length; i++) values[i] = transformExpression(values[i]!, seed);
      return stmt;
    }
    case "CompoundAssignmentStatement": {
      if (stmt.var.type !== "Identifier") {
        if (stmt.var.type === "IndexExpression") {
          stmt.var.object = transformExpression(stmt.var.object, seed);
          stmt.var.index = transformExpression(stmt.var.index, seed);
        } else {
          stmt.var.object = transformExpression(stmt.var.object, seed);
        }
      }
      stmt.value = transformExpression(stmt.value, seed);
      return stmt;
    }
    case "FunctionCallStatement": {
      stmt.call = transformExpression(stmt.call, seed) as any;
      return stmt;
    }
    case "ReturnStatement": {
      if (stmt.values) {
        const values = stmt.values;
        for (let i = 0; i < values.length; i++) values[i] = transformExpression(values[i]!, seed);
      }
      return stmt;
    }
    case "ForNumericStatement": {
      stmt.start = transformExpression(stmt.start, seed);
      stmt.end = transformExpression(stmt.end, seed);
      stmt.step = stmt.step ? transformExpression(stmt.step, seed) : undefined;
      const body = stmt.body;
      for (let i = 0; i < body.length; i++) body[i] = transformStatement(body[i]!, seed);
      return stmt;
    }
    case "ForInStatement": {
      const iter = stmt.iter;
      for (let i = 0; i < iter.length; i++) iter[i] = transformExpression(iter[i]!, seed);
      const body = stmt.body;
      for (let i = 0; i < body.length; i++) body[i] = transformStatement(body[i]!, seed);
      return stmt;
    }
    case "LocalFunctionStatement":
    case "FunctionStatement":
    case "TypeFunctionStatement":
    case "ExportTypeFunctionStatement": {
      seed.value++;
      const stVar = `_st${seed.value}`;
      const transformedBody = stmt.body || [];
      for (let i = 0; i < transformedBody.length; i++) transformedBody[i] = transformStatement(transformedBody[i]!, seed);
      (stmt as any).body = [
        { type: "LocalStatement", vars: [{ name: stVar }], values: [{ type: "NumberLiteral", value: 0, loc: stmt.loc } as any], loc: stmt.loc } as any,
        {
          type: "WhileStatement",
          condition: { type: "BooleanLiteral", value: true, loc: stmt.loc } as any,
          body: [
            {
              type: "IfStatement",
              condition: { type: "BinaryExpression", operator: "==", left: { type: "Identifier", name: stVar, loc: stmt.loc } as any, right: { type: "NumberLiteral", value: 0, loc: stmt.loc } as any, loc: stmt.loc } as any,
              thenBody: [...transformedBody, { type: "AssignmentStatement", vars: [{ name: stVar }], values: [{ type: "NumberLiteral", value: 1, loc: stmt.loc } as any], loc: stmt.loc } as any],
              elseifClauses: [{ condition: { type: "BinaryExpression", operator: "==", left: { type: "Identifier", name: stVar, loc: stmt.loc } as any, right: { type: "NumberLiteral", value: 1, loc: stmt.loc } as any, loc: stmt.loc } as any, body: [{ type: "BreakStatement", loc: stmt.loc } as any] }],
              elseBody: [{ type: "BreakStatement", loc: stmt.loc } as any],
              loc: stmt.loc,
            } as any,
          ],
          loc: stmt.loc,
        } as any,
      ];
      return stmt;
    }
    case "DoStatement": {
      const body = stmt.body;
      for (let i = 0; i < body.length; i++) body[i] = transformStatement(body[i]!, seed);
      return stmt;
    }
    default:
      return stmt;
  }
}

export interface ControlFlowScramblerOptions {

  seed?: number;

  enabled?: boolean;
}

export function scrambleControlFlow(
  ast: Chunk,
  options: ControlFlowScramblerOptions = {}
): Chunk {
  const enabled = options.enabled !== false;
  const seed = { value: options.seed ?? 0 };

  if (!enabled) return ast;

  const body = ast.body;
  for (let i = 0; i < body.length; i++) body[i] = transformStatement(body[i]!, seed);
  return ast;
}
