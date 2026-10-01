// Stage 12B microbenchmarks (measurement only — REFERENCE-RUNNER timings,
// explicitly NOT real Luau wall-time). Compares per-shape UNFUSED execution
// cost across 7 groups x 4 operators; medians of 51 runs after 5 warmups.
// The fusion value proposition is dispatch reduction (4 dispatches -> 1 per
// fused site), so per-group medians are normalized per executed instruction.
// Usage: node benchmarks/op-microbench.mjs [--out path]
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { runVM } = await import("../dist/vm/vm-runner.js");

const outPath = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : join(__dirname, "op-microbench.json");

const OPS = { DIV: "/", MOD: "%", POW: "^", IDIV: "//" };
const groups = {
  // 1. operator-heavy: 8 chained fusable-shape sites
  "operator-heavy": (o) =>
    `local a = 200 local b = 3 local s1 = a ${o} b local s2 = s1 ${o} b ` +
    `local s3 = s2 ${o} b local s4 = s3 ${o} b local s5 = s4 ${o} b ` +
    `local s6 = s5 ${o} b local s7 = s6 ${o} b local s8 = s7 ${o} b return s8`,
  // 2. mixed arithmetic across all four operators
  "mixed": (o) =>
    `local a = 200 local b = 3 local m = a / b local n = a % b ` +
    `local p = a ^ 2 local q = a // b local r = m ${o} n return r + p + q`,
  // 3. constant-heavy: const operands never form fusion windows
  "constant-heavy": (o) =>
    `local s = 200 ${o} 3 local t = 100 ${o} 7 local u = 50 ${o} 2 return s + t + u`,
  // 4. local-heavy: every site is local/local/STORE (max eligibility)
  "local-heavy": (o) =>
    `local a = 200 local b = 3 local c = 5 local d = 7 local r1 = a ${o} b ` +
    `local r2 = c ${o} d local r3 = r1 ${o} r2 return r3`,
  // 5. branch-heavy: op sites inside both branches
  "branch-heavy": (o) =>
    `local a = 200 local b = 3 local r = 0 if a > b then r = a ${o} b ` +
    `else r = b ${o} a end return r`,
  // 6. loop-heavy: hot loop-carried site (500 iterations)
  "loop-heavy": (o) =>
    `local acc = 200 local b = 3 local i = 0 while i < 500 do ` +
    `acc = acc ${o} b if acc < 1 then acc = 200 end i = i + 1 end return acc`,
  // 7. non-fusible negatives: call results and RETURN-direct sinks
  "nonfusible": (o) =>
    `local function id(x) return x end local a = 200 local b = 3 ` +
    `local t = id(a) ${o} id(b) return t`,
};
const REPS = 51, WARMUP = 5;
function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}
const rows = [];
for (const [gname, build] of Object.entries(groups)) {
  for (const [opName, sym] of Object.entries(OPS)) {
    const src = build(sym);
    const chunk = compile(obfuscate(parse(lex(src).tokens), { renameLocals: false, preserveGlobals: true }));
    const env = { print: () => {} };
    for (let w = 0; w < WARMUP; w++) runVM(chunk.K, chunk.code, { ...env }, 0, chunk.protos || []);
    const ts = [];
    for (let r = 0; r < REPS; r++) {
      const t0 = performance.now();
      runVM(chunk.K, chunk.code, { ...env }, 0, chunk.protos || []);
      ts.push(performance.now() - t0);
    }
    const med = median(ts);
    const perInstr = med / chunk.code.length;
    rows.push({ group: gname, op: opName, codeLen: chunk.code.length, medianMs: +med.toFixed(4), perInstrUs: +(perInstr * 1000).toFixed(3) });
    console.log(`${gname} ${opName}: median=${med.toFixed(4)}ms codeLen=${chunk.code.length} perInstr=${(perInstr * 1000).toFixed(3)}us`);
  }
}
writeFileSync(outPath, JSON.stringify({ reps: REPS, warmup: WARMUP, harness: "reference-runner (NOT Luau wall-time)", rows }, null, 2));
console.log(`Wrote ${outPath}`);
