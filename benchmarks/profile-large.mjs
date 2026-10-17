// Large-input memory profiler for the Quantum obfuscation pipeline.
//
// Purpose: attribute heap/RSS growth to exact pipeline phases for
// string-heavy real-world scripts, and demonstrate the pre-fix explosion
// (reg/max envelope + single-line flatten + per-byte string encoding).
//
// Run ONE size per process for clean peaks:
//   node --expose-gc --max-old-space-size=3072 benchmarks/profile-large.mjs --size=250000 --vm=register --level=max
//
// Flags:
//   --size=<chars>          synthetic source size (default 150000)
//   --vm=register|stack|none
//   --level=max|normal|debug
//   --no-encode             disable the AST string-encoding pass
//   --mba                   enable MBA pass
//   --seed=<n>              deterministic seed (default 1234)
//   --max-ms=<n>            abort with a clean message past this wall time (default 600000)
//   --json                  emit a single JSON line instead of a markdown table
import { lex } from "../dist/lexer/Lexer.js";
import { parseWithErrors } from "../dist/parser/Parser.js";
import { encodeStrings } from "../dist/obfuscator/StringEncoder.js";
import { scrambleControlFlow } from "../dist/obfuscator/ControlFlowScrambler.js";
import { applyMBA } from "../dist/obfuscator/MBAEncoder.js";
import { obfuscate } from "../dist/obfuscator/Obfuscator.js";
import { compile } from "../dist/vm/Compiler.js";
import { regCompile } from "../dist/vm/RegCompiler.js";
import { generateVM } from "../dist/vm/vm-gen.js";
import { generateRegVM } from "../dist/vm/reg-vm-gen.js";
import { readFileSync } from "node:fs";

function arg(name, dflt) {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const SIZE = parseInt(arg("size", "150000"), 10);
const FILE = arg("file", "");
const STRHEAVY = parseInt(arg("strheavy", "0"), 10);
const VM = arg("vm", "register");
const LEVEL = arg("level", "max");
const ENCODE = !flag("no-encode");
const MBA = flag("mba");
const SEED = parseInt(arg("seed", "1234"), 10);
const MAX_MS = parseInt(arg("max-ms", "600000"), 10);
const JSON_OUT = flag("json");

// ---------------------------------------------------------------------------
// Synthetic source: string-heavy Roblox-style UI module with the shape the
// incident script had (nested UI tables, rendering loops, metatable hooks).
// ---------------------------------------------------------------------------
function generateLuau(target) {
  const parts = [];
  let size = 0;
  let i = 0;
  const long = (n) => "InfoText_" + "x".repeat(Math.max(0, n - 10)) + "_end";
  while (size < target) {
    i++;
    const chunks = [
      `local Config_${i} = {\n  Name = "MenuItem_${i}_Label",\n  Visible = true,\n  Size = { ${i % 500}, 32 },\n  Color = "rgb(${i % 255}, 120, 200)",\n}\n`,
      `function Handler_${i}(a, b)\n  local t = { a = a + ${i}, b = b * 2 }\n  for k = 1, 4 do t.a = t.a + k end\n  return t.a + t.b\nend\n`,
      `Config_${i}.Callback = function(src)\n  if src and src.Enabled then\n    src.Value = Config_${i}.Name .. "_${i}"\n  end\n  return src\nend\n`,
    ];
    if (i % 25 === 0) {
      chunks.push(`local LongImage_${i} = "${long(320 + (i % 200))}"\n`);
    }
    if (i % 60 === 0) {
      chunks.push(`setmetatable(Config_${i}, { __index = function(self, k) return rawget(self, k) or "${"desc".repeat(8)}" end })\n`);
    }
    for (const c of chunks) { parts.push(c); size += c.length; }
  }
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Sampled peak RSS while work runs (captures transient allocation spikes).
// ---------------------------------------------------------------------------
let peakRss = 0;
let peakHeap = 0;
const sampler = setInterval(() => {
  const m = process.memoryUsage();
  if (m.rss > peakRss) peakRss = m.rss;
  if (m.heapUsed > peakHeap) peakHeap = m.heapUsed;
}, 25);
sampler.unref();

const rows = [];
const t0 = Date.now();
function snap(label) {
  if (global.gc) global.gc();
  const m = process.memoryUsage();
  rows.push({
    phase: label,
    heapMB: +(m.heapUsed / 1048576).toFixed(1),
    rssMB: +(m.rss / 1048576).toFixed(1),
    ms: Date.now() - t0,
    bytes: null,
  });
}
function bytes(label, out) {
  rows.push({ phase: label, heapMB: null, rssMB: null, ms: Date.now() - t0, bytes: out.length });
}

function deadline(label) {
  if (Date.now() - t0 > MAX_MS) {
    console.error(`[profile] ${label}: ABORTED past --max-ms=${MAX_MS}`);
    finish(true);
  }
}

function finish(aborted = false) {
  clearInterval(sampler);
  // resourceUsage().maxRSS captures the TRUE peak even inside synchronous
  // phases (the interval sampler cannot fire while the pipeline blocks).
  let peakFromOS = peakRss;
  try {
    const ru = process.resourceUsage();
    if (ru && ru.maxRSS > 0) {
      const kbToBytes = process.platform === "win32" ? 1024 : 1024;
      peakFromOS = Math.max(peakFromOS, ru.maxRSS * kbToBytes);
    }
  } catch { /* platform without resourceUsage */ }
  const out = {
    size: SIZE, file: FILE || null, vm: VM, level: LEVEL, encode: ENCODE, mba: MBA, seed: SEED, aborted,
    peakRssMB: +(peakFromOS / 1048576).toFixed(1),
    peakHeapMB: +(peakHeap / 1048576).toFixed(1),
    totalMs: Date.now() - t0,
    rows,
  };
  if (JSON_OUT) {
    console.log(JSON.stringify(out));
  } else {
    console.log(`\n## size=${SIZE} vm=${VM} level=${LEVEL} encode=${ENCODE} mba=${MBA}`);
    console.log(`| phase | heapMB | rssMB | ms | outBytes |`);
    console.log(`|---|---|---|---|---|`);
    for (const r of rows) console.log(`| ${r.phase} | ${r.heapMB ?? ""} | ${r.rssMB ?? ""} | ${r.ms} | ${r.bytes ?? ""} |`);
    console.log(`peakRSS=${out.peakRssMB}MB peakHeap=${out.peakHeapMB}MB total=${out.totalMs}ms aborted=${aborted}`);
  }
  process.exit(aborted ? 2 : 0);
}

process.on("uncaughtException", (e) => {
  console.error(`[profile] EXCEPTION after ${rows.length} phases: ${e.message}`);
  try { finish(true); } catch { process.exit(2); }
});

// Variant: `--strheavy=<bytes>` models Roblox scripts that embed large asset
// data as string literals (base64 images, JSON configs, serialized tables).
// Each literal is capped at 40KB (observed real-world max ~14KB in the
// incident corpus); total embedded string bytes approximate <bytes>.
function generateStringHeavy(target, strBytes) {
  const parts = [];
  let size = 0;
  let remaining = strBytes;
  let i = 0;
  const filler = "QwErTyUiOpAsDfGhJkLzXcVbNm1234567890+/=AbCdEfGhIjKlMnOpQrStUvWxYz";
  while (size < target) {
    i++;
    if (remaining > 0) {
      const n = Math.min(remaining, 40000, Math.max(64, target - size - 200));
      if (n > 64) {
        let s = "";
        while (s.length < n) s += filler;
        const lit = `local Asset_${i} = "${s.slice(0, n)}"\n`;
        parts.push(lit); size += lit.length; remaining -= n;
      }
    }
    const c = `function Render_${i}(gui)\n  if gui and gui.Visible then gui.Text = "Row_${i}" end\n  return gui\nend\n`;
    parts.push(c); size += c.length;
  }
  return parts.join("");
}

const src = FILE ? readFileSync(FILE, "utf8") : (STRHEAVY > 0 ? generateStringHeavy(SIZE, STRHEAVY) : generateLuau(SIZE));
console.log(`[profile] ${FILE ? `loaded ${FILE}` : "generated"}: ${src.length} chars${STRHEAVY > 0 ? ` (strBytes~${STRHEAVY})` : ""}`);
snap("source");

try {
  const lexed = lex(src);
  if (lexed.errors.length) throw new Error("lex errors: " + lexed.errors.length);
  snap("lex");
  deadline("lex");

  const parsed = parseWithErrors(lexed.tokens);
  if (parsed.errors.length) throw new Error("parse errors: " + parsed.errors.length);
  snap("parse");
  deadline("parse");

  let ast = parsed.ast;
  const seedOpt = { enabled: true, seed: SEED };
  if (ENCODE) { ast = encodeStrings(ast, seedOpt); snap("encodeStrings"); deadline("encodeStrings"); }
  ast = scrambleControlFlow(ast, seedOpt);
  snap("scramble");
  deadline("scramble");
  if (MBA) { ast = applyMBA(ast, { enabled: true, seed: SEED }); snap("mba"); }
  ast = obfuscate(ast, { renameLocals: true, preserveGlobals: true });
  snap("rename");
  deadline("rename");

  const polySeed = SEED;
  if (VM === "stack") {
    const chunk = compile(ast);
    snap(`compile (instr=${chunk.code.length}, K=${chunk.K.length})`);
    deadline("compile");
    const out = generateVM(chunk, { level: LEVEL, executorGlobals: true, polymorphicSeed: polySeed });
    snap("generateVM");
    bytes("OUTPUT", out);
  } else if (VM === "register") {
    let seedNum = polySeed | 0;
    let v = 2049 + (Math.abs(seedNum) % 3072) * 2;
    if (v % 2 === 0) v += 1;
    const rkOffset = Math.min(8191, Math.max(2049, v));
    const chunk = regCompile(ast, { rkOffset });
    snap(`regCompile (instr=${chunk.code.length / 4}, K=${chunk.K.length}, maxRegs=${chunk.maxRegs})`);
    deadline("regCompile");
    const disableFeatures = [];
    const tele = [];
    const origLog = console.log;
    console.log = (...a) => { const s = a.join(" "); if (s.startsWith("[RegVM]")) tele.push(s); else origLog(...a); };
    let out;
    try {
      out = generateRegVM(chunk, {
        level: LEVEL,
        executorGlobals: true,
        polymorphicSeed: polySeed,
        rkOffset,
        disableFeatures,
      });
    } finally {
      console.log = origLog;
    }
    snap("generateRegVM");
    for (const t of tele) origLog(`[profile][telemetry] ${t}`);
    bytes("OUTPUT", out);
    origLog(`[profile] output lines=${out.split("\n").length} maxLineLen=${Math.max(...out.split("\n").map(l => l.length))} nulBytes=${out.includes("\u0000")}`);
  } else {
    console.error("[profile] vm=none has no generator phase; use register or stack");
    finish(true);
  }
} catch (e) {
  console.error(`[profile] ERROR: ${e.message}`);
  finish(true);
}

finish(false);
