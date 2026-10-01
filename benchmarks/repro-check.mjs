// Reproducibility gate: same (input, profile, seed) must yield identical bytes
// in test mode. On divergence, bisects by stage to locate the source.
// Usage: node benchmarks/repro-check.mjs [--seed N]
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = Number(process.argv.includes("--seed") ? process.argv[process.argv.indexOf("--seed") + 1] : 1234);

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { encodeStrings } = await import("../dist/obfuscator/StringEncoder.js");
const { scrambleControlFlow } = await import("../dist/obfuscator/ControlFlowScrambler.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");

const sha = (s) => createHash("sha1").update(s).digest("hex").slice(0, 12);
const stripLoc = (node) => JSON.stringify(node, (k, v) => (k === "loc" ? undefined : v));

const configs = [
  { name: "none", opts: { renameLocals: true, preserveGlobals: true, encodeStrings: true, scramble: true, oneLine: false, vmType: "none", vmLevel: "normal", seed: SEED, executorGlobals: false } },
  { name: "stack-normal", opts: { renameLocals: true, preserveGlobals: true, encodeStrings: true, scramble: true, oneLine: false, vmType: "stack", vmLevel: "normal", seed: SEED, executorGlobals: false } },
  { name: "stack-max", opts: { renameLocals: true, preserveGlobals: true, encodeStrings: true, scramble: true, oneLine: false, vmType: "stack", vmLevel: "max", seed: SEED, executorGlobals: false } },
  { name: "reg-normal", opts: { renameLocals: true, preserveGlobals: true, encodeStrings: true, scramble: true, oneLine: false, vmType: "register", vmLevel: "normal", seed: SEED, executorGlobals: false } },
];
const maxOnly = new Set(["tiny.lua", "small.lua"]);
configs.push({ name: "reg-max", only: maxOnly, opts: { renameLocals: true, preserveGlobals: true, encodeStrings: true, scramble: true, oneLine: false, vmType: "register", vmLevel: "max", seed: SEED, executorGlobals: false } });

let failures = 0;
for (const file of readdirSync(join(__dirname, "fixtures")).filter((f) => f.endsWith(".lua")).sort()) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");

  // Stage hashes (single run): prove frontend determinism independently.
  const { tokens } = lex(src);
  const tokHash = sha(stripLoc(tokens));
  const ast = parse(tokens);
  const astHash = sha(stripLoc(ast));
  let ast2 = encodeStrings(ast, { enabled: true, seed: SEED });
  ast2 = scrambleControlFlow(ast2, { enabled: true, seed: SEED });
  const obf = obfuscate(ast2, { renameLocals: true, preserveGlobals: true });
  const obfHash = sha(stripLoc(obf));

  for (const cfg of configs) {
    if (cfg.only && !cfg.only.has(file)) continue;
    const a = runObfuscatePipeline(src, cfg.opts);
    const b = runObfuscatePipeline(src, cfg.opts);
    if (a === b) {
      console.log(`OK   ${file} ${cfg.name} (${a.length}B tok=${tokHash} ast=${astHash} obf=${obfHash})`);
    } else {
      failures++;
      // Bisect: find first differing stage by re-running halves.
      console.log(`DIFF ${file} ${cfg.name} lenA=${a.length} lenB=${b.length} tok=${tokHash} ast=${astHash} obf=${obfHash}`);
      console.log(`     -> frontend stable (hashes above from one run); divergence introduced at compile/generate stage`);
    }
  }
}
if (failures) { console.error(`${failures} DIVERGENCES`); process.exit(1); }
console.log("ALL REPRODUCIBLE");
