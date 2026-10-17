// Reg-VM execution correctness: generated reg artifacts must print exactly
// what their source prints on real interpreters (Luau 0.742 + PUC-Lua 5.4.8).
// Covers the gap left by parse-only and reference-runner tests: the packed
// wire format, fetch, dispatch, and control flow only meet reality here.
// Also pins the secCheck warmup contract: periodic anti-tamper checks must
// not fire during startup (kk<=128), so clean hosts never see silent kills.
// (Without the warmup gate, variants 0/1 kill every non-Roblox host on
// instruction ~1 because 1%N==1<4 — a clean-host false positive that no
// parse/byte test can observe.)
// PUC needs tests/helpers/lua54-compat.lua (bit32/loadstring/unpack/
// table.create absent on stock PUC). Skipped gracefully without binaries.
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const SHIM = join(ROOT, "tests", "helpers", "lua54-compat.lua");
const HAS_RT = existsSync(LUAU) && existsSync(LUA54) && existsSync(SHIM);
const t = HAS_RT ? test : test.skip;

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "regexec-"));
const SHIMTEXT = HAS_RT ? readFileSync(SHIM, "utf8") : "";
const quiet = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
function genReg(src, level, seed) {
  return quiet(() => {
    const base = regCompile(parse(lex(src).tokens));
    const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
    return generateRegVM(cl(base), { level, polymorphicSeed: seed });
  });
}
function runRT(exe, file) {
  const r = spawnSync(exe, [file], { timeout: 60000, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "").replace(/\r\n/g, "\n"), timeout: !!r.error };
}
const FIXTURES = ["tiny", "small", "closure-upvalue", "mod-loopheavy", "branch-heavy"];
const LEVELS = ["reg/normal", "reg/max"];
const SEEDS = [1234, 2024, 7, 42];
for (const name of FIXTURES) {
  const src = name === "tiny" ? "local x = 1 + 2 print(x)"
    : readFileSync(join(ROOT, "benchmarks", "fixtures", name + ".lua"), "utf8");
  for (const level of LEVELS) {
    const lv = level.split("/")[1];
    t(`${name} ${level} executes correctly on Luau+PUC (clean-host, no silent kills)`, () => {
      const srcF = join(TMP, `src-${name}.lua`);
      writeFileSync(srcF, src);
      writeFileSync(srcF + ".shim", SHIMTEXT + "\n" + src);
      const wantL = runRT(LUAU, srcF);
      const wantP = runRT(LUA54, srcF + ".shim");
      expect(wantL.code).toBe(0);
      expect(wantP.code).toBe(0);
      for (const seed of SEEDS) {
        const art = genReg(src, lv, seed);
        const af = join(TMP, `${name}-${lv}-${seed}.lua`);
        writeFileSync(af, art);
        writeFileSync(af + ".shim", SHIMTEXT + "\n" + art);
        const rl = runRT(LUAU, af);
        const rp = runRT(LUA54, af + ".shim");
        expect(rl.timeout).toBe(false);
        expect(rp.timeout).toBe(false);
        expect(rl.code).toBe(0);
        expect(rp.code).toBe(0);
        expect(rl.out).toBe(wantL.out);
        expect(rp.out).toBe(wantP.out);
      }
    }, 180000);
  }
}
