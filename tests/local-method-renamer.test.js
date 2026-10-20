// Conservative local-table method renaming: static methods get opaque
// properties, while external APIs, dynamic lookups, and escaped tables stay.
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const HAS_LUAU = existsSync(LUAU);
const t = HAS_LUAU ? test : test.skip;

const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");

const TMP = mkdtempSync(join(tmpdir(), "method-rename-"));
let counter = 0;

function runLuau(code) {
  const f = join(TMP, `method-${process.pid}-${counter++}.luau`);
  writeFileSync(f, code, "utf8");
  const r = spawnSync(LUAU, [f], { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  rmSync(f, { force: true });
  return {
    stdout: (r.stdout || "").replace(/\r\n/g, "\n"),
    stderr: (r.stderr || "").replace(/\r\n/g, "\n"),
  };
}

const BASE = {
  renameLocals: true,
  preserveGlobals: true,
  encodeStrings: false,
  scramble: false,
  oneLine: false,
  vmType: "none",
  vmLevel: "debug",
  seed: 4242,
  polymorphicSeed: 4242,
};

t("renames statically resolvable methods and keeps self-bound calls working", () => {
  const warnings = [];
  const code = runObfuscatePipeline(`
local t = { x = 7 }
function t:get_position() return self.x end
function t:aim() return t:get_position() end
local lib = { FindFirstChild = function() return "ok" end }
print(t:aim(), lib:FindFirstChild())
`, { ...BASE, onWarning: (m) => warnings.push(m) });
  expect(warnings).toEqual([]);
  expect(code).not.toContain(":get_position");
  expect(code).not.toContain(":aim");
  expect(code).toContain(":FindFirstChild");
  expect(code).toMatch(/:_0x[0-9a-f]+\(/);
  const r = runLuau(code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("7\tok\n");
});

t("skips escaped tables and dynamic method lookups", () => {
  const escaped = runObfuscatePipeline(`
local t = { x = 1 }
function t:aim() return self.x end
consume(t)
print(t:aim())
`, { ...BASE, preserveGlobals: false });
  expect(escaped).toContain(":aim");

  const dynamic = runObfuscatePipeline(`
local t = { x = 1 }
function t:aim() return self.x end
print(t["aim"]())
`, { ...BASE, preserveGlobals: false });
  expect(dynamic).toMatch(/:aim\(/);
  expect(dynamic).toContain('["aim"]');
});

t("does not let an unrelated local receiver with the same method name veto renames", () => {
  const code = runObfuscatePipeline(`
local notification = {}
function notification:update() return "n" end
local indicatorClass = { update = function(self) return "i" end }
print(notification:update(), indicatorClass:update())
`, { ...BASE, preserveGlobals: false });
  expect(code).toMatch(/:_0x[0-9a-f]+\(\)/);
  expect(code).toContain(":update()");
  const r = runLuau(code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("n\ti\n");
});

t("keeps methods when the table can reach an unresolved alias parameter", () => {
  const code = runObfuscatePipeline(`
local t = { x = 7 }
function t:aim() return self.x end
local function call(other) return other:aim() end
print(call(t))
`, { ...BASE, preserveGlobals: false });
  expect(code).toContain(":aim()");
  const r = runLuau(code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("7\n");
});

t("renames methods inside the Turbo prefix", () => {
  const warnings = [];
  const code = runObfuscatePipeline(`
--@quantum:turbo
local function paint()
  local t = { x = 7 }
  function t:get_position() return self.x end
  function t:aim() return t:get_position() end
  print(t:aim())
end
paint()
`, {
    ...BASE,
    vmType: "register",
    vmLevel: "max",
    onWarning: (m) => warnings.push(m),
  });
  expect(warnings).toEqual([]);
  expect(code).not.toContain(":aim");
  expect(code).not.toContain(":get_position");
  expect(code).toMatch(/:_0x[0-9a-f]+\(/);
  const r = runLuau(code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("7\n");
});


