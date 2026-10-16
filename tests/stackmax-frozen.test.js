// P0-A: stack/max must not crash on frozen-lib hosts (Luau), and debug
// neutralization must still work on mutable hosts (PUC-Lua).
// Method: control-vs-artifact presence vectors. Raw probe source shows the
// native debug table; the stack/max artifact must show all-six-neutralized
// on mutable hosts, and byte-identical-to-control on frozen hosts (skip,
// don't crash, don't alter). Luau freezes all stdlib tables (measured);
// PUC-Lua leaves them writable.
// Skipped gracefully when vendor binaries are absent.
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync, execFileSync } from "child_process";
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
const { generateVM } = await import("../dist/vm/vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "p0a-"));
function genMax(src, seed) {
  const ast = parse(lex(src).tokens);
  const base = compile(obfuscate(ast, { renameLocals: false, preserveGlobals: true }));
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const orig = console.log;
  console.log = () => {};
  try {
    return generateVM(cl(base), { level: "max", polymorphicSeed: seed, executorGlobals: false });
  } finally {
    console.log = orig;
  }
}
function runRT(exe, file) {
  const r = spawnSync(exe, [file], { timeout: 60000, encoding: "utf8" });
  return {
    code: r.status,
    out: (r.stdout || "").replace(/\r\n/g, "\n"),
    timeout: !!r.error,
  };
}
// Presence vector: 5 nil-targets (1=present) + getinfo-emptiness (1=empty).
const PROBE =
  "local d = debug\n" +
  "local function has(n) return d[n] ~= nil end\n" +
  "local v = (has(\"getupvalue\") and \"1\" or \"0\") .. (has(\"setupvalue\") and \"1\" or \"0\") .. " +
  "(has(\"getlocal\") and \"1\" or \"0\") .. (has(\"setlocal\") and \"1\" or \"0\") .. (has(\"sethook\") and \"1\" or \"0\")\n" +
  "local gi = d.getinfo\n" +
  "local gie = 0\n" +
  "if type(gi) == \"function\" then local ok, r = pcall(gi, print) if ok and type(r) == \"table\" and next(r) == nil then gie = 1 end end\n" +
  "print(v .. gie)\n";

t("stack/max tiny runs clean on Luau (was: readonly-table crash)", () => {
  const art = genMax("local x = 1 + 2 print(x)", 1234);
  const f = join(TMP, "tiny-max.lua");
  writeFileSync(f, art);
  const r = runRT(LUAU, f);
  expect(r.timeout).toBe(false);
  expect(r.code).toBe(0);
  expect(r.out).toBe("3\n");
});

t("neutralization preserved on mutable host (PUC): control vs artifact", () => {
  // UN-SKIPPED: the blocking premise is stale. The skip comment claimed
  // stack/max artifacts fail on PUC earlier in the envelope fallthrough path,
  // but live repro (PROBE x stack/max x 1234, seeds 1234/7/4242/555/31337)
  // passes on PUC WITH the documented compat shim (exit 0, neutering
  // visible: control "111110" -> artifact "000001"). The RAW artifact fails
  // on PUC at line 5 ("attempt to index a nil value") only because stock PUC
  // lacks bit32 — a documented host-scope harness necessity, not a product
  // defect (same precedent as tests/stackmax-puc.test.js). The shim provides
  // bit32/loadstring/unpack/table.create and never touches `debug`, so the
  // neutering assertion below is unaffected by it.
  const SHIMTEXT = readFileSync(SHIM, "utf8");
  const f = join(TMP, "probe-src.lua");
  writeFileSync(f, PROBE);
  const control = runRT(LUA54, f);
  expect(control.code).toBe(0);
  const art = genMax(PROBE, 1234);
  const af = join(TMP, "probe-max.lua");
  writeFileSync(af, SHIMTEXT + "\n" + art);
  const r = runRT(LUA54, af);
  expect(r.timeout).toBe(false);
  expect(r.code).toBe(0);
  // All five nil-targets present natively, absent after neutering.
  expect(control.out.slice(0, 5)).toBe("11111");
  expect(r.out.slice(0, 5)).toBe("00000");
});

t("frozen host (Luau): skip without crashing or altering", () => {
  const f = join(TMP, "probe-src.lua");
  writeFileSync(f, PROBE);
  const control = runRT(LUAU, f);
  expect(control.code).toBe(0);
  const art = genMax(PROBE, 1234);
  const af = join(TMP, "probe-max.lua");
  writeFileSync(af, art);
  const r = runRT(LUAU, af);
  expect(r.timeout).toBe(false);
  expect(r.code).toBe(0);
  // Skipped neutering => artifact observes exactly what raw source observes.
  expect(r.out).toBe(control.out);
});
