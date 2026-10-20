import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FIXTURE = join(__dirname, "fixtures", "large-ui-turbo.lua");
const MOCK = join(__dirname, "helpers", "roblox-mock.lua");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const HAS_LUAU = existsSync(LUAU);
const HAS_PUC = existsSync(LUA54);
const t = HAS_LUAU || HAS_PUC ? test : test.skip;

const { resolveProfile } = await import("../dist/engine/profiles.js");
const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");
const { scanFunctionMacros } = await import("../dist/engine/macros.js");
const { WATERMARK_LINE } = await import("../dist/vm/watermark.js");

const TMP = mkdtempSync(join(tmpdir(), "native-turbo-hardening-"));
const source = readFileSync(FIXTURE, "utf8");
const mock = readFileSync(MOCK, "utf8");
let counter = 0;

const profile = {
  ...resolveProfile({ profile: "MAXIMUM", seed: 10001, target: "generic" }),
  oneLine: true,
};

function generate() {
  const warnings = [];
  const artifact = runObfuscatePipeline(source, {
    ...profile,
    onWarning: (message) => warnings.push(message),
  });
  return { artifact, warnings };
}

function run(exe, artifact) {
  const file = join(TMP, `a11-${process.pid}-${counter++}.lua`);
  writeFileSync(file, `${mock}\n${artifact}`, "utf8");
  const result = spawnSync(exe, [file], {
    encoding: "utf8",
    timeout: 240000,
    maxBuffer: 32 * 1024 * 1024,
  });
  rmSync(file, { force: true });
  return {
    status: result.status,
    stdout: (result.stdout || "").replace(/\r\n/g, "\n"),
    stderr: (result.stderr || "").replace(/\r\n/g, "\n"),
  };
}

test("fixture exposes 24 Turbo and 2 Maximum entry points", () => {
  const fixtureLines = source.trimEnd().split(/\r?\n/).length;
  expect(fixtureLines).toBeGreaterThanOrEqual(1200);
  expect(fixtureLines).toBeLessThanOrEqual(1500);
  const scan = scanFunctionMacros(source);
  expect(scan.warnings).toEqual([]);
  expect(scan.turbos).toHaveLength(24);
  expect(scan.maximums).toHaveLength(2);
});

test("MAXIMUM artifact hardens native Turbo and stays within line budget", () => {
  const { artifact, warnings } = generate();
  expect(warnings).toEqual([]);
  expect(artifact.split("\n")[0]).toBe(WATERMARK_LINE);
  expect(artifact).not.toContain("@quantum");

  const lines = artifact.split("\n");
  let max = 0;
  for (const line of lines) max = Math.max(max, Buffer.byteLength(line, "utf8"));
  expect(max).toBeLessThanOrEqual(9609);

  const vmStart = artifact.indexOf("return(function(");
  expect(vmStart).toBeGreaterThan(0);
  const native = artifact.slice(0, vmStart);
  for (const token of [
    "Instance.new",
    "UDim2.new",
    "game:GetService",
    "TweenService",
    "UserInputService",
    "Players.LocalPlayer",
    "workspace",
    "task.delay",
    "Color3.fromRGB",
    "Enum.",
    '"Frame"',
    "'Frame'",
  ]) {
    expect(native).not.toContain(token);
  }
  expect(native).toContain("while true do");
  expect(native).toContain("os.clock()");
  expect(native).toContain("pcall(getfenv,0)");
  expect((native.match(/__qmv_/g) || []).length).toBeGreaterThanOrEqual(24);
});

t("A11 runs on plain PUC Lua 5.4 without getgenv or the compat shim", () => {
  if (!HAS_PUC) return;
  const { artifact } = generate();
  const result = run(LUA54, artifact);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("A11_READY");
  expect(result.stdout).toContain("QuantumRoot");
  expect(result.stdout).toContain("config\ttrue\tok");
  expect(result.stdout).toContain("contrast\t30");
}, 300000);

t("A11 runs on Luau", () => {
  if (!HAS_LUAU) return;
  const { artifact } = generate();
  const result = run(LUAU, artifact);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("A11_READY");
  expect(result.stdout).toContain("QuantumRoot");
  expect(result.stdout).toContain("config\ttrue\tok");
  expect(result.stdout).toContain("contrast\t30");
}, 300000);
