// Stage 11D-2E: stack-VM CONCAT fusion census (measurement only).
// Exact replication of src/vm/vm-gen.ts fuseOpcodes + collectJumpTargets +
// the module PRNG (lines 6-18, 53-162), driven with the same rng-burn the
// generator performs before fuseChunk at level "max" with default options:
//   seedRandom(seed) [vm-gen.ts:3376], then exactly 8 content-independent
//   rng() calls (xorKey, xorStep, codeXorKey, lazyBaseKey, lazyKeyPrime,
//   ctxInit, ctxPrime, jumpKey — vm-gen.ts:3459-3471, all flag-default-true
//   at max). fuseChunk order (main chunk, then protos depth-first) is kept.
// CAVEAT: this is replication, not instrumentation. Any future pre-fusion
// rng consumer in generateVM shifts the stream. Aggregate percentages are
// robust to burn misalignment (uniform 75% gate); per-window identity is not.
// Usage: node benchmarks/concat-fusion-census.mjs
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");

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
// --- Opcode arg sets copy (vm-gen.ts:53-60) ---
const A1 = new Set([4,5,6,7,8,30,31,32,33,34,35,37,38,40,41,42,43,44,45,47,49,50,52,54,55,65,67]);
const A2 = new Set([39,53,60,61,66]);
const A3 = new Set([56,57,58,59,62,63]);
const argc = (op) => (A3.has(op) ? 3 : A2.has(op) ? 2 : A1.has(op) ? 1 : 0);
// --- collectJumpTargets copy (vm-gen.ts:77-98) ---
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
// Instrumented fuseOpcodes copy (vm-gen.ts:107-162): counts everything,
// replicates every fusion decision for ALL super-op kinds so the shared
// rng stream stays aligned; records concat (op 15 -> 63) flow separately.
function censusFuse(code, rng, stats) {
  const result = [...code];
  const jt = collectJumpTargets(code);
  const canFuse = (start, len) => {
    for (let k = start + 1; k < start + len; k++) if (jt.has(k)) return false;
    return true;
  };
  let i = 0;
  const fusedOps = [];
  while (i < result.length) {
    const op = result[i];
    if (op === 5 && i + 6 < result.length) {
      const a = result[i + 1];
      if (result[i + 2] === 5 && result[i + 5] === 6) {
        const b = result[i + 3];
        const arith = result[i + 4];
        const c = result[i + 6];
        const superOp = arith === 9 ? 57 : arith === 10 ? 58 : arith === 11 ? 59 : arith === 15 ? 63 : -1;
        if (superOp !== -1) {
          if (arith === 15) stats.concatCandidates++;
          else stats.arithCandidates++;
          if (!canFuse(i, 7)) { if (arith === 15) stats.concatBlocked++; }
          else if (rng() > 0.25) {
            result[i] = superOp; result[i+1] = a; result[i+2] = b; result[i+3] = c;
            result[i+4] = 0; result[i+5] = 0; result[i+6] = 0;
            fusedOps.push(superOp);
            if (superOp === 63) stats.concatFused++;
            i += 7; continue;
          }
        }
      }
      if (result[i + 2] === 4 && result[i + 4] === 9 && result[i + 5] === 6) {
        if (canFuse(i, 7)) {
          if (rng() > 0.25) { result[i] = 62; i += 7; continue; }
        }
      }
      if (result[i + 2] === 6) {
        if (canFuse(i, 4)) {
          if (rng() > 0.25) { result[i] = 61; i += 4; continue; }
        }
      }
    }
    if (op === 4 && i + 3 < result.length && result[i + 2] === 6) {
      if (canFuse(i, 4)) {
        if (rng() > 0.25) { result[i] = 60; i += 4; continue; }
      }
    }
    i++;
    i += argc(op);
  }
  return fusedOps;
}
// NOTE: production evaluates `canFuse(i,n,jt) && rng()>0.25` left-to-right,
// so rng() is consumed exactly once per canFuse-passing candidate and never
// otherwise. The nested-if structure above preserves that consumption exactly;
// the 63-branch `else` path (canFuse fails) consumes nothing, as in production.

function countConcatOps(code) {
  let n = 0, i = 0;
  while (i < code.length) {
    if (code[i] === 15) n++;
    i++;
    i += argc(code[i - 1]);
  }
  return n;
}

const SEEDS = [1234, 1, 7, 42, 999];
const totals = { concatOps: 0, candidates: 0, blocked: 0, fused: 0, files: 0, filesWithConcat: 0 };
console.log("file | concatOps | candidates | jumpBlocked | fused63 | fused63/cand");
for (const file of readdirSync(join(__dirname, "fixtures")).filter((f) => f.endsWith(".lua")).sort()) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  const chunk = compile(obfuscate(parse(lex(src).tokens), { renameLocals: false, preserveGlobals: true }));
  const perSeed = [];
  for (const seed of SEEDS) {
    const rng = makeRng(seed);
    for (let b = 0; b < 8; b++) rng(); // pre-fusion burn, see header
    const stats = { concatCandidates: 0, arithCandidates: 0, concatBlocked: 0, concatFused: 0 };
    const walk = (c) => { censusFuse(c.code, rng, stats); for (const p of c.protos || []) walk(p); };
    // NOTE: census runs on a throwaway walk; chunk.code is never mutated here
    // (censusFuse copies). Production mutates in place during generateVM.
    const savedCode = JSON.stringify(chunk.code);
    walk({ code: [...chunk.code], protos: (chunk.protos || []).map((p) => ({ code: [...p.code], protos: p.protos })) });
    if (JSON.stringify(chunk.code) !== savedCode) throw new Error("census mutated input!");
    perSeed.push(stats);
  }
  const ops = countConcatOps(chunk.code) + (chunk.protos || []).reduce((a, p) => a + countConcatOps(p.code), 0);
  const avg = (k) => perSeed.reduce((a, s) => a + s[k], 0) / perSeed.length;
  const cand = avg("concatCandidates"), fused = avg("concatFused"), blocked = avg("concatBlocked");
  totals.concatOps += ops; totals.candidates += cand; totals.blocked += blocked; totals.fused += fused;
  totals.files++;
  if (ops > 0) totals.filesWithConcat++;
  const rate = cand > 0 ? `${Math.round((fused / cand) * 100)}%` : "-";
  console.log(`${file} | ${ops} | ${cand.toFixed(1)} | ${blocked.toFixed(1)} | ${fused.toFixed(1)} | ${rate}`);
}
console.log(`TOTAL files=${totals.files} withConcat=${totals.filesWithConcat} concatOps=${totals.concatOps} candidates=${totals.candidates.toFixed(1)} blocked=${totals.blocked.toFixed(1)} fused63=${totals.fused.toFixed(1)}`);
