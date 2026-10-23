// Nested Turbo extraction: native bridge, captures, and colon/dotted methods.
import { spawnSync } from "child_process";
import { existsSync, writeFileSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const HAS_LUAU = existsSync(LUAU);

const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");
const { scanFunctionMacros } = await import("../dist/engine/macros.js");

const t = HAS_LUAU ? test : test.skip;
const BASE = {
  renameLocals: true,
  preserveGlobals: true,
  encodeStrings: false,
  scramble: false,
  oneLine: true,
  vmType: "none",
  vmLevel: "normal",
  seed: 4242,
  polymorphicSeed: 4242,
};

let artifactCounter = 0;
function runLuau(code) {
  const file = join(tmpdir(), `nested-macro-test-${process.pid}-${artifactCounter++}.luau`);
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

function compile(code, overrides = {}) {
  const warnings = [];
  const out = runObfuscatePipeline(code, {
    ...BASE,
    ...overrides,
    onWarning: (message) => warnings.push(message),
  });
  return { out, warnings };
}

t("nested colon method survives its parent and mutates captured state", () => {
  const code = `local function makeUI(initial)
  local ui = { total = initial }
  --@quantum:turbo
  function ui:Add(amount)
    local base = self.total
    self.total = base + amount
    return function(extra)
      self.total = self.total + extra
      return self.total
    end
  end
  return ui
end
local ui = makeUI(10)
local bump = ui:Add(5)
print(bump(1), bump(2))
`;
  const { out, warnings } = compile(code);
  expect(warnings).toEqual([]);
  expect(out).toMatch(/__qmn_/);
  const result = runLuau(out);
  expect(result.stdout).toBe("16\t18\n");
  expect(result.stderr).toBe("");
});

t("returned closures retain bridge accessors after the parent returns", () => {
  const code = `local function build()
  local count = 0
  local ui = {}
  --@quantum:turbo
  function ui:Bump()
    return function()
      count = count + 1
      return count
    end
  end
  return ui
end
local bump = build():Bump()
print(bump(), bump(), bump())
`;
  const { out, warnings } = compile(code);
  expect(warnings).toEqual([]);
  const result = runLuau(out);
  expect(result.stdout).toBe("1\t2\t3\n");
  expect(result.stderr).toBe("");
});

t("nested method captures an outer local and preserves self", () => {
  const code = `local scale = 3
local function make()
  local ui = { last = 0 }
  --@quantum:turbo
  function ui:Set(value)
    self.last = value * scale
    return self.last
  end
  return ui
end
local ui = make()
print(ui:Set(7), ui.last)
`;
  const { out, warnings } = compile(code);
  expect(warnings).toEqual([]);
  const result = runLuau(out);
  expect(result.stdout).toBe("21\t21\n");
  expect(result.stderr).toBe("");
});

t("top-level colon and dotted Turbo methods are extracted natively", () => {
  const code = `local ui = {}
local offset = 4
--@quantum:turbo
function ui:Add(value)
  return self.base + value + offset
end
--@quantum:turbo
function ui.Double(value)
  return value * 2
end
ui.base = 10
print(ui:Add(1), ui.Double(21))
`;
  const { out, warnings } = compile(code);
  expect(warnings).toEqual([]);
  expect(out).toMatch(/__qmn_/);
  const result = runLuau(out);
  expect(result.stdout).toBe("15\t42\n");
  expect(result.stderr).toBe("");
});

t("nested recursive Turbo function calls itself through the bridge", () => {
  const code = `local function outer(n)
  --@quantum:turbo
  local function fact(x)
    if x <= 1 then return 1 end
    return x * fact(x - 1)
  end
  return fact(n)
end
print(outer(6))
`;
  const { out, warnings } = compile(code);
  expect(warnings).toEqual([]);
  const result = runLuau(out);
  expect(result.stdout).toBe("720\n");
  expect(result.stderr).toBe("");
});

t("nested writes, compound writes, and multiple assignment cross the bridge", () => {
  const code = `local function outer()
  local x, y = 1, 2
  --@quantum:turbo
  local function inner()
    local a
    a, x, y = 3, 4, 5
    x += 10
    y = y .. "!"
    return a, x, y
  end
  return inner()
end
print(outer())
`;
  const { out, warnings } = compile(code);
  expect(warnings).toEqual([]);
  const result = runLuau(out);
  expect(result.stdout).toBe("3\t14\t5!\n");
  expect(result.stderr).toBe("");
});

t("nested Turbo extraction works under the stack and register VMs", () => {
  const code = `local function build(n)
  local ui = {}
  --@quantum:turbo
  function ui:Add(x)
    local total = n
    return function(y) total = total + x + y return total end
  end
  return ui
end
local ui = build(10)
local f = ui:Add(5)
print(f(1), f(2))
`;
  for (const [vmType, vmLevel] of [["stack", "normal"], ["register", "max"]]) {
    const { out, warnings } = compile(code, { vmType, vmLevel });
    expect(warnings).toEqual([]);
    const result = runLuau(out);
    expect(result.stdout).toBe("16\t23\n");
    expect(result.stderr).toBe("");
  }
});

test("scanner reports bridge sites without claiming top-level Turbo names", () => {
  const result = scanFunctionMacros(
    `local ui = {}
--@quantum:turbo
function ui:Add() return self end
local function outer()
  --@quantum:turbo
  local function inner() return 1 end
  return inner()
end
print(ui:Add(), outer())
`,
  );
  expect(result.turbos).toEqual([]);
  expect(result.maximums).toEqual([]);
  expect(result.nestedTurbos).toBe(2);
  expect(result.warnings).toEqual([]);
});
