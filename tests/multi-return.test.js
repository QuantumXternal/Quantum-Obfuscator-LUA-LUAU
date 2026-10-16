// Multi-return truncation differential tests (Task 3).
// SCOPE: these tests establish stack-runner/reference-runner PARITY plus
// agreement with spec-derived literals. They do NOT validate against a real
// Lua/Luau runtime (no executor exists); runtime-truth differential testing
// is a separate P2 measurement-track item. Do not cite this file as proof of
// language-level compatibility.
// Lua adjusts all but the LAST call/vararg in an expression list to exactly
// one value; surplus results pad with nil. Both reference runners must agree
// with each other and with these spec-derived expectations. Float-MOD-style
// kernel differences do not apply here (integer/nil values only).
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
function mkEnv() {
  const env = { print: () => {} };
  env._G = env;
  return env;
}
function expectBoth(src, wantJson) {
  const sv = JSON.stringify(stackRun(src, mkEnv()));
  const rv = JSON.stringify(regVal(src, mkEnv()));
  expect(rv).toBe(sv);
  expect(sv).toBe(wantJson);
}

describe("multi-return truncation: runner parity (not runtime-validated)", () => {
  test("non-last call adjusts to one value", () => {
    expectBoth(
      "local function f() return 1, 2 end local function g() return 3, 4 end local a, b = f(), g() return {a, b}",
      '{"1":1,"2":3}'
    );
  });
  test("single target keeps first value only", () => {
    expectBoth(
      "local function f() return 1, 2 end local function g() return 3, 4 end local a = f(), g() return a",
      "1"
    );
  });
  test("table constructor truncates non-last call", () => {
    expectBoth(
      "local function f() return 1, 2 end local t = {f(), 9} return t",
      '{"1":1,"2":9}'
    );
  });
  test("call args spread the last call", () => {
    expectBoth(
      "local function f() return 1, 2 end local function g(a, b) return a + b end return g(f())",
      "3"
    );
  });
  test("last call expands fully in table", () => {
    expectBoth("local function f() return 1, 2 end return {f()}", '{"1":1,"2":2}');
  });
  test("fewer targets than values drops extras", () => {
    expectBoth(
      "local function f() return 1, 2, 3 end local a, b = f() return {a, b}",
      '{"1":1,"2":2}'
    );
  });
  test("fewer values than targets pads nil", () => {
    expectBoth(
      "local function f() return 1, 2 end local a, b, c = f() return {a, b, c}",
      '{"1":1,"2":2,"3":null}'
    );
  });
  test("missing values default nil", () => {
    expectBoth("local a, b = 1 return {a, b}", '{"1":1,"2":null}');
  });
});
