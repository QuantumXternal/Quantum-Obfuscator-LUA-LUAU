// v4 executor hardening regression: emulate Roblox's `_G` semantics on PUC.
// On Roblox (and in executors), `_G` is a script-shared DATA table with NO
// standard library — the v3.2.1 executor incident was exactly
// `[string "Quantum"]:43: attempt to index nil with 'pack'` because the
// decrypted runtime rooted all stdlib captures at `_G`.
// PUC-Lua 5.4 cannot rebind its global environment, but it CAN rebind the
// `_G` NAME (it is just a field): `_G = {}` gives the runtime a bare table
// under that name while `print`, `table`, ... still resolve as real globals
// — precisely the split the fix must survive. Variants:
//   bare-G       : `_G = {}`                      (Roblox-like bare table)
//   no-loadstring: `_G = {}` + loadstring = nil   (load-only host)
//   executor     : `_G = {}` + getgenv() shim     (executor global env)
// Contract: the artifact still executes byte-exactly in every variant.
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const HAS_PUC = existsSync(LUA54);
const SHIM = HAS_PUC ? readFileSync(join(ROOT, "tests", "helpers", "lua54-compat.lua"), "utf8") : "";

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "roblox-env-semantics-"));

function quiet(fn) {
  const ol = console.log;
  const ow = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = ol;
    console.warn = ow;
  }
}

function buildReg(src, seed = 4242, level = "normal") {
  const base = regCompile(parse(lex(src).tokens));
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  return quiet(() => generateRegVM(cl(base), { level, polymorphicSeed: seed }));
}

function runPuc(code, preamble) {
  const path = join(TMP, `${Math.floor(Math.random() * 1e9)}.lua`);
  writeFileSync(path, SHIM + "\n" + preamble + "\n" + code);
  const r = spawnSync(LUA54, ["-W", path], { encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").slice(0, 1200) };
}

function writeArtifact(code) {
  const p = join(TMP, `art-${Math.floor(Math.random() * 1e9)}.lua`);
  writeFileSync(p, code);
  return p;
}

function runPucBare(code) {
  const path = join(TMP, `${Math.floor(Math.random() * 1e9)}.lua`);
  writeFileSync(path, code);
  const r = spawnSync(LUA54, ["-W", path], { encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").slice(0, 1200) };
}

// Executor env-split emulation. The live incident: the chunk the host loads
// runs with an environment that has NO bit32 (and no getgenv), while its
// getfenv chain / `_G` still resolves a RICH env — so the capture gate
// passed and the first literal `bit32.*` use crashed with
// `attempt to index a nil value (global 'bit32')` (Luau report:
// `attempt to index nil with 'bxor'`). loadfile(path,"t",S) is the faithful
// outer→inner split on PUC 5.4.
function splitEnvRunner(artPath, opts = {}) {
  const lines = [
    `local G=_ENV`,
    `local S={} for k,v in pairs(G) do S[k]=v end`,
    `S.bit32=nil`,
    `S.getgenv=nil`,
  ];
  if (opts.getfenvRich) {
    lines.push(`S._G=G`);
    lines.push(`S.getfenv=function() return G end`);
  } else {
    lines.push(`S._G=S`);
    lines.push(`S.getfenv=nil`);
    lines.push(`S.load=function(c,n) return (load)(c,n,"t",S) end`);
    lines.push(`S.loadstring=S.load`);
  }
  lines.push(`local f=assert(loadfile(${JSON.stringify(artPath)},"t",S))`);
  lines.push(`f()`);
  return lines.join("\n");
}

const VARIANTS = [
  { name: "bare _G data table", preamble: "local _keep_print=print\n_G = {}\n" },
  { name: "bare _G + loadstring disabled (load-only host)", preamble: "local _keep_print=print\n_G = {}\nloadstring = nil\n" },
  { name: "bare _G + executor getgenv", preamble: "local _keep_print=print\n_G = {}\ngetgenv = function() return _ENV end\n" },
  { name: "bare _G + getgenv + getfenv stub (thrower)", preamble: "local _keep_print=print\n_G = {}\ngetgenv = function() return _ENV end\ngetfenv = function() error('restricted') end\n" },
];

const CASES = [
  { name: "tiny print", src: "print('ENV_OK')", expected: "ENV_OK" },
  { name: "stdlib through env proxy", src: "local t={} for i=1,3 do t[i]=i*i end print(table.concat(t,','))", expected: "1,4,9" },
  { name: "global read fallback", src: "print(math.floor(12.9), tostring(true))", expected: "12\ttrue" },
];

describe("Roblox _G semantics (PUC emulation)", () => {
  const t = HAS_PUC ? test : test.skip;
  for (const variant of VARIANTS) {
    for (const c of CASES) {
      t(`${variant.name}: ${c.name}`, () => {
        const art = buildReg(c.src);
        const r = runPuc(art, variant.preamble);
        expect(r.stderr).toBe("");
        expect(r.status).toBe(0);
        expect(r.stdout).toBe(c.expected);
      }, 180000);
    }
  }

  t("bare _G + load-only + executor getgenv: max level", () => {
    const art = buildReg("print('ENV_MAX_OK')", 777, "max");
    const r = runPuc(art, "local _keep_print=print\n_G = {}\nloadstring = nil\ngetgenv = function() return _ENV end\n");
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("ENV_MAX_OK");
  }, 180000);

  // v4 executor env-split: the chunk env lacks bit32 while the chain is rich.
  t("executor env split: rich getfenv chain, chunk env without bit32", () => {
    const art = buildReg("local t={} for i=1,3 do t[i]=i*i end print(table.concat(t,','))");
    const r = runPuc(splitEnvRunner(writeArtifact(art), { getfenvRich: true }), "");
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("1,4,9");
  }, 180000);

  t("executor env split: no chain helpers, loaders resolve into the bare env", () => {
    const art = buildReg("print('SPLIT_BARE_OK')");
    const r = runPuc(splitEnvRunner(writeArtifact(art), { getfenvRich: false }), "");
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("SPLIT_BARE_OK");
  }, 180000);

  t("executor env split: max level", () => {
    const art = buildReg("print('SPLIT_MAX_OK')", 909, "max");
    const r = runPuc(splitEnvRunner(writeArtifact(art), { getfenvRich: true }), "");
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("SPLIT_MAX_OK");
  }, 180000);

  // Regression for the live v4 incident: the vendored lua54 has NO bit32
  // (and no shim here), so BOTH the chunk env and the runtime's resolved
  // env root lack it. The inner VM resolves globals through its OWN root
  // (getgenv -> getfenv -> _G), bypassing the injected chunk env — only
  // the root seeding fixes this permutation.
  t("executor env split, no shim, root env without bit32", () => {
    const art = buildReg("local t={} for i=1,3 do t[i]=i*i end print(table.concat(t,','))");
    const r = runPucBare(splitEnvRunner(writeArtifact(art), { getfenvRich: true }));
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("1,4,9");
  }, 180000);

  test("inner runtime installs bit32 before any literal bit32 use (static)", () => {
    const prev = process.env.NO_CIPHER;
    const pw = console.warn;
    process.env.NO_CIPHER = "1";
    console.warn = () => {};
    try {
      for (const level of ["normal", "max"]) {
        const art = buildReg("print('X')", 31337, level);
        const at = art.indexOf("if bit32==nil then");
        expect(at).toBeGreaterThanOrEqual(0);
        expect(art).toContain("pcall(function() bit32=z end)");
        const use = art.search(/bit32\.(band|bxor|bor|lshift|rshift|lrotate)\(/);
        expect(use).toBeGreaterThan(at);
      }
    } finally {
      console.warn = pw;
      if (prev === undefined) delete process.env.NO_CIPHER; else process.env.NO_CIPHER = prev;
    }
  });
});
