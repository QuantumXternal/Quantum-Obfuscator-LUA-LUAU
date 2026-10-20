// nativeErrorSkip: engine-environment errors crossing the VM boundary
// ("OnClientInvoke ..." / "Unable to cast ...") are swallowed in non-debug
// builds so a blocked engine call cannot abort the whole script. Ordinary
// errors must still propagate. The CLOSURE wrapper must preserve returns and
// varargs while guarding host-invoked callbacks.
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
const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

let counter = 0;
function runLuau(code) {
  const f = join(tmpdir(), `native-error-skip-${process.pid}-${counter++}.luau`);
  writeFileSync(f, code, "utf8");
  const r = spawnSync(LUAU, [f], { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  rmSync(f, { force: true });
  if (r.stdout) r.stdout = r.stdout.replace(/\r\n/g, "\n");
  if (r.stderr) r.stderr = r.stderr.replace(/\r\n/g, "\n");
  return r;
}

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

function gen(src, extra = {}) {
  const out = console.log;
  console.log = () => {};
  try {
    return runObfuscatePipeline(src, { ...BASE, ...extra });
  } finally {
    console.log = out;
  }
}

t("OnClientInvoke errors are skipped and execution continues", () => {
  const src =
    'local api = {}\n' +
    'function api:boom() error("OnClientInvoke: blocked by executor") end\n' +
    'api:boom()\n' +
    'print("after-onclient")\n';
  const r = runLuau(gen(src));
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
  expect(r.stdout).toBe("after-onclient\n");
});

t("Unable to cast errors are skipped and execution continues", () => {
  const src =
    'local api = {}\n' +
    'function api:cast() error("Unable to cast value to Object") end\n' +
    'api:cast()\n' +
    'print("after-cast")\n';
  const r = runLuau(gen(src));
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
  expect(r.stdout).toBe("after-cast\n");
});

t("ordinary errors still abort the VM", () => {
  const src =
    'local api = {}\n' +
    'function api:bad() error("genuine-bug-xyz") end\n' +
    'api:bad()\n' +
    'print("should-not-print")\n';
  const r = runLuau(gen(src));
  expect(r.status).not.toBe(0);
  expect(r.stdout).not.toContain("should-not-print");
  expect(r.stdout + r.stderr).toContain("genuine-bug-xyz");
});

t("guarded closures preserve returns and varargs", () => {
  const src =
    'local function add(a, b) return a + b, "ok" end\n' +
    'local co = coroutine.create(add)\n' +
    'local ok, sum, tag = coroutine.resume(co, 2, 3)\n' +
    'print(ok, sum, tag)\n';
  const r = runLuau(gen(src));
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
  expect(r.stdout).toBe("true\t5\tok\n");
});

t("debug builds keep the original error behavior (no skip guard)", () => {
  const src = 'print("debug-probe")\n';
  const out = gen(src, { vmLevel: "debug" });
  expect(out).not.toContain("Unable to cast");
});

t("plaintext runtime contains the skip guard and sanitized decoders", () => {
  const src = 'print("guard-probe")\n';
  const prev = process.env.NO_CIPHER;
  process.env.NO_CIPHER = "1";
  let raw;
  try {
    const chunk = regCompile(parse(lex(src).tokens), {});
    raw = generateRegVM(chunk, {
      level: "max",
      polymorphicSeed: 4242,
      disableFeatures: ["stringEncoding"],
    });
  } finally {
    if (prev === undefined) delete process.env.NO_CIPHER;
    else process.env.NO_CIPHER = prev;
  }
  expect(raw).toContain("OnClientInvoke");
  expect(raw).toContain("Unable to cast");
  expect(raw).toContain("string.char(math.floor(tonumber(");
});
