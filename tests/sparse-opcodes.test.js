// Phase 1.2(c): sparse per-build opcode space (both VMs + nested layers).
//
// Contract under test:
// - wire opcode maps are uniform injections into 0..127 (reg: 57 of 128,
//   71 gaps; stack: 71 of 128, 57 gaps) — never a contiguous image;
// - reg `_opNames` (debugTrace) keys follow the sparse wire map exactly;
// - debug level is the documented plaintext bypass (identity map);
// - reg WIRE ceiling: H = op*16 + argc <= 2043 (< 2^53, argc < 16);
// - stack max-level +128 mirror keys never collide with real keys for any
//   dispatch key (exhaustive over hxk 1..0xFFFE);
// - string-seed determinism holds on the sparse encoding (5 seeds x 2 VMs);
// - per-build uniqueness across both VMs: 5 seeds, all reg maps distinct,
//   all stack maps distinct, reg(s) != stack(s) within each build.
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM, takeRecordedOpcodeMaps: takeStackMaps } = await import("../dist/vm/vm-gen.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM, takeRecordedOpcodeMaps: takeRegMaps } = await import("../dist/vm/reg-vm-gen.js");
const { SPARSE_OPCODE_RANGE, STACK_OPCODE_COUNT, REG_OPCODE_COUNT, REG_FUSED_SLOTS, REG_OP_MASK } = await import("../dist/vm/bytecode.js");

const SRC = readFileSync(join(ROOT, "benchmarks", "fixtures", "small.lua"), "utf8");
const SEEDS = [1234, 7, 42, 99, 2024];
const rcl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(rcl) });
const scl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(scl) });
const quiet = (fn) => {
  const lo = console.log, lw = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = lo; console.warn = lw; }
};

function genReg(src, seed, opts = {}) {
  return quiet(() =>
    generateRegVM(rcl(regCompile(parse(lex(src).tokens))), { level: "max", polymorphicSeed: seed, ...opts }));
}
function genStack(src, seed, opts = {}) {
  return quiet(() => {
    const base = compile(obfuscate(parse(lex(src).tokens), { renameLocals: false, preserveGlobals: true }));
    return generateVM(scl(base), { level: "max", polymorphicSeed: seed, executorGlobals: false, ...opts });
  });
}
function assertSparseMap(map, count, label) {
  expect(map.length).toBe(count);
  expect(new Set(map).size).toBe(count);
  for (const v of map) {
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(SPARSE_OPCODE_RANGE);
  }
  const sorted = [...map].sort((a, b) => a - b);
  const contiguous = sorted.every((v, i) => v === i);
  expect(contiguous).toBe(false);
}

describe("sparse wire space (reg VM)", () => {
  test.each(SEEDS)("seed %p: injective map over 0..127 with 71 gaps", (s) => {
    takeRegMaps();
    genReg(SRC, s);
    const maps = takeRegMaps();
    expect(maps.length).toBe(1);
    assertSparseMap(maps[0], REG_OPCODE_COUNT, "reg");
  });
  test("reg debug level records no shuffled map (documented plaintext bypass)", () => {
    takeRegMaps();
    const art = genReg(SRC, 1234, { level: "debug", debugTrace: true });
    expect(takeRegMaps().length).toBe(0);
    const m = art.match(/_opNames=\{([^}]*)\}/);
    expect(m).not.toBeNull();
    const keys = [...m[1].matchAll(/\[(\d+)\]="/g)].map((x) => parseInt(x[1], 10));
    expect(new Set(keys).size).toBe(REG_OPCODE_COUNT);
    const sorted = [...new Set(keys)].sort((a, b) => a - b);
    expect(sorted[0]).toBe(0);
    expect(sorted[sorted.length - 1]).toBe(REG_OPCODE_COUNT - 1);
  });
});

describe("sparse wire space (stack VM)", () => {
  test.each(SEEDS)("seed %p: injective map over 0..127 with 57 gaps", (s) => {
    takeStackMaps();
    genStack(SRC, s);
    const maps = takeStackMaps();
    expect(maps.length).toBe(1);
    assertSparseMap(maps[0], STACK_OPCODE_COUNT, "stack");
  });
});

describe("reg _opNames follows the sparse map (max + debugTrace)", () => {
  test("artifact keys == recorded wire map image; spot-check NOP", () => {
    takeRegMaps();
    const prev = process.env.NO_CIPHER;
    process.env.NO_CIPHER = "1";
    let art;
    try { art = genReg(SRC, 1234, { debugTrace: true }); }
    finally { if (prev === undefined) delete process.env.NO_CIPHER; else process.env.NO_CIPHER = prev; }
    const maps = takeRegMaps();
    expect(maps.length).toBe(1);
    const map = maps[0];
    const m = art.match(/_opNames=\{([^}]*)\}/);
    expect(m).not.toBeNull();
    const keys = [...m[1].matchAll(/\[(\d+)\]="/g)].map((x) => parseInt(x[1], 10));
    expect(new Set(keys)).toEqual(new Set(map));
    expect(art).toContain(`[${map[0]}]="NOP"`);
    expect(map[0]).toBeGreaterThanOrEqual(0);
    expect(map[0]).toBeLessThan(SPARSE_OPCODE_RANGE);
  });
});

describe("wire ceiling invariants", () => {
  test("reg worst-case H = (range-1)*16 + maxArgc < 2^53 and argc < 16", () => {
    let maxQuads = 1;
    for (const q of REG_FUSED_SLOTS.values()) maxQuads = Math.max(maxQuads, q);
    const maxFusedArgc = maxQuads * 4 - 1;
    let maxMaskArgc = 0;
    for (const mask of REG_OP_MASK) {
      const pc = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
      maxMaskArgc = Math.max(maxMaskArgc, pc);
    }
    const maxArgc = Math.max(maxFusedArgc, maxMaskArgc);
    expect(maxArgc).toBeLessThan(16);
    const worstH = (SPARSE_OPCODE_RANGE - 1) * 16 + maxArgc;
    expect(worstH).toBeLessThan(2 ** 53);
    expect(worstH).toBe((SPARSE_OPCODE_RANGE - 1) * 16 + 11);
  });
  test("stack wire ops stay single-byte in VLE (v < 128)", () => {
    expect(SPARSE_OPCODE_RANGE - 1).toBeLessThan(128);
  });
  test("stack max-level +128 mirror keys never collide with real keys (exhaustive)", () => {
    let collisions = 0;
    outer: for (let hxk = 1; hxk <= 0xFFFE; hxk++) {
      for (let a = 0; a < SPARSE_OPCODE_RANGE; a++) {
        const k1 = a ^ hxk;
        const mirroredBack = ((k1 + 128) ^ hxk);
        if (mirroredBack <= SPARSE_OPCODE_RANGE - 1) { collisions++; break outer; }
      }
    }
    expect(collisions).toBe(0);
  });
});

describe("string-seed determinism on the sparse encoding (5 seeds x 2 VMs)", () => {
  const STRING_SEEDS = ["sparse-seed-01", "sparse-seed-02", "sparse-seed-03", "sparse-seed-04", "sparse-seed-05"];
  test.each(STRING_SEEDS)("reg/max string seed %p re-generates byte-identical", (s) => {
    expect(genReg(SRC, s)).toBe(genReg(SRC, s));
  });
  test.each(STRING_SEEDS)("stack/max string seed %p re-generates byte-identical", (s) => {
    expect(genStack(SRC, s)).toBe(genStack(SRC, s));
  });
});

describe("per-build uniqueness across both VMs (5 builds)", () => {
  test("all reg maps distinct, all stack maps distinct, reg(s) != stack(s)", () => {
    takeRegMaps(); takeStackMaps();
    const regMaps = [];
    const stackMaps = [];
    for (const s of SEEDS) {
      genReg(SRC, s);
      regMaps.push(takeRegMaps()[0]);
      genStack(SRC, s);
      stackMaps.push(takeStackMaps()[0]);
    }
    expect(regMaps.length).toBe(5);
    expect(stackMaps.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      assertSparseMap(regMaps[i], REG_OPCODE_COUNT, "reg");
      assertSparseMap(stackMaps[i], STACK_OPCODE_COUNT, "stack");
      expect(regMaps[i]).not.toEqual(stackMaps[i]);
      for (let j = i + 1; j < 5; j++) {
        expect(regMaps[i]).not.toEqual(regMaps[j]);
        expect(stackMaps[i]).not.toEqual(stackMaps[j]);
      }
    }
  });
});
