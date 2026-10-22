import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { injectHeavyMacros } from "../dist/engine/macroAuto.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "large-ui-turbo.lua");

test("injects a Turbo macro above a safe top-level function", () => {
  const code = `local function ui()\n  local f = Instance.new("Frame")\n  return f\nend\nprint(ui())\n`;
  const result = injectHeavyMacros(code, "turbo");
  expect(result.injected).toBe(1);
  expect(result.tier).toBe("turbo");
  expect(result.warnings).toEqual([]);
  expect(result.code).toBe(`--@quantum:turbo\n${code}`);
  expect(code.startsWith("--@quantum")).toBe(false);
});

test("Maximum injection is idempotent", () => {
  const code = `local function ui()\n  local f = Instance.new("Frame")\n  return f\nend\nprint(ui())\n`;
  const first = injectHeavyMacros(code, "maximum");
  const second = injectHeavyMacros(first.code, "maximum");
  expect(first.injected).toBe(1);
  expect(first.code.startsWith("--@quantum:maximum\n")).toBe(true);
  expect(second.injected).toBe(0);
  expect(second.code).toBe(first.code);
});

test("preserves CRLF line endings while inserting the directive", () => {
  const code = `-- header\r\nlocal function ui()\r\n  local f = Instance.new("Frame")\r\n  return f\r\nend\r\nprint(ui())\r\n`;
  const result = injectHeavyMacros(code, "turbo");
  expect(result.injected).toBe(1);
  expect(result.code).toContain("--@quantum:turbo\r\nlocal function ui()");
  expect(result.code.split("\n").every((line) => line.endsWith("\r") || line === "")).toBe(true);
});

test("tags the enclosing top-level function for a nested hot call", () => {
  const code = `local function outer()\n  local function inner()\n    return Instance.new("Frame")\n  end\n  return inner()\nend\nprint(outer())\n`;
  const result = injectHeavyMacros(code, "turbo");
  expect(result.injected).toBe(1);
  expect(result.warnings).toEqual([]);
  expect(result.code).toBe(`--@quantum:turbo\n${code}`);
});

test("skips syntax-invalid source without changing it", () => {
  const code = `local function broken(\n  local f = Instance.new("Frame")\n`;
  const result = injectHeavyMacros(code, "turbo");
  expect(result.injected).toBe(0);
  expect(result.code).toBe(code);
  expect(result.warnings[0]).toMatch(/syntax errors/);
});

test("deduplicates multiple heavy calls in one function", () => {
  const code = `local function ui()\n  local a = Instance.new("Frame")\n  local b = Instance.new("TextLabel")\n  return a, b\nend\nprint(ui())\n`;
  const result = injectHeavyMacros(code, "turbo");
  expect(result.injected).toBe(1);
  expect(result.code.match(/--@quantum:turbo/g)).toHaveLength(1);
});

test("the large fixture gets exactly the untagged runDemo macro", () => {
  const code = readFileSync(FIXTURE, "utf8");
  const result = injectHeavyMacros(code, "turbo");
  expect(result.injected).toBe(1);
  expect(result.warnings).toEqual([]);
  expect(result.code).toContain("--@quantum:turbo\nlocal function runDemo()");
});
