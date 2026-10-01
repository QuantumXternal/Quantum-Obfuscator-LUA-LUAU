// Stage 12C-8/12C-5 acceptance benchmark: UNFUSED-DIV vs FUSED-DIV only.
// 1. Before/after output bytes + gen time on fixed seeds (before = 12C-1
//    baseline lengths recorded in this file; after = measured live).
// 2. Drift probe: replication of the fusion stream in OLD mode (DIV -> -1,
//    pre-12C matcher) vs NEW mode (DIV -> 68) across the full 17-file corpus:
//    counts existing super-op fusions (57/58/59/60/61/62/63) in both modes.
//    Any difference = rng-stream shift from the new gate (intended
//    polymorphic difference, but must be reported, not hidden).
// 3. Runner timing: unfused compiled div-shapes vs hand-fused-ALL version
//    (median of 51; REFERENCE-RUNNER, not Luau wall-time).
// Usage: node benchmarks/div-acceptance.mjs
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");
const { runVM } = await import("../dist/vm/vm-runner.js");

const SEEDS = [1234, 1, 7, 42, 999];
// Pre-implementation baseline (12C-1, same pipeline/seeds, checkpoint 379257c).
const BEFORE_BYTES = { 1234: 150720, 1: 149728, 7: 151425, 42: 148811, 999: 148873 };

function makeRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const A1 = new Set([4,5,6,7,8,30,31,32,33,34,35,37,38,40,41,42,43,44,45,47,49,50,52,54,55,65,67]);
const A2 = new Set([39,53,60,61,66]);
const A3 = new Set([56,57,58,59,62,63,68]);
const argc = (op) => (A3.has(op) ? 3 : A2.has(op) ? 2 : A1.has(op) ? 1 : 0);
function collectJumpTargets(code) {
  const targets = new Set();
  let i = 0;
  while (i < code.length) {
    const op = code[i];
    i++;
    if (op === 32 || op === 33 || op === 42 || op === 43) { targets.add(code[i]); i++; }
    else if (op === 53) { i++; targets.add(code[i]); i++; }
    else { i += argc(op); }
  }
  return targets;
}
// mode: "old" (DIV never fuses) or "new" (DIV -> 68). Returns existing-op
// fused counts + DIV fused count, replicating production stream exactly.
function replicate(code, rng, mode) {
  const result = [...code];
  const jt = collectJumpTargets(code);
  const canFuse = (s, len) => {
    for (let k = s + 1; k < s + len; k++) if (jt.has(k)) return false;
    return true;
  };
  const fused = { 57: 0, 58: 0, 59: 0, 60: 0, 61: 0, 62: 0, 63: 0, 68: 0 };
  let divFused = 0;
  let i = 0;
  while (i < result.length) {
    const op = result[i];
    if (op === 5 && i + 6 < result.length) {
      if (result[i + 2] === 5 && result[i + 5] === 6) {
        const arith = result[i + 4];
        let superOp = arith === 9 ? 57 : arith === 10 ? 58 : arith === 11 ? 59
          : arith === 15 ? 63 : arith === 12 && mode === "new" ? 68 : -1;
        if (superOp !== -1) {
          if (!canFuse(i, 7)) { /* no rng consumed, as in production */ }
          else if (rng() > 0.25) {
            result[i] = superOp; result[i+1] = result[i+1]; result[i+2] = result[i+3];
            result[i+3] = result[i+6]; result[i+4] = 0; result[i+5] = 0; result[i+6] = 0;
            fused[superOp]++;
            if (superOp === 68) divFused++;
            i += 7; continue;
          }
        }
      }
      if (result[i + 2] === 4 && result[i + 4] === 9 && result[i + 5] === 6) {
        if (canFuse(i, 7) && rng() > 0.25) { result[i] = 62; fused[62]++; i += 7; continue; }
      }
      if (result[i + 2] === 6) {
        if (canFuse(i, 4) && rng() > 0.25) { result[i] = 61; fused[61]++; i += 4; continue; }
      }
    }
    if (op === 4 && i + 3 < result.length && result[i + 2] === 6) {
      if (canFuse(i, 4) && rng() > 0.25) { result[i] = 60; fused[60]++; i += 4; continue; }
    }
    i++;
    i += argc(op);
  }
  return { fused, divFused };
}
function compileSrc(src) {
  return compile(obfuscate(parse(lex(src).tokens), { renameLocals: false, preserveGlobals: true }));
}
function quietGenerate(chunk, seed) {
  const orig = console.log;
  console.log = () => {};
  const heap0 = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  let out = "";
  try { out = generateVM(chunk, { level: "max", polymorphicSeed: seed }); }
  finally { console.log = orig; }
  return { out, ms: performance.now() - t0, heap: Math.max(0, Math.round(process.memoryUsage().heapUsed - heap0)) };
}

// --- 1. before/after on div-shapes ---
console.log("== before/after div-shapes (max, fixed seeds) ==");
const divSrc = readFileSync(join(__dirname, "fixtures", "div-shapes.lua"), "utf8");
for (const seed of SEEDS) {
  const chunk = compileSrc(divSrc);
  const g = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: (chunk.protos || []).map((p) => ({ ...p })) }, seed);
  const before = BEFORE_BYTES[seed];
  const d = g.out.length - before;
  console.log(`seed ${seed}: before=${before} after=${g.out.length} delta=${d >= 0 ? "+" : ""}${d} genMs=${g.ms.toFixed(1)} heap=${g.heap}`);
}

// --- 2. drift probe across corpus ---
console.log("== drift probe: existing-op fusions old-mode vs new-mode ==");
let driftCells = 0, totalCells = 0;
for (const file of readdirSync(join(__dirname, "fixtures")).filter((f) => f.endsWith(".lua")).sort()) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  const base = compileSrc(src);
  const perSeedDrift = [];
  for (const seed of SEEDS) {
    const run = (mode) => {
      const rng = makeRng(seed);
      for (let b = 0; b < 8; b++) rng();
      const acc = { 57: 0, 58: 0, 59: 0, 60: 0, 61: 0, 62: 0, 63: 0 };
      const walk = (c) => {
        const r = replicate(c.code, rng, mode);
        for (const k of Object.keys(acc)) acc[k] += r.fused[k];
        for (const p of c.protos || []) walk(p);
      };
      walk({ code: [...base.code], protos: (base.protos || []).map((p) => ({ code: [...p.code], protos: p.protos })) });
      return acc;
    };
    const oldM = run("old"), newM = run("new");
    const diff = Object.keys(oldM).filter((k) => oldM[k] !== newM[k]).map((k) => `${k}:${oldM[k]}->${newM[k]}`);
    totalCells++;
    if (diff.length > 0) { driftCells++; perSeedDrift.push(`seed${seed}[${diff.join(",")}]`); }
  }
  console.log(`${file}: ${perSeedDrift.length > 0 ? "DRIFT " + perSeedDrift.join(" ") : "no drift"}`);
}
console.log(`drift cells: ${driftCells}/${totalCells} fixture-seeds`);

// --- 3. runner timing: unfused vs hand-fused-ALL div-shapes ---
console.log("== runner unfused vs fused (median of 51, REFERENCE-RUNNER) ==");
function fuseAllDiv(code) {
  const out = [...code];
  const jt = collectJumpTargets(out);
  let i = 0, n = 0;
  while (i + 6 < out.length) {
    if (out[i] === 5 && out[i+2] === 5 && out[i+4] === 12 && out[i+5] === 6) {
      let safe = true;
      for (let k = i + 1; k < i + 7; k++) if (jt.has(k)) { safe = false; break; }
      if (safe) {
        out[i] = 68; out[i+1] = out[i+1]; out[i+2] = out[i+3]; out[i+3] = out[i+6];
        out[i+4] = 0; out[i+5] = 0; out[i+6] = 0; n++; i += 7; continue;
      }
    }
    i++;
  }
  return { out, n };
}
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
{
  const chunk = compileSrc(divSrc);
  const { out: fusedCode, n } = fuseAllDiv(chunk.code);
  console.log(`hand-fused windows in div-shapes main chunk: ${n}`);
  const env = { print: () => {} };
  const time = (code) => {
    for (let w = 0; w < 5; w++) runVM(chunk.K, code, { ...env }, 0, chunk.protos || []);
    const ts = [];
    for (let r = 0; r < 51; r++) {
      const t0 = performance.now();
      runVM(chunk.K, code, { ...env }, 0, chunk.protos || []);
      ts.push(performance.now() - t0);
    }
    return median(ts);
  };
  const tu = time(chunk.code), tf = time(fusedCode);
  console.log(`unfused median=${tu.toFixed(4)}ms fused median=${tf.toFixed(4)}ms delta=${(tf - tu).toFixed(4)}ms (${(100 * (tf - tu) / tu).toFixed(1)}%)`);
}
