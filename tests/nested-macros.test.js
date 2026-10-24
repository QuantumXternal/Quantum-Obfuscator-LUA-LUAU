// Nested/table/method Turbo tags are advisory: they warn and stay in the VM.
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
  vmType: "register",
  vmLevel: "max",
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

test("scanner warns for nested Turbo functions and does not claim them", () => {
  const result = scanFunctionMacros(
    "local function outer()\n  --@quantum:turbo\n  local function inner() return 1 end\n  return inner()\nend\nprint(outer())\n",
  );
  expect(result.turbos).toEqual([]);
  expect(result).not.toHaveProperty("nestedTurbos");
  expect(result.warnings.some((w) => /nested 'inner' is not supported/.test(w))).toBe(true);
});

test("scanner warns for top-level colon and dotted Turbo methods", () => {
  const result = scanFunctionMacros(
    `local ui = {}
--@quantum:turbo
function ui:Add(x) return self, x end
--@quantum:turbo
function ui.Remove(x) return x end
print(ui:Add(1))
`,
  );
  expect(result.turbos).toEqual([]);
  expect(result.warnings.filter((w) => /table\/method functions are not supported/.test(w))).toHaveLength(2);
});

t("nested Turbo tags stay in the VM and preserve captured state", () => {
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
  expect(warnings.some((w) => /nested this function is not supported/.test(w))).toBe(true);
  expect(out).not.toMatch(/__qmn_/);
  const result = runLuau(out);
  expect(result.stdout).toBe("16\t18\n");
  expect(result.stderr).toBe("");
});

t("top-level method Turbo tags stay in the VM", () => {
  const code = `local ui = {}
--@quantum:turbo
function ui:Add(x) return self, x end
--@quantum:turbo
function ui.Remove(x) return x end
local self, value = ui:Add(15)
print(value, ui.Remove(42))
`;
  const { out, warnings } = compile(code);
  expect(warnings.filter((w) => /table\/method functions are not supported/.test(w))).toHaveLength(2);
  expect(out).not.toMatch(/__qmn_/);
  const result = runLuau(out);
  expect(result.stdout).toBe("15\t42\n");
  expect(result.stderr).toBe("");
});
