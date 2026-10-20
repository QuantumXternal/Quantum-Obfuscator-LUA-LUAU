// Executor-loaded chunks must see the executor environment, not the VM's
// sandbox or getfenv(0). loadstring/load return values and errors are
// preserved, and the same wrapper is installed inside lifted prefix code.
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const SHIM = join(ROOT, "tests", "helpers", "lua54-compat.lua");
const HAS_LUAU = existsSync(LUAU);
const HAS_PUC = existsSync(LUA54) && existsSync(SHIM);
const t = HAS_LUAU || HAS_PUC ? test : test.skip;

const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");

const TMP = mkdtempSync(join(tmpdir(), "loadstring-env-"));
const SHIMTEXT = HAS_PUC ? readFileSync(SHIM, "utf8") : "";
const PRELUDE = 'local G=setmetatable({x=42},{__index=_G}) getgenv=function() return G end\n';
const quiet = (fn) => {
  const o = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = o; }
};
let counter = 0;

function run(exe, prelude, artifact, shim) {
  const f = join(TMP, `ls-${process.pid}-${counter++}.lua`);
  writeFileSync(f, (shim ? SHIMTEXT + "\n" : "") + prelude + artifact, "utf8");
  const r = spawnSync(exe, [f], { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  rmSync(f, { force: true });
  return {
    status: r.status,
    stdout: (r.stdout || "").replace(/\r\n/g, "\n").trim(),
    stderr: (r.stderr || "").replace(/\r\n/g, "\n").slice(0, 900),
  };
}

const BASE = {
  renameLocals: false,
  preserveGlobals: true,
  encodeStrings: false,
  scramble: false,
  oneLine: false,
  seed: 4242,
  polymorphicSeed: 4242,
};

const LOADER_SRC = `
local f, e = loadstring("return x + 1")
print(f and f(), e)
local l = load("return x + 2")
print(l and l())
local bad, msg = loadstring("return +")
print(bad == nil, type(msg))
`;

const VARIANTS = [
  ["register", "normal"],
  ["register", "max"],
  ["stack", "normal"],
  ["stack", "max"],
];

for (const [vmType, vmLevel] of VARIANTS) {
  t(`${vmType}/${vmLevel}: loadstring and load use getgenv, preserving errors`, () => {
    const artifact = quiet(() => runObfuscatePipeline(LOADER_SRC, { ...BASE, vmType, vmLevel }));
    for (const [label, exe, shim] of [
      ["luau", LUAU, false],
      ["puc", LUA54, true],
    ]) {
      if ((label === "luau" && !HAS_LUAU) || (label === "puc" && !HAS_PUC)) continue;
      const r = run(exe, PRELUDE, artifact, shim);
      expect({ label, stderr: r.stderr, status: r.status, stdout: r.stdout }).toEqual({
        label,
        stderr: "",
        status: 0,
        stdout: "43\tnil\n44\ntrue\tstring",
      });
    }
  }, 180000);
}

t("prefix: Turbo loadstring uses getgenv before the VM starts", () => {
  const src = `--@quantum:turbo
local function read()
  local f = loadstring("return x")
  return f()
end
print(read())
`;
  const artifact = quiet(() => runObfuscatePipeline(src, { ...BASE, vmType: "register", vmLevel: "normal" }));
  expect(artifact).toContain("getgenv");
  for (const [label, exe, shim] of [
    ["luau", LUAU, false],
    ["puc", LUA54, true],
  ]) {
    if ((label === "luau" && !HAS_LUAU) || (label === "puc" && !HAS_PUC)) continue;
    const r = run(exe, PRELUDE, artifact, shim);
    expect({ label, stderr: r.stderr, status: r.status, stdout: r.stdout }).toEqual({
      label,
      stderr: "",
      status: 0,
      stdout: "42",
    });
  }
}, 180000);

t("plain PUC 5.4: Turbo loader initializes without getgenv or the compat shim", () => {
  if (!HAS_PUC) return;
  const src = `--@quantum:turbo
local function read()
  local f = loadstring("return 6*7")
  return f()
end
print(read())
`;
  const artifact = quiet(() => runObfuscatePipeline(src, {
    ...BASE,
    vmType: "register",
    vmLevel: "max",
  }));
  const r = run(LUA54, "", artifact, false);
  expect({ stderr: r.stderr, status: r.status, stdout: r.stdout }).toEqual({
    stderr: "",
    status: 0,
    stdout: "42",
  });
}, 180000);

t("loader remains usable when getgenv is absent", () => {
  const artifact = quiet(() => runObfuscatePipeline('local f=loadstring("return 1+1") print(f())', {
    ...BASE,
    vmType: "register",
    vmLevel: "normal",
  }));
  for (const [label, exe, shim] of [
    ["luau", LUAU, false],
    ["puc", LUA54, true],
  ]) {
    if ((label === "luau" && !HAS_LUAU) || (label === "puc" && !HAS_PUC)) continue;
    const r = run(exe, "", artifact, shim);
    expect({ label, stderr: r.stderr, status: r.status, stdout: r.stdout }).toEqual({
      label,
      stderr: "",
      status: 0,
      stdout: "2",
    });
  }
}, 180000);
