// v3.2.0 loader resilience: every payload-load site in the envelope wrappers
// goes through a pcall guard that converts loader rejections (executor parser
// limits, corrupted payload) into ONE deterministic clean error instead of an
// `attempt to call a nil value` traceback into generated code; and
// wrapNestedVM passes through inputs over its loader-safety size limit.
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const HAS_LUAU = existsSync(LUAU);
const HAS_PUC = existsSync(LUA54);
const SHIM = HAS_PUC ? readFileSync(join(ROOT, "tests", "helpers", "lua54-compat.lua"), "utf8") : "";

const { wrapCustomCipher, wrapNestedVM, wrapStubVM } = await import("../dist/vm/vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "payload-guard-"));
const QUIET = "Quantum: payload load failed";
const quiet = (fn) => { const o = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = o; } };

function runLua(exe, code, shim) {
  const path = join(TMP, `${Math.floor(Math.random() * 1e9)}.lua`);
  writeFileSync(path, (shim ? SHIM + "\n" : "") + code);
  const r = spawnSync(exe, [path], { encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").slice(0, 500) };
}

// Corrupt the payload byte stream at a position that provably feeds the
// decoded prefix-length byte's neighbor (offset 1 of the FIRST concatenated
// fragment): for the pinned seed this deterministically breaks the decrypt
// result so the payload fails to load, which is exactly the condition the
// guard must convert into a clean error. Frag fragments appear either as a
// `a..b..c` chain or as an indexed table — resolve whichever this seed used.
function corruptFirstPayloadChar(art) {
  let decl;
  const chain = art.split("\n").find((l) => /local \w+=\w+\.\.\w+/.test(l));
  if (chain) {
    const first = /local \w+=(\w+)\.\./.exec(chain)[1];
    decl = new RegExp(`local ${first}=\\[\\[`).exec(art);
  } else {
    decl = /\w+\[1\]=\[\[/.exec(art);
  }
  expect(decl).not.toBeNull();
  const start = decl.index + decl[0].length;
  const c = art[start + 1];
  const repl = c === "A" ? "B" : "A";
  return art.slice(0, start + 1) + repl + art.slice(start + 2);
}

describe("payload load guards (all wrap layers)", () => {
  test("every seed's wrap layer emits the pcall guard", () => {
    const src = "print('GUARD_OK')";
    for (let seed = 1; seed <= 24; seed++) {
      for (const wrap of [wrapCustomCipher, wrapNestedVM]) {
        const art = quiet(() => wrap(src, seed));
        expect(art).toContain(`pcall(`);
        expect(art).toContain(QUIET);
      }
    }
  }, 60000);

  test("guarded wrappers execute cleanly (Luau + PUC)", () => {
    const src = "print('GUARD_OK')";
    for (const exe of [HAS_LUAU ? LUAU : null, HAS_PUC ? LUA54 : null].filter(Boolean)) {
      for (const wrap of [wrapCustomCipher, wrapNestedVM]) {
        for (const seed of [7, 8, 9]) {
          const art = quiet(() => wrap(src, seed));
          const r = runLua(exe, art, exe === LUA54);
          expect(r.status).toBe(0);
          expect(r.stderr).toBe("");
          expect(r.stdout).toBe("GUARD_OK");
        }
      }
    }
  }, 120000);

  test("corrupted payload reports the clean Quantum error, not a nil-call traceback", () => {
    const art = quiet(() => wrapCustomCipher("print('GUARD_OK')", 424242));
    const broken = corruptFirstPayloadChar(art);
    expect(broken).not.toBe(art);
    for (const exe of [HAS_LUAU ? LUAU : null, HAS_PUC ? LUA54 : null].filter(Boolean)) {
      const r = runLua(exe, broken, exe === LUA54);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain(QUIET);
      expect(r.stderr).not.toContain("attempt to call a nil value");
      expect(r.stdout).toBe("");
    }
  }, 60000);

  test("unloadable (malformed) payload gives the same clean error on both runtimes", () => {
    const art = quiet(() => wrapCustomCipher("print('GUARD_OK'", 555));
    expect(art).toContain(QUIET);
    for (const exe of [HAS_LUAU ? LUAU : null, HAS_PUC ? LUA54 : null].filter(Boolean)) {
      const r = runLua(exe, art, exe === LUA54);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain(QUIET);
      expect(r.stderr).not.toContain("attempt to call a nil value");
      expect(r.stdout).toBe("");
    }
  }, 60000);
});

describe("stub layer guard", () => {
  const t = HAS_LUAU ? test : test.skip;

  t("stub artifact carries the same guard and executes", () => {
    const src = "print('GUARD_OK')";
    const art = quiet(() => wrapStubVM(src, 1234));
    expect(art).toContain(QUIET);
    const r = runLua(LUAU, art, false);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe("GUARD_OK");
  }, 60000);
});

describe("wrapNestedVM loader-safety size guard", () => {
  test("sources over 1.5M chars pass through unwrapped + warn", () => {
    const big = "x".repeat(1_500_001);
    const warns = [];
    const ow = console.warn;
    console.warn = (...a) => warns.push(a.join(" "));
    let out;
    try {
      out = wrapNestedVM(big, 42);
    } finally {
      console.warn = ow;
    }
    expect(out).toBe(big);
    expect(warns.some((w) => w.includes("loader-safety guard"))).toBe(true);
  }, 60000);

  test("sources at or under the limit still get wrapped", () => {
    const src = "print(1)";
    const art = quiet(() => wrapNestedVM(src, 42));
    expect(art).not.toBe(src);
    expect(art).toContain(QUIET);
  }, 60000);
});
