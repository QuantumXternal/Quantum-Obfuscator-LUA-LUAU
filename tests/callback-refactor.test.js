// Direct RenderStepped/Heartbeat callback extraction.
import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const HAS_LUAU = existsSync(LUAU);

const { extractCallbacks } = await import("../dist/engine/iifeRefactor.js");
const { analyzeScript } = await import("../dist/engine/analyzer.js");

const t = HAS_LUAU ? test : test.skip;

let artifactCounter = 0;
function runLuau(code) {
  const file = join(tmpdir(), `callback-refactor-test-${process.pid}-${artifactCounter++}.luau`);
  writeFileSync(file, code, "utf8");
  const result = spawnSync(LUAU, [file], {
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  rmSync(file, { force: true });
  if (result.stdout) result.stdout = result.stdout.replace(/\r\n/g, "\n");
  if (result.stderr) result.stderr = result.stderr.replace(/\r\n/g, "\n");
  return result;
}

test("extracts direct Heartbeat and RenderStepped callbacks", () => {
  const src = `local ticks = 0
local RunService = {
  Heartbeat = { Connect = function(self, fn) self.fn = fn end },
  RenderStepped = { Connect = function(self, fn) self.fn = fn end },
}
RunService.Heartbeat:Connect(function()
  ticks = ticks + 1
end)
RunService.RenderStepped:Connect(function()
  ticks = ticks + 10
end)
RunService.Heartbeat.fn()
RunService.RenderStepped.fn()
print(ticks)
`;
  const result = extractCallbacks(src);
  expect(result.extracted).toBe(2);
  expect(result.remaining).toBe(0);
  expect(result.warnings).toEqual([]);
  expect(result.code.match(/--@quantum:turbo/g)).toHaveLength(2);
  expect(result.code).toContain("local __quantum_callback_1 = function()");
  expect(result.code).toContain("local __quantum_callback_2 = function()");
  expect(result.code).toContain("RunService.Heartbeat:Connect(__quantum_callback_1)");
  expect(result.code).toContain("RunService.RenderStepped:Connect(__quantum_callback_2)");
  expect(result.code).not.toContain("Connect(function()");
});

test("extracts only the requested line", () => {
  const src = `local RunService = { Heartbeat = { Connect = function(self, fn) self.fn = fn end } }
RunService.Heartbeat:Connect(function() print("first") end)
RunService.Heartbeat:Connect(function() print("second") end)
RunService.Heartbeat.fn()
`;
  const result = extractCallbacks(src, { line: 2 });
  expect(result.extracted).toBe(1);
  expect(result.remaining).toBe(1);
  expect(result.code.match(/--@quantum:turbo/g)).toHaveLength(1);
  expect(result.code).toContain('print("first")');
  expect(result.code).toContain('RunService.Heartbeat:Connect(function() print("second") end)');
});

test("leaves indirect, nested, tagged, and multi-argument calls alone", () => {
  const src = `local RunService = { Heartbeat = { Connect = function(self, fn) self.fn = fn end } }
local assigned = RunService.Heartbeat:Connect(function() end)
RunService.Heartbeat:Connect(function() end, true)
local function install()
  RunService.Heartbeat:Connect(function() end)
end
--@quantum:turbo
RunService.Heartbeat:Connect(function() end)
`;
  const result = extractCallbacks(src);
  expect(result.extracted).toBe(0);
  expect(result.remaining).toBe(0);
  expect(result.code).toBe(src);
});

t("extracted callbacks keep closure semantics", () => {
  const src = `local total = 0
local RunService = {
  Heartbeat = { Connect = function(self, fn) self.fn = fn end },
}
RunService.Heartbeat:Connect(function(value)
  total = total + value
end)
RunService.Heartbeat.fn(7)
RunService.Heartbeat.fn(5)
print(total)
`;
  const result = extractCallbacks(src);
  expect(result.extracted).toBe(1);
  const run = runLuau(result.code);
  expect(run.stdout).toBe("12\n");
  expect(run.stderr).toBe("");
});

test("analyzer reports Heartbeat callbacks with a callback action", () => {
  const result = analyzeScript(`local RunService = game:GetService("RunService")
RunService.Heartbeat:Connect(function()
  print("tick")
end)
`);
  expect(result.summary.heartbeat).toBe(1);
  expect(result.summary.renderStepped).toBe(0);
  const diagnostic = result.diagnostics.find((item) => item.code === "heartbeat");
  expect(diagnostic).toBeTruthy();
  expect(diagnostic.callback).toEqual({ line: 2 });
  expect(diagnostic.fixable).toBe(true);
});

test("Skido direct callbacks are extractable and tagged", () => {
  const source = readFileSync(join(__dirname, "fixtures", "Skido 3.4.luau"), "utf8");
  for (const line of [372, 591, 1026, 1262]) {
    const result = extractCallbacks(source, { line });
    expect(result.extracted).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(result.code.match(/--@quantum:turbo/g)).toHaveLength(1);
  }

  const all = extractCallbacks(source);
  expect(all.extracted).toBeGreaterThanOrEqual(4);
  expect(all.remaining).toBe(0);
  expect(all.code.match(/--@quantum:turbo/g)).toHaveLength(all.extracted);
});
