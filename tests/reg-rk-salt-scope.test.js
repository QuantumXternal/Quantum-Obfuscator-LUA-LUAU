// RK salt-scope regressions.
//
// Defect 1 (executor round-3, inner :157 "mod on nil and number"): the
// constant-salt local was declared AFTER the RK helper that closes over it,
// so the helper read a GLOBAL of the same name (nil) and `salt % #K` threw.
// Defect 2: the RK inliner only matched single-uppercase-letter arguments,
// leaving `RK(_E2)` calls in fused MUL+ADD bodies - the only live callers of
// the broken helper.
//
// Pins both invariants: the salt declaration must precede the helper
// definition, no RK call sites may survive inlining, and artifacts that
// exercise fused arithmetic still execute correctly on Luau + PUC-Lua.
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

const TMP = mkdtempSync(join(tmpdir(), "rksalt-"));
const SHIMTEXT = HAS_RT ? readFileSync(SHIM, "utf8") : "";
const quiet = (fn) => {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
};
function compile(src) {
  return quiet(() => regCompile(parse(lex(src).tokens)));
}
function genRaw(src, level, seed) {
  const base = compile(src);
  const clone = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(clone) });
  const prev = process.env.NO_CIPHER;
  process.env.NO_CIPHER = "1";
  try {
    return quiet(() => generateRegVM(clone(base), { level, polymorphicSeed: seed }));
  } finally {
    if (prev === undefined) delete process.env.NO_CIPHER; else process.env.NO_CIPHER = prev;
  }
}
function genArtifact(src, level, seed) {
  const base = compile(src);
  const clone = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(clone) });
  return quiet(() => generateRegVM(clone(base), { level, polymorphicSeed: seed }));
}
function runRT(exe, file) {
  const r = spawnSync(exe, [file], { timeout: 120000, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "").replace(/\r\n/g, "\n"), timeout: !!r.error };
}

const FUSION_SRC = [
  "local s=0\nfor i=1,8 do s = s + i * 2 + 7 end\nprint(s)",
  "local a=17\nfor i=1,10 do a = (a * 3 + 5) % 97 end\nprint(a)",
  "local x=2 local y=3 print(x*y+4, x+y*2, (x*y+4)%7)",
].join("\n");

const SEEDS = [10001, 1234, 2024];

for (const seed of SEEDS) {
  t(`salt local precedes RK helper and no RK call sites survive (seed ${seed})`, () => {
    for (const level of ["normal", "max"]) {
      const raw = genRaw(FUSION_SRC, level, seed);
      const helper = raw.match(/local function (\w+)\(x\) if x>=/);
      expect(helper).not.toBeNull();
      const helperName = helper[1];
      const helperIdx = raw.indexOf(helper[0]);
      expect(helperIdx).toBeGreaterThanOrEqual(0);
      const salt = raw.slice(helperIdx, helperIdx + 400).match(/-1,(\w+)%#\w+/);
      expect(salt).not.toBeNull();
      const saltIdx = raw.indexOf(`local ${salt[1]}=`);
      expect(saltIdx).toBeGreaterThanOrEqual(0);
      expect(saltIdx).toBeLessThan(helperIdx);
      const callRe = new RegExp("\\b" + helperName + "\\([A-Za-z_]", "g");
      const calls = raw.match(callRe) || [];
      expect(calls.length).toBe(1);
    }
  });
}

t("fused arithmetic artifacts with constant operands execute on Luau+PUC", () => {
  const srcF = join(TMP, "src-fused.lua");
  writeFileSync(srcF, FUSION_SRC);
  writeFileSync(srcF + ".shim", SHIMTEXT + "\n" + FUSION_SRC);
  const wantL = runRT(LUAU, srcF);
  const wantP = runRT(LUA54, srcF + ".shim");
  expect(wantL.code).toBe(0);
  expect(wantP.code).toBe(0);
  for (const level of ["normal", "max"]) {
    for (const seed of SEEDS) {
      const art = genArtifact(FUSION_SRC, level, seed);
      const af = join(TMP, `fused-${level}-${seed}.lua`);
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
  }
}, 180000);
