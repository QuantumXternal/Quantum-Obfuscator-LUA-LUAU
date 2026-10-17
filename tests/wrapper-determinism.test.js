// Phase 5 / Step 1: explicit wrapper seeding. wrapCustomCipher, wrapNestedVM
// and wrapStubVM accept an optional seed (number => seedRandom, string =>
// seedRandom128) and reset the shared name counter, so output is
// byte-reproducible across calls for a fixed seed. Absent seed => unchanged
// legacy behavior (ambient stream). Runs the seeded output on both hosts;
// PUC needs tests/helpers/lua54-compat.lua. Skipped gracefully without binaries.
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const SHIM = join(ROOT, "tests", "helpers", "lua54-compat.lua");
const HAS_RT = existsSync(LUAU) && existsSync(LUA54) && existsSync(SHIM);
const t = HAS_RT ? test : test.skip;

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");
const {
  wrapCustomCipher, wrapNestedVM, wrapStubVM, seedRandom, seedRandom128,
} = await import("../dist/vm/vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "wrap-det-"));
const SHIMTEXT = HAS_RT ? readFileSync(SHIM, "utf8") : "";
const quiet = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
const SRC = "local x = 1 + 2 print(x)";
const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });

const INNER = HAS_RT
  ? quiet(() => generateRegVM(cl(regCompile(parse(lex(SRC).tokens))), { level: "normal", polymorphicSeed: 42 }))
  : "";

function runRT(exe, file) {
  const r = spawnSync(exe, [file], { timeout: 60000, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "").replace(/\r\n/g, "\n"), timeout: !!r.error };
}
function expect3(label, code) {
  const f = join(TMP, label + ".lua");
  writeFileSync(f, code);
  writeFileSync(f + ".shim", SHIMTEXT + "\n" + code);
  const rl = runRT(LUAU, f);
  const rp = runRT(LUA54, f + ".shim");
  expect(rl.timeout).toBe(false);
  expect(rp.timeout).toBe(false);
  expect(rl.code).toBe(0);
  expect(rp.code).toBe(0);
  expect(rl.out.trim()).toBe("3");
  expect(rp.out.trim()).toBe("3");
}

test("seedRandom / seedRandom128 are exported API", () => {
  expect(typeof seedRandom).toBe("function");
  expect(typeof seedRandom128).toBe("function");
});

t("wrapCustomCipher numeric seed: byte-identical across three calls", () => {
  const a = quiet(() => wrapCustomCipher(INNER, 1234));
  const b = quiet(() => wrapCustomCipher(INNER, 1234));
  const c = quiet(() => wrapCustomCipher(INNER, 1234));
  expect(a).toBe(b);
  expect(b).toBe(c);
});

t("wrapCustomCipher string seed: byte-identical and distinct from numeric seed", () => {
  const a = quiet(() => wrapCustomCipher(INNER, "release-v1"));
  const b = quiet(() => wrapCustomCipher(INNER, "release-v1"));
  const c = quiet(() => wrapCustomCipher(INNER, 1234));
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

t("wrapNestedVM and wrapStubVM: same seed => byte-identical, different seed => distinct", () => {
  const n1 = quiet(() => wrapNestedVM(INNER, 2024));
  const n2 = quiet(() => wrapNestedVM(INNER, 2024));
  const n3 = quiet(() => wrapNestedVM(INNER, 2025));
  expect(n1).toBe(n2);
  expect(n1).not.toBe(n3);
  const s1 = quiet(() => wrapStubVM(INNER, "alpha"));
  const s2 = quiet(() => wrapStubVM(INNER, "alpha"));
  const s3 = quiet(() => wrapStubVM(INNER, "beta"));
  expect(s1).toBe(s2);
  expect(s1).not.toBe(s3);
});

t("no-seed calls keep legacy behavior (functional, not pinned)", () => {
  const a = quiet(() => wrapCustomCipher(INNER));
  const b = quiet(() => wrapCustomCipher(INNER));
  expect(a.length).toBeGreaterThan(0);
  expect(b.length).toBeGreaterThan(0);
  expect3("nonseed", a);
}, 180000);

t("seeded wrapper chain executes correctly on Luau+PUC", () => {
  const inner = quiet(() => wrapCustomCipher(INNER, 777));
  const chained = quiet(() => wrapStubVM(wrapNestedVM(inner, 888), 999));
  expect3("seeded-chain", chained);
}, 180000);
