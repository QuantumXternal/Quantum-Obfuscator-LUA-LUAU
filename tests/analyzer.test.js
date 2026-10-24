import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { analyzeScript } from "../dist/engine/analyzer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "large-ui-turbo.lua");

test("analyzer suggests a Turbo tag for a safe top-level function", () => {
  const result = analyzeScript(`local function makeUi()\n  local f = Instance.new("Frame")\n  return f\nend\nprint(makeUi())\n`);
  expect(result.valid).toBe(true);
  expect(result.summary.instanceNew).toBe(1);
  expect(result.summary.autoFixable).toBe(1);
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]).toMatchObject({
    line: 2,
    column: 13,
    severity: "warning",
    code: "instance-new",
    functionName: "makeUi",
    fix: { line: 1, insertText: "--@quantum:turbo\n", tier: "turbo" },
  });
});

test("analyzer uses the Maximum tier when requested", () => {
  const result = analyzeScript(`local function effect()\n  return Instance.new("Attachment")\nend\nprint(effect())\n`, { tier: "maximum" });
  expect(result.diagnostics[0].fix).toEqual({ line: 1, insertText: "--@quantum:maximum\n", tier: "maximum" });
});

test("already tagged functions are reported without a replacement fix", () => {
  const result = analyzeScript(`--@quantum:turbo\nlocal function makeUi()\n  local f = Instance.new("Frame")\n  return f\nend\nprint(makeUi())\n`);
  expect(result.summary.autoFixable).toBe(0);
  expect(result.diagnostics[0].fix).toBeNull();
  expect(result.diagnostics[0].message).toMatch(/already tagged for TURBO/);
});

test("nested Turbo tags warn and keep the hot call attributed to the top-level parent", () => {
  const result = analyzeScript(`local function outer()
  --@quantum:turbo
  local function inner()
    return Instance.new("Frame")
  end
  return inner()
end
print(outer())
`);
  expect(result.macros).not.toHaveProperty("nestedTurbos");
  expect(result.macros.warnings.some((w) => /nested 'inner' is not supported/.test(w))).toBe(true);
  expect(result.summary.autoFixable).toBe(1);
  expect(result.diagnostics.some((d) => d.code === "macro-warning")).toBe(true);
  const diagnostic = result.diagnostics.find((d) => d.code === "instance-new");
  expect(diagnostic).toMatchObject({
    functionName: "outer",
    fix: { line: 1, insertText: "--@quantum:turbo\n", tier: "turbo" },
  });
  expect(diagnostic.message).toMatch(/inside 'outer'/);
});

test("nested method Turbo tags warn and keep the hot call attributed to the top-level parent", () => {
  const result = analyzeScript(`local ui = {}
local function make()
  --@quantum:turbo
  function ui:Render()
    return Instance.new("Frame")
  end
end
print(make())
`);
  expect(result.macros.warnings.some((w) => /nested this function is not supported/.test(w))).toBe(true);
  expect(result.summary.autoFixable).toBe(1);
  const diagnostic = result.diagnostics.find((d) => d.code === "instance-new");
  expect(diagnostic).toMatchObject({
    functionName: "make",
    fix: { line: 2, insertText: "--@quantum:turbo\n", tier: "turbo" },
  });
  expect(diagnostic.message).toMatch(/inside 'make'/);
});

test("nested functions are attributed to the enclosing top-level function", () => {
  const nested = analyzeScript(`local function outer()\n  local function inner()\n    return Instance.new("Frame")\n  end\n  return inner()\nend\nprint(outer())\n`);
  expect(nested.summary.autoFixable).toBe(1);
  expect(nested.summary.iifeCount).toBe(0);
  expect(nested.diagnostics[0].functionName).toBe("outer");
  expect(nested.diagnostics[0].fix).toEqual({ line: 1, insertText: "--@quantum:turbo\n", tier: "turbo" });
  expect(nested.diagnostics[0].message).toMatch(/inside 'outer'/);

  const iife = analyzeScript(`(function()\n  local f = Instance.new("Frame")\n  return f\nend)()\n`);
  expect(iife.summary.autoFixable).toBe(0);
  expect(iife.summary.iifeCount).toBe(1);
  expect(iife.summary.iifeRefactorable).toBe(1);
  const iifeDiagnostic = iife.diagnostics.find((d) => d.code === "iife");
  expect(iifeDiagnostic).toMatchObject({
    line: 1,
    severity: "warning",
    fix: null,
    refactor: { line: 1 },
  });
  expect(iifeDiagnostic.message).toMatch(/can be refactored/);

  const nestedIife = analyzeScript(`do\n  (function()\n    return Instance.new("Frame")\n  end)()\nend\n`);
  expect(nestedIife.summary.iifeCount).toBe(1);
  expect(nestedIife.summary.iifeRefactorable).toBe(1);
  const nestedDiagnostic = nestedIife.diagnostics.find((d) => d.code === "iife");
  expect(nestedDiagnostic.refactor).not.toBeNull();

  const wrapped = analyzeScript(`local Module = (function()\n  return {}\nend)()\nprint(Module)\n`);
  expect(wrapped.summary.iifeCount).toBe(1);
  expect(wrapped.summary.iifeRefactorable).toBe(1);

  const callback = analyzeScript(`pcall(function()\n  return Instance.new("Frame")\nend)\n`);
  expect(callback.summary.iifeCount).toBe(0);
});

test("anonymous callbacks inside top-level functions are attributed to the parent", () => {
  const result = analyzeScript(`local function outer()\n  return pcall(function()\n    return Instance.new("Frame")\n  end)\nend\nprint(outer())\n`);
  expect(result.summary.autoFixable).toBe(1);
  expect(result.diagnostics[0].functionName).toBe("outer");
  expect(result.diagnostics[0].fix.line).toBe(1);
});

test("duplicate top-level names are not auto-tagged", () => {
  const result = analyzeScript(`local function makeUi()\n  return Instance.new("Frame")\nend\nlocal function makeUi()\n  return Instance.new("TextLabel")\nend\nprint(makeUi())\n`);
  expect(result.summary.instanceNew).toBe(2);
  expect(result.summary.autoFixable).toBe(0);
  expect(result.diagnostics.every((d) => d.fix === null)).toBe(true);
  expect(result.diagnostics[0].message).toMatch(/declared more than once/);
});

test("RenderStepped sites are detected and fixable", () => {
  const result = analyzeScript(`local function onFrame()\n  RunService.RenderStepped:Connect(function() end)\nend\nonFrame()\n`);
  expect(result.summary.renderStepped).toBe(1);
  expect(result.summary.autoFixable).toBe(1);
  expect(result.diagnostics[0].fix.line).toBe(1);
});

test("do blocks without a top-level function offer a parent hoist", () => {
  const result = analyzeScript(`local count = 0\nfor i = 1, 5 do\n  do\n    local f = Instance.new("Frame")\n    count += 1\n    if count == 2 then break end\n  end\nend\nprint(count)\n`);
  expect(result.valid).toBe(true);
  expect(result.summary.autoFixable).toBe(0);
  expect(result.diagnostics).toHaveLength(1);
  expect(result.diagnostics[0]).toMatchObject({
    code: "instance-new",
    functionName: null,
    fix: null,
    hoist: { line: 3 },
    fixable: true,
  });
});

test("RenderStepped property access without an inline callback is not a hot site", () => {
  const result = analyzeScript(`local Loops = {}\nfunction Loops:Add(draw)\n  local connection = RunService.RenderStepped:Connect(draw)\n  return connection\nend\n`);
  expect(result.summary.renderStepped).toBe(0);
  expect(result.diagnostics).toHaveLength(0);
});

test("syntax errors make the analysis invalid and disable fixes", () => {
  const result = analyzeScript(`local function broken(\n`);
  expect(result.valid).toBe(false);
  expect(result.summary.errors).toBeGreaterThan(0);
  expect(result.summary.autoFixable).toBe(0);
  expect(result.diagnostics[0]).toMatchObject({ severity: "error", code: "parse-error", fix: null });
});

test("diagnostics are not capped at 500", () => {
  const code = Array.from(
    { length: 520 },
    (_, index) => `local function make${index}()\n  return Instance.new("Frame")\nend\n`,
  ).join("");
  const result = analyzeScript(code);
  expect(result.valid).toBe(true);
  expect(result.diagnostics).toHaveLength(520);
  expect(result.summary.autoFixable).toBe(520);
  expect(result.summary.truncated).toBe(false);
  expect(result.diagnostics.every((diagnostic) => diagnostic.fixable)).toBe(true);
});

test("large fixture analysis matches the stress-test baseline", () => {
  const code = readFileSync(FIXTURE, "utf8");
  const result = analyzeScript(code);
  expect(result.valid).toBe(true);
  expect(result.summary).toMatchObject({
    lines: 1228,
    tokens: 8860,
    functions: 54,
    iifeCount: 0,
    iifeRefactorable: 0,
    instanceNew: 90,
    renderStepped: 0,
    heavyFunctions: 20,
    autoFixable: 1,
    errors: 0,
    truncated: false,
  });
  expect(result.macros.turbos).toHaveLength(24);
  expect(result.macros.maximums).toHaveLength(2);
  expect(result.diagnostics.filter((d) => d.fix).length).toBe(2);
  expect(result.diagnostics.every((d) => d.functionName !== "runDemo" || d.fix)).toBe(true);
});
