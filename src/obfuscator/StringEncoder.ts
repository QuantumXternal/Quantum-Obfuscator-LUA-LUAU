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
import { lex } from "../lexer/Lexer.js";
import { parse } from "../parser/Parser.js";

function makeLoc(start: SourceLocation["start"], end: SourceLocation["end"]): SourceLocation {
  return { start, end };
}

function encodeString(str: string, key: number): number[] {
  const bytes = Array.from(Buffer.from(str, "utf8"));
  const k = key & 0xff;
  const step = 1 + (k % 11);
  const offset = (k * 17 + 29) & 0xff;
  return bytes.map((b, i) => (((b ^ ((k + i * step) & 0xff)) + offset) & 0xff));
}

function utf8ByteLength(str: string): number {
  return Buffer.byteLength(str, "utf8");
}

export function encodeStringExpression(
  value: string,
  key: number,
  loc: SourceLocation,
  decoderName: string
): Expression {
  return makeDecodeCall(encodeString(value, key), key, loc, decoderName);
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
      value: b,
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
    args: [table, { type: "NumberLiteral", value: key, loc }],
    loc,
  };
}

function makeDecoderStatements(
  _key: number,
  _loc: SourceLocation,
  decoderName: string,
  rng: () => number = Math.random,
): Statement[] {
  const cacheName = `_c_${randomSuffix(rng, 4)}`;
  const src = [
    `local ${cacheName} = {}`,
    `local function ${decoderName}(t, k)`,
    `  if ${cacheName}[t] then return ${cacheName}[t] end`,
    `  local kb = math.floor(tonumber(k) or 0) % 256`,
    `  local step = 1 + (kb % 11)`,
    `  local off = (kb * 17 + 29) % 256`,
    `  local s = {}`,
    `  for i = 1, #t do`,
    `    local rk = (kb + (i - 1) * step) % 256`,
    `    local c = math.floor((math.floor(tonumber(t[i]) or 0) % 256 - off) % 256) % 256`,
    `    local v = math.floor(tonumber(bit32.bxor(c, math.floor(tonumber(rk) or 0) % 256)) or 0) % 256`,
    `    s[i] = string.char(math.floor(tonumber(v) or 0) % 256)`,
    `  end`,
    `  local res = table.concat(s)`,
    `  ${cacheName}[t] = res`,
    `  return res`,
    `end`,
  ].join("\n");
  return parse(lex(src).tokens).body as Statement[];
}

interface EncodeBudget {
  maxLen: number;
  remaining: number;
}

function transformExpression(exp: Expression, key: number, decoderName: string, budget: EncodeBudget): Expression {
  if (exp.type === "StringLiteral") {
    if (exp.value === "") return exp;
    // Budget gate: long literals stay plain (a per-byte table for an
    // N-byte literal compiles to O(N) instructions/constants and is what
    // sank large embedded assets); the total budget bounds instruction
    // growth for scripts with thousands of small strings. Budget in UTF-8
    // bytes because that is what the decoder reconstructs.
    const byteLen = utf8ByteLength(exp.value);
    if (byteLen > budget.maxLen || byteLen > budget.remaining) return exp;
    budget.remaining -= byteLen;
    const bytes = encodeString(exp.value, key);
    return makeDecodeCall(bytes, key, exp.loc, decoderName) as Expression;
  }
  if (exp.type === "BinaryExpression") {
    return {
      ...exp,
      left: transformExpression(exp.left, key, decoderName, budget),
      right: transformExpression(exp.right, key, decoderName, budget),
    };
  }
  if (exp.type === "UnaryExpression") {
    return { ...exp, argument: transformExpression(exp.argument, key, decoderName, budget) };
  }
  if (exp.type === "CallExpression") {
    return {
      ...exp,
      callee: transformExpression(exp.callee, key, decoderName, budget),
      args: exp.args.map((a) => transformExpression(a, key, decoderName, budget)),
    };
  }
  if (exp.type === "MethodCallExpression") {
    return {
      ...exp,
      object: transformExpression(exp.object, key, decoderName, budget),
      args: exp.args.map((a) => transformExpression(a, key, decoderName, budget)),
    };
  }
  if (exp.type === "IndexExpression") {
    return {
      ...exp,
      object: transformExpression(exp.object, key, decoderName, budget),
      index: transformExpression(exp.index, key, decoderName, budget),
    };
  }
  if (exp.type === "MemberExpression") {
    return { ...exp, object: transformExpression(exp.object, key, decoderName, budget) };
  }
  if (exp.type === "TableConstructor") {
    return {
      ...exp,
      fields: exp.fields.map((f) => {
        if (f.kind === "index")
          return { ...f, index: transformExpression(f.index, key, decoderName, budget), value: transformExpression(f.value, key, decoderName, budget) };
        if (f.kind === "named")
          return { ...f, value: transformExpression(f.value, key, decoderName, budget) };
        return { ...f, value: transformExpression(f.value, key, decoderName, budget) };
      }),
    };
  }
  if (exp.type === "FunctionExpression") {
    return {
      ...exp,
      body: exp.body.map((s) => transformStatement(s, key, decoderName, budget)),
    };
  }
  if (exp.type === "ParenExpression") {
    return { ...exp, expression: transformExpression(exp.expression, key, decoderName, budget) };
  }
  if (exp.type === "TypeAssertion") {
    return { ...exp, expression: transformExpression(exp.expression, key, decoderName, budget) };
  }
  if (exp.type === "IfElseExpression") {
    return {
      ...exp,
      condition: transformExpression(exp.condition, key, decoderName, budget),
      thenExp: transformExpression(exp.thenExp, key, decoderName, budget),
      elseifClauses: exp.elseifClauses?.map((c) => ({
        ...c,
        condition: transformExpression(c.condition, key, decoderName, budget),
        value: transformExpression(c.value, key, decoderName, budget),
      })),
      elseExp: transformExpression(exp.elseExp, key, decoderName, budget),
    };
  }
  if (exp.type === "StringInterpolation") {
    return {
      ...exp,
      parts: exp.parts.map((p) =>
        typeof p === "string" ? p : transformExpression(p, key, decoderName, budget)
      ),
    };
  }
  return exp;
}

function transformStatement(stmt: Statement | LastStatement, key: number, decoderName: string, budget: EncodeBudget): Statement | LastStatement {
  switch (stmt.type) {
    case "LocalStatement":
      return {
        ...stmt,
        values: stmt.values?.map((e) => transformExpression(e, key, decoderName, budget)),
      };
    case "AssignmentStatement":
      return {
        ...stmt,
        vars: stmt.vars.map((v) => {
          if (v.type === "Identifier") return v;
          if (v.type === "IndexExpression")
            return { ...v, object: transformExpression(v.object, key, decoderName, budget), index: transformExpression(v.index, key, decoderName, budget) };
          return { ...v, object: transformExpression(v.object, key, decoderName, budget) };
        }),
        values: stmt.values.map((e) => transformExpression(e, key, decoderName, budget)),
      };
    case "CompoundAssignmentStatement":
      return {
        ...stmt,
        var: stmt.var.type === "Identifier" ? stmt.var : {
          ...stmt.var,
          object: transformExpression(stmt.var.object, key, decoderName, budget),
          ...(stmt.var.type === "IndexExpression" && { index: transformExpression(stmt.var.index, key, decoderName, budget) }),
        },
        value: transformExpression(stmt.value, key, decoderName, budget),
      };
    case "FunctionCallStatement":
      return { ...stmt, call: transformExpression(stmt.call, key, decoderName, budget) as CallExpression };
    case "ReturnStatement":
      return { ...stmt, values: stmt.values?.map((e) => transformExpression(e, key, decoderName, budget)) };
    case "IfStatement":
      return {
        ...stmt,
        condition: transformExpression(stmt.condition, key, decoderName, budget),
        thenBody: stmt.thenBody.map((s) => transformStatement(s, key, decoderName, budget)),
        elseifClauses: stmt.elseifClauses?.map((c) => ({
          ...c,
          condition: transformExpression(c.condition, key, decoderName, budget),
          body: c.body.map((s) => transformStatement(s, key, decoderName, budget)),
        })),
        elseBody: stmt.elseBody?.map((s) => transformStatement(s, key, decoderName, budget)),
      };
    case "ForNumericStatement":
      return {
        ...stmt,
        start: transformExpression(stmt.start, key, decoderName, budget),
        end: transformExpression(stmt.end, key, decoderName, budget),
        step: stmt.step ? transformExpression(stmt.step, key, decoderName, budget) : undefined,
        body: stmt.body.map((s) => transformStatement(s, key, decoderName, budget)),
      };
    case "ForInStatement":
      return {
        ...stmt,
        iter: stmt.iter.map((e) => transformExpression(e, key, decoderName, budget)),
        body: stmt.body.map((s) => transformStatement(s, key, decoderName, budget)),
      };
    case "LocalFunctionStatement":
    case "FunctionStatement":
      return {
        ...stmt,
        params: stmt.params,
        body: stmt.body.map((s) => transformStatement(s, key, decoderName, budget)),
      };
    case "DoStatement":
    case "WhileStatement":
    case "RepeatStatement":
      return {
        ...stmt,
        ...(stmt.type === "WhileStatement" && { condition: transformExpression(stmt.condition, key, decoderName, budget) }),
        ...(stmt.type === "RepeatStatement" && { condition: transformExpression(stmt.condition, key, decoderName, budget) }),
        body: stmt.body.map((s) => transformStatement(s, key, decoderName, budget)),
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

  // Longest string (UTF-8 bytes, matching encodeString) that gets encoded
  // into a byte table. Longer literals stay plain: an N-byte table compiles
  // to O(N) VM instructions/constants (embedded assets, base85 blobs), which
  // is the documented large-input failure mode. Default 64.
  maxStringLength?: number;

  // Total encoded-string bytes allowed per build. Once exhausted, the
  // remaining literals stay plain, bounding worst-case instruction growth
  // for scripts with thousands of small strings. Default 65536.
  maxTotalBytes?: number;

  // Deterministic decoder name for callers that need to identify the
  // generated decoder (e.g. to hoist decode calls out of hot callbacks).
  // Omitted = random name derived from `seed`/Math.random as before.
  decoderName?: string;
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
  const decoderName = options.decoderName ?? `_quantumDec_${randomSuffix(rng, 6)}`;
  const loc = ast.body[0]?.loc ?? { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };
  const decoders = makeDecoderStatements(key, loc, decoderName, rng);

  const budget: EncodeBudget = {
    maxLen: options.maxStringLength ?? 64,
    remaining: options.maxTotalBytes ?? 65536,
  };

  const transformedBody = ast.body.map((s) => transformStatement(s, key, decoderName, budget));

  return {
    ...ast,
    body: [...decoders, ...transformedBody],
  };
}
