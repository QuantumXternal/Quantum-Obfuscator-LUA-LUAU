// Reg-VM yield heartbeat: yields are counted by retired instructions, not by
// the opcode index, and are pcall-guarded. The opcode index is a logical PC
// that starts at 1 and jumps backward in loops, so the old `ip%N<4` check
// yielded once per VM function call and crashed non-yieldable threads
// (RenderStepped callbacks, engine metamethods) with
// "thread is not yieldable". This suite pins both properties:
//   - a hostile task.wait that always raises must not break execution;
//   - the heartbeat is periodic in executed instructions (zero for short
//     scripts, >=1 for a long loop), never per call.
// PUC needs tests/helpers/lua54-compat.lua. Skipped gracefully without it.
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const SHIM = join(ROOT, "tests", "helpers", "lua54-compat.lua");
const HAS_RT = existsSync(LUA54) && existsSync(SHIM);
const t = HAS_RT ? test : test.skip;

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "vm-heartbeat-"));
const SHIMTEXT = HAS_RT ? readFileSync(SHIM, "utf8") : "";
let counter = 0;

const quiet = (fn) => {
  const o = console.log;
  const w = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try { return fn(); } finally { console.log = o; console.warn = w; }
};

function gen(src, seed) {
  return quiet(() => {
    const base = regCompile(parse(lex(src).tokens));
    const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
    return generateRegVM(cl(base), { level: "max", polymorphicSeed: seed });
  });
}

function runLua(chunk) {
  const f = join(TMP, `hb-${process.pid}-${counter++}.lua`);
  writeFileSync(f, chunk, "utf8");
  const r = spawnSync(LUA54, [f], { encoding: "utf8", timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  return {
    code: r.status,
    out: (r.stdout || "").replace(/\r\n/g, "\n"),
    err: (r.stderr || "").replace(/\r\n/g, "\n"),
    timeout: !!r.error,
  };
}

function probe(art, prelude = "") {
  return SHIMTEXT + "\n" + prelude + "\n" + art + "\n";
}

// Artifacts end with a top-level return, so counted probes wrap the artifact
// in a vararg function (the bootstrap forwards `...` to the payload) and
// print after it returns.
function wrapProbe(art, prelude, suffix) {
  return SHIMTEXT + "\n" + prelude +
    "\nlocal __ok, __e = pcall(function(...)\n" + art + "\nend)\n" +
    suffix + "\nif not __ok then error(__e) end\n";
}

const COUNTED =
  "local function f(n) return n + 1 end\n" +
  "local s = 0\n" +
  "for i = 1, 100 do s = f(s) end\n" +
  "print(\"sum\", s)\n";

const EXPECTED = "sum\t100\n";

t("hostile non-yieldable task.wait does not break VM execution", () => {
  const art = gen(COUNTED, 1234);
  const r = runLua(probe(
    art,
    "task = { wait = function() error(\"thread is not yieldable\", 0) end }",
  ));
  expect(r.timeout).toBe(false);
  expect(r.code).toBe(0);
  expect(r.out).toBe(EXPECTED);
});

t("heartbeat does not yield once per VM function call", () => {
  const art = gen(COUNTED, 1234);
  const r = runLua(wrapProbe(
    art,
    "local __hb = 0\ntask = { wait = function() __hb = __hb + 1 end }",
    "print(\"HB\", __hb)",
  ));
  expect(r.timeout).toBe(false);
  expect(r.code).toBe(0);
  expect(r.out.startsWith(EXPECTED)).toBe(true);
  const m = /HB\t(\d+)/.exec(r.out);
  expect(m).not.toBeNull();
  expect(Number(m[1])).toBe(0);
});

t("large string constants decode intact", () => {
  const big = "A".repeat(8191) + "Z";
  const src =
    'local s = "' + big + '"\n' +
    'print("len", #s, s:sub(1, 1), s:sub(-1))\n';
  const art = gen(src, 9090);
  const r = runLua(art);
  expect(r.code).toBe(0);
  expect(r.err).toBe("");
  expect(r.out).toBe("len\t8192\tA\tZ\n");
});

t("heartbeat still yields periodically in long-running code", () => {
  const src =
    "local s = 0\n" +
    "for i = 1, 120000 do s = (s + i) % 7 end\n" +
    "print(\"w\", s)\n";
  const want = runLua(SHIMTEXT + "\n" + src);
  expect(want.code).toBe(0);
  const art = gen(src, 2024);
  const r = runLua(wrapProbe(
    art,
    "local __hb = 0\ntask = { wait = function() __hb = __hb + 1 end }",
    "print(\"HB\", __hb)",
  ));
  expect(r.timeout).toBe(false);
  expect(r.code).toBe(0);
  expect(r.out.startsWith(want.out)).toBe(true);
  const m = /HB\t(\d+)/.exec(r.out);
  expect(m).not.toBeNull();
  const n = Number(m[1]);
  expect(n).toBeGreaterThanOrEqual(1);
  expect(n).toBeLessThan(200);
});
