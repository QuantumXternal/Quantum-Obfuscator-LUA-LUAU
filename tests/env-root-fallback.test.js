// Executor env-root regression: a present-but-empty getgenv() must not hide
// the standard library or Roblox globals captured at chunk load time.
// The live failure was `[string "Quantum"]:279: attempt to index nil with
// 'wait'` on a host whose getgenv() returned an empty table.
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

const TMP = mkdtempSync(join(tmpdir(), "env-root-fallback-"));
const SHIMTEXT = HAS_PUC ? readFileSync(SHIM, "utf8") : "";
const quiet = (fn) => {
  const o = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = o; }
};

const PRELUDE = `
local _keep_print = print
_G = {}
getgenv = function() return {} end
getfenv = nil
task = { wait = function() return "task-ok" end }
wait = function() return "wait-ok" end
game = { GetService = function(_, name) return { Name = name } end }
workspace = { Parent = game }
Instance = function() return {} end
`;

const SRC = `
print(task.wait(), wait(), type(game), type(workspace), type(Instance))
print(type(game.GetService))
local t = {}
for i = 1, 3 do t[i] = i * i end
print(table.concat(t, ","), math.floor(4.9))
`;

const EXPECTED = "task-ok\twait-ok\ttable\ttable\tfunction\nfunction\n1,4,9\t4";

const BASE = {
  renameLocals: false,
  preserveGlobals: true,
  encodeStrings: false,
  scramble: false,
  oneLine: false,
  seed: 4242,
  polymorphicSeed: 4242,
};

function run(exe, artifact, shim) {
  const f = join(TMP, `art-${process.pid}-${Math.floor(Math.random() * 1e9)}.lua`);
  writeFileSync(f, (shim ? SHIMTEXT + "\n" : "") + PRELUDE + artifact, "utf8");
  const r = spawnSync(exe, [f], { encoding: "utf8", timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  rmSync(f, { force: true });
  return {
    status: r.status,
    stdout: (r.stdout || "").replace(/\r\n/g, "\n").trim(),
    stderr: (r.stderr || "").replace(/\r\n/g, "\n").slice(0, 1200),
  };
}

for (const [vmType, vmLevel] of [
  ["register", "normal"],
  ["register", "max"],
  ["stack", "normal"],
  ["stack", "max"],
]) {
  t(`${vmType}/${vmLevel}: empty getgenv keeps wait/task/game and stdlib`, () => {
    const artifact = quiet(() => runObfuscatePipeline(SRC, { ...BASE, vmType, vmLevel }));
    if (HAS_LUAU) {
      expect({ exe: "luau", ...run(LUAU, artifact, false) }).toEqual({
        exe: "luau", status: 0, stdout: EXPECTED, stderr: "",
      });
    }
    if (HAS_PUC) {
      expect({ exe: "puc", ...run(LUA54, artifact, true) }).toEqual({
        exe: "puc", status: 0, stdout: EXPECTED, stderr: "",
      });
    }
  }, 180000);
}
