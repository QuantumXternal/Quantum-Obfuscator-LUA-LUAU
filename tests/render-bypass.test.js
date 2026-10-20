// RenderStepped auto-bypass: hot-frame callbacks are lifted into plain
// top-level factories before the VM, while callbacks that mutate captured
// scalars stay in the VM (value capture cannot propagate writes).
import { existsSync, writeFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const HAS_LUAU = existsSync(LUAU);
const t = HAS_LUAU ? test : test.skip;

const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");
const { makeSeedMangler } = await import("../dist/engine/macros.js");

let counter = 0;
function runLuau(code) {
  const f = join(tmpdir(), `render-bypass-${process.pid}-${counter++}.luau`);
  writeFileSync(f, code, "utf8");
  const r = spawnSync(LUAU, [f], { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  rmSync(f, { force: true });
  if (r.stdout) r.stdout = r.stdout.replace(/\r\n/g, "\n");
  if (r.stderr) r.stderr = r.stderr.replace(/\r\n/g, "\n");
  return r;
}

const BASE = {
  renameLocals: true,
  preserveGlobals: true,
  encodeStrings: false,
  scramble: false,
  oneLine: true,
  vmType: "register",
  vmLevel: "max",
  seed: 4242,
  polymorphicSeed: 4242,
};

const HARNESS = `
local calls = {}
local rs = { RenderStepped = {} }
function rs.RenderStepped:Connect(fn)
  calls[#calls + 1] = fn
end
local function connect(service, fn)
  service:Connect(fn)
end
`;

t("RenderStepped callbacks are lifted for :Connect, connect(), and AddToRenderStepped", () => {
  const warnings = [];
  const code =
    HARNESS +
    `
local cfg = { label = "hud" }
local function emit(tag)
  print(tag, cfg.label)
end

local function stable()
  emit("stable")
end
rs.RenderStepped:Connect(stable)

local function direct()
  print("direct", cfg.label)
end
rs.RenderStepped:Connect(direct)

connect(rs.RenderStepped, function()
  emit("inline")
end)

local Loops = {}
function Loops:AddToRenderStepped(name, fn)
  calls[#calls + 1] = fn
end
Loops:AddToRenderStepped("loop", function()
  emit("loop")
end)

cfg.label = "changed"
for _, fn in ipairs(calls) do fn() end
`;
  const out = runObfuscatePipeline(code, { ...BASE, onWarning: (m) => warnings.push(m) });
  expect(out).toMatch(/__qmr_/);
  expect(out.indexOf("__qmr_")).toBeLessThan(out.indexOf("Quantum Protection V2"));
  expect(warnings).toEqual([]);
  const r = runLuau(out);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("stable\tchanged\ndirect\tchanged\ninline\tchanged\nloop\tchanged\n");
});

t("externally reassigned captures use live getters; callback writes stay in the VM", () => {
  const warnings = [];
  const code =
    HARNESS +
    `
local n = 0
local function bump()
  n = n + 1
end
local function read()
  print("read", n)
end
rs.RenderStepped:Connect(read)
rs.RenderStepped:Connect(bump)

n = 5
for _, fn in ipairs(calls) do fn() end
print("final", n)
`;
  const out = runObfuscatePipeline(code, { ...BASE, onWarning: (m) => warnings.push(m) });
  // `read` captures a local reassigned elsewhere: lifted with a getter.
  // `bump` writes a captured local: cannot be lifted safely.
  expect(warnings.some((m) => m.includes("writes captured"))).toBe(true);
  expect(warnings.some((m) => m.includes("'bump'"))).toBe(true);
  expect(out).toMatch(/__qmr_/);
  expect(out).toMatch(/\("read", \w+\(\)\)/);
  const r = runLuau(out);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("read\t5\nfinal\t6\n");
});

t("lifted factories are string-encoded (and MBA) like the main body", () => {
  const warnings = [];
  const code =
    HARNESS +
    `
local cfg = { label = "hud" }
local function paint()
  local weight = 2 + 3
  print("frame-paint", cfg.label, "secret-token", weight)
end
rs.RenderStepped:Connect(paint)

cfg.label = "changed"
for _, fn in ipairs(calls) do fn() end
`;
  const out = runObfuscatePipeline(code, {
    ...BASE,
    encodeStrings: true,
    mba: true,
    onWarning: (m) => warnings.push(m),
  });
  const marker = out.indexOf("--[[\n__________");
  expect(marker).toBeGreaterThan(0);
  const prefix = out.slice(0, marker);
  expect(prefix).toMatch(/__qmr_/);
  // Callback literals must not survive in the plaintext prefix.
  expect(prefix).not.toContain("secret-token");
  expect(prefix).not.toContain("frame-paint");
  expect(prefix).not.toContain('"hud"');
  expect(warnings).toEqual([]);
  const r = runLuau(out);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("frame-paint\tchanged\tsecret-token\t5\n");
});

t("hoists callback decodes out of the hot path with light-tier CFF", () => {
  const warnings = [];
  const code =
    HARNESS +
    `
local cfg = { label = "hud" }
local function paint()
  print("frame-paint", cfg.label)
end
rs.RenderStepped:Connect(paint)
for _, fn in ipairs(calls) do fn() end
`;
  const out = runObfuscatePipeline(code, {
    ...BASE,
    renameLocals: false,
    encodeStrings: true,
    scramble: true,
    mba: false,
    onWarning: (m) => warnings.push(m),
  });
  const marker = out.indexOf("--[[\n__________");
  expect(marker).toBeGreaterThan(0);
  const prefix = out.slice(0, marker);
  const decoder = makeSeedMangler(BASE.polymorphicSeed, "ad")("dec", 0);
  const table = makeSeedMangler(BASE.polymorphicSeed, "hs")("h", 0);
  expect(prefix).toContain(`local ${table} = {}`);
  expect(prefix).toMatch(new RegExp(`${table}\\[1\\] = ${decoder}\\(`));
  const callback = prefix.slice(prefix.indexOf("return function"));
  expect(callback).not.toContain(`${decoder}(`);
  expect(prefix).toContain("os.clock()");
  expect(prefix).not.toContain("while true do");
  expect(warnings).toEqual([]);
  const r = runLuau(out);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("frame-paint\thud\n");
});

t("unresolved global callback is left alone with a warning", () => {
  const warnings = [];
  const code = HARNESS + "\nrs.RenderStepped:Connect(print)\n";
  const out = runObfuscatePipeline(code, { ...BASE, onWarning: (m) => warnings.push(m) });
  expect(warnings.some((m) => m.includes("not a resolvable local function"))).toBe(true);
  expect(out).not.toMatch(/__qmr_/);
  const r = runLuau(out);
  expect(r.stderr).toBe("");
});

const HB_HARNESS = `
local calls = {}
local hb = { Heartbeat = {} }
function hb.Heartbeat:Connect(fn)
  calls[#calls + 1] = fn
end
local Loops = {}
function Loops:AddToHeartbeat(name, fn)
  calls[#calls + 1] = fn
end
`;

t("Heartbeat callbacks are lifted for :Connect and AddToHeartbeat", () => {
  const warnings = [];
  const code =
    HB_HARNESS +
    `
local function beat()
  print("beat")
end
hb.Heartbeat:Connect(beat)

local function viaLoop()
  print("via-loop")
end
Loops:AddToHeartbeat("viaLoop", viaLoop)

for _, fn in ipairs(calls) do fn() end
`;
  const out = runObfuscatePipeline(code, { ...BASE, onWarning: (m) => warnings.push(m) });
  expect(warnings).toEqual([]);
  expect(out).toMatch(/__qmr_/);
  const r = runLuau(out);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("beat\nvia-loop\n");
});

const UI_HARNESS = `
local handlers = {}
local function makeSignal(name)
  local s = {}
  function s:Connect(fn)
    handlers[name] = fn
  end
  return s
end
local Instance = { new = function(cls)
  return {
    ClassName = cls,
    InputBegan = makeSignal("began"),
    InputEnded = makeSignal("ended"),
  }
end }
`;

t("Instance.new aliases lift UI builders and write captures back via setters", () => {
  const warnings = [];
  const code =
    UI_HARNESS +
    `
local InstanceNew = Instance.new
local dragging = false
local dragCount = 0

local function BuildUI()
  local frame = InstanceNew("Frame")
  local label = InstanceNew("TextLabel")
  label.Name = "hud"
  frame.Name = "panel"
  label.Parent = frame
  frame.InputBegan:Connect(function(input)
    dragging = true
    dragCount += 1
  end)
  frame.InputEnded:Connect(function()
    dragging = false
  end)
  return frame
end

local ui = BuildUI()
print("built", ui.Name, ui.ClassName)
handlers.began({ Position = 1 })
print("drag", dragging, dragCount)
handlers.ended({})
print("stop", dragging, dragCount)
`;
  const out = runObfuscatePipeline(code, { ...BASE, onWarning: (m) => warnings.push(m) });
  expect(warnings).toEqual([]);
  expect(out).toMatch(/__qmr_/);
  const r = runLuau(out);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("built\tpanel\tFrame\ndrag\ttrue\t1\nstop\tfalse\t1\n");
});

t("nested method self stays bound to its own receiver inside lifted UI", () => {
  const warnings = [];
  const code =
    UI_HARNESS +
    `
local InstanceNew = Instance.new
local UI = {}

function UI:Create()
  local frame = InstanceNew("Frame")
  local label = InstanceNew("TextLabel")
  frame.Name = "panel"
  label.Name = "label"

  local Dropdown = {}
  Dropdown.__index = Dropdown
  function Dropdown:Update()
    self.state = "updated"
  end
  function Dropdown:Set(value)
    self.value = value
    self:Update()
  end

  local dropdown = setmetatable({}, Dropdown)
  frame.Dropdown = dropdown
  return frame, dropdown
end

local frame, dropdown = UI:Create()
dropdown:Set(7)
print("self", dropdown.value, dropdown.state, frame.state, frame.Name)
`;
  const out = runObfuscatePipeline(code, { ...BASE, onWarning: (m) => warnings.push(m) });
  expect(warnings).toEqual([]);
  expect(out).toMatch(/__qmr_/);
  const r = runLuau(out);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("self\t7\tupdated\tnil\tpanel\n");
});

t("light Instance.new users are not auto-lifted", () => {
  const warnings = [];
  const code =
    UI_HARNESS +
    `
local InstanceNew = Instance.new
local function mainBrain()
  local part = InstanceNew("Part")
  local cfg = { label = "x" }
  return cfg, part
end

local cfg, part = mainBrain()
print("main", cfg.label, part.ClassName)
`;
  const out = runObfuscatePipeline(code, { ...BASE, onWarning: (m) => warnings.push(m) });
  expect(warnings).toEqual([]);
  expect(out).not.toMatch(/__qmr_/);
  const r = runLuau(out);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("main\tx\tPart\n");
});
