// Reproducible baseline: build ms per stage, output bytes, heap delta.
// Usage: node benchmarks/run-baseline.mjs [--out benchmarks/baseline.json]
// Fixed seed (1234) for encode/scramble/polymorphicSeed. No randomness.
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const fixDir = join(__dirname, "fixtures");

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate, printChunk } = await import("../dist/obfuscator/index.js");
const { encodeStrings } = await import("../dist/obfuscator/StringEncoder.js");
const { scrambleControlFlow } = await import("../dist/obfuscator/ControlFlowScrambler.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

const SEED = 1234;
const outPath = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : join(__dirname, "baseline.json");

const fixtures = readdirSync(fixDir).filter((f) => f.endsWith(".lua")).sort();
const configs = [
  { name: "none", vm: "none" },
  { name: "stack-normal", vm: "stack", level: "normal" },
  { name: "reg-normal", vm: "register", level: "normal" },
];
// reg-max only on small fixtures (expensive); stack-max excluded from default baseline.
const maxFixtures = new Set(["tiny.lua", "small.lua", "function-heavy.lua"]);
if (process.argv.includes("--include-max")) {
  configs.push({ name: "reg-max", vm: "register", level: "max", only: maxFixtures });
}

function sha1(s) {
  return createHash("sha1").update(s).digest("hex").slice(0, 12);
}

const results = {
  meta: {
    seed: SEED,
    node: process.version,
    date: new Date().toISOString(),
    outPath,
  },
  fixtures: [],
};

for (const file of fixtures) {
  const src = readFileSync(join(fixDir, file), "utf8");
  const entry = { file, bytes: src.length, sha: sha1(src), configs: [] };
  for (const cfg of configs) {
    if (cfg.only && !cfg.only.has(file)) continue;
    const heap0 = process.memoryUsage().heapUsed;
    const t = {};
    let output = "";
    try {
      let t0 = performance.now();
      const { tokens, errors } = lex(src);
      t.lex = performance.now() - t0;
      if (errors.length) throw new Error("lex errors: " + JSON.stringify(errors).slice(0, 200));
      t0 = performance.now();
      let ast = parse(tokens);
      t.parse = performance.now() - t0;
      t0 = performance.now();
      ast = encodeStrings(ast, { enabled: true, seed: SEED });
      ast = scrambleControlFlow(ast, { enabled: true, seed: SEED });
      const obf = obfuscate(ast, { renameLocals: true, preserveGlobals: true });
      t.transforms = performance.now() - t0;
      t0 = performance.now();
      if (cfg.vm === "stack") {
        const chunk = compile(obf);
        t.compile = performance.now() - t0;
        t0 = performance.now();
        output = generateVM(chunk, { level: cfg.level, executorGlobals: false, polymorphicSeed: SEED });
        t.generate = performance.now() - t0;
      } else if (cfg.vm === "register") {
        const chunk = regCompile(obf);
        t.compile = performance.now() - t0;
        t0 = performance.now();
        output = generateRegVM(chunk, { level: cfg.level, executorGlobals: false, polymorphicSeed: SEED });
        t.generate = performance.now() - t0;
      } else {
        t.compile = 0;
        t.generate = 0;
        output = printChunk(obf);
      }
      t.total = t.lex + t.parse + t.transforms + t.compile + t.generate;
      const heap1 = process.memoryUsage().heapUsed;
      entry.configs.push({
        config: cfg.name,
        ms: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * 100) / 100])),
        outBytes: output.length,
        outSha: sha1(output),
        heapDelta: Math.max(0, Math.round(heap1 - heap0)),
        ok: true,
      });
    } catch (e) {
      entry.configs.push({ config: cfg.name, ok: false, error: String(e && e.message || e).slice(0, 300) });
    }
  }
  results.fixtures.push(entry);
  const line = entry.configs.map((c) => `${c.config}:${c.ok ? `${c.ms.total}ms/${c.outBytes}B` : "FAIL"}`).join(" ");
  console.log(`${file} (${entry.bytes}B): ${line}`);
}

writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`Wrote ${outPath}`);
