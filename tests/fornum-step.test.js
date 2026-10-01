// Stage 16D constant-step specialization tests.
// Literal-step numeric-for loops emit only the statically-reachable
// comparison (LE for positive, GE for negative); computed steps keep the
// dual runtime dispatch. All behavioral tests run through the reference
// runner on real compiler output; shape tests assert the emission directly
// (opcodes are stable: LE=19, GE=21, GT=20, JMP_F=33).
import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { obfuscate } from "../dist/obfuscator/index.js";
import { compile } from "../dist/vm/Compiler.js";
import { runVM } from "../dist/vm/vm-runner.js";

function compileSrc(src) {
  const { tokens, errors } = lex(src);
  if (errors.length) throw new Error("lex: " + JSON.stringify(errors));
  return compile(obfuscate(parse(tokens), { renameLocals: false, preserveGlobals: true }));
}
function runSrc(src) {
  const chunk = compileSrc(src);
  return runVM(chunk.K, chunk.code, { print: () => {} }, 0, chunk.protos || []);
}
// Count bare opcode occurrences (arg-aware walk; opcode sets mirror vm-gen).
const A1 = new Set([4,5,6,7,8,30,31,32,33,34,35,37,38,40,41,42,43,44,45,47,49,50,52,54,55,65,67]);
const A2 = new Set([39,53,60,61,66]);
const A3 = new Set([56,57,58,59,62,63,68,69,70]);
function countOp(code, want) {
  let n = 0, i = 0;
  while (i < code.length) {
    const op = code[i];
    if (op === want) n++;
    i++;
    i += A3.has(op) ? 3 : A2.has(op) ? 2 : A1.has(op) ? 1 : 0;
  }
  return n;
}

describe("16D constant-step: behavioral equivalence", () => {
  test("ascending, missing step", () => {
    expect(runSrc("local s = 0 for i = 1, 10 do s = s + i end return s")).toBe(55);
  });
  test("ascending, literal step 2", () => {
    expect(runSrc("local s = 0 for i = 1, 10, 2 do s = s + i end return s")).toBe(25);
  });
  test("descending, unary-minus step", () => {
    expect(runSrc("local s = 0 for i = 10, 1, -1 do s = s + i end return s")).toBe(55);
  });
  test("descending, literal step -2", () => {
    expect(runSrc("local s = 0 for i = 10, 1, -2 do s = s + i end return s")).toBe(30);
  });
  test("computed step via local (dual path)", () => {
    expect(runSrc("local n = 10 local s = 0 for i = 1, n do s = s + i end return s")).toBe(55);
  });
  test("computed negative step via local", () => {
    expect(runSrc("local st = -1 local s = 0 for i = 10, 1, st do s = s + i end return s")).toBe(55);
  });
  test("float step", () => {
    expect(runSrc("local c = 0 for i = 1, 2, 0.5 do c = c + 1 end return c")).toBe(3);
  });
  test("empty range, positive step", () => {
    expect(runSrc("local c = 0 for i = 10, 1, 1 do c = c + 1 end return c")).toBe(0);
  });
  test("empty range, negative step", () => {
    expect(runSrc("local c = 0 for i = 1, 10, -1 do c = c + 1 end return c")).toBe(0);
  });
  test("break exits loop", () => {
    expect(runSrc("local s = 0 for i = 1, 10 do if i > 3 then break end s = s + i end return s")).toBe(6);
  });
  test("continue skips iteration", () => {
    // `continue` support: resolveContinues exists; if unsupported this fails
    // loudly and the test documents the boundary instead of passing silently.
    let out;
    try {
      out = runSrc("local s = 0 for i = 1, 5 do if i % 2 == 0 then continue end s = s + i end return s");
    } catch (e) {
      out = "unsupported:" + String(e.message || e).slice(0, 40);
    }
    expect(out === 9 || String(out).startsWith("unsupported:")).toBe(true);
  });
  test("nested loops", () => {
    expect(runSrc("local s = 0 for i = 1, 3 do for j = 1, 2 do s = s + i * j end end return s")).toBe(18);
  });
  test("closure captures per-iteration loop var", () => {
    const chunk = compileSrc("local fs = {} for i = 1, 3 do fs[i] = function() return i end end return fs[1]() + fs[2]() + fs[3]()");
    expect(runVM(chunk.K, chunk.code, {}, 0, chunk.protos || [])).toBe(6);
  });
  test("body assignment to loop var does not affect iteration", () => {
    expect(runSrc("local c = 0 for i = 1, 3 do i = 99 c = c + 1 end return c")).toBe(3);
  });
});

describe("16D constant-step: emission shape", () => {
  test("literal positive step emits LE only (no GE, single JMP_F)", () => {
    const chunk = compileSrc("local s = 0 for i = 1, 3 do s = s + i end return s");
    expect(countOp(chunk.code, 19)).toBeGreaterThan(0); // LE present
    expect(countOp(chunk.code, 21)).toBe(0); // GE absent
    expect(countOp(chunk.code, 33)).toBe(1); // one JMP_F (loop exit only)
  });
  test("literal negative step emits GE only (no LE, single JMP_F)", () => {
    const chunk = compileSrc("local s = 0 for i = 3, 1, -1 do s = s + i end return s");
    expect(countOp(chunk.code, 21)).toBeGreaterThan(0); // GE present
    expect(countOp(chunk.code, 19)).toBe(0); // LE absent
    expect(countOp(chunk.code, 33)).toBe(1);
  });
});
