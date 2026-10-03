// Stage 17D/17E CFF cost matrix (audit only — no production changes).
// Part 1: stack ablation bytes/ms/heap across variants x classes x seeds.
//   NOTE: disableFeatures:["cff"] is VESTIGIAL for stack block-flattening
//   (flattenChunk runs whenever level==max, no flag check) — the max-nocff
//   variant is included to DEMONSTRATE it equals max, not as a real OFF.
//   True OFF is approximated by normal level (confounded: also disables
//   fusion/shuffle/etc. — confound ledger in report, not in this file).
// Part 2: structural flatten census (blocks, est. added JMPs, jumps).
// Part 3: flatten replication -> runVM pre/post equality + timing + exact
//   inflation. The replica uses a fresh PRNG (a valid flatten instance;
//   production's exact permutation differs by stream position).
//   Runner timing here is REFERENCE-MODEL timing of CFF'd bytecode, NOT
//   generated-output runtime (no Luau executor exists).
// Part 4: register variants + telemetry (fused counts, CFF blocks, dispatch
//   variant). controlFlowFlattening is a REAL flag for the register VM.
// Usage: node benchmarks/cff-cost.mjs
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");
const { runVM } = await import("../dist/vm/vm-runner.js");

const CLASSES = ["tiny.lua", "small.lua", "medium.lua", "branch-heavy.lua", "fornum-heavy.lua", "function-heavy.lua", "large.lua"];
const SEEDS = [1234, 7, 42];
const STACK_VARIANTS = [
  ["normal", { level: "normal" }],
  ["max", { level: "max" }],
  ["max-nosuper", { level: "max", disableFeatures: ["superOperators"] }],
  ["max-nonlinear", { level: "max", disableFeatures: ["nonLinearJumps"] }],
  ["max-nocff-vestigial", { level: "max", disableFeatures: ["cff"] }],
];
const REG_VARIANTS = [
  ["reg-normal", { level: "normal" }],
  ["reg-max", { level: "max" }],
  ["reg-max-nocff", { level: "max", disableFeatures: ["controlFlowFlattening"] }],
  ["reg-max-nofusion", { level: "max", disableFeatures: ["opcodeFusion"] }],
];

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
// NOTE: A1 deliberately includes 56 here (ITER_PREP is 3-arg; production
// OPCODES_3ARG covers it — see Stage 16 correction notes).
function walk(code, fn) {
  let i = 0;
  while (i < code.length) {
    const op = code[i];
    fn(op, i);
    i += 1 + argc(op);
  }
}
function quietGenerate(gen, chunk, options) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => { lines.push(a.join(" ")); };
  const heap0 = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  let out = "", err = null;
  try { out = gen(chunk, options); }
  catch (e) { err = String((e && e.message) || e).slice(0, 100); }
  finally { console.log = orig; }
  return { out, err, lines, ms: performance.now() - t0, heap: Math.max(0, Math.round(process.memoryUsage().heapUsed - heap0)) };
}
function cloneChunk(c) {
  return { ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cloneChunk) };
}
function cloneReg(c) {
  return { ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cloneReg) };
}

// ---- Part 2: structural flatten census (pre-flatten estimate) ----
function censusBlocks(code) {
  const targets = new Set();
  const isJump = (op) => op === 32 || op === 33 || op === 42 || op === 43;
  walk(code, (op, i) => {
    if (isJump(op)) targets.add(code[i + 1]);
    else if (op === 53) targets.add(code[i + 2]);
  });
  const bounds = new Set([0]);
  for (const t of targets) if (t >= 0 && t < code.length) bounds.add(t);
  walk(code, (op, i) => {
    if (op === 32 || op === 31 || op === 41) {
      const nx = i + 1 + argc(op);
      if (nx < code.length) bounds.add(nx);
    }
  });
  const sorted = [...bounds].sort((a, b) => a - b);
  // fallthrough estimate: blocks not ending in JMP/RETURN/TAILCALL gain a JMP.
  let fallthrough = 0;
  for (let b = 0; b < sorted.length; b++) {
    const start = sorted[b];
    const end = b + 1 < sorted.length ? sorted[b + 1] : code.length;
    let last = -1, j = start;
    while (j < end) { last = code[j]; j += 1 + argc(code[j]); }
    if (last !== 32 && last !== 31 && last !== 41) fallthrough++;
  }
  let jumps = 0;
  walk(code, (op) => { if (isJump(op) || op === 53) jumps++; });
  return { blocks: sorted.length, fallthroughNewJmps: fallthrough, jumps };
}

// ---- Part 3: flatten replication (copy of vm-gen.ts flatten logic shape) ----
function replicateFlatten(code, rng) {
  const arr = [...code];
  if (arr.length < 20) return { out: arr, addedJmps: 0 };
  const bounds = new Set([0]);
  const isJump = (op) => op === 32 || op === 33 || op === 42 || op === 43;
  const isTerm = (op) => op === 32 || op === 31 || op === 41;
  let i = 0;
  while (i < arr.length) {
    const op = arr[i];
    const sz = 1 + argc(op);
    const nextI = i + sz;
    if (isJump(op)) {
      const t = arr[i + 1];
      if (t >= 0 && t < arr.length) bounds.add(t);
      if (nextI < arr.length) bounds.add(nextI);
    } else if (op === 53) {
      const t = arr[i + 2];
      if (t >= 0 && t < arr.length) bounds.add(t);
      if (nextI < arr.length) bounds.add(nextI);
    }
    if (op === 31 || op === 41) { if (nextI < arr.length) bounds.add(nextI); }
    i = nextI;
  }
  const sorted = [...bounds].sort((a, b) => a - b);
  if (sorted.length < 3) return { out: arr, addedJmps: 0 };
  // blocks with fallsThrough flag
  const blocks = [];
  for (let b = 0; b < sorted.length; b++) {
    const s = sorted[b], e = b + 1 < sorted.length ? sorted[b + 1] : arr.length;
    let last = -1, j = s;
    while (j < e) { last = arr[j]; j += 1 + argc(arr[j]); }
    blocks.push({ start: s, end: e, falls: last !== 32 && last !== 31 && last !== 41 });
  }
  const entry = blocks[0];
  const rest = blocks.slice(1);
  for (let k = rest.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [rest[k], rest[j]] = [rest[j], rest[k]];
  }
  const order = [entry, ...rest];
  let addedJmps = 0;
  for (const b of order) if (b.falls) addedJmps++;
  const result = [];
  const posOf = new Map();
  let p = 0;
  for (const b of order) { posOf.set(b.start, p); p += b.end - b.start + (b.falls ? 2 : 0); }
  const HALT = p; // fall-off-the-end sentinel (runner exits when ip >= length)
  for (const b of order) {
    let k = b.start;
    while (k < b.end) {
      const op = arr[k];
      result.push(op);
      if (op === 32 || op === 33 || op === 42 || op === 43) {
        const t = arr[k + 1];
        result.push(posOf.has(t) ? posOf.get(t) : t);
        k += 2;
      } else if (op === 53) {
        result.push(arr[k + 1]);
        const t = arr[k + 2];
        result.push(posOf.has(t) ? posOf.get(t) : t);
        k += 3;
      } else {
        for (let a = 1; a <= argc(op); a++) result.push(arr[k + a]);
        k += 1 + argc(op);
      }
    }
    if (b.falls) {
      // Target the ORIGINAL successor (the block starting where b ends),
      // not the next emitted block — otherwise permutation changes semantics.
      // If b runs off the end of the code, target the halt sentinel.
      const succ = posOf.has(b.end) ? posOf.get(b.end) : HALT;
      result.push(32, succ);
    }
  }
  return { out: result, addedJmps };
}

const env = {
  print: () => {},
  pairs: (t) => { const ks = Object.keys(t); let i = 0; return [(..._) => { if (i >= ks.length) return [null]; const k = ks[i++]; return [k, t[k]]; }, t, null]; },
  ipairs: (t) => { let i = 0; return [(..._) => { i++; const v = t[i]; if (v === undefined || v === null) return [null]; return [i, v]; }, t, 0]; },
};
console.log("== Part 1+2: stack ablation + structural census ==");
for (const file of CLASSES) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  const base = compile(obfuscate(parse(lex(src).tokens), { renameLocals: false, preserveGlobals: true }));
  const cen = censusBlocks(base.code);
  console.log(`${file}: preFlatten words=${base.code.length} blocks~=${cen.blocks} estAddedJMPs~=${cen.fallthroughNewJmps} jumps=${cen.jumps}`);
  for (const [vname, vopts] of STACK_VARIANTS) {
    const o = typeof vopts === "function" ? null : vopts;
    void o;
  }
  for (const v of STACK_VARIANTS) {
    const vname = v[0];
    const vopts = v[1];
    const ms = [], bytes = [];
    for (const seed of SEEDS) {
      const g = quietGenerate(generateVM, cloneChunk(base), { executorGlobals: false, polymorphicSeed: seed, ...vopts });
      if (!g.err) { ms.push(g.ms); bytes.push(g.out.length); }
    }
    ms.sort((a, b) => a - b);
    const bmin = Math.min(...bytes), bmax = Math.max(...bytes);
    console.log(`  ${vname}: bytes=[${bmin}-${bmax}] genMsMed=${ms.length ? ms[Math.floor(ms.length / 2)].toFixed(0) : "FAIL"}`);
  }
}

console.log("== Part 3: flatten replication + runVM pre/post ==");
for (const file of ["loop-carried.lua", "fornum-heavy.lua", "branch-heavy.lua"]) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  const chunk = compile(obfuscate(parse(lex(src).tokens), { renameLocals: false, preserveGlobals: true }));
  const rng = makeRng(1234);
  const { out: flat, addedJmps } = replicateFlatten(chunk.code, rng);
  const guarded = (code) => {
    let n = 0;
    return runVM(chunk.K, code, { ...env }, 0, [], { onTick: () => { if (++n > 5000000) throw new Error("TICK-LIMIT"); }, tickInterval: 1 });
  };
  let r1 = "?", r2 = "?", diverged = false;
  try { r1 = JSON.stringify(guarded(chunk.code)); r2 = JSON.stringify(guarded(flat)); }
  catch (e) { diverged = true; r1 = "ERR:" + String(e.message).slice(0, 30); }
  const t = (c) => {
    for (let w = 0; w < 5; w++) guarded(c);
    const ts = [];
    for (let r = 0; r < 11; r++) { const t0 = performance.now(); guarded(c); ts.push(performance.now() - t0); }
    ts.sort((a, b) => a - b);
    return ts[5];
  };
  let tu = NaN, tf = NaN;
  try { tu = t(chunk.code); tf = t(flat); } catch { diverged = true; }
  console.log(`${file}: words ${chunk.code.length}->${flat.length} (+${flat.length - chunk.code.length}, addedJMPs=${addedJmps}) valueEq=${r1 === r2}${diverged ? " DIVERGED" : ""} runnerMed ${Number.isNaN(tu) ? "?" : tu.toFixed(3)}->${Number.isNaN(tf) ? "?" : tf.toFixed(3)}ms`);
}

console.log("== Part 4: register variants + telemetry ==");
for (const file of ["tiny.lua", "medium.lua", "branch-heavy.lua", "function-heavy.lua", "large.lua"]) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  const rchunk = regCompile(obfuscate(parse(lex(src).tokens), { renameLocals: true, preserveGlobals: true }));
  for (const [vname, vopts] of REG_VARIANTS) {
    const ms = [], bytes = [], notes = new Set();
    for (const seed of SEEDS) {
      const g = quietGenerate(generateRegVM, cloneReg(rchunk), { level: vopts.level, executorGlobals: false, polymorphicSeed: seed, disableFeatures: vopts.disableFeatures });
      if (g.err) { notes.add("ERR:" + g.err); continue; }
      ms.push(g.ms); bytes.push(g.out.length);
      for (const l of g.lines) {
        const m = l.match(/\[RegVM\] (Dispatch: variant \d+|CFF: .*|Fused .*|Dead handler .*)/);
        if (m) notes.add(m[1].slice(0, 60));
      }
    }
    ms.sort((a, b) => a - b);
    console.log(`${file} ${vname}: bytes=[${Math.min(...bytes)}-${Math.max(...bytes)}] genMsMed=${ms.length ? ms[Math.floor(ms.length / 2)].toFixed(0) : "FAIL"} | ${[...notes].join(" ; ")}`);
  }
}
