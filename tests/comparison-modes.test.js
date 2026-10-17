// Comparison-mode tests (Phase 1.2a P-gate: P1/P2/P3 resolved by contract).
//
// MEASURED probe table (Luau 0.742 vs PUC-Lua 5.4.8, full matrix in the 1.2a
// report; probes: TEMP probe.mjs/probe2.mjs, vendor binaries local):
//
//   P1 rawequal __eq: A==A with counting __eq->false => PUC (0 calls, true),
//     Luau (1 call, false). A~=A with __eq->false => PUC (0, false), Luau
//     (1, true). A==A with __eq->true => PUC (0, true), Luau (1, true).
//   P2 same-mm __eq: A==B with different __eq fns (A->true) => PUC fires A's
//     (true), Luau fires neither (false). A==B with A-only __eq->true =>
//     PUC true, Luau false. A~=B on the P2 setup => PUC false, Luau true.
//   P3 second-only __eq (both tables, mm ONLY on the second operand):
//     A==B with B-only __eq->true => PUC fires B's (first-then-second order
//     rule) => true; Luau fires nothing (same-mm rule) => false. A~=B on
//     the P3 setup => PUC false, Luau true. The old first-only runner rule
//     matched Luau here and diverged PUC; corrected to first-then-second.
//   Mixed number/table with __eq: BOTH hosts skip the mm (E5/E6/N3/N4) —
//     retained in both modes.
//   <=/>= fallback (PUC only): absent __le falls back to NOT-swapped-__lt.
//     A<=B with only-__lt both (B->false) => PUC fires B's (B,A) => true.
//     A<=B with only-A-__lt (A->true) => PUC fires A's (B,A) => false.
//     A>=B with only-__lt both (A->true) => PUC fires A's (A,B) => false.
//   Ordering on tables (Luau only): Luau 0.742 raises on EVERY <,<=,>,>=
//     involving a table even with __lt/__le defined (L1-L5/M1-M6/G1-G4):
//     "attempt to compare {ta} {op} {tb}" (>/>= lower to </<= swapped).
//     PUC computes via mm rules above.
//
// Contract: runners take comparisonMode ("puc" default, "luau" opt-in).
// Emitted handlers (both VMs) delegate to host operators, so shipped
// artifacts match their host natively; these tests govern the oracles.
// Every value case below runs BOTH runners in BOTH modes (parity shape:
// stack and reg must agree cell-for-cell in each mode).
import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { obfuscate } from "../dist/obfuscator/index.js";
import { compile } from "../dist/vm/Compiler.js";
import { regCompile } from "../dist/vm/RegCompiler.js";
import { runVM } from "../dist/vm/vm-runner.js";
import { runReg } from "../dist/vm/reg-runner.js";

function stackRun(src, env, mode) {
  const lr = lex(src);
  if (lr.errors.length) throw new Error("lex: " + JSON.stringify(lr.errors));
  const obf = obfuscate(parse(lr.tokens), { renameLocals: true, preserveGlobals: true });
  const chunk = compile(obf);
  const opts = mode === undefined ? {} : { comparisonMode: mode };
  return runVM(chunk.K, chunk.code, env, 0, chunk.protos || [], {}, {}, [], opts);
}
function regVal(src, env, mode) {
  const lr = lex(src);
  if (lr.errors.length) throw new Error("lex: " + JSON.stringify(lr.errors));
  const opts = mode === undefined ? {} : { comparisonMode: mode };
  return runReg(regCompile(parse(lr.tokens)), env, [], {}, opts)[0];
}
function runBoth(src, env, mode) {
  return [stackRun(src, env, mode), regVal(src, env, mode)];
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
// Counting mm returning `ret`; records (tag(a), tag(b)) per call.
function countingMm(seen, objs, ret) {
  const tag = (v) => {
    for (const k of Object.keys(objs)) if (objs[k] === v) return k;
    return typeof v;
  };
  return (a, b) => { seen.push([tag(a), tag(b)]); return ret; };
}
function freshA(seen, ret) {
  const A = mmObj("L");
  withMM(A, "__eq", countingMm(seen, { A: A }, ret));
  return A;
}
function freshB(seen, ret) {
  const B = mmObj("R");
  withMM(B, "__eq", countingMm(seen, { B: B }, ret));
  return B;
}

describe("P1 rawequal __eq (puc skips mm, luau calls mm)", () => {
  test("E1: A==A with __eq->false => puc (0 calls, true), luau (1 call, false)", () => {
    let seen = [];
    let A = freshA(seen, false);
    expect(runBoth("return A == A", mkEnv({ A: A }), "puc")).toEqual([true, true]);
    expect(seen).toEqual([]);
    seen = [];
    A = freshA(seen, false);
    expect(runBoth("return A == A", mkEnv({ A: A }), "luau")).toEqual([false, false]);
    expect(seen).toEqual([["A", "A"], ["A", "A"]]);
  });
  test("E8: B==B with __eq->false => puc (0 calls, true), luau (1 call, false)", () => {
    let seen = [];
    let B = freshB(seen, false);
    expect(runBoth("return B == B", mkEnv({ B: B }), "puc")).toEqual([true, true]);
    expect(seen).toEqual([]);
    seen = [];
    B = freshB(seen, false);
    expect(runBoth("return B == B", mkEnv({ B: B }), "luau")).toEqual([false, false]);
    expect(seen).toEqual([["B", "B"], ["B", "B"]]);
  });
  test("E11: A==A with __eq->true => puc (0 calls, true), luau (1 call, true)", () => {
    let seen = [];
    let A = freshA(seen, true);
    expect(runBoth("return A == A", mkEnv({ A: A }), "puc")).toEqual([true, true]);
    expect(seen).toEqual([]);
    seen = [];
    A = freshA(seen, true);
    expect(runBoth("return A == A", mkEnv({ A: A }), "luau")).toEqual([true, true]);
    expect(seen).toEqual([["A", "A"], ["A", "A"]]);
  });
  test("N2: A~=A with __eq->false => puc (0 calls, false), luau (1 call, true)", () => {
    let seen = [];
    let A = freshA(seen, false);
    expect(runBoth("return A ~= A", mkEnv({ A: A }), "puc")).toEqual([false, false]);
    expect(seen).toEqual([]);
    seen = [];
    A = freshA(seen, false);
    expect(runBoth("return A ~= A", mkEnv({ A: A }), "luau")).toEqual([true, true]);
    expect(seen).toEqual([["A", "A"], ["A", "A"]]);
  });
});

describe("P2 same-mm __eq (puc fires first mm, luau fires neither)", () => {
  test("E3: A==B different __eq fns => puc fires A's (true), luau skips (false)", () => {
    let seen = [];
    let A = mmObj("L"); let B = mmObj("R");
    withMM(A, "__eq", countingMm(seen, { A: A, B: B }, true));
    withMM(B, "__eq", countingMm(seen, { A: A, B: B }, false));
    expect(runBoth("return A == B", mkEnv({ A: A, B: B }), "puc")).toEqual([true, true]);
    expect(seen).toEqual([["A", "B"], ["A", "B"]]);
    seen = [];
    A = mmObj("L"); B = mmObj("R");
    withMM(A, "__eq", countingMm(seen, { A: A, B: B }, true));
    withMM(B, "__eq", countingMm(seen, { A: A, B: B }, false));
    expect(runBoth("return A == B", mkEnv({ A: A, B: B }), "luau")).toEqual([false, false]);
    expect(seen).toEqual([]);
  });
  test("E7: A==B A-only __eq->true => puc true, luau false", () => {
    let seen = [];
    let A = mmObj("L"); let B = mmObj("R");
    withMM(A, "__eq", countingMm(seen, { A: A, B: B }, true));
    expect(runBoth("return A == B", mkEnv({ A: A, B: B }), "puc")).toEqual([true, true]);
    expect(seen).toEqual([["A", "B"], ["A", "B"]]);
    seen = [];
    A = mmObj("L"); B = mmObj("R");
    withMM(A, "__eq", countingMm(seen, { A: A, B: B }, true));
    expect(runBoth("return A == B", mkEnv({ A: A, B: B }), "luau")).toEqual([false, false]);
    expect(seen).toEqual([]);
  });
  test("N1: A~=B on the P2 setup => puc false, luau true", () => {
    let seen = [];
    let A = mmObj("L"); let B = mmObj("R");
    withMM(A, "__eq", countingMm(seen, { A: A, B: B }, true));
    withMM(B, "__eq", countingMm(seen, { A: A, B: B }, false));
    expect(runBoth("return A ~= B", mkEnv({ A: A, B: B }), "puc")).toEqual([false, false]);
    expect(seen).toEqual([["A", "B"], ["A", "B"]]);
    seen = [];
    A = mmObj("L"); B = mmObj("R");
    withMM(A, "__eq", countingMm(seen, { A: A, B: B }, true));
    withMM(B, "__eq", countingMm(seen, { A: A, B: B }, false));
    expect(runBoth("return A ~= B", mkEnv({ A: A, B: B }), "luau")).toEqual([true, true]);
    expect(seen).toEqual([]);
  });
});

describe("P3 second-only __eq (puc fires second mm, luau fires nothing)", () => {
  test("E4: A==B B-only __eq->true => puc fires B's (true), luau skips (false)", () => {
    let seen = [];
    let A = mmObj("L"); let B = mmObj("R");
    withMM(B, "__eq", countingMm(seen, { A: A, B: B }, true));
    expect(runBoth("return A == B", mkEnv({ A: A, B: B }), "puc")).toEqual([true, true]);
    expect(seen).toEqual([["A", "B"], ["A", "B"]]);
    seen = [];
    A = mmObj("L"); B = mmObj("R");
    withMM(B, "__eq", countingMm(seen, { A: A, B: B }, true));
    expect(runBoth("return A == B", mkEnv({ A: A, B: B }), "luau")).toEqual([false, false]);
    expect(seen).toEqual([]);
  });
  test("N5: A~=B B-only __eq->true => puc false, luau true", () => {
    let seen = [];
    let A = mmObj("L"); let B = mmObj("R");
    withMM(B, "__eq", countingMm(seen, { A: A, B: B }, true));
    expect(runBoth("return A ~= B", mkEnv({ A: A, B: B }), "puc")).toEqual([false, false]);
    expect(seen).toEqual([["A", "B"], ["A", "B"]]);
    seen = [];
    A = mmObj("L"); B = mmObj("R");
    withMM(B, "__eq", countingMm(seen, { A: A, B: B }, true));
    expect(runBoth("return A ~= B", mkEnv({ A: A, B: B }), "luau")).toEqual([true, true]);
    expect(seen).toEqual([]);
  });
});

describe("mixed number/table __eq skipped in both modes", () => {
  test("E6: 1==A (second-only, mixed) => false in both modes, no calls", () => {
    for (const mode of ["puc", "luau"]) {
      const seen = [];
      const A = freshA(seen, true);
      expect(runBoth("return 1 == A", mkEnv({ A: A }), mode)).toEqual([false, false]);
      expect(seen).toEqual([]);
    }
  });
  test("E5: A==1 (first-only, mixed) => false in both modes, no calls", () => {
    for (const mode of ["puc", "luau"]) {
      const seen = [];
      const A = freshA(seen, true);
      expect(runBoth("return A == 1", mkEnv({ A: A }), mode)).toEqual([false, false]);
      expect(seen).toEqual([]);
    }
  });
});

describe("PUC <=/>= NOT-swapped-__lt fallback (M1/M5/G4)", () => {
  test("M1: A<=B only-__lt both => fires B's (B,A) => true", () => {
    const seen = [];
    const A = mmObj("L"); const B = mmObj("R");
    withMM(A, "__lt", countingMm(seen, { A: A, B: B }, true));
    withMM(B, "__lt", countingMm(seen, { A: A, B: B }, false));
    expect(runBoth("return A <= B", mkEnv({ A: A, B: B }), "puc")).toEqual([true, true]);
    expect(seen).toEqual([["B", "A"], ["B", "A"]]);
  });
  test("M5: A<=B only-A-__lt => fires A's (B,A) => false", () => {
    const seen = [];
    const A = mmObj("L"); const B = mmObj("R");
    withMM(A, "__lt", countingMm(seen, { A: A, B: B }, true));
    expect(runBoth("return A <= B", mkEnv({ A: A, B: B }), "puc")).toEqual([false, false]);
    expect(seen).toEqual([["B", "A"], ["B", "A"]]);
  });
  test("G4: A>=B only-__lt both => fires A's (A,B) => false", () => {
    const seen = [];
    const A = mmObj("L"); const B = mmObj("R");
    withMM(A, "__lt", countingMm(seen, { A: A, B: B }, true));
    withMM(B, "__lt", countingMm(seen, { A: A, B: B }, false));
    expect(runBoth("return A >= B", mkEnv({ A: A, B: B }), "puc")).toEqual([false, false]);
    expect(seen).toEqual([["A", "B"], ["A", "B"]]);
  });
});

describe("Luau ordering on tables raises (host-verbatim messages)", () => {
  test("A<B with __lt => attempt to compare table < table", () => {
    for (const mode of ["luau"]) {
      const A = mmObj("L"); const B = mmObj("R");
      withMM(B, "__lt", () => true);
      expect(() => stackRun("return A < B", mkEnv({ A: A, B: B }), mode))
        .toThrow(/attempt to compare table < table/);
      expect(() => regVal("return A < B", mkEnv({ A: A, B: B }), mode))
        .toThrow(/attempt to compare table < table/);
    }
  });
  test("1<=B => attempt to compare number <= table", () => {
    const B = mmObj("R");
    withMM(B, "__le", () => true);
    expect(() => stackRun("return 1 <= B", mkEnv({ B: B }), "luau"))
      .toThrow(/attempt to compare number <= table/);
    expect(() => regVal("return 1 <= B", mkEnv({ B: B }), "luau"))
      .toThrow(/attempt to compare number <= table/);
  });
  test("A>B lowers to swapped <: attempt to compare table < table", () => {
    const A = mmObj("L"); const B = mmObj("R");
    withMM(A, "__lt", () => true);
    expect(() => stackRun("return A > B", mkEnv({ A: A, B: B }), "luau"))
      .toThrow(/attempt to compare table < table/);
    expect(() => regVal("return A > B", mkEnv({ A: A, B: B }), "luau"))
      .toThrow(/attempt to compare table < table/);
  });
  test("A>=B lowers to swapped <=: attempt to compare table <= table", () => {
    const A = mmObj("L"); const B = mmObj("R");
    withMM(B, "__le", () => true);
    expect(() => stackRun("return A >= B", mkEnv({ A: A, B: B }), "luau"))
      .toThrow(/attempt to compare table <= table/);
    expect(() => regVal("return A >= B", mkEnv({ A: A, B: B }), "luau"))
      .toThrow(/attempt to compare table <= table/);
  });
});

describe("non-object ordering computes identically in both modes", () => {
  test("2 < '10' => true in both modes on both runners", () => {
    expect(runBoth('return 2 < "10"', mkEnv({}), "puc")).toEqual([true, true]);
    expect(runBoth('return 2 < "10"', mkEnv({}), "luau")).toEqual([true, true]);
  });
  test("5 > 2 => true, 2 >= 5 => false in both modes on both runners", () => {
    expect(runBoth("return 5 > 2", mkEnv({}), "puc")).toEqual([true, true]);
    expect(runBoth("return 5 > 2", mkEnv({}), "luau")).toEqual([true, true]);
    expect(runBoth("return 2 >= 5", mkEnv({}), "puc")).toEqual([false, false]);
    expect(runBoth("return 2 >= 5", mkEnv({}), "luau")).toEqual([false, false]);
  });
});

describe("default mode is puc", () => {
  test("omitted comparisonMode reproduces puc on the P3 cell (E4 fires)", () => {
    const seen = [];
    const A = mmObj("L"); const B = mmObj("R");
    withMM(B, "__eq", countingMm(seen, { A: A, B: B }, true));
    expect(runBoth("return A == B", mkEnv({ A: A, B: B }), undefined))
      .toEqual([true, true]);
    expect(seen).toEqual([["A", "B"], ["A", "B"]]);
  });
});
