// Stage 18 hot-subset dispatch tests.
// Production design under test (src/vm/vm-gen.ts): dynamic per-chunk hot
// set (smallest set covering 80% of fused-mix dispatches, Kmax 12, decoys
// excluded, ties by (-count, opcode)); max-level dispatch is a short
// comparison chain that CALLS existing handler closures, with the
// pre-existing table lookup as cold fallback. Handler bodies exist exactly
// once — verified structurally (18E byte-shrinkage) since max output is
// multi-layer encrypted and chain text is unassertable directly.
// Opcodes numeric; Op is a const enum (erased at compile).
import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { obfuscate } from "../dist/obfuscator/index.js";
import { compile } from "../dist/vm/Compiler.js";
import { generateVM, selectHotOps } from "../dist/vm/vm-gen.js";
import { runVM } from "../dist/vm/vm-runner.js";

function compileSrc(src) {
  const { tokens, errors } = lex(src);
  if (errors.length) throw new Error("lex: " + JSON.stringify(errors));
  return compile(obfuscate(parse(tokens), { renameLocals: false, preserveGlobals: true }));
}
function quietGenerate(chunk, options) {
  const orig = console.log;
  console.log = () => {};
  try {
    return generateVM(chunk, options);
  } finally {
    console.log = orig;
  }
}
function covOf(set, hist, total) {
  let c = 0;
  for (const op of set) c += hist.get(op) || 0;
  return total > 0 ? c / total : 1;
}

describe("selectHotOps rule properties", () => {
  test("empty input and zero total select nothing", () => {
    expect(selectHotOps(new Map(), 0)).toEqual([]);
    expect(selectHotOps(new Map([[4, 0]]), 0)).toEqual([]);
  });
  test("smallest set covering 80%: skewed distribution stops early", () => {
    const hist = new Map([[4, 70], [5, 20], [6, 5], [9, 5]]);
    expect(selectHotOps(hist, 100)).toEqual([4, 5]);
  });
  test("Kmax cap binds before target on flat distributions", () => {
    const hist = new Map();
    for (let op = 0; op < 30; op++) hist.set(op, 10);
    const set = selectHotOps(hist, 300);
    expect(set.length).toBeLessThanOrEqual(12);
    expect(set.length).toBe(12);
  });
  test("tie-breaking is total and deterministic: (-count, opcode)", () => {
    const a = new Map([[9, 5], [4, 5], [12, 5]]);
    const b = new Map([[12, 5], [9, 5], [4, 5]]);
    expect(selectHotOps(a, 15)).toEqual(selectHotOps(b, 15));
    expect(selectHotOps(a, 15)).toEqual([4, 9, 12]);
  });
  test("decoys and NOP pads are never selected even when dominant", () => {
    const hist = new Map([[64, 1000], [65, 900], [66, 800], [0, 700], [4, 10]]);
    const set = selectHotOps(hist, 3410);
    for (const o of [0, 64, 65, 66]) expect(set.includes(o)).toBe(false);
    expect(set.includes(4)).toBe(true);
  });
  test("fused super-ops are first-class candidates when frequent", () => {
    const hist = new Map([[4, 10], [68, 30], [69, 25], [9, 5]]);
    const set = selectHotOps(hist, 70);
    expect(set.includes(68)).toBe(true);
    expect(set.includes(69)).toBe(true);
  });
  test("fused super-ops fall to cold path when rare (still reachable via table)", () => {
    const hist = new Map([[4, 80], [68, 1]]);
    const set = selectHotOps(hist, 81);
    expect(set.includes(68)).toBe(false);
  });
  test("selection is order-independent and repeatable", () => {
    const entries = [[30, 7], [4, 40], [12, 12], [5, 30], [31, 3]];
    const m1 = new Map(entries);
    const m2 = new Map([...entries].reverse());
    const s1 = selectHotOps(m1, 92);
    expect(selectHotOps(m2, 92)).toEqual(s1);
    expect(selectHotOps(m1, 92)).toEqual(s1);
    expect(s1.length).toBeLessThanOrEqual(12);
  });
  test("no hard-coded opcode list: selection follows the input", () => {
    // Two disjoint workloads must be able to select disjoint hot sets.
    const arith = new Map([[9, 50], [10, 40], [11, 30]]);
    const ctrl = new Map([[32, 50], [33, 40], [31, 30]]);
    const sa = selectHotOps(arith, 120);
    const sc = selectHotOps(ctrl, 120);
    expect(sa.includes(9)).toBe(true);
    expect(sc.includes(32)).toBe(true);
    expect(sc.includes(9)).toBe(false);
  });
});

describe("hot-subset generation behavior", () => {
  const SRC = "local a = 20 local b = 4 local q = a / b local r = q + 1 return r";
  test("max generation is deterministic for fixed seed", () => {
    const chunk = compileSrc(SRC);
    const a = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 77 });
    const b = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 77 });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10000);
  });
  test("different seeds vary (polymorphism preserved)", () => {
    const chunk = compileSrc(SRC);
    const a = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 77 });
    const c = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 78 });
    expect(a === c).toBe(false);
  });
  test("debug and normal generation succeed deterministically", () => {
    const chunk = compileSrc(SRC);
    for (const level of ["debug", "normal"]) {
      const a = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level, polymorphicSeed: 1234 });
      const b = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level, polymorphicSeed: 1234 });
      expect(a).toBe(b);
      expect(a.length).toBeGreaterThan(1000);
    }
  });
  test("fused-op programs generate identically across repeated runs", () => {
    for (const src of [
      "local a = 7 local b = 3 local m = a % b return m",
      "local a = 7 local b = 2 local q = a // b return q",
    ]) {
      const chunk = compileSrc(src);
      const a = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 55 });
      const b = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 55 });
      expect(a).toBe(b);
    }
  });
  test("unknown opcode is a graceful no-op in the reference runner", () => {
    // Generated fallback (`if hA then hA() end`) guards missing handlers;
    // the runner models unknown ops as no-ops. Documents graceful behavior.
    expect(runVM([], [200, 4, 0, 6, 0, 5, 0, 31, 1], {}, 0, [])).toBe(undefined);
  });
});
