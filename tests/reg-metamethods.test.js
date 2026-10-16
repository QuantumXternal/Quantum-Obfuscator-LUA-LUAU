// Reg-runner metamethod mirror tests (Task 2).
// Scope: arithmetic (ADD/SUB/MUL/DIV/MOD/POW/IDIV) + CONCAT only — the direct
// analog of the Stage 11D-1 stack precedent (one dispatch + one coercion
// model shared by unfused paths). Comparisons (__eq/__lt/__le), LEN/UNM,
// __call/__index/__newindex are follow-ups, NOT covered here.
// Every test asserts reg-runner == stack-runner on the same source, plus the
// Lua-correct literal where the semantics are unambiguous. Kernels are
// untouched: stack/reg luaMod float dust differs (measured 48/484 cells) and
// is a separate backlog item needing Luau ground truth — float-MOD differential
// tests below use integers only.
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
function regRun(src, env) {
  const lr = lex(src);
  if (lr.errors.length) throw new Error("lex: " + JSON.stringify(lr.errors));
  return regCompile(parse(lr.tokens));
}
function regVal(src, env) {
  return runReg(regRun(src, env), env)[0];
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

const ARITH = [
  ["add", "+", "__add", 2, 1, 3],
  ["sub", "-", "__sub", 6, 1, 5],
  ["mul", "*", "__mul", 3, 2, 6],
  ["div", "/", "__div", 7, 2, 3.5],
  ["mod", "%", "__mod", 17, 5, 2],
  ["pow", "^", "__pow", 2, 3, 8],
  ["idiv", "//", "__idiv", 7, 2, 3],
];

describe("reg arithmetic metamethod dispatch matches stack", () => {
  for (const entry of ARITH) {
    const name = entry[0], sym = entry[1], mm = entry[2];
    const sn = entry[3], kn = entry[4], coerceWant = entry[5];
    test(name + ": left metamethod wins", () => {
      const A = withMM(mmObj("L"), mm, () => "L");
      expectBoth("return A " + sym + " 1", mkEnv({ A: A }), "L");
    });
    test(name + ": right metamethod wins", () => {
      const B = withMM(mmObj("R"), mm, () => "R");
      expectBoth("return 1 " + sym + " B", mkEnv({ B: B }), "R");
    });
    test(name + ": left priority when both present", () => {
      const A = withMM(mmObj("L"), mm, () => "L");
      const B = withMM(mmObj("R"), mm, () => "R");
      expectBoth("return A " + sym + " B", mkEnv({ A: A, B: B }), "L");
    });
    test(name + ": operands passed in order", () => {
      const A = mmObj("L");
      const B = mmObj("R");
      withMM(A, mm, (a, b) => "o" + (a === A ? "A" : "x") + (b === B ? "B" : "x"));
      withMM(B, mm, (a, b) => "o" + (a === A ? "A" : "x") + (b === B ? "B" : "x"));
      expectBoth("return A " + sym + " B", mkEnv({ A: A, B: B }), "oAB");
    });
    test(name + ": numeric-string coercion", () => {
      expectBoth("return S " + sym + " " + kn, mkEnv({ S: String(sn) }), coerceWant);
    });
  }
  test("idiv: division by zero documents Infinity on both", () => {
    expectBoth("return 1 // 0", mkEnv({}), Infinity);
  });
  test("mod: negative dividend floor sign on both", () => {
    expectBoth("return -7 % 3", mkEnv({}), 2);
  });
});

describe("reg concat metamethod dispatch matches stack", () => {
  test("left metamethod wins", () => {
    const A = withMM(mmObj("L"), "__concat", () => "L");
    expectBoth('return A .. "x"', mkEnv({ A: A }), "L");
  });
  test("right metamethod wins", () => {
    const B = withMM(mmObj("R"), "__concat", () => "R");
    expectBoth('return "x" .. B', mkEnv({ B: B }), "R");
  });
  test("left priority when both present", () => {
    const A = withMM(mmObj("L"), "__concat", () => "L");
    const B = withMM(mmObj("R"), "__concat", () => "R");
    expectBoth("return A .. B", mkEnv({ A: A, B: B }), "L");
  });
  test("ternary chain is right-associative on both", () => {
    const C = withMM(mmObj("C"), "__concat", () => "pair");
    expectBoth("return A .. B .. C", mkEnv({ A: 1, B: 2, C: C }), "1pair");
  });
  test("string-number coercion", () => {
    expectBoth('return S .. T', mkEnv({ S: "6", T: 7 }), "67");
  });
  test("number-string order", () => {
    expectBoth('return N .. "x"', mkEnv({ N: 2 }), "2x");
  });
  test("non-concatenable throws on both", () => {
    const env = mkEnv({ T: true, U: {} });
    expect(() => stackRun("return T .. U", env)).toThrow();
    expect(() => regVal("return T .. U", env)).toThrow();
  });
});
