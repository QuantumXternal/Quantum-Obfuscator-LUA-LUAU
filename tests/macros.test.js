// Phase 3.2(b): macro directive extraction (--@quantum:no-vm / light-vm / secure).
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
const { scanMacroDirectives, rootCopyLua } = await import("../dist/engine/macros.js");

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

test("scanMacroDirectives finds no-vm names and file directives", () => {
  const d = scanMacroDirectives(
    "--@quantum:no-vm\nlocal function add(a, b)\n--@quantum:light-vm\nprint(1)\n--@quantum:no-vm\nfunction greet() end\n",
  );
  expect(d.noVmFunctions).toEqual(["add", "greet"]);
  expect(d.fileDirective).toBe("light-vm");
});

test("secure beats light-vm regardless of order", () => {
  expect(scanMacroDirectives("--@quantum:secure\n--@quantum:light-vm\n").fileDirective).toBe("secure");
  expect(scanMacroDirectives("--@quantum:light-vm\n--@quantum:secure\n").fileDirective).toBe("secure");
});

test("secure directive resolves to register VM max and forces features", () => {
  const opts = { ...BASE, vmType: "none", vmLevel: "normal", performanceTier: "turbo" };
  const out = runObfuscatePipeline("--@quantum:secure\nlocal x = 1\nprint(x)\n", opts);
  expect(opts.vmType).toBe("register");
  expect(opts.vmLevel).toBe("max");
  expect(out.length).toBeGreaterThan(1000);
});

test("light-vm directive resolves to stack VM normal and executes", () => {
  const opts = { ...BASE, vmType: "none", vmLevel: "normal", performanceTier: "maximum" };
  const out = runObfuscatePipeline("--@quantum:light-vm\nlocal x = 1\nprint(x)\n", opts);
  expect(opts.vmType).toBe("stack");
  expect(opts.vmLevel).toBe("normal");
  if (!HAS_LUAU) return;
  const r = runLuau(out);
  expect(r.stdout).toBe("1\n");
  expect(r.stderr).toBe("");
});

test("no directives leaves output free of macro markers", () => {
  const code = "local function add(a, b) return a + b end\nprint(add(2, 3))\n";
  const a = runObfuscatePipeline(code, { ...BASE });
  const b = runObfuscatePipeline(code, { ...BASE, noVmFunctions: [] });
  expect(a).toBe(b);
  expect(a).not.toMatch(/__qmv_/);
});

t("no-vm local function is hoisted, renamed, and callable", () => {
  const code = "--@quantum:no-vm\nlocal function add(a, b)\n  return a + b\nend\nprint(add(2, 3))\n";
  const out = runObfuscatePipeline(code, { ...BASE });
  expect(out).toMatch(/__qmv_/);
  expect(out.split("select(2,pcall(getfenv,0))").length - 1).toBe(1);
  const r = runLuau(out);
  expect(r.stdout).toBe("5\n");
  expect(r.stderr).toBe("");
});

t("no-vm global function form is extracted", () => {
  const code = '--@quantum:no-vm\nfunction greet()\n  return "hi"\nend\nprint(greet())\n';
  const out = runObfuscatePipeline(code, { ...BASE });
  expect(out).toMatch(/__qmv_/);
  const r = runLuau(out);
  expect(r.stdout).toBe("hi\n");
  expect(r.stderr).toBe("");
});

t("no-vm assignment form is extracted", () => {
  const code = "--@quantum:no-vm\nlocal mul = function(a, b)\n  return a * b\nend\nprint(mul(6, 7))\n";
  const out = runObfuscatePipeline(code, { ...BASE });
  expect(out).toMatch(/__qmv_/);
  const r = runLuau(out);
  expect(r.stdout).toBe("42\n");
  expect(r.stderr).toBe("");
});

t("extracted recursion works", () => {
  const code =
    "--@quantum:no-vm\nlocal function fib(n)\n  if n < 2 then return n end\n  return fib(n - 1) + fib(n - 2)\nend\nprint(fib(10))\n";
  const out = runObfuscatePipeline(code, { ...BASE });
  expect(out).toMatch(/__qmv_/);
  const r = runLuau(out);
  expect(r.stdout).toBe("55\n");
  expect(r.stderr).toBe("");
});

t("earlier extracted candidates are callable from later ones", () => {
  const code =
    "--@quantum:no-vm\nlocal function one() return 1 end\n--@quantum:no-vm\nlocal function two() return one() + 1 end\nprint(two())\n";
  const out = runObfuscatePipeline(code, { ...BASE });
  const r = runLuau(out);
  expect(r.stdout).toBe("2\n");
  expect(r.stderr).toBe("");
});

test("upvalue capture vetoes extraction with a warning", () => {
  const warnings = [];
  const code = "local x = 7\n--@quantum:no-vm\nlocal function f()\n  return x * 6\nend\nprint(f())\n";
  const out = runObfuscatePipeline(code, { ...BASE, onWarning: (m) => warnings.push(m) });
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
    "--@quantum:no-vm\nlocal function f() return 1 end\n--@quantum:no-vm\nlocal function f() return 2 end\nprint(f())\n";
  const out = runObfuscatePipeline(code, { ...BASE, onWarning: (m) => warnings.push(m) });
  expect(out).not.toMatch(/__qmv_/);
  expect(warnings.some((w) => /declared more than once/.test(w))).toBe(true);
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
    "--@quantum:no-vm\nlocal function f(v)\n  return v + 1\nend\ndo\n  local f = function() return 99 end\n  print(f())\nend\nprint(f(1))\n";
  const out = runObfuscatePipeline(code, { ...BASE });
  const r = runLuau(out);
  expect(r.stdout).toBe("99\n2\n");
  expect(r.stderr).toBe("");
});
