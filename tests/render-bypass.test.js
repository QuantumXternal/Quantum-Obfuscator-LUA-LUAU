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

t("unresolved global callback is left alone with a warning", () => {
  const warnings = [];
  const code = HARNESS + "\nrs.RenderStepped:Connect(print)\n";
  const out = runObfuscatePipeline(code, { ...BASE, onWarning: (m) => warnings.push(m) });
  expect(warnings.some((m) => m.includes("not a resolvable local function"))).toBe(true);
  expect(out).not.toMatch(/__qmr_/);
  const r = runLuau(out);
  expect(r.stderr).toBe("");
});
