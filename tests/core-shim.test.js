// Core task/wait shim: executors can remove task, wait, and both _G entries.
// Every execution path (register VM sandbox, stack VM sandbox, native Turbo
// prefix alias) must still provide task.wait/wait backed by RunService
// Heartbeat. The Turbo function is exercised through the native prefix and the
// Maximum function through the register VM in the same artifact.
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

const TMP = mkdtempSync(join(tmpdir(), "core-shim-"));
const SHIMTEXT = HAS_PUC ? readFileSync(SHIM, "utf8") : "";
const quiet = (fn) => {
  const o = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = o; }
};

const STRIPPED = `
task = nil
wait = nil
pcall(function() _G.task = nil; _G.wait = nil end)
HB = 0
RunService = { Heartbeat = { Wait = function() HB = HB + 1 return 0.01 end } }
game = { GetService = function(_, name)
  if name == "RunService" then return RunService end
  return { Name = name }
end }
`;

const PRELUDE = STRIPPED + `
getgenv = function() return {} end
`;

const MIXED_SRC = `
--@quantum:turbo
local function turboWait()
  local count = 0
  for i = 1, 3 do
    task.wait(1)
    count = count + 1
  end
  return count
end

--@quantum:maximum
local function maximumWait()
  local count = 0
  for i = 1, 3 do
    wait(1)
    count = count + 1
  end
  return count
end

print("CORE", turboWait(), maximumWait())
print("HB", HB)
`;

const TURBO_SRC = `
--@quantum:turbo
local function turboOnly()
  local count = 0
  for i = 1, 3 do
    task.wait(1)
    count = count + 1
  end
  return count
end

print("TURBO", turboOnly())
print("HB", HB)
`;

const STACK_SRC = `
local count = 0
for i = 1, 3 do
  task.wait(1)
  count = count + 1
end
print("STACK", count)
print("HB", HB)
`;

const BASE = {
  renameLocals: false,
  preserveGlobals: true,
  encodeStrings: false,
  scramble: false,
  oneLine: false,
  seed: 4242,
  polymorphicSeed: 4242,
};

function generate(source, options) {
  const warnings = [];
  const artifact = quiet(() =>
    runObfuscatePipeline(source, {
      ...BASE,
      ...options,
      onWarning: (message) => warnings.push(message),
    }),
  );
  const vetoed = warnings.filter((message) => message.includes("native macro"));
  expect(vetoed).toEqual([]);
  return artifact;
}

function run(exe, artifact, shim, prelude) {
  const file = join(TMP, `core-${process.pid}-${Math.floor(Math.random() * 1e9)}.lua`);
  const runner = `
local __co = coroutine.create(function(...)
${artifact}
end)
while coroutine.status(__co) ~= "dead" do
  local __ok, __err = coroutine.resume(__co)
  if not __ok then error(__err, 0) end
end
`;
  writeFileSync(file, (shim ? SHIMTEXT + "\n" : "") + prelude + runner, "utf8");
  const r = spawnSync(exe, [file], {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 32 * 1024 * 1024,
  });
  rmSync(file, { force: true });
  return {
    status: r.status,
    stdout: (r.stdout || "").replace(/\r\n/g, "\n").trim(),
    stderr: (r.stderr || "").replace(/\r\n/g, "\n").slice(0, 2000),
    timeout: !!r.error,
  };
}

function hbFrom(stdout) {
  const match = /(?:^|\n)HB\t(\d+)/.exec(stdout);
  return match ? Number(match[1]) : -1;
}

function runBoth(name, artifact, prelude, expectedLine) {
  const runners = [];
  if (HAS_LUAU) runners.push(["luau", LUAU, false]);
  if (HAS_PUC) runners.push(["puc", LUA54, true]);
  for (const [label, exe, shim] of runners) {
    const r = run(exe, artifact, shim, prelude);
    expect({ name, label, status: r.status, timeout: r.timeout, stderr: r.stderr }).toEqual({
      name,
      label,
      status: 0,
      timeout: false,
      stderr: "",
    });
    expect(r.stderr).not.toContain("attempt to index nil with 'wait'");
    expect(r.stdout.split("\n")[0]).toBe(expectedLine);
    expect(hbFrom(r.stdout)).toBeGreaterThan(0);
  }
}

t("mixed Turbo + Maximum survives stripped task/wait", () => {
  const artifact = generate(MIXED_SRC, { vmType: "register", vmLevel: "max" });
  runBoth("mixed", artifact, PRELUDE, "CORE\t3\t3");
}, 180000);

t("pure Turbo native prefix survives stripped task/wait", () => {
  const artifact = generate(TURBO_SRC, { performanceTier: "turbo" });
  runBoth("turbo", artifact, STRIPPED, "TURBO\t3");
}, 180000);

t("stack VM sandbox survives stripped task/wait", () => {
  const artifact = generate(STACK_SRC, { vmType: "stack", vmLevel: "max" });
  runBoth("stack", artifact, PRELUDE, "STACK\t3");
}, 180000);
