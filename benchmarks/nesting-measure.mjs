// Nesting measurements (Stage 10E/10F): NO nesting vs nesting:1 vs nesting:2.
// Nesting is not exposed via pipeline/CLI/server; measured via direct calls.
// Usage: node benchmarks/nesting-measure.mjs [--out file.json]
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = 1234;
const outPath = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : join(__dirname, "nesting.json");

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { encodeStrings } = await import("../dist/obfuscator/StringEncoder.js");
const { scrambleControlFlow } = await import("../dist/obfuscator/ControlFlowScrambler.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");
const { lex: lexCheck } = await import("../dist/lexer/Lexer.js");

const rows = [];
for (const file of ["tiny.lua", "small.lua", "medium.lua"]) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  let ast = parse(lex(src).tokens);
  ast = encodeStrings(ast, { enabled: true, seed: SEED });
  ast = scrambleControlFlow(ast, { enabled: true, seed: SEED });
  const obf = obfuscate(ast, { renameLocals: true, preserveGlobals: true });
  const entry = { file, levels: {} };
  for (const nesting of [0, 1, 2]) {
    const chunk = compile(obf);
    const heap0 = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    let out = "", err = null;
    try {
      out = generateVM(chunk, { level: "normal", executorGlobals: false, polymorphicSeed: SEED, nesting });
    } catch (e) { err = String(e && e.message || e).slice(0, 200); }
    // Determinism: run twice, compare.
    let out2 = "";
    try {
      out2 = generateVM(compile(obf), { level: "normal", executorGlobals: false, polymorphicSeed: SEED, nesting });
    } catch (e) { err = (err ? err + " | " : "") + String(e && e.message || e).slice(0, 200); }
    entry.levels[`nesting${nesting}`] = err
      ? { ok: false, error: err }
      : {
          ok: true,
          ms: Math.round((performance.now() - t0) * 100) / 100,
          bytes: out.length,
          heapKB: Math.max(0, Math.round((process.memoryUsage().heapUsed - heap0) / 1024)),
          deterministic: out === out2,
          lexClean: lexCheck(out).errors.length === 0,
        };
  }
  rows.push(entry);
  console.log(`${file}: ` + [0, 1, 2].map((n) => {
    const r = entry.levels[`nesting${n}`];
    return `L${n}:${r.ok ? `${r.ms}ms/${r.bytes}B/det=${r.deterministic}` : "FAIL:" + r.error}`;
  }).join(" "));
}
writeFileSync(outPath, JSON.stringify({ seed: SEED, rows }, null, 2));
console.log(`Wrote ${outPath}`);
