// Envelope parse sweep: every emitted layer must parse on BOTH runtimes.
// Defect class: a `(`-leading emitted line (exec variant 0, `(<load>(...))()`)
// merges with a preceding expression-ending line into an "ambiguous syntax"
// call continuation — newlines do NOT separate statements before `(`.
// Demonstrated: small.lua stack/max seed 2024 drew execV0 after a
// `...end)()` honeypot tail; the nested layer failed to COMPILE on every
// host (`loadstring` -> nil -> "attempt to call a nil value" at the exec).
// Fix: execV0 is wrapped in `do...end`, never `(`-leading (vm-gen.ts
// wrapCustomCipher + wrapNestedVM). `;`-separation was evaluated and
// rejected: Luau refuses `;` after `do`/`then`/`else`/`repeat` (measured).
// Method: compile-only (`assert(loadfile(f))`, never executed) across
// fixtures x levels x seeds on Luau 0.742 + PUC-Lua 5.4.8. No shim is needed:
// parsing resolves no globals. large.lua is excluded: its SOURCE does not
// compile on Luau ("Out of local registers ... exceeded limit 200").
// Skipped gracefully when vendor binaries are absent.
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const HAS_RT = existsSync(LUAU) && existsSync(LUA54);
const t = HAS_RT ? test : test.skip;

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "parsesweep-"));
const quiet = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
function genStack(src, level, seed) {
  return quiet(() => {
    const ast = parse(lex(src).tokens);
    const base = compile(obfuscate(ast, { renameLocals: false, preserveGlobals: true }));
    const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
    return generateVM(cl(base), { level, polymorphicSeed: seed, executorGlobals: false });
  });
}
function genReg(src, level, seed) {
  return quiet(() => {
    const ast = parse(lex(src).tokens);
    const base = regCompile(ast);
    const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
    return generateRegVM(cl(base), { level, polymorphicSeed: seed });
  });
}
// Compile-only probe: parses every envelope layer, executes nothing.
// Luau has no loadfile/io, so the Luau probe carries the artifact inline via
// loadstring with a provably-safe long-bracket level (one above the highest
// `]=*]` closer present in the artifact — computed, not assumed). PUC uses
// native loadfile (no shim needed: parsing resolves no globals).
function luaQuote(s) {
  // Overlap-safe level scan: a regex like /\](=*)\]/g misses overlapping
  // closers (`]]=]` consumes `]]` and skips the `]=]` starting at the second
  // bracket), under-counting the level and truncating the probe string.
  // String.includes scans every position, so it cannot miss. (Same pattern
  // as bootstrap-template.ts; the v2 packed wire raised the odds of such
  // byte collisions, exposing the latent helper bug. The artifact itself was
  // always valid — it executes cleanly when run as a file.)
  let level = 0;
  while (s.includes("]" + "=".repeat(level) + "]")) level++;
  const eq = "=".repeat(level);
  return `[${eq}[${s}]${eq}]`;
}
const FIXTURES = [
  ["tiny", "local x = 1 + 2 print(x)"],
  ["small", null],
  ["closure-upvalue", null],
  ["mod-loopheavy", null],
  ["branch-heavy", null],
];
const LEVELS = ["stack/debug", "stack/normal", "stack/max", "reg/normal", "reg/max"];
const SEEDS = [1234, 2024, 7, 42];
for (const [name, inlineSrc] of FIXTURES) {
  const src = inlineSrc !== null ? inlineSrc : readFileSync(join(ROOT, "benchmarks", "fixtures", name + ".lua"), "utf8");
  for (const level of LEVELS) {
    t(`parse sweep ${name} ${level} compiles on Luau+PUC`, () => {
      const [vm, lv] = level.split("/");
      for (const seed of SEEDS) {
        const art = vm === "stack" ? genStack(src, lv, seed) : genReg(src, lv, seed);
        const af = join(TMP, `${name}-${vm}-${lv}-${seed}.lua`);
        writeFileSync(af, art);
        for (const [exe, tag] of [[LUAU, "luau"], [LUA54, "puc"]]) {
          const pf = join(TMP, `probe-${tag}.lua`);
          const probe = tag === "luau"
            ? `local f,e=loadstring(${luaQuote(art)})\nassert(f,e)\nprint('PARSE-OK')\n`
            : `assert(loadfile(${JSON.stringify(af.split("\\").join("/"))}))\nprint('PARSE-OK')\n`;
          writeFileSync(pf, probe);
          const r = spawnSync(exe, [pf], { timeout: 60000, encoding: "utf8" });
          expect(r.error).toBe(undefined);
          expect({ status: r.status, err: (r.stderr || "").slice(0, 200) }).toEqual({ status: 0, err: "" });
          expect((r.stdout || "").replace(/\r\n/g, "\n")).toBe("PARSE-OK\n");
        }
      }
    }, 180000);
  }
}
