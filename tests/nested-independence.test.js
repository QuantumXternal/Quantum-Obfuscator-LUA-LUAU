// Phase 1.2(c) R2: nested layer independence — statistical test, not assertion.
//
// For N = 100 Maximum nested (VM-in-VM) builds of one source, the inner and
// outer wire maps are extracted via the generator's record seam (they are
// the exact maps the generators used, captured at the shuffle call site).
// Then:
//   - extraction control: identical parent seed -> identical map pair
//     (the "same-seed tau=1.0" control: the seam is exact/deterministic);
//   - per-build: inner map != outer map;
//   - independence: normalized mutual information (NMI) between inner and
//     outer maps, 4x4 bins over 0..127 (bucket = v >> 5), must be < 0.01;
//   - null calibration: 200 permutations of the cross-build pairing give
//     the empirical NMI noise floor; observed must sit inside it.
// Same-parent control: inner and outer sub-seeds stem from one parent seed
// but are independent expansions — covered by the cross-build pooling and
// by the same-seed extraction control above.
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM, takeRecordedOpcodeMaps } = await import("../dist/vm/vm-gen.js");

const SRC = "local a = 1 + 2 print(a)\n";
const quiet = (fn) => {
  const lo = console.log, lw = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = lo; console.warn = lw; }
};
const scl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(scl) });

const BASE = compile(obfuscate(parse(lex(SRC).tokens), { renameLocals: false, preserveGlobals: true }));

function nestedMaps(seed) {
  return quiet(() => {
    takeRecordedOpcodeMaps();
    const art = generateVM(scl(BASE), { level: "max", nesting: 1, polymorphicSeed: seed, executorGlobals: false });
    const maps = takeRecordedOpcodeMaps();
    return { art, maps };
  });
}

const BINS = 4;
const bin = (v) => v >> 5;

function nmiFromPairs(pairs) {
  const N = pairs.length;
  const joint = Array.from({ length: BINS }, () => new Array(BINS).fill(0));
  const px = new Array(BINS).fill(0);
  const py = new Array(BINS).fill(0);
  for (const [a, b] of pairs) { joint[a][b]++; px[a]++; py[b]++; }
  const H = (p) => { let h = 0; for (const c of p) { if (c) { const q = c / N; h -= q * Math.log2(q); } } return h; };
  const hx = H(px), hy = H(py);
  let mi = 0;
  for (let a = 0; a < BINS; a++) {
    for (let b = 0; b < BINS; b++) {
      if (joint[a][b]) {
        const p = joint[a][b] / N;
        mi += p * Math.log2(p / ((px[a] / N) * (py[b] / N)));
      }
    }
  }
  return mi / Math.sqrt(hx * hy);
}

const N_BUILDS = 100;
const N_PERM = 200;

const innerMaps = [];
const outerMaps = [];
const artifactHashes = [];

describe("nested map extraction (N=100 Maximum nested builds)", () => {
  test("each build records exactly [inner, outer]; maps are sparse", () => {
    for (let i = 0; i < N_BUILDS; i++) {
      const { art, maps } = nestedMaps(700000 + i);
      expect(maps.length).toBe(2);
      const [inner, outer] = maps;
expect(inner.length).toBe(73);
expect(outer.length).toBe(73);
expect(new Set(inner).size).toBe(73);
expect(new Set(outer).size).toBe(73);
      for (const v of [...inner, ...outer]) expect(v).toBeLessThan(128);
      innerMaps.push(inner);
      outerMaps.push(outer);
      artifactHashes.push(art.length + ":" + art.slice(0, 64));
    }
    expect(innerMaps.length).toBe(N_BUILDS);
  }, 600000);

  test("extraction control: same parent seed -> identical map pair (tau=1.0)", () => {
    const a = nestedMaps(42);
    const b = nestedMaps(42);
    expect(a.maps).toEqual(b.maps);
    expect(a.art).toBe(b.art);
  }, 120000);

  test("per-build: inner wire map differs from outer wire map", () => {
    for (let i = 0; i < innerMaps.length; i++) {
      expect(innerMaps[i]).not.toEqual(outerMaps[i]);
    }
  });

  test(`independence: NMI(inner, outer) < 0.01 with permutation null (${N_BUILDS} builds x 73 ops)`, () => {
    const pairs = [];
    for (let i = 0; i < innerMaps.length; i++) {
      for (let j = 0; j < 73; j++) pairs.push([bin(innerMaps[i][j]), bin(outerMaps[i][j])]);
    }
    const observed = nmiFromPairs(pairs);
    expect(observed).toBeLessThan(0.01);

    let s = 987654321;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x80000000);
    const order = outerMaps.map((_, i) => i);
    const nullNm = [];
    for (let p = 0; p < N_PERM; p++) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const permPairs = [];
      for (let i = 0; i < innerMaps.length; i++) {
        const om = outerMaps[order[i]];
        for (let j = 0; j < 73; j++) permPairs.push([bin(innerMaps[i][j]), bin(om[j])]);
      }
      nullNm.push(nmiFromPairs(permPairs));
    }
    const mean = nullNm.reduce((a, b) => a + b, 0) / nullNm.length;
    const std = Math.sqrt(nullNm.reduce((a, b) => a + (b - mean) ** 2, 0) / nullNm.length);
    console.log(`[nested-independence] observed NMI=${observed.toFixed(6)} null mean=${mean.toFixed(6)} std=${std.toFixed(6)}`);
    expect(observed).toBeLessThan(mean + 4 * std);
    expect(observed).toBeLessThan(0.01);
  }, 120000);
});
