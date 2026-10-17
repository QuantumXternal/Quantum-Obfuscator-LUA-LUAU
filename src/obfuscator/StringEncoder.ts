import type {
  Chunk,
  Statement,
  LastStatement,
  Expression,
  CallExpression,
  TableConstructor,
  TableField,
} from "../ast/types.js";
import type { SourceLocation } from "../tokens.js";

function makeLoc(start: SourceLocation["start"], end: SourceLocation["end"]): SourceLocation {
  return { start, end };
}

function encodeString(str: string, key: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < str.length; i++) {
    result.push(str.charCodeAt(i) ^ key);
  }
  return result;
}

function makeDecodeCall(
  bytes: number[],
  key: number,
  loc: SourceLocation,
  decoderName: string
): CallExpression {
  const tableFields: TableField[] = bytes.map((b) => ({
    kind: "value" as const,
    value: {
      type: "NumberLiteral",
      value: String(b),
      loc,
    },
  }));

  const table: TableConstructor = {
    type: "TableConstructor",
    fields: tableFields,
    loc,
  };

  return {
    type: "CallExpression",
    callee: {
      type: "Identifier",
      name: decoderName,
      loc,
    },
    args: [table, { type: "NumberLiteral", value: String(key), loc }],
    loc,
  };
}

function makeDecoderStatements(
  key: number,
  loc: SourceLocation,
  decoderName: string,
  rng: () => number = Math.random,
): Statement[] {
  const cacheName = `_c_${randomSuffix(rng, 4)}`;

  const cacheStmt: Statement = {
    type: "LocalStatement",
    vars: [{ name: cacheName, type: undefined }],
    values: [{ type: "TableConstructor", fields: [], loc }],
    loc,
  };

  const ifCacheStmt: Statement = {
    type: "IfStatement",
    condition: {
      type: "IndexExpression",
      object: { type: "Identifier", name: cacheName, loc },
      index: { type: "Identifier", name: "t", loc },
      loc,
    },
    thenBody: [
      {
        type: "ReturnStatement",
        values: [
          {
            type: "IndexExpression",
            object: { type: "Identifier", name: cacheName, loc },
            index: { type: "Identifier", name: "t", loc },
            loc,
          },
        ],
        loc,
      },
    ],
    elseifClauses: [],
    loc,
  };

  const sTableStmt: Statement = {
    type: "LocalStatement",
    vars: [{ name: "s", type: undefined }],
    values: [{ type: "TableConstructor", fields: [], loc }],
    loc,
  };

  const forLoopStmt: Statement = {
    type: "ForNumericStatement",
    var: { type: "Identifier", name: "i", loc },
    start: { type: "NumberLiteral", value: "1", loc },
    end: {
      type: "UnaryExpression",
      operator: "#",
      argument: { type: "Identifier", name: "t", loc },
      loc,
    },
    body: [
      {
        type: "AssignmentStatement",
        vars: [
          {
            type: "IndexExpression",
            object: { type: "Identifier", name: "s", loc },
            index: { type: "Identifier", name: "i", loc },
            loc,
          },
        ],
        values: [
          {
            type: "CallExpression",
            callee: {
              type: "MemberExpression",
              object: { type: "Identifier", name: "string", loc },
              property: "char",
              loc,
            },
            args: [
              {
                type: "CallExpression",
                callee: {
                  type: "MemberExpression",
                  object: { type: "Identifier", name: "bit32", loc },
                  property: "bxor",
                  loc,
                },
                args: [
                  {
                    type: "IndexExpression",
                    object: { type: "Identifier", name: "t", loc },
                    index: { type: "Identifier", name: "i", loc },
                    loc,
                  },
                  { type: "Identifier", name: "k", loc },
                ],
                loc,
              },
            ],
            loc,
          },
        ],
        loc,
      },
    ],
    loc,
  };

  const concatStmt: Statement = {
    type: "LocalStatement",
    vars: [{ name: "res", type: undefined }],
    values: [
      {
        type: "CallExpression",
        callee: {
          type: "MemberExpression",
          object: { type: "Identifier", name: "table", loc },
          property: "concat",
          loc,
        },
        args: [{ type: "Identifier", name: "s", loc }],
        loc,
      },
    ],
    loc,
  };

  const cacheAssignStmt: Statement = {
    type: "AssignmentStatement",
    vars: [
      {
        type: "IndexExpression",
        object: { type: "Identifier", name: cacheName, loc },
        index: { type: "Identifier", name: "t", loc },
        loc,
      },
    ],
    values: [{ type: "Identifier", name: "res", loc }],
    loc,
  };

  const returnStmt: LastStatement = {
    type: "ReturnStatement",
    values: [{ type: "Identifier", name: "res", loc }],
    loc,
  };

  const decoderFunc: Statement = {
    type: "LocalStatement",
    vars: [{ name: decoderName, type: undefined }],
    values: [
      {
        type: "FunctionExpression",
        params: [
          { type: "Param", name: "t", variadic: false, loc },
          { type: "Param", name: "k", variadic: false, loc },
        ],
        body: [
          ifCacheStmt,
          sTableStmt,
          forLoopStmt,
          concatStmt,
          cacheAssignStmt,
          returnStmt,
        ],
        loc,
      },
    ],
    loc,
  };

  return [cacheStmt, decoderFunc];
}

function transformExpression(exp: Expression, key: number, decoderName: string): Expression {
  if (exp.type === "StringLiteral") {
    if (exp.value === "") return exp;
    const bytes = encodeString(exp.value, key);
    return makeDecodeCall(bytes, key, exp.loc, decoderName) as Expression;
  }
  if (exp.type === "BinaryExpression") {
    return {
      ...exp,
      left: transformExpression(exp.left, key, decoderName),
      right: transformExpression(exp.right, key, decoderName),
    };
  }
  if (exp.type === "UnaryExpression") {
    return { ...exp, argument: transformExpression(exp.argument, key, decoderName) };
  }
  if (exp.type === "CallExpression") {
    return {
      ...exp,
      callee: transformExpression(exp.callee, key, decoderName),
      args: exp.args.map((a) => transformExpression(a, key, decoderName)),
    };
  }
  if (exp.type === "MethodCallExpression") {
    return {
      ...exp,
      object: transformExpression(exp.object, key, decoderName),
      args: exp.args.map((a) => transformExpression(a, key, decoderName)),
    };
  }
  if (exp.type === "IndexExpression") {
    return {
      ...exp,
      object: transformExpression(exp.object, key, decoderName),
      index: transformExpression(exp.index, key, decoderName),
    };
  }
  if (exp.type === "MemberExpression") {
    return { ...exp, object: transformExpression(exp.object, key, decoderName) };
  }
  if (exp.type === "TableConstructor") {
    return {
      ...exp,
      fields: exp.fields.map((f) => {
        if (f.kind === "index")
          return { ...f, index: transformExpression(f.index, key, decoderName), value: transformExpression(f.value, key, decoderName) };
        if (f.kind === "named")
          return { ...f, value: transformExpression(f.value, key, decoderName) };
        return { ...f, value: transformExpression(f.value, key, decoderName) };
      }),
    };
  }
  if (exp.type === "FunctionExpression") {
    return {
      ...exp,
      body: exp.body.map((s) => transformStatement(s, key, decoderName)),
    };
  }
  if (exp.type === "ParenExpression") {
    return { ...exp, expression: transformExpression(exp.expression, key, decoderName) };
  }
  if (exp.type === "TypeAssertion") {
    return { ...exp, expression: transformExpression(exp.expression, key, decoderName) };
  }
  if (exp.type === "IfElseExpression") {
    return {
      ...exp,
      condition: transformExpression(exp.condition, key, decoderName),
      thenExp: transformExpression(exp.thenExp, key, decoderName),
      elseifClauses: exp.elseifClauses?.map((c) => ({
        ...c,
        condition: transformExpression(c.condition, key, decoderName),
        value: transformExpression(c.value, key, decoderName),
      })),
      elseExp: transformExpression(exp.elseExp, key, decoderName),
    };
  }
  if (exp.type === "StringInterpolation") {
    return {
      ...exp,
      parts: exp.parts.map((p) =>
        typeof p === "string" ? p : transformExpression(p, key, decoderName)
      ),
    };
  }
  return exp;
}

function transformStatement(stmt: Statement | LastStatement, key: number, decoderName: string): Statement | LastStatement {
  switch (stmt.type) {
    case "LocalStatement":
      return {
        ...stmt,
        values: stmt.values?.map((e) => transformExpression(e, key, decoderName)),
      };
    case "AssignmentStatement":
      return {
        ...stmt,
        vars: stmt.vars.map((v) => {
          if (v.type === "Identifier") return v;
          if (v.type === "IndexExpression")
            return { ...v, object: transformExpression(v.object, key, decoderName), index: transformExpression(v.index, key, decoderName) };
          return { ...v, object: transformExpression(v.object, key, decoderName) };
        }),
        values: stmt.values.map((e) => transformExpression(e, key, decoderName)),
      };
    case "CompoundAssignmentStatement":
      return {
        ...stmt,
        var: stmt.var.type === "Identifier" ? stmt.var : {
          ...stmt.var,
          object: transformExpression(stmt.var.object, key, decoderName),
          ...(stmt.var.type === "IndexExpression" && { index: transformExpression(stmt.var.index, key, decoderName) }),
        },
        value: transformExpression(stmt.value, key, decoderName),
      };
    case "FunctionCallStatement":
      return { ...stmt, call: transformExpression(stmt.call, key, decoderName) as CallExpression };
    case "ReturnStatement":
      return { ...stmt, values: stmt.values?.map((e) => transformExpression(e, key, decoderName)) };
    case "IfStatement":
      return {
        ...stmt,
        condition: transformExpression(stmt.condition, key, decoderName),
        thenBody: stmt.thenBody.map((s) => transformStatement(s, key, decoderName)),
        elseifClauses: stmt.elseifClauses?.map((c) => ({
          ...c,
          condition: transformExpression(c.condition, key, decoderName),
          body: c.body.map((s) => transformStatement(s, key, decoderName)),
        })),
        elseBody: stmt.elseBody?.map((s) => transformStatement(s, key, decoderName)),
      };
    case "ForNumericStatement":
      return {
        ...stmt,
        start: transformExpression(stmt.start, key, decoderName),
        end: transformExpression(stmt.end, key, decoderName),
        step: stmt.step ? transformExpression(stmt.step, key, decoderName) : undefined,
        body: stmt.body.map((s) => transformStatement(s, key, decoderName)),
      };
    case "ForInStatement":
      return {
        ...stmt,
        iter: stmt.iter.map((e) => transformExpression(e, key, decoderName)),
        body: stmt.body.map((s) => transformStatement(s, key, decoderName)),
      };
    case "LocalFunctionStatement":
    case "FunctionStatement":
      return {
        ...stmt,
        params: stmt.params,
        body: stmt.body.map((s) => transformStatement(s, key, decoderName)),
      };
    case "DoStatement":
    case "WhileStatement":
    case "RepeatStatement":
      return {
        ...stmt,
        ...(stmt.type === "WhileStatement" && { condition: transformExpression(stmt.condition, key, decoderName) }),
        ...(stmt.type === "RepeatStatement" && { condition: transformExpression(stmt.condition, key, decoderName) }),
        body: stmt.body.map((s) => transformStatement(s, key, decoderName)),
      };
    default:
      return stmt;
  }
}

export interface StringEncoderOptions {

  key?: number;

  enabled?: boolean;

  // When provided, decoder/cache names are derived deterministically from
  // this seed (mulberry32) instead of Math.random(), enabling reproducible
  // builds, caching, and snapshot tests. Omitted = legacy random behavior.
  seed?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSuffix(rng: () => number, len: number): string {
  let s = "";
  while (s.length < len) s += rng().toString(36).substring(2);
  return s.substring(0, len);
}

export function encodeStrings(ast: Chunk, options: StringEncoderOptions = {}): Chunk {
  const enabled = options.enabled !== false;
  const key = (options.key ?? 0x5A) & 0xff;

  if (!enabled) return ast;

  const rng = options.seed !== undefined ? mulberry32(options.seed) : Math.random;
  const decoderName = `_quantumDec_${randomSuffix(rng, 6)}`;
  const loc = ast.body[0]?.loc ?? { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };
  const decoders = makeDecoderStatements(key, loc, decoderName, rng);

  const transformedBody = ast.body.map((s) => transformStatement(s, key, decoderName));

  return {
    ...ast,
    body: [...decoders, ...transformedBody],
  };
}
