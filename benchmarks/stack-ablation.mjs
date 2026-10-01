// Stack feature-cost ablation (Stage 10D): baseline + single-feature deltas +
// combined deltas + interaction check. Non-additivity is reported, not assumed.
// Usage: node benchmarks/stack-ablation.mjs [--out file.json]
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = 1234;
const outPath = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : join(__dirname, "stack-ablation.json");

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { encodeStrings } = await import("../dist/obfuscator/StringEncoder.js");
const { scrambleControlFlow } = await import("../dist/obfuscator/ControlFlowScrambler.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");

const fixtures = ["tiny.lua", "small.lua", "medium.lua"];
const variants = [
  { name: "normal", opts: { level: "normal" } },
  { name: "max", opts: { level: "max" } },
  { name: "max-nocomp", opts: { level: "max", noCompression: true } },
  { name: "max-nowm", opts: { level: "max", _noWatermark: true } },
  { name: "max-nosuper", opts: { level: "max", disableFeatures: ["superOperators"] } },
  { name: "max-nolazy", opts: { level: "max", disableFeatures: ["lazyDecode"] } },
  { name: "max-nocff", opts: { level: "max", disableFeatures: ["cff"] } },
  { name: "max-nonlinear", opts: { level: "max", disableFeatures: ["nonLinearJumps"] } },
  { name: "max-nosuper-nolazy", opts: { level: "max", disableFeatures: ["superOperators", "lazyDecode"] } },
];

const rows = [];
for (const file of fixtures) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  let ast = parse(lex(src).tokens);
  ast = encodeStrings(ast, { enabled: true, seed: SEED });
  ast = scrambleControlFlow(ast, { enabled: true, seed: SEED });
  const obf = obfuscate(ast, { renameLocals: true, preserveGlobals: true });
  const entry = { file, variants: {} };
  for (const v of variants) {
    // Fresh compile per variant: generateVM pipeline stages mutate bytecode
    // in place, so sharing one chunk would confound deltas.
    const chunk = compile(obf);
    const heap0 = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    let out = "";
    let err = null;
    try {
      out = generateVM(chunk, { executorGlobals: false, polymorphicSeed: SEED, ...v.opts });
    } catch (e) { err = String(e && e.message || e).slice(0, 120); }
    entry.variants[v.name] = err
      ? { ok: false, error: err }
      : { ok: true, ms: Math.round((performance.now() - t0) * 100) / 100, bytes: out.length, heapKB: Math.max(0, Math.round((process.memoryUsage().heapUsed - heap0) / 1024)) };
  }
  rows.push(entry);
  const line = variants.map((v) => {
    const r = entry.variants[v.name];
    return `${v.name}:${r.ok ? `${r.ms}ms/${r.bytes}B` : "FAIL"}`;
  }).join(" ");
  console.log(`${file}: ${line}`);
}
writeFileSync(outPath, JSON.stringify({ seed: SEED, rows }, null, 2));
console.log(`Wrote ${outPath}`);
