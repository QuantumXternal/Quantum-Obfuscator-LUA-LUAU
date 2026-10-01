// Stage 18L permanent hot-subset protection (reporting only — no gates).
// For each fixture: compile -> replicate production fusion (seeded) ->
// count fused-mix opcodes -> selectHotOps (imported from dist, i.e. the
// LOCKED production rule) -> report selection, coverage, K, and weighted
// dispatch work vs the 71-chain baseline under call-cost sensitivity.
// Structural invariants (K<=12, coverage-or-cap, determinism, exclusions)
// are enforced by tests/dispatch-hotsubset.test.js. Weighted-work numbers
// are REPORTED here, never asserted (corpus evolution must not fail tests).
// Model: baseline op = 35.5 compares, no call; hot = (K+1)/2 + C;
// cold = K + L + C with lookup L=3, call C in {5,10,20}. Compare=1 unit.
// Generated runtime speed is UNMEASURED (no Luau executor).
// Usage: node benchmarks/dispatch-work.mjs
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { selectHotOps } = await import("../dist/vm/vm-gen.js");

const A1 = new Set([4,5,6,7,8,30,31,32,33,34,35,37,38,40,41,42,43,44,45,47,49,50,52,54,55,65,67]);
const A2 = new Set([39,53,60,61,66]);
const A3 = new Set([56,57,58,59,62,63,68,69,70]);
const argc = (op) => (A3.has(op) ? 3 : A2.has(op) ? 2 : A1.has(op) ? 1 : 0);
const OP_NAMES = { 4:"PUSH_K",5:"LOAD_L",6:"STORE_L",9:"ADD",12:"DIV",13:"MOD",15:"CONCAT",30:"CALL",31:"RETURN",32:"JMP",33:"JMP_F",48:"IDIV",57:"ADD_F",63:"CONCAT_F",68:"DIV_F",69:"MOD_F",70:"IDIV_F" };
const EXCLUDED = new Set([0, 64, 65, 66]);
const BASELINE = 35.5;
function makeRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
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
function replicateFuse(code, rng) {
  const result = [...code];
  const jt = collectJumpTargets(code);
  const canFuse = (s, len) => {
    for (let k = s + 1; k < s + len; k++) if (jt.has(k)) return false;
    return true;
  };
  let i = 0;
  while (i < result.length) {
    const op = result[i];
    if (op === 5 && i + 6 < result.length) {
      if (result[i + 2] === 5 && result[i + 5] === 6) {
        const arith = result[i + 4];
        const superOp = arith === 9 ? 57 : arith === 10 ? 58 : arith === 11 ? 59
          : arith === 12 ? 68 : arith === 13 ? 69 : arith === 48 ? 70
          : arith === 15 ? 63 : -1;
        if (superOp !== -1 && canFuse(i, 7) && rng() > 0.25) {
          result[i] = superOp; result[i+1] = result[i+1]; result[i+2] = result[i+3];
          result[i+3] = result[i+6]; result[i+4] = 0; result[i+5] = 0; result[i+6] = 0;
          i += 7; continue;
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
  return result;
}
function countOps(code, hist) {
  let i = 0;
  while (i < code.length) {
    const op = code[i];
    hist.set(op, (hist.get(op) || 0) + 1);
    i += 1 + argc(op);
  }
}
let aggBase = 0, aggNew = { 5: 0, 10: 0, 20: 0 }, aggN = 0;
for (const file of readdirSync(join(__dirname, "fixtures")).filter((f) => f.endsWith(".lua")).sort()) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  const chunk = compile(obfuscate(parse(lex(src).tokens), { renameLocals: false, preserveGlobals: true }));
  const hist = new Map();
  const walk = (c) => {
    const rng = makeRng(1234);
    for (let b = 0; b < 8; b++) rng();
    countOps(replicateFuse(c.code, rng), hist);
    for (const p of c.protos || []) {
      const prng = makeRng(1234);
      for (let b = 0; b < 8; b++) prng();
      countOps(replicateFuse(p.code, prng), hist);
    }
  };
  walk(chunk);
  const total = [...hist.values()].reduce((a, b) => a + b, 0);
  const set = selectHotOps(hist, total);
  const hot = new Set(set);
  const K = set.length;
  let cov = 0, w = 0;
  for (const [op, n] of hist) {
    if (EXCLUDED.has(op)) continue;
    if (hot.has(op)) { cov += n; w += n * (((K + 1) / 2) + 10); }
    else { w += n * (K + 3 + 10); }
  }
  const eligible = [...hist.entries()].filter(([op]) => !EXCLUDED.has(op)).reduce((a, [, n]) => a + n, 0);
  const work = w / eligible;
  aggBase += BASELINE * eligible;
  aggNew[5] += w - eligible * 10 + eligible * 5;
  aggNew[10] += w;
  aggNew[20] += w - eligible * 10 + eligible * 20;
  aggN += eligible;
  const names = set.map((o) => OP_NAMES[o] ?? ("op" + o)).join(",");
  console.log(`${file}: K=${K} cov=${(100 * cov / total).toFixed(1)}% work(C10)=${work.toFixed(1)} [${names}]`);
}
console.log(`CORPUS: baseline=${(aggBase / aggN).toFixed(1)} work C5=${(aggNew[5] / aggN).toFixed(1)} C10=${(aggNew[10] / aggN).toFixed(1)} C20=${(aggNew[20] / aggN).toFixed(1)}`);
