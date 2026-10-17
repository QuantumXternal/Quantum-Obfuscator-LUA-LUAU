// Phase 4.3 dual-VM nesting: a register-VM artifact produced by the
// pipeline (seed-derived RK_OFFSET, computed-index K layout) must survive
// the outer custom-cipher wrapper layers and still print exactly what its
// source prints, on both hosts. Defect pinned: pipeline artifacts died with
// "attempt to perform arithmetic on nil" because constRK encoded constants
// with the hardcoded default offset (2049) while the runtime threshold was
// the threaded per-build offset. Pure inner generation with default options
// passes regardless, so only the pipeline + wrap path observes it.
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

const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");
const { wrapCustomCipher, wrapNestedVM, wrapStubVM } = await import("../dist/vm/vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "dualvm-"));
const SHIMTEXT = HAS_RT ? readFileSync(SHIM, "utf8") : "";
const quiet = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
const SRC = "local x = 1 + 2 print(x)";
const OPTS = { renameLocals: false, preserveGlobals: true, encodeStrings: false, scramble: false, oneLine: false, vmType: "register", vmLevel: "max" };
const SEEDS = [1234, 2024];
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
for (const seed of SEEDS) {
  t(`pipeline reg artifact seed ${seed} executes correctly on Luau+PUC`, () => {
    const out = quiet(() => runObfuscatePipeline(SRC, { ...OPTS, polymorphicSeed: seed }));
    expect3(`plain-${seed}`, out);
  }, 180000);
  t(`outer-cipher wrapped reg artifact seed ${seed} executes correctly on Luau+PUC`, () => {
    const inner = quiet(() => runObfuscatePipeline(SRC, { ...OPTS, polymorphicSeed: seed }));
    const wrapped = quiet(() => wrapCustomCipher(inner));
    expect3(`wrapped-${seed}`, wrapped);
  }, 180000);
}
t("triple-stacked wrapper layers execute correctly on Luau+PUC", () => {
  const inner = quiet(() => runObfuscatePipeline(SRC, { ...OPTS, polymorphicSeed: 1234 }));
  const stacked = quiet(() => wrapStubVM(wrapNestedVM(wrapCustomCipher(inner))));
  expect3("stack3", stacked);
}, 180000);
