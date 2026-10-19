// CFF coroutine/yield regression: the scrambled state machine must advance
// `_st` after a yield, so resuming a function continues after the yield
// instead of re-running its body from the top.
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
  const f = join(tmpdir(), `cff-yield-${process.pid}-${counter++}.luau`);
  writeFileSync(f, code, "utf8");
  const r = spawnSync(LUAU, [f], { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  rmSync(f, { force: true });
  if (r.stdout) r.stdout = r.stdout.replace(/\r\n/g, "\n");
  if (r.stderr) r.stderr = r.stderr.replace(/\r\n/g, "\n");
  return r;
}

const BASE = {
  renameLocals: false,
  preserveGlobals: true,
  encodeStrings: false,
  scramble: true,
  oneLine: false,
  vmType: "none",
  vmLevel: "normal",
  seed: 1234,
};

t("scrambled yielded function resumes without re-running its body", () => {
  const code = `
local log = {}
local function worker()
  log[#log + 1] = "start"
  coroutine.yield("first")
  log[#log + 1] = "resumed"
  coroutine.yield("second")
  log[#log + 1] = "end"
end
local co = coroutine.create(worker)
print(coroutine.resume(co))
print(coroutine.resume(co))
print(coroutine.resume(co))
print(table.concat(log, ","))
`;
  const out = runObfuscatePipeline(code, { ...BASE });
  expect(out).toMatch(/_st\d+ = 1/);
  const r = runLuau(out);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe(
    "true\tfirst\n" +
      "true\tsecond\n" +
      "true\n" +
      "start,resumed,end\n",
  );
});

t("scrambled function called twice keeps independent state", () => {
  const code = `
local log = {}
local function worker(tag)
  log[#log + 1] = tag .. "1"
  coroutine.yield(tag)
  log[#log + 1] = tag .. "2"
  return tag
end
local a = coroutine.wrap(worker)
local b = coroutine.wrap(worker)
print(a("a"))
print(a("a"))
print(b("b"))
print(b("b"))
print(table.concat(log, ","))
`;
  const out = runObfuscatePipeline(code, { ...BASE });
  const r = runLuau(out);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("a\na\nb\nb\na1,a2,b1,b2\n");
});
