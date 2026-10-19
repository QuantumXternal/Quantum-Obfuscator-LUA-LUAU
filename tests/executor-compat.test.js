// v3.2.1 executor-compat hardening. Hosts in the wild strip bit32, predate
// string.pack, or block loaders/pcall. Contract:
//   - bit32 gone (bootstrap aliases AND the decrypted inner runtime, which
//     references bit32.* globals directly): arithmetic-only fallback
//     captures plus a self-contained bit32 global installer keep execution
//     exact on both runtimes;
//   - string.pack gone: the nDecode ">I4" packer falls back to pure
//     arithmetic (PUC only — Luau's string table is frozen, so the profile
//     cannot be simulated there, but PUC proves the fallback);
//   - loader/pcall failures are covered in restricted-executor.test.js.
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const HAS_LUAU = existsSync(LUAU);
const HAS_PUC = existsSync(LUA54);
const SHIM = HAS_PUC ? readFileSync(join(ROOT, "tests", "helpers", "lua54-compat.lua"), "utf8") : "";

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "executor-compat-"));
const t = HAS_LUAU || HAS_PUC ? test : test.skip;
const quiet = (fn) => { const o = console.log; const w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = o; console.warn = w; } };

const SRC = "local x = 1 + 2 print(x)";
const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
const REG = quiet(() => generateRegVM(cl(regCompile(parse(lex(SRC).tokens))), { level: "max", polymorphicSeed: 1234 }));

function runProfile(exe, prelude, shim, args = []) {
  const f = join(TMP, `p-${Math.floor(Math.random() * 1e9)}.lua`);
  writeFileSync(f, (shim ? SHIM + "\n" : "") + prelude + "\n" + REG);
  const r = spawnSync(exe, [...args, f], { encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").slice(0, 900) };
}

test("artifact carries the bit32 installer and the string.pack fallback", () => {
  // Outer installer keeps a local ref (consumed by the stExec env injection),
  // so the emitted shape is `local <ref>=bit32` + `<ref>==nil` guard.
  expect(REG).toMatch(/local (\w+)=bit32\s+if \1==nil then/);
  expect(REG).toMatch(/pcall\(function\(\) bit32=(\w+) end\)/);
  expect(REG).toContain('type(string)=="table" and string.pack');
  expect(REG).toContain('type(bit32)=="table"');
});

test("artifact injects the resolved env (bit32-carrying) into the inner chunk", () => {
  expect(REG).toContain("local _0in=nil");
  expect(REG).toMatch(/_0in=\{bit32=\w+\}/);
  expect(REG).toContain("(setfenv,");
  expect(REG).toMatch(/"@q","t",\{\w+_?\w*=true\}\)/);
  expect(REG).toMatch(/if\s+\w+\((\w+)\)=="table"\s+and\s+\1\[\w+\(/);
});

// The Luau CLI marks bit32/loadstring/pcall as protected globals (assignment
// is silently ignored), so a missing-bit32 host cannot be simulated there;
// PUC-Lua 5.4 has no bit32/bit of its own, and the shim's bit32 is removed by
// the profile prelude, which is the genuine arithmetic-fallback exercise.
t("reg/max executes exactly with bit32 stripped (fallback captures + installer, PUC)", () => {
  if (!HAS_PUC) return;
  const r = runProfile(LUA54, "bit32=nil", true);
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
  expect(r.stdout).toBe("3");
}, 120000);

t("reg/max executes exactly with string.pack stripped (arithmetic packer, PUC)", () => {
  if (!HAS_PUC) return;
  const r = runProfile(LUA54, "string.pack=nil", true);
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
  expect(r.stdout).toBe("3");
}, 120000);

t("reg/max bit32-stripped artifact still diagnoses a corrupted payload (PUC)", () => {
  if (!HAS_PUC) return;
  const re = /\[(=*)\[/g;
  let m = null;
  let last = null;
  while ((m = re.exec(REG)) !== null) last = m;
  const pos = last.index + last[0].length + 10;
  const c = REG[pos];
  const broken = REG.slice(0, pos) + (c === "A" ? "B" : "A") + REG.slice(pos + 1);
  const f = join(TMP, "broken-nobit32.lua");
  writeFileSync(f, SHIM + "\nbit32=nil\n" + broken);
  const r = spawnSync(LUA54, ["-W", f], { encoding: "utf8", timeout: 120000 });
  const combined = (r.stdout || "") + "\n" + (r.stderr || "");
  expect(r.status).not.toBe(0);
  expect(combined).toContain("Quantum Error:");
  expect(combined).not.toContain("attempt to call a nil value");
}, 120000);
