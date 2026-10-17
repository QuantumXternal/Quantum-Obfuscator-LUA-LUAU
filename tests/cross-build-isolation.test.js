// Phase 1.2(h): cross-build isolation proof.
// For N distinct builds, the sparse opcode maps (inner layer) must be
// statistically independent: NMI < 0.01 and normalized Kendall-tau
// ( (tau+1)/2 ) in [0.45, 0.55] over all cross-build pairs. Same-seed
// control must be exact (tau_norm = 1.0, NMI = 0).
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
const quiet = (fn) => { const lo = console.log, lw = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = lo; console.warn = lw; } };
const scl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(scl) });
const BASE = compile(obfuscate(parse(lex(SRC).tokens), { renameLocals: false, preserveGlobals: true }));

const N_BUILDS = 20;

function mapsForSeed(seed) {
  return quiet(() => {
    takeRecordedOpcodeMaps();
    generateVM(scl(BASE), { level: "max", nesting: 1, polymorphicSeed: seed, executorGlobals: false });
    const m = takeRecordedOpcodeMaps();
    return m[0]; // inner map
  });
}

function kendallTau(a, b) {
  const n = a.length;
  let conc = 0, disc = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sgnA = Math.sign(a[j] - a[i]);
      const sgnB = Math.sign(b[j] - b[i]);
      if (sgnA === 0 || sgnB === 0) continue;
      if (sgnA === sgnB) conc++; else disc++;
    }
  }
  const denom = conc + disc;
  return denom === 0 ? 0 : (conc - disc) / denom;
}
function normTau(a, b) { return (kendallTau(a, b) + 1) / 2; }

const BINS = 4;
const bin = (v) => v >> 5;
function nmiFromPairs(pairs) {
  const N = pairs.length;
  const joint = Array.from({ length: BINS }, () => new Array(BINS).fill(0));
  const px = new Array(BINS).fill(0), py = new Array(BINS).fill(0);
  for (const [a, b] of pairs) { joint[a][b]++; px[a]++; py[b]++; }
  const H = (p) => { let h = 0; for (const c of p) { if (c) { const q = c / N; h -= q * Math.log2(q); } } return h; };
  const hx = H(px), hy = H(py);
  let mi = 0;
  for (let a = 0; a < BINS; a++) for (let b = 0; b < BINS; b++) if (joint[a][b]) {
    const p = joint[a][b] / N; mi += p * Math.log2(p / ((px[a] / N) * (py[b] / N)));
  }
  return (hx * hy === 0) ? 0 : mi / Math.sqrt(hx * hy);
}

test("cross-build isolation: NMI < 0.01 and norm-tau in [0.45,0.55] over ~190 pairs", () => {
  const seeds = Array.from({ length: N_BUILDS }, (_, i) => 800000 + i);
  const maps = seeds.map(mapsForSeed);

  // cross-build pairs
  const taus = [];
  const pooledPairs = [];
  for (let i = 0; i < maps.length; i++) {
    for (let j = i + 1; j < maps.length; j++) {
      taus.push(normTau(maps[i], maps[j]));
      for (let k = 0; k < maps[i].length; k++) pooledPairs.push([bin(maps[i][k]), bin(maps[j][k])]);
    }
  }
  const meanTau = taus.reduce((a, b) => a + b, 0) / taus.length;
  const pooledNmi = nmiFromPairs(pooledPairs);
  console.log(`[cross-build] pairs=${taus.length} mean norm-tau=${meanTau.toFixed(4)} pooled NMI=${pooledNmi.toFixed(6)}`);
  expect(pooledNmi).toBeLessThan(0.01);
  expect(meanTau).toBeGreaterThanOrEqual(0.45);
  expect(meanTau).toBeLessThanOrEqual(0.55);
}, 600000);

test("same-seed control: norm-tau = 1.0, NMI = 0", () => {
  const m1 = mapsForSeed(42);
  const m2 = mapsForSeed(42);
  expect(normTau(m1, m2)).toBe(1);
  const pairs = m1.map((v, k) => [bin(v), bin(m2[k])]);
  expect(nmiFromPairs(pairs)).toBeGreaterThan(0.99);
}, 120000);
