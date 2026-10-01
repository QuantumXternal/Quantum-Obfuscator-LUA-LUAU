// Stage 14 acceptance benchmark: UNFUSED-IDIV vs FUSED-IDIV only.
// 1. Before/after output bytes + gen time on fixed seeds (before = 14A
//    baseline lengths recorded in this file; after = measured live).
//    NOTE: DIV-68 and MOD-69 are production in BOTH runs (accepted Stages
//    12/13), so the delta isolates the IDIV-70 expansion.
// 2. Drift probe: replication in OLD mode (IDIV -> -1; DIV -> 68, MOD -> 69)
//    vs NEW mode (+ IDIV -> 70) across the full corpus: counts all existing
//    super-op fusions (57-63,68,69) in both modes. Bar: DIV/MOD tolerance.
// 3. Runner timing: idiv-loopheavy unfused vs hand-fused-ALL (interleaved
//    A/B medians + means; REFERENCE-RUNNER, not Luau wall-time).
// Usage: node benchmarks/idiv-acceptance.mjs
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
// Pre-implementation baseline (14A checkpoint 6b04e35, same pipeline/seeds).
const BEFORE_BYTES = { 1234: 147737, 1: 154404, 7: 152456, 42: 149400, 999: 147683 };

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
const A3 = new Set([56,57,58,59,62,63,68,69,70]);
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
// mode: "old" (IDIV never fuses) or "new" (IDIV -> 70). DIV -> 68, MOD -> 69
// in both modes (accepted production).
function replicate(code, rng, mode) {
  const result = [...code];
  const jt = collectJumpTargets(code);
  const canFuse = (s, len) => {
    for (let k = s + 1; k < s + len; k++) if (jt.has(k)) return false;
    return true;
  };
  const fused = { 57: 0, 58: 0, 59: 0, 60: 0, 61: 0, 62: 0, 63: 0, 68: 0, 69: 0, 70: 0 };
  let idivFused = 0;
  let i = 0;
  while (i < result.length) {
    const op = result[i];
    if (op === 5 && i + 6 < result.length) {
      if (result[i + 2] === 5 && result[i + 5] === 6) {
        const arith = result[i + 4];
        let superOp = arith === 9 ? 57 : arith === 10 ? 58 : arith === 11 ? 59
          : arith === 12 ? 68 : arith === 13 ? 69
          : arith === 48 && mode === "new" ? 70
          : arith === 15 ? 63 : -1;
        if (superOp !== -1) {
          if (!canFuse(i, 7)) { /* no rng consumed, as in production */ }
          else if (rng() > 0.25) {
            result[i] = superOp; result[i+1] = result[i+1]; result[i+2] = result[i+3];
            result[i+3] = result[i+6]; result[i+4] = 0; result[i+5] = 0; result[i+6] = 0;
            fused[superOp]++;
            if (superOp === 70) idivFused++;
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
  return { fused, idivFused };
}
function compileSrc(src) {
  return compile(obfuscate(parse(lex(src).tokens), { renameLocals: false, preserveGlobals: true }));
}
function cloneChunk(c) {
  return { K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cloneChunk) };
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

// --- 1. before/after on idiv-shapes ---
console.log("== before/after idiv-shapes (max, fixed seeds) ==");
const idivSrc = readFileSync(join(__dirname, "fixtures", "idiv-shapes.lua"), "utf8");
for (const seed of SEEDS) {
  const chunk = compileSrc(idivSrc);
  const g = quietGenerate(cloneChunk(chunk), seed);
  const g2 = quietGenerate(cloneChunk(chunk), seed);
  const before = BEFORE_BYTES[seed];
  const d = g.out.length - before;
  console.log(`seed ${seed}: before=${before} after=${g.out.length} delta=${d >= 0 ? "+" : ""}${d} genMs=${g.ms.toFixed(1)} heap=${g.heap} repro=${g.out === g2.out}`);
}

// --- 2. drift probe across corpus (existing ops 57-63 + DIV-68 + MOD-69) ---
console.log("== drift probe: existing fusions old-mode vs new-mode ==");
let driftCells = 0, totalCells = 0;
for (const file of readdirSync(join(__dirname, "fixtures")).filter((f) => f.endsWith(".lua")).sort()) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  const base = compileSrc(src);
  const perSeedDrift = [];
  for (const seed of SEEDS) {
    const run = (mode) => {
      const rng = makeRng(seed);
      for (let b = 0; b < 8; b++) rng();
      const acc = { 57: 0, 58: 0, 59: 0, 60: 0, 61: 0, 62: 0, 63: 0, 68: 0, 69: 0 };
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

// --- 3. runner timing on idiv-loopheavy: unfused vs hand-fused-ALL ---
console.log("== runner unfused vs fused on idiv-loopheavy (interleaved, REFERENCE-RUNNER) ==");
{
  const src = readFileSync(join(__dirname, "fixtures", "idiv-loopheavy.lua"), "utf8");
  const chunk = compileSrc(src);
  const fusedCode = [...chunk.code];
  let n = 0;
  for (let i = 0; i + 6 < fusedCode.length; i++) {
    if (fusedCode[i] === 5 && fusedCode[i+2] === 5 && fusedCode[i+4] === 48 && fusedCode[i+5] === 6) {
      fusedCode[i] = 70; fusedCode[i+2] = fusedCode[i+3]; fusedCode[i+3] = fusedCode[i+6];
      fusedCode[i+4] = 0; fusedCode[i+5] = 0; fusedCode[i+6] = 0; n++;
    }
  }
  console.log(`hand-fused windows: ${n}`);
  const env = { print: () => {} };
  console.log("values:", runVM(chunk.K, chunk.code, { ...env }, 0, []), runVM(chunk.K, fusedCode, { ...env }, 0, []));
  for (let w = 0; w < 10; w++) {
    runVM(chunk.K, chunk.code, env, 0, []);
    runVM(chunk.K, fusedCode, env, 0, []);
  }
  const tu = [], tf = [];
  for (let r = 0; r < 51; r++) {
    let t0 = performance.now();
    runVM(chunk.K, chunk.code, env, 0, []);
    tu.push(performance.now() - t0);
    t0 = performance.now();
    runVM(chunk.K, fusedCode, env, 0, []);
    tf.push(performance.now() - t0);
  }
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`unfused med=${med(tu).toFixed(3)}ms mean=${mean(tu).toFixed(3)}ms`);
  console.log(`fused med=${med(tf).toFixed(3)}ms mean=${mean(tf).toFixed(3)}ms`);
}
