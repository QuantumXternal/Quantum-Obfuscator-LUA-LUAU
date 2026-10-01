// Fusion-aware metric layer (Stage 9A): per fixture report compiler output,
// fusion-pattern census, actual fused telemetry, and final bytes.
// Usage: node benchmarks/fusion-metrics.mjs [--out benchmarks/fusion-metrics.json]
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED = 1234;
const outPath = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : join(__dirname, "fusion-metrics.json");

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { encodeStrings } = await import("../dist/obfuscator/StringEncoder.js");
const { scrambleControlFlow } = await import("../dist/obfuscator/ControlFlowScrambler.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM, countFusionMatches } = await import("../dist/vm/reg-vm-gen.js");

const OP_NAMES = ["NOP","LOADK","LOADNIL","LOADBOOL","MOVE","GETGLOBAL","SETGLOBAL","GETTABLE","SETTABLE","NEWTABLE","ADD","SUB","MUL","DIV","MOD","POW","IDIV","UNM","NOT","LEN","CONCAT","JMP","EQ","LT","LE","TEST","TESTSET","CALL","TAILCALL","RETURN","FORPREP","FORLOOP","TFORLOOP","SETLIST","CLOSURE","VARARG","SELF","GETUPVAL","SETUPVAL","CLOSEUPVAL","PCALL","XPCALL","ITERPREP","LOADKX","EXTRAARG"];
const COUNT_OPS = ["MOVE","LOADK","LOADKX","EXTRAARG","JMP","EQ","LT","LE","TEST","TESTSET"];

function opHistogram(chunk) {
  const h = {};
  const walk = (c) => {
    for (let i = 0; i < c.code.length; i += 4) {
      const n = OP_NAMES[c.code[i]] ?? `OP${c.code[i]}`;
      h[n] = (h[n] || 0) + 1;
    }
    for (const p of c.protos || []) walk(p);
  };
  walk(chunk);
  return h;
}

// Capture [RegVM] telemetry lines without printing them.
function generateCapture(chunk) {
  const lines = [];
  const orig = console.log;
  console.log = (...a) => { lines.push(a.join(" ")); };
  const heap0 = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  let output = "";
  try {
    output = generateRegVM(chunk, { level: "normal", executorGlobals: false, polymorphicSeed: SEED });
  } finally {
    console.log = orig;
  }
  return { lines, ms: performance.now() - t0, heapDelta: Math.max(0, Math.round(process.memoryUsage().heapUsed - heap0)), output };
}
const pick = (lines, re) => { const l = lines.find((x) => re.test(x)); return l ? l.match(/[\d.]+/g).map(Number) : null; };

const rows = [];
for (const file of readdirSync(join(__dirname, "fixtures")).filter((f) => f.endsWith(".lua")).sort()) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  let ast = parse(lex(src).tokens);
  ast = encodeStrings(ast, { enabled: true, seed: SEED });
  ast = scrambleControlFlow(ast, { enabled: true, seed: SEED });
  const chunk = regCompile(obfuscate(ast, { renameLocals: true, preserveGlobals: true }));
  const hist = opHistogram(chunk);
  const total = Object.values(hist).reduce((a, b) => a + b, 0);
  const census = countFusionMatches(chunk);
  const gen = generateCapture(chunk);
  const fused = pick(gen.lines, /Fused .* instruction/);
  const row = {
    file, srcBytes: src.length,
    instructions: total,
    opcodes: Object.fromEntries(COUNT_OPS.map((o) => [o, hist[o] || 0])),
    fusionMatches: Object.fromEntries(census.perPattern.map((p) => [p.name, p.matches])),
    greedyTotal: census.greedyTotal,
    fusedTelemetry: fused ? { count: fused[0], patterns: fused[1], ratePct: fused[2] } : null,
    cff: pick(gen.lines, /CFF:/)?.[0] ?? null,
    dispatch: (gen.lines.find((x) => /Dispatch:/.test(x)) || "").replace(/.*variant \d+ /, "").replace(/[()]/g, "") || null,
    genMs: Math.round(gen.ms * 100) / 100,
    heapDelta: gen.heapDelta,
    outBytes: gen.output.length,
  };
  rows.push(row);
  const top = Object.entries(row.fusionMatches).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(" ") || "none";
  console.log(`${file}: instr=${total} greedy=${census.greedyTotal} fused=${row.fusedTelemetry?.count ?? "?"} matches[${top}] out=${row.outBytes}B gen=${row.genMs}ms`);
}
writeFileSync(outPath, JSON.stringify({ seed: SEED, level: "normal", rows }, null, 2));
console.log(`Wrote ${outPath}`);
