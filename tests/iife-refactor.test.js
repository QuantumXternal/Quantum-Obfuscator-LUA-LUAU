import { analyzeScript } from "../dist/engine/analyzer.js";
import { collectIifeSites, hoistDoBlockParent, refactorIifes } from "../dist/engine/iifeRefactor.js";
import { lex } from "../dist/lexer/Lexer.js";
import { parse, parseWithErrors } from "../dist/parser/Parser.js";

function expectValid(code) {
  const tokens = lex(code);
  expect(tokens.errors).toEqual([]);
  const parsed = parseWithErrors(tokens.tokens);
  expect(parsed.errors).toEqual([]);
}

function sitesFor(code) {
  const lexed = lex(code);
  return collectIifeSites(parse(lexed.tokens), code, lexed);
}

test("refactors a direct top-level IIFE into an untagged local function", () => {
  const code = `(function(a)\n  return a + 1\nend)(41)\n`;
  const result = refactorIifes(code);
  expect(result.refactored).toBe(1);
  expect(result.remaining).toBe(0);
  expect(result.warnings).toEqual([]);
  expect(result.code).toContain("__q_iife_wrap_1()");
  expectValid(result.code);
});

test("preserves assignment prefixes, call arguments, and trailing comments", () => {
  const code = `local value = (function(a, b)\n  return a + b\nend)(1, 2) -- keep this\nprint(value)\n`;
  const result = refactorIifes(code);
  expect(result.refactored).toBe(1);
  expect(result.code).toContain("local value = __q_iife_wrap_1() -- keep this");
  expectValid(result.code);
});

test("refactors every safe top-level site with unique names", () => {
  const code = `local first = (function() return 1 end)()\nlocal second = (function() return 2 end)()\nprint(first, second)\n`;
  const result = refactorIifes(code);
  expect(result.refactored).toBe(2);
    expect(result.code).toContain("local function __q_iife_wrap_1()");
  expect(result.code).toContain("local function __q_iife_wrap_2()");
  expect(result.code).toContain("local first = __q_iife_wrap_1()");
  expect(result.code).toContain("local second = __q_iife_wrap_2()");
  expectValid(result.code);
});

test("a line target refactors only the IIFE that starts on that line", () => {
  const code = `local first = (function() return 1 end)()\nlocal second = (function() return 2 end)()\nprint(first, second)\n`;
  const result = refactorIifes(code, { line: 2 });
  expect(result.refactored).toBe(1);
  expect(result.line).toBe(2);
  expect(result.code).toContain("local first = (function() return 1 end)()");
  expect(result.code).toContain("local second = __q_iife_wrap_1()");
  expectValid(result.code);
});

test("a line without a safe IIFE returns the source unchanged", () => {
  const code = `(function() return 1 end)()\nprint("done")\n`;
  const result = refactorIifes(code, { line: 9 });
  expect(result.refactored).toBe(0);
  expect(result.code).toBe(code);
  expect(result.warnings[0]).toMatch(/No refactorable top-level IIFE starts on line 9/);
});

test("rejects an invalid line option instead of refactoring everything", () => {
  const code = `local value = (function() return 1 end)()\n`;
  const result = refactorIifes(code, { line: 0 });
  expect(result.refactored).toBe(0);
  expect(result.code).toBe(code);
  expect(result.warnings[0]).toMatch(/Invalid 'line' option/);
});

test("nested IIFEs are now closure-wrapped", () => {
  const code = `do\n  (function()\n    return 1\n  end)()\nend\n`;
  const sites = sitesFor(code);
  expect(sites).toHaveLength(1);
  expect(sites[0]).toMatchObject({ line: 2, safe: true });
  const result = refactorIifes(code);
  expect(result.refactored).toBe(1);
  expect(result.remaining).toBe(0);
  expect(result.code).toContain("__q_iife_wrap_1()");
  expectValid(result.code);
});

test("nested IIFEs inside a refactored body are also wrapped", () => {
  const code = `local value = (function()\n  return (function() return 1 end)()\nend)()\nprint(value)\n`;
  const result = refactorIifes(code);
  expect(result.refactored).toBe(2);
  expect(result.remaining).toBe(0);
  expectValid(result.code);
});

test("preserves an existing directive instead of adding a duplicate", () => {
  const code = `--@quantum:maximum\n(function() return 1 end)()\n`;
  const result = refactorIifes(code);
  expect(result.refactored).toBe(1);
  expect(result.code.match(/--@quantum:maximum/g)).toHaveLength(1);
    expect(result.code).toContain("--@quantum:maximum\nlocal function __q_iife_wrap_1()");
  expectValid(result.code);
});

test("reports the requested tier without auto-tagging", () => {
  const code = `local value = (function() return 1 end)()\n`;
  const result = refactorIifes(code, { tier: "maximum" });
  expect(result.tier).toBe("maximum");
  expect(result.code.startsWith("local function __q_iife_wrap_1()")).toBe(true);
  });

test("preserves CRLF line endings", () => {
  const code = `local a = 1\r\nlocal b = (function()\r\n  return a\r\nend)()\r\nprint(b)\r\n`;
  const result = refactorIifes(code);
  expect(result.refactored).toBe(1);
  expect(result.code).toContain("\r\nlocal function __q_iife_wrap_1()");
    expect(result.code.split("\n").every((line) => line.endsWith("\r") || line === "")).toBe(true);
});

test("handles multiple IIFEs in one statement and wraps with block bodies", () => {
  const code = `local a, b = (function() return 1 end)(), (function()\n  if true then return 2 end\n  return 3\nend)()\nprint(a, b)\n`;
  const result = refactorIifes(code);
  expect(result.refactored).toBe(2);
  expect(result.code).toContain("local function __q_iife_wrap_1() return (function() return 1 end)() end");
  expect(result.code).toContain("local function __q_iife_wrap_2() return (function()\n  if true then return 2 end\n  return 3\nend)() end");
  expectValid(result.code);
});

test("avoids generated-name collisions", () => {
  const code = `local __q_iife_wrap_1 = true\nlocal value = (function() return 1 end)()\nprint(__q_iife_wrap_1, value)\n`;
  const result = refactorIifes(code);
  expect(result.refactored).toBe(1);
  expect(result.code).toContain("local function __q_iife_wrap_2()");
  expectValid(result.code);
});

test("supports string and table call suffixes", () => {
  const code = `local s = (function() return "x" end) "arg"\nlocal t = (function() return {} end) {1}\n`;
  const result = refactorIifes(code);
  expect(result.refactored).toBe(2);
  expect(result.code).toContain("local s = __q_iife_wrap_1()");
  expect(result.code).toContain("local t = __q_iife_wrap_2()");
  expectValid(result.code);
});

test("refuses type-asserted IIFEs", () => {
  const code = `local value = (function() return 1 end :: any)()\n`;
  const sites = sitesFor(code);
  expect(sites[0].safe).toBe(false);
  expect(sites[0].reason).toMatch(/Type-asserted/);
  const result = refactorIifes(code);
  expect(result.refactored).toBe(0);
  expect(result.code).toBe(code);
});

test("leaves syntax-invalid source unchanged", () => {
  const code = `local value = (function(\n`;
  const result = refactorIifes(code);
  expect(result.refactored).toBe(0);
  expect(result.code).toBe(code);
  expect(result.warnings[0]).toMatch(/syntax errors/);
});

test("is idempotent after a successful refactor", () => {
  const first = refactorIifes(`local value = (function() return 1 end)()\n`);
  const second = refactorIifes(first.code);
  expect(second.refactored).toBe(0);
  expect(second.code).toBe(first.code);
});

test("the analyzer sees generated functions without macro tags", () => {
  const result = refactorIifes(`local value = (function() return 1 end)()\nprint(value)\n`);
  const analysis = analyzeScript(result.code);
  expect(analysis.valid).toBe(true);
  expect(analysis.summary.iifeCount).toBe(0);
  expect(analysis.summary.iifeRefactorable).toBe(0);
  expect(analysis.macros.turbos).toHaveLength(0);
});

test("hoists a do block's top-level loop into a wrapper", () => {
  const code = `local count = 0\nfor i = 1, 5 do\n  do\n    local f = Instance.new("Frame")\n    count = count + 1\n    if count == 2 then break end\n  end\nend\nprint(count)\n`;
  const result = hoistDoBlockParent(code, { line: 3 });
  expect(result.hoisted).toBe(1);
  expect(result.parentLine).toBe(2);
  expect(result.warnings).toEqual([]);
  expect(result.code).toContain("local function __q_do_wrap_1()");
  expect(result.code).toContain("__q_do_wrap_1()");
  expect(result.code).toContain("if count == 2 then break end");
  expectValid(result.code);
});

test("parent hoisting preserves an existing directive and reports its tier", () => {
  const code = `--@quantum:maximum\nfor i = 1, 2 do\n  do\n    local f = Instance.new("Frame")\n  end\nend\nprint(i)\n`;
  const result = hoistDoBlockParent(code, { line: 3, tier: "turbo" });
  expect(result.hoisted).toBe(1);
  expect(result.tier).toBe("maximum");
  expect(result.code.match(/--@quantum:maximum/g)).toHaveLength(1);
  expect(result.code).toContain("--@quantum:maximum\nlocal function __q_do_wrap_1()");
  expectValid(result.code);
});

test("hoisting a block with a direct return wraps the remaining chunk and propagates it", () => {
  const code = `local count = 0\ndo\n  local f = Instance.new("Frame")\n  count = count + 1\n  if count == 2 then return 7 end\nend\nprint("after", count)\n`;
  const result = hoistDoBlockParent(code, { line: 2 });
  expect(result.hoisted).toBe(1);
  expect(result.code).toContain("print(\"after\", count)");
  expect(result.code).toContain("return __q_do_wrap_1(...)");
  expectValid(result.code);
});

test("parent hoisting refuses a do block nested inside an IIFE", () => {
  const code = `do\n  (function()\n    do\n      local f = Instance.new("Frame")\n    end\n  end)()\nend\n`;
  const result = hoistDoBlockParent(code, { line: 3 });
  expect(result.hoisted).toBe(0);
  expect(result.code).toBe(code);
  expect(result.warnings[0]).toMatch(/inside an IIFE/);
});

test("parent hoisting requires a valid line", () => {
  const code = `do\n  local f = Instance.new("Frame")\nend\n`;
  const result = hoistDoBlockParent(code, { line: 0 });
  expect(result.hoisted).toBe(0);
  expect(result.code).toBe(code);
  expect(result.warnings[0]).toMatch(/positive 'line'/);
});
