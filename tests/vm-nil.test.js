// Generated stack/register VM parity for UNM/LEN on nil.
import { spawnSync } from "child_process";
import { existsSync, writeFileSync, rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const HAS_LUAU = existsSync(LUAU);

const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");

const t = HAS_LUAU ? test : test.skip;
const BASE = {
  renameLocals: false,
  preserveGlobals: true,
  encodeStrings: false,
  scramble: false,
  oneLine: false,
  vmLevel: "normal",
  polymorphicSeed: 777,
};

let artifactCounter = 0;
function runLuau(code) {
  const file = join(tmpdir(), `vm-nil-test-${process.pid}-${artifactCounter++}.luau`);
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

const SRC = `local value
local ok1, err1 = pcall(function() return -value end)
local ok2, err2 = pcall(function() return #value end)
print(ok1, tostring(err1):find("nil") ~= nil, ok2, tostring(err2):find("nil") ~= nil)
`;

for (const vmType of ["stack", "register"]) {
  t(`${vmType} VM raises protected errors for -nil and #nil`, () => {
    const out = runObfuscatePipeline(SRC, { ...BASE, vmType });
    const result = runLuau(out);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split(/\s+/)).toEqual(["false", "true", "false", "true"]);
  }, 180000);
}
