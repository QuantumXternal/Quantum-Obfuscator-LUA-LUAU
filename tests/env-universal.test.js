// Universal executor environment: the dynamic proxy must survive a stripped
// task/wait pair, a persistent-but-empty getgenv(), and still provide Roblox
// globals from getfenv/_ENV/_G. The yield shim must not index a nil task and
// must not let sandbox writes leak into the persistent executor table.
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
const MOCK = join(ROOT, "tests", "helpers", "roblox-mock.lua");
const HAS_LUAU = existsSync(LUAU);
const HAS_PUC = existsSync(LUA54) && existsSync(SHIM);
const t = HAS_LUAU || HAS_PUC ? test : test.skip;

const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");

const TMP = mkdtempSync(join(tmpdir(), "env-universal-"));
const SHIMTEXT = HAS_PUC ? readFileSync(SHIM, "utf8") : "";
const MOCKTEXT = readFileSync(MOCK, "utf8");
const quiet = (fn) => {
  const o = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = o; }
};

const PRELUDE = `
local SMOKE_GENV = {}
getgenv = function() return SMOKE_GENV end
task = nil
wait = nil
pcall(function() _G.task = nil; _G.wait = nil end)
isfolder = function(name) return name == "JOKER" end
makefolder = function() end
SMOKE_HB = 0
`;

const SRC = `
local ok = {
  type(task) == "table",
  type(task.wait) == "function",
  type(task.spawn) == "function",
  type(task.delay) == "function",
  type(wait) == "function",
}
local TaskType, TaskWaitType, WaitType = type(task), type(task.wait), type(wait)
assert(TaskType == "table" and TaskWaitType == "function" and WaitType == "function",
  "task/wait shim missing")
local spawned = false
task.spawn(function()
  spawned = true
  task.wait(0)
end)
local delayed = false
task.delay(0, function() delayed = true end)
local a = task.wait(0)
local b = wait(0)
local svc = game:GetService("Players")
local folder = isfolder("JOKER")
makefolder("JOKER")
task = "shadow"
print(ok[1], ok[2], ok[3], ok[4], ok[5], spawned, delayed, a ~= nil, b ~= nil,
  svc.Name, folder, getgenv().task == nil, task)
print("SMOKE_TAIL", SMOKE_HB)
print("TASK_SHIM", TaskType, TaskWaitType, WaitType)
`;

const EXPECTED = "true\ttrue\ttrue\ttrue\ttrue\ttrue\ttrue\ttrue\ttrue\tPlayers\ttrue\ttrue\tshadow";

const SCENARIOS = [
  ["no heartbeat", "", 0],
  ["heartbeat wait", `
RunService = { Heartbeat = { Wait = function() SMOKE_HB = SMOKE_HB + 1 return 0.01 end } }
`, 1],
  ["heartbeat error", `
RunService = { Heartbeat = { Wait = function() error("heartbeat unavailable") end } }
`, 0],
];

const BASE = {
  renameLocals: false,
  preserveGlobals: true,
  encodeStrings: false,
  scramble: false,
  oneLine: false,
  seed: 4242,
  polymorphicSeed: 4242,
};

function run(exe, artifact, shim, scenario) {
  const f = join(TMP, `art-${process.pid}-${Math.floor(Math.random() * 1e9)}.lua`);
  const runner = `
local __co = coroutine.create(function(...)
${artifact}
end)
while coroutine.status(__co) ~= "dead" do
  local __ok, __err = coroutine.resume(__co)
  if not __ok then error(__err, 0) end
end
`;
  writeFileSync(f, (shim ? SHIMTEXT + "\n" : "") + MOCKTEXT + "\n" + PRELUDE + scenario + runner, "utf8");
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
  t(`${vmType}/${vmLevel}: stripped task/wait get a yield-safe shim`, () => {
    const artifact = quiet(() => runObfuscatePipeline(SRC, { ...BASE, vmType, vmLevel }));
    for (const [scenarioName, scenario, minHb] of SCENARIOS) {
      for (const [label, exe, shim] of [
        ["luau", LUAU, false],
        ["puc", LUA54, true],
      ]) {
        if ((label === "luau" && !HAS_LUAU) || (label === "puc" && !HAS_PUC)) continue;
        const r = run(exe, artifact, shim, scenario);
        const lines = r.stdout.split("\n");
        const tail = lines[1] && lines[1].split("\t");
        const hb = tail && Number(tail[1]);
        expect({ scenarioName, label, status: r.status, stderr: r.stderr, first: lines[0] }).toEqual({
          scenarioName, label, status: 0, stderr: "", first: EXPECTED,
        });
        expect(tail && tail[0]).toBe("SMOKE_TAIL");
        expect(Number.isFinite(hb)).toBe(true);
        expect(hb).toBeGreaterThanOrEqual(minHb);
        expect(lines[2] && lines[2].split("\t")).toEqual([
          "TASK_SHIM", "table", "function", "function",
        ]);
      }
    }
  }, 180000);
}
