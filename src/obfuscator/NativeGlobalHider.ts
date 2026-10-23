import type {
  Chunk,
  Expression,
  FunctionExpression,
  LastStatement,
  Statement,
  Var,
} from "../ast/types.js";
import { lex } from "../lexer/Lexer.js";
import { parseWithErrors } from "../parser/Parser.js";
import { buildCoreShimLua } from "../vm/coreShim.js";
import { encodeStringExpression } from "./StringEncoder.js";

const SAFE_GLOBALS = new Set([
  "_G", "_ENV", "getgenv", "getfenv", "setfenv", "shared",
  "load", "loadstring", "require",
  "pcall", "xpcall", "select", "type", "typeof", "error", "assert",
  "tostring", "tonumber", "ipairs", "pairs", "next",
  "rawget", "rawset", "rawequal", "rawlen", "unpack",
  "table", "string", "math", "coroutine", "os", "debug", "bit32", "utf8",
  "setmetatable", "getmetatable", "newproxy", "collectgarbage",
  "print", "warn",
]);

export interface NativeGlobalHiderOptions {
  functionNames: Set<string>;
  aliasName: string;
  decoderName: string;
  key?: number;
}

export interface NativeGlobalHiderResult {
  statements: Statement[];
  hidden: number;
  aliasName: string | null;
}

type Scopes = Set<string>[];

function isBound(name: string, scopes: Scopes): boolean {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i]!.has(name)) return true;
  }
  return false;
}

function parseAlias(aliasName: string): Statement[] {
  const shim = buildCoreShimLua(
    `function(_0k) local _0ok,_0v=pcall(function() return e[_0k] end);if _0ok and _0v~=nil then return _0v end;return nil end`,
  );
  const src = [
    `local ${aliasName}=(function()`,
    `local e`,
    `if type(getgenv)=="function" then`,
    `local ok`,
    `ok,e=pcall(getgenv)`,
    `if not ok or type(e)~="table" then e=nil end`,
    `end`,
    `if e==nil and type(getfenv)=="function" then`,
    `local ok`,
    `ok,e=pcall(getfenv,0)`,
    `if not ok or type(e)~="table" then e=nil end`,
    `end`,
    `if e==nil and type(_G)=="table" then e=_G end`,
    `if e==nil then e={} end`,
    `local _0s=${shim}`,
    `local _0b={}`,
    `rawset(_0b,"task",_0s["task"])`,
    `rawset(_0b,"wait",_0s["wait"])`,
    `rawset(_0b,"_safe_task",_0s["safe_task"])`,
    `rawset(_0b,"_safe_wait",_0s["safe_wait"])`,
    `return setmetatable(_0b,{__index=e,__newindex=function(_,_0k,_0v) e[_0k]=_0v end})`,
    `end)()`,
  ].join("\n");
  const lr = lex(src);
  const parsed = parseWithErrors(lr.tokens);
  if (lr.errors.length > 0 || parsed.errors.length > 0) {
    throw new Error("failed to build native global alias");
  }
  return parsed.ast.body as Statement[];
}

function globalRead(
  name: string,
  loc: any,
  aliasName: string,
  decoderName: string,
  key: number,
): Expression {
  return {
    type: "IndexExpression",
    object: { type: "Identifier", name: aliasName, loc },
    index: encodeStringExpression(name, key, loc, decoderName),
    loc,
  };
}

function rewriteVar(
  v: Var,
  scopes: Scopes,
  options: Required<NativeGlobalHiderOptions>,
  counter: { hidden: number },
): Var {
  if (v.type === "Identifier") {
    if (v.name === options.aliasName || SAFE_GLOBALS.has(v.name) || isBound(v.name, scopes)) {
      return v;
    }
    counter.hidden++;
    return globalRead(v.name, v.loc, options.aliasName, options.decoderName, options.key) as Var;
  }
  if (v.type === "IndexExpression") {
    return {
      ...v,
      object: rewriteExpression(v.object, scopes, options, counter),
      index: rewriteExpression(v.index, scopes, options, counter),
    };
  }
  return {
    ...v,
    object: rewriteExpression(v.object, scopes, options, counter),
  };
}

function rewriteExpression(
  exp: Expression,
  scopes: Scopes,
  options: Required<NativeGlobalHiderOptions>,
  counter: { hidden: number },
): Expression {
  switch (exp.type) {
    case "Identifier":
      if (exp.name === options.aliasName || SAFE_GLOBALS.has(exp.name) || isBound(exp.name, scopes)) {
        return exp;
      }
      counter.hidden++;
      return globalRead(exp.name, exp.loc, options.aliasName, options.decoderName, options.key);
    case "BinaryExpression":
      return {
        ...exp,
        left: rewriteExpression(exp.left, scopes, options, counter),
        right: rewriteExpression(exp.right, scopes, options, counter),
      };
    case "UnaryExpression":
      return {
        ...exp,
        argument: rewriteExpression(exp.argument, scopes, options, counter),
      };
    case "CallExpression":
      return {
        ...exp,
        callee: rewriteExpression(exp.callee, scopes, options, counter),
        args: exp.args.map((a) => rewriteExpression(a, scopes, options, counter)),
      };
    case "MethodCallExpression":
      return {
        ...exp,
        object: rewriteExpression(exp.object, scopes, options, counter),
        args: exp.args.map((a) => rewriteExpression(a, scopes, options, counter)),
      };
    case "IndexExpression":
      return {
        ...exp,
        object: rewriteExpression(exp.object, scopes, options, counter),
        index: rewriteExpression(exp.index, scopes, options, counter),
      };
    case "MemberExpression":
      return {
        ...exp,
        object: rewriteExpression(exp.object, scopes, options, counter),
      };
    case "TableConstructor":
      return {
        ...exp,
        fields: exp.fields.map((f) => {
          if (f.kind === "index") {
            return {
              ...f,
              index: rewriteExpression(f.index, scopes, options, counter),
              value: rewriteExpression(f.value, scopes, options, counter),
            };
          }
          return {
            ...f,
            value: rewriteExpression(f.value, scopes, options, counter),
          };
        }),
      };
    case "FunctionExpression":
      rewriteFunction(exp, scopes, options, counter);
      return exp;
    case "ParenExpression":
      return {
        ...exp,
        expression: rewriteExpression(exp.expression, scopes, options, counter),
      };
    case "TypeAssertion":
      return {
        ...exp,
        expression: rewriteExpression(exp.expression, scopes, options, counter),
      };
    case "IfElseExpression":
      return {
        ...exp,
        condition: rewriteExpression(exp.condition, scopes, options, counter),
        thenExp: rewriteExpression(exp.thenExp, scopes, options, counter),
        elseifClauses: exp.elseifClauses.map((c) => ({
          ...c,
          condition: rewriteExpression(c.condition, scopes, options, counter),
          value: rewriteExpression(c.value, scopes, options, counter),
        })),
        elseExp: rewriteExpression(exp.elseExp, scopes, options, counter),
      };
    case "StringInterpolation":
      return {
        ...exp,
        parts: exp.parts.map((p) =>
          typeof p === "string" ? p : rewriteExpression(p, scopes, options, counter),
        ),
      };
    default:
      return exp;
  }
}

function rewriteBlock(
  body: (Statement | LastStatement)[],
  scopes: Scopes,
  options: Required<NativeGlobalHiderOptions>,
  counter: { hidden: number },
): void {
  for (let i = 0; i < body.length; i++) {
    body[i] = rewriteStatement(body[i]!, scopes, options, counter);
  }
}

function rewriteStatement(
  stmt: Statement | LastStatement,
  scopes: Scopes,
  options: Required<NativeGlobalHiderOptions>,
  counter: { hidden: number },
): Statement | LastStatement {
  switch (stmt.type) {
    case "AssignmentStatement":
      return {
        ...stmt,
        vars: stmt.vars.map((v) => rewriteVar(v, scopes, options, counter)),
        values: stmt.values.map((v) => rewriteExpression(v, scopes, options, counter)),
      };
    case "CompoundAssignmentStatement":
      return {
        ...stmt,
        var: rewriteVar(stmt.var, scopes, options, counter),
        value: rewriteExpression(stmt.value, scopes, options, counter),
      };
    case "FunctionCallStatement":
      return {
        ...stmt,
        call: rewriteExpression(stmt.call, scopes, options, counter) as any,
      };
    case "DoStatement": {
      const inner = [...scopes, new Set<string>()];
      rewriteBlock(stmt.body, inner, options, counter);
      return stmt;
    }
    case "WhileStatement": {
      stmt.condition = rewriteExpression(stmt.condition, scopes, options, counter);
      const inner = [...scopes, new Set<string>()];
      rewriteBlock(stmt.body, inner, options, counter);
      return stmt;
    }
    case "RepeatStatement": {
      const inner = [...scopes, new Set<string>()];
      rewriteBlock(stmt.body, inner, options, counter);
      stmt.condition = rewriteExpression(stmt.condition, inner, options, counter);
      return stmt;
    }
    case "IfStatement": {
      stmt.condition = rewriteExpression(stmt.condition, scopes, options, counter);
      rewriteBlock(stmt.thenBody, [...scopes, new Set<string>()], options, counter);
      stmt.elseifClauses = stmt.elseifClauses.map((c) => {
        const condition = rewriteExpression(c.condition, scopes, options, counter);
        const body = [...c.body];
        rewriteBlock(body, [...scopes, new Set<string>()], options, counter);
        return { ...c, condition, body };
      });
      if (stmt.elseBody) {
        rewriteBlock(stmt.elseBody, [...scopes, new Set<string>()], options, counter);
      }
      return stmt;
    }
    case "ForNumericStatement": {
      stmt.start = rewriteExpression(stmt.start, scopes, options, counter);
      stmt.end = rewriteExpression(stmt.end, scopes, options, counter);
      if (stmt.step) stmt.step = rewriteExpression(stmt.step, scopes, options, counter);
      const inner = [...scopes, new Set<string>([stmt.var.name])];
      rewriteBlock(stmt.body, inner, options, counter);
      return stmt;
    }
    case "ForInStatement": {
      stmt.iter = stmt.iter.map((e) => rewriteExpression(e, scopes, options, counter));
      const inner = [...scopes, new Set<string>(stmt.vars.map((v) => v.name))];
      rewriteBlock(stmt.body, inner, options, counter);
      return stmt;
    }
    case "FunctionStatement": {
      if (stmt.name.base.type === "MemberExpression") {
        stmt.name = {
          ...stmt.name,
          base: {
            ...stmt.name.base,
            object: rewriteExpression(stmt.name.base.object, scopes, options, counter),
          },
        };
      }
      const frame = new Set<string>(stmt.params.map((p) => p.name));
      if (stmt.name.method) frame.add("self");
      rewriteBlock(stmt.body, [...scopes, frame], options, counter);
      return stmt;
    }
    case "LocalFunctionStatement": {
      scopes[scopes.length - 1]!.add(stmt.name);
      const frame = new Set<string>(stmt.params.map((p) => p.name));
      rewriteBlock(stmt.body, [...scopes, frame], options, counter);
      return stmt;
    }
    case "LocalStatement": {
      if (stmt.values) {
        stmt.values = stmt.values.map((e) => rewriteExpression(e, scopes, options, counter));
      }
      for (const v of stmt.vars) scopes[scopes.length - 1]!.add(v.name);
      return stmt;
    }
    case "ReturnStatement":
      if (stmt.values) {
        stmt.values = stmt.values.map((e) => rewriteExpression(e, scopes, options, counter));
      }
      return stmt;
    default:
      return stmt;
  }
}

function rewriteFunction(
  fn: FunctionExpression,
  scopes: Scopes,
  options: Required<NativeGlobalHiderOptions>,
  counter: { hidden: number },
): void {
  const frame = new Set<string>(fn.params.map((p) => p.name));
  rewriteBlock(fn.body, [...scopes, frame], options, counter);
}

export function hideNativeGlobals(
  statements: Statement[],
  options: NativeGlobalHiderOptions,
): NativeGlobalHiderResult {
  const resolved: Required<NativeGlobalHiderOptions> = {
    functionNames: options.functionNames,
    aliasName: options.aliasName,
    decoderName: options.decoderName,
    key: options.key ?? 0x5a,
  };
  const counter = { hidden: 0 };
  for (const stmt of statements) {
    if (stmt.type !== "AssignmentStatement") continue;
    if (stmt.vars.length !== 1) continue;
    const target = stmt.vars[0]!;
    if (target.type !== "Identifier" || !resolved.functionNames.has(target.name)) continue;
    const value = stmt.values[0];
    if (value?.type !== "FunctionExpression") continue;
    rewriteFunction(value, [], resolved, counter);
  }
  if (counter.hidden === 0) {
    return { statements, hidden: 0, aliasName: null };
  }
  return {
    statements: [...parseAlias(resolved.aliasName), ...statements],
    hidden: counter.hidden,
    aliasName: resolved.aliasName,
  };
}
