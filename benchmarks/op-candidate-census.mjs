// Stage 12B candidate census (measurement only — no production changes).
// Per operator (DIV/MOD/POW/IDIV) across dedicated fixtures x seeds, records:
//   SOURCE occurrence count -> RAW fusable windows -> FUSION CANDIDATES
//   (jump-safe) -> ACTUAL FUSED (replicated stream) -> FINAL OUTPUT.
// Fusion replication: exact copy of vm-gen.ts fuseOpcodes + collectJumpTargets
// + module PRNG with the documented 8-call pre-fusion burn at level "max"
// (see concat-fusion-census.mjs header). Percentages are burn-robust;
// per-window identity is replication, not instrumentation.
// generateVM MUTATES its input chunk: every seed runs on a deep copy.
// Usage: node benchmarks/op-candidate-census.mjs [--out path]
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");
const { runVM } = await import("../dist/vm/vm-runner.js");

const outPath = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : join(__dirname, "op-candidate-census.json");

const FIXTURES = ["div-shapes.lua", "mod-shapes.lua", "pow-shapes.lua", "idiv-shapes.lua"];
const SEEDS = [1234, 1, 7, 42, 999];
const OP_OF = { "div-shapes.lua": 12, "mod-shapes.lua": 13, "pow-shapes.lua": 14, "idiv-shapes.lua": 48 };
const OP_NAME = { 12: "DIV", 13: "MOD", 14: "POW", 48: "IDIV" };

// --- PRNG copy (vm-gen.ts:8-16) ---
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
const A3 = new Set([56,57,58,59,62,63]);
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
// Full-stream fuse replication; records per-arith-op candidate/fused/blocked
// for ops 9,10,11,12,13,14,15,48 and fused totals for existing super-ops.
function censusFuse(code, rng, stats) {
  const result = [...code];
  const jt = collectJumpTargets(code);
  const canFuse = (start, len) => {
    for (let k = start + 1; k < start + len; k++) if (jt.has(k)) return false;
    return true;
  };
  const rec = (arith, kind) => {
    stats.perOp[arith] = stats.perOp[arith] || { raw: 0, cand: 0, blocked: 0, fused: 0 };
    stats.perOp[arith][kind]++;
  };
  let i = 0;
  while (i < result.length) {
    const op = result[i];
    if (op === 5 && i + 6 < result.length) {
      if (result[i + 2] === 5 && result[i + 5] === 6) {
        const arith = result[i + 4];
        if ([9,10,11,12,13,14,15,48].includes(arith)) {
          rec(arith, "raw");
          const superOp = arith === 9 ? 57 : arith === 10 ? 58 : arith === 11 ? 59
            : arith === 15 ? 63 : arith === 12 ? 68 : arith === 13 ? 69
            : arith === 14 ? 70 : arith === 48 ? 71 : -1;
          const known = superOp === 57 || superOp === 58 || superOp === 59 || superOp === 63;
          if (known) {
            rec(arith, "cand");
            if (!canFuse(i, 7)) rec(arith, "blocked");
            else if (rng() > 0.25) {
              result[i] = superOp; result[i+1] = result[i+1]; result[i+2] = result[i+3];
              result[i+3] = result[i+6]; result[i+4] = 0; result[i+5] = 0; result[i+6] = 0;
              rec(arith, "fused");
              stats.existingFused[superOp] = (stats.existingFused[superOp] || 0) + 1;
              i += 7; continue;
            }
          } else {
            // Candidate for a NOT-YET-EXISTING super-op: record candidacy and
            // consume rng EXACTLY as production would once implemented
            // (canFuse && rng()>0.25 gate), so downstream stream position is
            // projected faithfully. "fused" here is PROJECTION, not fact.
            rec(arith, "cand");
            if (!canFuse(i, 7)) rec(arith, "blocked");
            else if (rng() > 0.25) { rec(arith, "fused"); i += 1; continue; }
          }
        }
      }
      if (result[i + 2] === 4 && result[i + 4] === 9 && result[i + 5] === 6) {
        if (canFuse(i, 7) && rng() > 0.25) { result[i] = 62; i += 7; continue; }
      }
      if (result[i + 2] === 6) {
        if (canFuse(i, 4) && rng() > 0.25) { result[i] = 61; i += 4; continue; }
      }
    }
    if (op === 4 && i + 3 < result.length && result[i + 2] === 6) {
      if (canFuse(i, 4) && rng() > 0.25) { result[i] = 60; i += 4; continue; }
    }
    i++;
    i += argc(op);
  }
}

// Count source-level occurrences of an operator via AST walk.
function countSourceOps(ast, ops) {
  let n = 0;
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const e of node) walk(e); return; }
    if (node.type === "BinaryExpression" && ops.includes(node.operator)) n++;
    if (node.type === "CompoundAssignmentStatement" && ops.some((o) => node.operator === o + "=")) n++;
    for (const k of Object.keys(node)) { if (k !== "loc") walk(node[k]); }
  };
  walk(ast);
  return n;
}
function countInstr(code) {
  let n = 0, i = 0;
  while (i < code.length) { const op = code[i]; n++; i++; i += argc(op); }
  return n;
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
  try {
    out = generateVM(chunk, { level: "max", polymorphicSeed: seed });
  } finally {
    console.log = orig;
  }
  return { out, ms: performance.now() - t0, heapDelta: Math.max(0, Math.round(process.memoryUsage().heapUsed - heap0)) };
}

const SRC_OPS = { 12: ["/"], 13: ["%"], 14: ["^"], 48: ["//"] };
const rows = [];
for (const file of FIXTURES) {
  const op = OP_OF[file];
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  const ast = parse(lex(src).tokens);
  const srcCount = countSourceOps(ast, SRC_OPS[op]);
  const base = compile(obfuscate(ast, { renameLocals: false, preserveGlobals: true }));
  const chunks = [base, ...(base.protos || [])];
  const instr = chunks.reduce((a, c) => a + countInstr(c.code), 0);
  // arg-aware opcode occurrence count
  let occurrences = 0;
  for (const c of chunks) {
    let i = 0;
    while (i < c.code.length) {
      if (c.code[i] === op) occurrences++;
      i++; i += argc(c.code[i - 1]);
    }
  }
  const seedRows = [];
  for (const seed of SEEDS) {
    const rng = makeRng(seed);
    for (let b = 0; b < 8; b++) rng();
    const stats = { perOp: {}, existingFused: {} };
    const walk = (c) => { censusFuse(c.code, rng, stats); for (const p of c.protos || []) walk(p); };
    walk(cloneChunk(base));
    const g1 = quietGenerate(cloneChunk(base), seed);
    const g2 = quietGenerate(cloneChunk(base), seed);
    const s = stats.perOp[op] || { raw: 0, cand: 0, blocked: 0, fused: 0 };
    seedRows.push({
      seed,
      raw: s.raw, cand: s.cand, blocked: s.blocked, fusedProj: s.fused,
      existingFused: { ...stats.existingFused },
      outBytes: g1.out.length, genMs: Math.round(g1.ms * 100) / 100,
      heapDelta: g1.heapDelta, reproBytesEqual: g1.out === g2.out,
    });
  }
  // stack-runner execution time on UNFUSED compiled output (median of 21).
  const env = { print: () => {} };
  const times = [];
  for (let r = 0; r < 21; r++) {
    const t0 = performance.now();
    runVM(base.K, base.code, { ...env }, 0, base.protos || []);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const runnerMsMedian = Math.round(times[10] * 1000) / 1000;
  const avg = (k) => seedRows.reduce((a, r) => a + r[k], 0) / seedRows.length;
  const min = (k) => Math.min(...seedRows.map((r) => r[k]));
  const max = (k) => Math.max(...seedRows.map((r) => r[k]));
  const row = {
    file, op: OP_NAME[op], srcCount, instr, occurrences,
    rawAvg: +avg("raw").toFixed(1), candAvg: +avg("cand").toFixed(1),
    blockedAvg: +avg("blocked").toFixed(1), fusedProjAvg: +avg("fusedProj").toFixed(1),
    fusedProjMin: min("fusedProj"), fusedProjMax: max("fusedProj"),
    outBytesMin: min("outBytes"), outBytesMax: max("outBytes"),
    genMsMedian: seedRows.map((r) => r.genMs).sort((a, b) => a - b)[2],
    runnerMsMedian, heapDeltaMax: max("heapDelta"),
    reproAllEqual: seedRows.every((r) => r.reproBytesEqual),
    seeds: seedRows,
  };
  rows.push(row);
  console.log(`${row.op} ${file}: src=${srcCount} instr=${instr} occ=${occurrences} raw=${row.rawAvg} cand=${row.candAvg} fusedProj=${row.fusedProjAvg}[${row.fusedProjMin}-${row.fusedProjMax}] bytes=[${row.outBytesMin}-${row.outBytesMax}] runner=${runnerMsMedian}ms repro=${row.reproAllEqual}`);
}
writeFileSync(outPath, JSON.stringify({ seeds: SEEDS, rows }, null, 2));
console.log(`Wrote ${outPath}`);
