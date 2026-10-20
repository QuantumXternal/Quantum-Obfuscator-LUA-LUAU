// Phase 1: manual Turbo/Maximum macro tiers.
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
const { scanFunctionMacros, rootCopyLua } = await import("../dist/engine/macros.js");
const { WATERMARK_LINE } = await import("../dist/vm/watermark.js");

const t = HAS_LUAU ? test : test.skip;

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

let artifactCounter = 0;
function runLuau(code) {
  const f = join(tmpdir(), `macro-test-${process.pid}-${artifactCounter++}.luau`);
  writeFileSync(f, code, "utf8");
  const r = spawnSync(LUAU, [f], { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  rmSync(f, { force: true });
  if (r.stdout) r.stdout = r.stdout.replace(/\r\n/g, "\n");
  if (r.stderr) r.stderr = r.stderr.replace(/\r\n/g, "\n");
  return r;
}

test("scanner tags top-level Turbo and Maximum declarations", () => {
  const result = scanFunctionMacros(
    "--@quantum:turbo\nlocal function add(a, b) return a + b end\n\n-- @quantum : maximum\nfunction greet() return '--@quantum:turbo' end\n",
  );
  expect(result.turbos).toEqual(["add"]);
  expect(result.maximums).toEqual(["greet"]);
  expect(result.warnings).toEqual([]);
});

test("scanner supports direct function assignments", () => {
  const result = scanFunctionMacros(
    "--@quantum:turbo\nlocal a = function() return 1 end\n--@quantum:maximum\nb = function() return 2 end\n",
  );
  expect(result.turbos).toEqual(["a"]);
  expect(result.maximums).toEqual(["b"]);
  expect(result.warnings).toEqual([]);
});

test("scanner warns and skips nested functions", () => {
  const result = scanFunctionMacros(
    "local function outer()\n  --@quantum:turbo\n  local function inner() return 1 end\n  return inner()\nend\nprint(outer())\n",
  );
  expect(result.turbos).toEqual([]);
  expect(result.warnings.some((w) => /nested 'inner' is not supported/.test(w))).toBe(true);
});

test("scanner warns and skips ambiguous and conflicting placements", () => {
  const ambiguous = scanFunctionMacros("--@quantum:turbo\nlocal x = 1\nprint(x)\n");
  expect(ambiguous.turbos).toEqual([]);
  expect(ambiguous.warnings.some((w) => /only a top-level function/.test(w))).toBe(true);

  const conflicting = scanFunctionMacros(
    "--@quantum:turbo\n--@quantum:maximum\nlocal function f() return 1 end\nprint(f())\n",
  );
  expect(conflicting.turbos).toEqual([]);
  expect(conflicting.maximums).toEqual([]);
  expect(conflicting.warnings.some((w) => /conflicting tier comments/.test(w))).toBe(true);
});

test("comments in strings and trailing comments are not directives", () => {
  const result = scanFunctionMacros(
    "local s = '--@quantum:turbo'\nprint(s) --@quantum:turbo\nlocal function f() return s end\nprint(f())\n",
  );
  expect(result.turbos).toEqual([]);
  expect(result.maximums).toEqual([]);
  expect(result.warnings).toEqual([]);
});

test("no macro leaves output free of tier markers and extraction helpers", () => {
  const code = "local function add(a, b) return a + b end\nprint(add(2, 3))\n";
  const out = runObfuscatePipeline(code, { ...BASE });
  expect(out).not.toMatch(/__qmv_/);
  expect(out).not.toMatch(/@quantum/);
});

t("Turbo local function is hoisted, renamed, and callable", () => {
  const code = "--@quantum:turbo\nlocal function add(a, b)\n  return a + b\nend\nprint(add(2, 3))\n";
  const out = runObfuscatePipeline(code, { ...BASE, vmType: "none", vmLevel: "normal" });
  expect(out).toMatch(/__qmv_/);
  expect(out.split("\n")[0]).toBe(WATERMARK_LINE);
  expect(out.split("select(2,pcall(getfenv,0))").length - 1).toBe(1);
  const r = runLuau(out);
  expect(r.stdout).toBe("5\n");
  expect(r.stderr).toBe("");
});

t("Turbo global and assignment forms are extracted", () => {
  const globalForm = runObfuscatePipeline(
    '--@quantum:turbo\nfunction greet()\n  return "hi"\nend\nprint(greet())\n',
    { ...BASE, vmType: "none", vmLevel: "normal" },
  );
  const assignmentForm = runObfuscatePipeline(
    "--@quantum:turbo\nlocal mul = function(a, b)\n  return a * b\nend\nprint(mul(6, 7))\n",
    { ...BASE, vmType: "none", vmLevel: "normal" },
  );
  expect(globalForm).toMatch(/__qmv_/);
  expect(assignmentForm).toMatch(/__qmv_/);
  expect(runLuau(globalForm).stdout).toBe("hi\n");
  expect(runLuau(assignmentForm).stdout).toBe("42\n");
});

t("Turbo recursion and earlier-candidate calls work", () => {
  const fib = runObfuscatePipeline(
    "--@quantum:turbo\nlocal function fib(n)\n  if n < 2 then return n end\n  return fib(n - 1) + fib(n - 2)\nend\nprint(fib(10))\n",
    { ...BASE, vmType: "none", vmLevel: "normal" },
  );
  const chained = runObfuscatePipeline(
    "--@quantum:turbo\nlocal function one() return 1 end\n--@quantum:turbo\nlocal function two() return one() + 1 end\nprint(two())\n",
    { ...BASE, vmType: "none", vmLevel: "normal" },
  );
  expect(runLuau(fib).stdout).toBe("55\n");
  expect(runLuau(chained).stdout).toBe("2\n");
});

test("upvalue capture vetoes extraction with a warning", () => {
  const warnings = [];
  const code = "local x = 7\n--@quantum:turbo\nlocal function f()\n  return x * 6\nend\nprint(f())\n";
  const out = runObfuscatePipeline(code, { ...BASE, vmType: "none", vmLevel: "normal", onWarning: (m) => warnings.push(m) });
  expect(out).not.toMatch(/__qmv_/);
  expect(warnings.some((w) => /captures outer local/.test(w))).toBe(true);
  if (!HAS_LUAU) return;
  const r = runLuau(out);
  expect(r.stdout).toBe("42\n");
  expect(r.stderr).toBe("");
});

test("duplicate candidate names are vetoed with a warning", () => {
  const warnings = [];
  const code =
    "--@quantum:turbo\nlocal function f() return 1 end\n--@quantum:turbo\nlocal function f() return 2 end\nprint(f())\n";
  const out = runObfuscatePipeline(code, { ...BASE, vmType: "none", vmLevel: "normal", onWarning: (m) => warnings.push(m) });
  expect(out).not.toMatch(/__qmv_/);
  expect(warnings.some((w) => /declared more than once/.test(w))).toBe(true);
});

test("Maximum raises a lower profile to the register max VM", () => {
  const opts = { ...BASE, vmType: "none", vmLevel: "normal" };
  const out = runObfuscatePipeline(
    "--@quantum:maximum\nlocal function heavy() return 1 end\nprint(heavy())\n",
    opts,
  );
  expect(opts.vmType).toBe("register");
  expect(opts.vmLevel).toBe("max");
  expect(out.length).toBeGreaterThan(1000);
  expect(out.split("\n")[0]).toBe(WATERMARK_LINE);
});

test("Turbo gets string, MBA, and native control-flow hardening", () => {
  const code = `--@quantum:turbo
local function hot()
  return "plain-turbo-token" .. tostring(10 + 20)
end
print(hot())
`;
  const out = runObfuscatePipeline(code, { ...BASE, encodeStrings: false, mba: false });
  expect(out).not.toContain("plain-turbo-token");
  expect(out).toContain("os.clock()");
  expect(out).not.toMatch(/__qnc_/);
  if (!HAS_LUAU) return;
  const r = runLuau(out);
  expect(r.stdout).toBe("plain-turbo-token30\n");
  expect(r.stderr).toBe("");
});

t("debug mode emits Turbo and Maximum bodies as plaintext natives", () => {
  const code = `--@quantum:turbo
local function hot()
  return "debug-plain-token"
end
--@quantum:maximum
local function critical()
  return 7
end
print(hot(), critical())
`;
  const out = runObfuscatePipeline(code, { ...BASE, vmType: "register", vmLevel: "debug", debugTrace: false });
  expect(out.split("\n")[0]).toBe(WATERMARK_LINE);
  expect(out).toContain("debug-plain-token");
  expect(out).not.toContain("@quantum");
  const r = runLuau(out);
  expect(r.stdout).toBe("debug-plain-token\t7\n");
  expect(r.stderr).toBe("");
});

test("stack and register artifacts put the watermark on line one", () => {
  for (const [vmType, vmLevel] of [["stack", "normal"], ["register", "max"]]) {
    const out = runObfuscatePipeline("local x = 1 print(x)\n", { ...BASE, vmType, vmLevel });
    expect(out.split("\n")[0]).toBe(WATERMARK_LINE);
    expect(out).not.toContain("discord.gg");
    expect(out).not.toContain("@quantum");
  }
});

test("rootCopyLua emits resolution chain and no assignments for empty input", () => {
  expect(rootCopyLua([])).toBe("");
  const line = rootCopyLua(["__qmv_a_0", "__qmv_a_1"]);
  expect(line).toContain('r["__qmv_a_0"]=__qmv_a_0');
  expect(line).toContain('r["__qmv_a_1"]=__qmv_a_1');
  expect(line.startsWith("pcall(function()")).toBe(true);
});

t("reference shadowed by an unrelated local is not rewritten", () => {
  const code =
    "--@quantum:turbo\nlocal function f(v)\n  return v + 1\nend\ndo\n  local f = function() return 99 end\n  print(f())\nend\nprint(f(1))\n";
  const out = runObfuscatePipeline(code, { ...BASE, vmType: "none", vmLevel: "normal" });
  const r = runLuau(out);
  expect(r.stdout).toBe("99\n2\n");
  expect(r.stderr).toBe("");
});
