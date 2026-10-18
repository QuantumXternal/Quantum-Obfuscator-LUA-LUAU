// Phase 5 / Step 3: restricted-executor hardening. Standard executors may
// block getfenv/loadstring (present-but-throwing or absent) and strip debug
// hook APIs. The VM bootstrap must degrade to _G / load instead of
// hard-crashing, and the anti-tamper probes must not false-positive on a
// debug library whose gethook was stripped (only an actual installed hook,
// detected via a successful gethook() returning non-nil, may corrupt).
// Technique: restrictions are applied in the SAME chunk via an inlined
// prelude before the artifact body; Luau stdlib tables are frozen, so
// `debug` is replaced globally rather than field-mutated on the real table.
// PUC runs prepend the documented compat shim. Skipped without binaries.
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
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateVM, wrapCustomCipher } = await import("../dist/vm/vm-gen.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "restricted-"));
const SHIMTEXT = HAS_RT ? readFileSync(SHIM, "utf8") : "";
const quiet = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
const SRC = "local x = 1 + 2 print(x)";
const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });

const REG = HAS_RT
  ? quiet(() => generateRegVM(cl(regCompile(parse(lex(SRC).tokens))), { level: "max", polymorphicSeed: 1234 }))
  : "";
const STK = HAS_RT
  ? quiet(() => generateVM(cl(compile(obfuscate(parse(lex(SRC).tokens), { renameLocals: false, preserveGlobals: true }))), { level: "max", polymorphicSeed: 1234, executorGlobals: false }))
  : "";
const STK_DBG = HAS_RT
  ? quiet(() => generateVM(cl(compile(obfuscate(parse(lex(SRC).tokens), { renameLocals: false, preserveGlobals: true }))), { level: "debug", polymorphicSeed: 1234, executorGlobals: false }))
  : "";
const WRAPPED = HAS_RT ? quiet(() => wrapCustomCipher(REG, 555)) : "";

// Restriction profiles. `load` is bridged to the captured loadstring so that
// setting loadstring=nil yields a true load-only host on both runtimes.
const P_GF_NIL = "getfenv=nil";
const P_GF_THROW = 'getfenv=function() error("restricted") end';
const P_DBG_NIL = "debug=nil";
const P_DBG_STRIP = "debug={}";
const P_LOAD_ONLY = "local __ls=loadstring load=function(s,n) return __ls(s,n) end loadstring=nil";
const P_WORST = P_LOAD_ONLY + " getfenv=nil debug={}";
// v3.2.1 executor-compat: a host that blocks BOTH loaders must be diagnosed
// (inline (warn or print) before the env-check `return nil`), not silently
// no-op. PUC standalone needs -W or Lua's warn() stays silent.
const P_NO_LOAD = "loadstring=nil load=nil";
const P_NO_PCALL = "pcall=nil";
const DIAG_NO_LOAD = "Quantum Error: loadstring/load is blocked in this executor.";
const DIAG_NO_PCALL = "Quantum Error: pcall is unavailable in this executor.";

function runRT(exe, file, extraArgs = []) {
  const r = spawnSync(exe, [...extraArgs, file], { timeout: 60000, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "").replace(/\r\n/g, "\n"), err: (r.stderr || "").replace(/\r\n/g, "\n"), timeout: !!r.error };
}
function expectProfile3(label, artifact, prelude, withPuc) {
  const f = join(TMP, label + ".lua");
  writeFileSync(f, prelude + "\n" + artifact);
  const rl = runRT(LUAU, f);
  expect(rl.timeout).toBe(false);
  expect(rl.code).toBe(0);
  expect(rl.out.trim()).toBe("3");
  if (withPuc) {
    const pf = join(TMP, label + ".puc.lua");
    writeFileSync(pf, SHIMTEXT + "\n" + prelude + "\n" + artifact);
    const rp = runRT(LUA54, pf);
    expect(rp.timeout).toBe(false);
    expect(rp.code).toBe(0);
    expect(rp.out.trim()).toBe("3");
  }
}

t("reg/max: getfenv absent degrades to _G (Luau+PUC)", () => {
  expectProfile3("reg-gfnil", REG, P_GF_NIL, true);
}, 120000);
t("reg/max: getfenv present but blocked does not crash (Luau)", () => {
  expectProfile3("reg-gfthrow", REG, P_GF_THROW, false);
}, 120000);
t("reg/max: debug nil / stripped-debug table (Luau)", () => {
  expectProfile3("reg-dbgnil", REG, P_DBG_NIL, false);
  expectProfile3("reg-dbgstrip", REG, P_DBG_STRIP, false);
}, 120000);
t("reg/max: load-only host via load fallback (Luau+PUC)", () => {
  expectProfile3("reg-loadonly", REG, P_LOAD_ONLY, true);
}, 120000);
t("reg/max: combined worst-case restrictions (Luau+PUC)", () => {
  expectProfile3("reg-worst", REG, P_WORST, true);
}, 120000);

// Luau CLI declares loadstring/pcall as protected globals (assignment is
// silently ignored), so a fully stripped-loader/pcall host can only be
// simulated on PUC-Lua; there -W un-silences Lua's warn() so the inline
// (warn or print) diagnostic is observable.
t("reg/max: both loaders blocked emits the diagnostic and exits cleanly, no crash (PUC)", () => {
  const pf = join(TMP, "reg-noload.puc.lua");
  writeFileSync(pf, SHIMTEXT + "\n" + P_NO_LOAD + "\n" + REG);
  const rp = runRT(LUA54, pf, ["-W"]);
  expect(rp.timeout).toBe(false);
  expect(rp.code).toBe(0);
  expect(rp.out + "\n" + rp.err).toContain(DIAG_NO_LOAD);
}, 120000);

t("reg/max: pcall stripped emits the diagnostic and exits cleanly, no crash (PUC)", () => {
  const pf = join(TMP, "reg-nopcall.puc.lua");
  writeFileSync(pf, SHIMTEXT + "\n" + P_NO_PCALL + "\n" + REG);
  const rp = runRT(LUA54, pf, ["-W"]);
  expect(rp.timeout).toBe(false);
  expect(rp.code).toBe(0);
  expect(rp.out + "\n" + rp.err).toContain(DIAG_NO_PCALL);
}, 120000);

t("stack/max: getfenv absent degrades to _G (Luau+PUC)", () => {
  expectProfile3("stk-gfnil", STK, P_GF_NIL, true);
}, 120000);
t("stack/max: getfenv present but blocked does not crash (Luau)", () => {
  expectProfile3("stk-gfthrow", STK, P_GF_THROW, false);
}, 120000);
t("stack/max: debug nil / stripped-debug table (Luau)", () => {
  expectProfile3("stk-dbgnil", STK, P_DBG_NIL, false);
  expectProfile3("stk-dbgstrip", STK, P_DBG_STRIP, false);
}, 120000);
t("stack/max: load-only host via load fallback (Luau+PUC)", () => {
  expectProfile3("stk-loadonly", STK, P_LOAD_ONLY, true);
}, 120000);
t("stack/max: combined worst-case restrictions (Luau+PUC)", () => {
  expectProfile3("stk-worst", STK, P_WORST, true);
}, 120000);

t("stack/debug level: blocked getfenv and worst-case restrictions (Luau)", () => {
  expectProfile3("stkdbg-gfthrow", STK_DBG, P_GF_THROW, false);
  expectProfile3("stkdbg-worst", STK_DBG, P_WORST, false);
}, 120000);

t("wrapped reg artifact (custom cipher + seeded) survives worst-case (Luau)", () => {
  expectProfile3("wrap-worst", WRAPPED, P_WORST, false);
}, 120000);

// Introspection generation: NO_CIPHER=1 emits the reg runtime WITHOUT the
// blob-encryption envelope, making the probe/dispatch text inspectable.
function genRegNoCipher(level) {
  const prev = process.env.NO_CIPHER;
  const prevWarn = console.warn;
  process.env.NO_CIPHER = "1";
  console.warn = () => {};
  try {
    return quiet(() => generateRegVM(cl(regCompile(parse(lex(SRC).tokens))), { level, polymorphicSeed: 1234 }));
  } finally {
    console.warn = prevWarn;
    if (prev === undefined) delete process.env.NO_CIPHER; else process.env.NO_CIPHER = prev;
  }
}

test("reg probe uses positive hook detection, not stripped-lib corruption", () => {
  const raw = genRegNoCipher("max");
  expect(raw).toContain('type(debug.gethook)=="function"');
  expect(raw).toContain("pcall(debug.gethook)");
  expect(raw).not.toContain('type(debug.gethook)~="function"');
});

test("stack artifact has no unguarded getfenv(0) calls", () => {
  const bare = STK.replace(/pcall\(getfenv,0\)/g, "");
  expect(bare).not.toMatch(/getfenv\(0\)/);
});

test("reg runtime boots loadstring with load fallback", () => {
  const raw = genRegNoCipher("max");
  expect(raw).toMatch(/loadstring or load/);
  expect(raw).not.toMatch(/[^r]loadstring\(/);
});
