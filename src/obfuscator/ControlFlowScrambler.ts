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
      left: { type: "NumberLiteral", value: String(a), loc },
      right: { type: "NumberLiteral", value: String(b), loc },
      loc,
    },
    right: { type: "NumberLiteral", value: String(c), loc },
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

function transformExpression(exp: Expression, seed: { value: number }): Expression {
  if (exp.type === "BinaryExpression") {
    return {
      ...exp,
      left: transformExpression(exp.left, seed),
      right: transformExpression(exp.right, seed),
    };
  }
  if (exp.type === "UnaryExpression") {
    return { ...exp, argument: transformExpression(exp.argument, seed) };
  }
  if (exp.type === "CallExpression") {
    return {
      ...exp,
      callee: transformExpression(exp.callee, seed),
      args: exp.args.map((a) => transformExpression(a, seed)),
    };
  }
  if (exp.type === "MethodCallExpression") {
    return {
      ...exp,
      object: transformExpression(exp.object, seed),
      args: exp.args.map((a) => transformExpression(a, seed)),
    };
  }
  if (exp.type === "IndexExpression") {
    return {
      ...exp,
      object: transformExpression(exp.object, seed),
      index: transformExpression(exp.index, seed),
    };
  }
  if (exp.type === "MemberExpression") {
    return { ...exp, object: transformExpression(exp.object, seed) };
  }
  if (exp.type === "TableConstructor") {
    return {
      ...exp,
      fields: exp.fields.map((f) => {
        if (f.kind === "index")
          return { ...f, index: transformExpression(f.index, seed), value: transformExpression(f.value, seed) };
        return { ...f, value: transformExpression(f.value, seed) };
      }),
    };
  }
  if (exp.type === "FunctionExpression") {
    return {
      ...exp,
      body: exp.body.map((s) => transformStatement(s, seed)),
    };
  }
  if (exp.type === "ParenExpression") {
    return { ...exp, expression: transformExpression(exp.expression, seed) };
  }
  if (exp.type === "TypeAssertion") {
    return { ...exp, expression: transformExpression(exp.expression, seed) };
  }
  if (exp.type === "IfElseExpression") {
    return {
      ...exp,
      condition: transformExpression(exp.condition, seed),
      thenExp: transformExpression(exp.thenExp, seed),
      elseifClauses: exp.elseifClauses.map((c) => ({
        ...c,
        condition: transformExpression(c.condition, seed),
        value: transformExpression(c.value, seed),
      })),
      elseExp: transformExpression(exp.elseExp, seed),
    };
  }
  if (exp.type === "StringInterpolation") {
    return {
      ...exp,
      parts: exp.parts.map((p) =>
        typeof p === "string" ? p : transformExpression(p, seed)
      ),
    };
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
      const newCondition = wrapWithOpaque(
        transformExpression(stmt.condition, seed),
        stmt.condition.loc,
        seed.value
      );
      return {
        ...stmt,
        condition: newCondition,
        thenBody: stmt.thenBody.map((s) => transformStatement(s, seed)),
        elseifClauses: stmt.elseifClauses.map((c) => {
          seed.value++;
          return {
            condition: wrapWithOpaque(
              transformExpression(c.condition, seed),
              c.condition.loc,
              seed.value
            ),
            body: c.body.map((s) => transformStatement(s, seed)),
          };
        }).concat([{
          condition: { type: "BooleanLiteral", value: false, loc: stmt.loc } as any,
          body: [{ type: "ExpressionStatement", expression: { type: "CallExpression", callee: { type: "Identifier", name: "print", loc: stmt.loc } as any, args: [], loc: stmt.loc } as any, loc: stmt.loc } as any],
        }]),
        elseBody: stmt.elseBody?.map((s) => transformStatement(s, seed)),
      };
    }
    case "WhileStatement": {
      seed.value++;
      return {
        ...stmt,
        condition: wrapWithOpaque(
          transformExpression(stmt.condition, seed),
          stmt.condition.loc,
          seed.value
        ),
        body: stmt.body.map((s) => transformStatement(s, seed)),
      };
    }
    case "RepeatStatement": {
      seed.value++;
      return {
        ...stmt,
        body: stmt.body.map((s) => transformStatement(s, seed)),
        condition: wrapWithOpaque(
          transformExpression(stmt.condition, seed),
          stmt.condition.loc,
          seed.value
        ),
      };
    }
    case "LocalStatement":
      return {
        ...stmt,
        values: stmt.values?.map((e) => transformExpression(e, seed)),
      };
    case "AssignmentStatement":
      return {
        ...stmt,
        vars: stmt.vars.map((v) => {
          if (v.type === "Identifier") return v;
          if (v.type === "IndexExpression")
            return {
              ...v,
              object: transformExpression(v.object, seed),
              index: transformExpression(v.index, seed),
            };
          return { ...v, object: transformExpression(v.object, seed) };
        }),
        values: stmt.values.map((e) => transformExpression(e, seed)),
      };
    case "CompoundAssignmentStatement":
      return {
        ...stmt,
        var:
          stmt.var.type === "Identifier"
            ? stmt.var
            : {
                ...stmt.var,
                object: transformExpression(stmt.var.object, seed),
                ...(stmt.var.type === "IndexExpression" && {
                  index: transformExpression(stmt.var.index, seed),
                }),
              },
        value: transformExpression(stmt.value, seed),
      };
    case "FunctionCallStatement":
      return {
        ...stmt,
        call: transformExpression(stmt.call, seed) as any,
      };
    case "ReturnStatement":
      return {
        ...stmt,
        values: stmt.values?.map((e) => transformExpression(e, seed)),
      };
    case "ForNumericStatement":
      return {
        ...stmt,
        start: transformExpression(stmt.start, seed),
        end: transformExpression(stmt.end, seed),
        step: stmt.step ? transformExpression(stmt.step, seed) : undefined,
        body: stmt.body.map((s) => transformStatement(s, seed)),
      };
    case "ForInStatement":
      return {
        ...stmt,
        iter: stmt.iter.map((e) => transformExpression(e, seed)),
        body: stmt.body.map((s) => transformStatement(s, seed)),
      };
    case "LocalFunctionStatement":
    case "FunctionStatement":
    case "TypeFunctionStatement":
    case "ExportTypeFunctionStatement": {
      seed.value++;
      const stVar = `_st${seed.value}`;
      const transformedBody = (stmt.body || []).map((s) => transformStatement(s, seed));
      return {
        ...stmt,
        body: [
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
        ],
      };
    }
    case "DoStatement":
      return {
        ...stmt,
        body: stmt.body.map((s) => transformStatement(s, seed)),
      };
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

  return {
    ...ast,
    body: ast.body.map((s) => transformStatement(s, seed)),
  };
}
