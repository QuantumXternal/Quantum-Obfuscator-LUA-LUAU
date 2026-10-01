// Stage 12B semantic baseline (UNFUSED paths only — no fused DIV/MOD/POW/IDIV
// opcodes exist yet). Validates the reference runner models the ESTABLISHED
// generated semantics (vm-gen.ts h[12]/h[13]/h[14]/h[48] via generated
// arithMM). Expected values are LUA/LUAU LANGUAGE SEMANTICS hand-encoded as
// constants — never derived from JS operators where they differ (notably %
// is floor modulo). No Luau executor exists here; the Luau column is
// REASONED. One documented divergence: IDIV-by-zero yields inf (production
// h48 uses math.floor(x/y), not raw // which would error natively).
import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { obfuscate } from "../dist/obfuscator/index.js";
import { compile } from "../dist/vm/Compiler.js";
import { runVM } from "../dist/vm/vm-runner.js";

// Numeric opcodes: PUSH_K=4 LOAD_L=5 STORE_L=6 DIV=12 MOD=13 POW=14 RETURN=31 IDIV=48.
function runArith(op, a, b) {
  const K = [a, b];
  const code = [4, 0, 6, 0, 4, 1, 6, 1, 5, 0, 5, 1, op, 6, 2, 5, 2, 31, 1];
  return runVM(K, code, {}, 0, []);
}
function compileSrc(src) {
  const { tokens, errors } = lex(src);
  if (errors.length) throw new Error("lex: " + JSON.stringify(errors));
  return compile(obfuscate(parse(tokens), { renameLocals: false, preserveGlobals: true }));
}
function runSrc(src) {
  const chunk = compileSrc(src);
  return runVM(chunk.K, chunk.code, { print: () => {} }, 0, chunk.protos || []);
}

describe("12B semantic baseline: unfused DIV", () => {
  test("positive/negative/fractional", () => {
    expect(runArith(12, 20, 4)).toBe(5);
    expect(runArith(12, -7, 2)).toBe(-3.5);
    expect(runArith(12, 7, -2)).toBe(-3.5);
    expect(runArith(12, 5.5, 2)).toBe(2.75);
    expect(runArith(12, "6", 2)).toBe(3); // numeric-string coercion (established model)
  });
  test("division by zero follows IEEE (inf/nan), not errors", () => {
    expect(runArith(12, 1, 0)).toBe(Infinity);
    expect(runArith(12, -1, 0)).toBe(-Infinity);
    expect(runArith(12, 0, 0)).toBeNaN();
  });
  test("__div metamethod dispatches", () => {
    let calls = 0;
    const obj = { __metatable: { __div: () => { calls++; return 42; } } };
    expect(runArith(12, obj, 2)).toBe(42);
    expect(calls).toBe(1);
  });
});

describe("12B semantic baseline: unfused MOD (floor semantics)", () => {
  test("positive and mixed-sign combinations", () => {
    expect(runArith(13, 7, 3)).toBe(1);
    expect(runArith(13, -7, 3)).toBe(2); // floor-mod, NOT JS -1
    expect(runArith(13, 7, -3)).toBe(-2);
    expect(runArith(13, -7, -3)).toBe(-1);
    expect(runArith(13, 5.5, 2)).toBe(1.5);
    expect(runArith(13, "7", 3)).toBe(1);
  });
  test("zero divisor yields NaN (Lua: 7 % 0 == nan)", () => {
    expect(runArith(13, 7, 0)).toBeNaN();
  });
  test("__mod metamethod dispatches", () => {
    let calls = 0;
    const obj = { __metatable: { __mod: () => { calls++; return 9; } } };
    expect(runArith(13, obj, 2)).toBe(9);
    expect(calls).toBe(1);
  });
});

describe("12B semantic baseline: unfused POW", () => {
  test("positive/negative/fractional/zero", () => {
    expect(runArith(14, 2, 10)).toBe(1024);
    expect(runArith(14, -2, 3)).toBe(-8);
    expect(runArith(14, 9, 0.5)).toBe(3);
    expect(runArith(14, 5, 0)).toBe(1);
    expect(runArith(14, 0, 0)).toBe(1);
    expect(runArith(14, 2, -1)).toBe(0.5);
  });
  test("right-associativity is a parser property (2^3^2 == 512)", () => {
    expect(runSrc("return 2 ^ 3 ^ 2")).toBe(512);
  });
  test("__pow metamethod dispatches", () => {
    let calls = 0;
    const obj = { __metatable: { __pow: () => { calls++; return 7; } } };
    expect(runArith(14, obj, 2)).toBe(7);
    expect(calls).toBe(1);
  });
});

describe("12B semantic baseline: unfused IDIV (floor division)", () => {
  test("positive/negative/fractional", () => {
    expect(runArith(48, 7, 2)).toBe(3);
    expect(runArith(48, -7, 2)).toBe(-4); // floor, NOT trunc (-3)
    expect(runArith(48, 7, -2)).toBe(-4);
    expect(runArith(48, -7, -2)).toBe(3);
    expect(runArith(48, 5.5, 2)).toBe(2);
  });
  test("zero divisor follows the established math.floor shape (inf)", () => {
    // REASONED divergence: native Luau 1//0 ERRORS, but production h48 is
    // math.floor(x/y) == inf. The runner models GENERATED behavior here.
    expect(runArith(48, 1, 0)).toBe(Infinity);
  });
  test("__idiv metamethod dispatches", () => {
    let calls = 0;
    const obj = { __metatable: { __idiv: () => { calls++; return 5; } } };
    expect(runArith(48, obj, 2)).toBe(5);
    expect(calls).toBe(1);
  });
});

describe("12B semantic baseline: contexts via compiled sources", () => {
  test("locals, constants, nesting", () => {
    expect(runSrc("local a = 20 local b = 4 return a / b")).toBe(5);
    expect(runSrc("return 20 / 4")).toBe(5);
    expect(runSrc("local a = -7 return a % 3")).toBe(2);
    expect(runSrc("return (2 + 8) / (3 - 1)")).toBe(5);
    expect(runSrc("local a = 2 local b = 3 return a ^ b ^ 2")).toBe(512);
  });
  test("calls, returns, compound assignment, branches", () => {
    expect(runSrc("local function id(x) return x end return id(20 / 4)")).toBe(5);
    expect(runSrc("local a = 20 a /= 4 return a")).toBe(5);
    expect(runSrc("local a = 7 a %= 3 return a")).toBe(1);
    expect(runSrc("local a = 2 a ^= 3 return a")).toBe(8);
    expect(runSrc("local a = 7 a //= 2 return a")).toBe(3);
    expect(runSrc("local a = 20 if a > 10 then return a / 4 else return 0 end")).toBe(5);
  });
  test("loop-carried operations", () => {
    expect(runSrc("local acc = 100 local i = 0 while i < 3 do acc = acc / 2 i = i + 1 end return acc")).toBe(12.5);
    expect(runSrc("local acc = 0 local i = 0 while i < 4 do acc = acc + i % 3 i = i + 1 end return acc")).toBe(3);
  });
  test("closures and upvalues", () => {
    expect(runSrc("local b = 4 local function half(x) return x / b end return half(20)")).toBe(5);
  });
});
