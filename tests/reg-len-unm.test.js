// Reg-runner __len/__unm mirror tests.
// SCOPE: differential parity between the stack and register reference
// runners, plus mirror-defined literals. NOT runtime-validated against a
// real Lua/Luau target (no executor yet); runtime-truth differential is a
// separate measurement-track item.
//
// Stack semantics mirrored verbatim (vm-runner.ts): UNM tries __unm then
// unary minus; LEN tries __len then luaLen. Metamethod RESULTS pass through
// uncoerced (unlike comparisons' `=== true` rule) — including non-numbers.
// Known parity-only divergences from real Lua (both runners agree, Lua
// would differ): length of a number yields 0 here but errors in Lua;
// __len/__unm fire without any same-metamethod requirement.
import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { obfuscate } from "../dist/obfuscator/index.js";
import { compile } from "../dist/vm/Compiler.js";
import { regCompile } from "../dist/vm/RegCompiler.js";
import { runVM } from "../dist/vm/vm-runner.js";
import { runReg } from "../dist/vm/reg-runner.js";

function stackRun(src, env) {
  const lr = lex(src);
  if (lr.errors.length) throw new Error("lex: " + JSON.stringify(lr.errors));
  const obf = obfuscate(parse(lr.tokens), { renameLocals: true, preserveGlobals: true });
  const chunk = compile(obf);
  return runVM(chunk.K, chunk.code, env, 0, chunk.protos || []);
}
function regVal(src, env) {
  const lr = lex(src);
  if (lr.errors.length) throw new Error("lex: " + JSON.stringify(lr.errors));
  return runReg(regCompile(parse(lr.tokens)), env)[0];
}
function expectBoth(src, env, want) {
  const sv = stackRun(src, env);
  const rv = regVal(src, env);
  expect(rv).toBe(sv);
  expect(sv).toBe(want);
}
function mmObj(tag) {
  const o = { tag: tag };
  o.__metatable = {};
  return o;
}
function withMM(o, name, fn) {
  o.__metatable[name] = fn;
  return o;
}
function mkEnv(entries) {
  const env = {};
  for (const k of Object.keys(entries)) env[k] = entries[k];
  env._G = env;
  return env;
}

describe("reg __unm dispatch matches stack", () => {
  test("plain number negation", () => {
    expectBoth("return -5", mkEnv({}), -5);
  });
  test("variable negation", () => {
    expectBoth("local x = 4 return -x", mkEnv({}), -4);
  });
  test("metamethod result passes through (even non-number)", () => {
    const O = withMM(mmObj("O"), "__unm", () => "neg");
    expectBoth("return -O", mkEnv({ O: O }), "neg");
  });
  test("metamethod receives the operand itself", () => {
    const O = mmObj("O");
    const seen = [];
    withMM(O, "__unm", (v) => { seen.push(v === O); return 0; });
    expectBoth("return -O", mkEnv({ O: O }), 0);
    expect(seen).toEqual([true, true]);
  });
  test("numeric-string coercion", () => {
    expectBoth('return -S', mkEnv({ S: "5" }), -5);
  });
});

describe("reg __len dispatch matches stack", () => {
  test("sequence length", () => {
    expectBoth("local t = {1, 2, 3} return #t", mkEnv({}), 3);
  });
  test("border stops at first hole", () => {
    expectBoth("local t = {1, nil, 3} return #t", mkEnv({}), 1);
  });
  test("empty table", () => {
    expectBoth("local t = {} return #t", mkEnv({}), 0);
  });
  test("metamethod result passes through (even non-number)", () => {
    const O = withMM(mmObj("O"), "__len", () => "L");
    expectBoth("return #O", mkEnv({ O: O }), "L");
  });
  test("metamethod receives the operand itself", () => {
    const O = mmObj("O");
    const seen = [];
    withMM(O, "__len", (v) => { seen.push(v === O); return 7; });
    expectBoth("return #O", mkEnv({ O: O }), 7);
    expect(seen).toEqual([true, true]);
  });
  test("number length is 0 on both (parity-only: Lua errors)", () => {
    expectBoth("return #N", mkEnv({ N: 5 }), 0);
  });
});
