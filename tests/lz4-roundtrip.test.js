// v3.2.0 LZ4 payload pipeline: the reg-path blob is LZ4-compressed before
// encryption, decoded to compLen bytes, inflated by the bootstrap's pure-Luau
// unlz4 (bounded by the original length), and only then checksum-verified.
// Contract: every fixture executes byte-exactly on Luau + PUC; corrupted or
// truncated blob data still produces the single clean "Quantum Protection V2"
// error (never a nil-call traceback into generated code).
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { randomBytes } from "crypto";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const HAS_LUAU = existsSync(LUAU);
const HAS_PUC = existsSync(LUA54);
const SHIM = HAS_PUC ? readFileSync(join(ROOT, "tests", "helpers", "lua54-compat.lua"), "utf8") : "";

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");
const { lz4Compress } = await import("../dist/vm/lzma.js");

const TMP = mkdtempSync(join(tmpdir(), "lz4-roundtrip-"));
const CLEAN = "Quantum Protection V2";

function quiet(fn) {
  const ol = console.log;
  const ow = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = ol;
    console.warn = ow;
  }
}

function runLua(exe, code, shim) {
  const path = join(TMP, `${Math.floor(Math.random() * 1e9)}.lua`);
  writeFileSync(path, (shim ? SHIM + "\n" : "") + code);
  const r = spawnSync(exe, [path], { encoding: "utf8", timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").slice(0, 900) };
}

function buildReg(src, seed = 1234, level = "normal") {
  const base = regCompile(parse(lex(src).tokens));
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  return quiet(() => generateRegVM(cl(base), { level, polymorphicSeed: seed }));
}

// Deterministic pseudo-random literal (safe subset) so the payload is
// effectively incompressible and the literal-only decode path runs.
const RAND_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
let rngState = 0xC0FFEE01;
const randByte = () => {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return RAND_CHARS[rngState % RAND_CHARS.length];
};
const RANDOM_STR = Array.from({ length: 30000 }, randByte).join("");

const FIXTURES = [
  { name: "tiny", src: "print('LZ4_OK')", expected: "LZ4_OK" },
  { name: "match-heavy RLE", src: "local s=('AB'):rep(2000) print(#s)", expected: "4000" },
  { name: "long overlapping match", src: "local s=('pattern-'):rep(8000) print(#s)", expected: "64000" },
  { name: "random incompressible literal", src: `local s="${RANDOM_STR}" print(#s)`, expected: String(RANDOM_STR.length) },
];

describe("lz4 codec (unit)", () => {
  test("empty input yields a single literal-only token", () => {
    expect(Array.from(lz4Compress(new Uint8Array(0)))).toEqual([0]);
  });

  test("highly repetitive input compresses far below 1/4", () => {
    const data = new Uint8Array(40000).fill(65);
    const comp = lz4Compress(data);
    expect(comp.length).toBeLessThan(data.length / 4);
  });

  test("incompressible input stays close to the source size", () => {
    const data = new Uint8Array(randomBytes(30000));
    const comp = lz4Compress(data);
    expect(comp.length).toBeGreaterThan(data.length - 64);
    expect(comp.length).toBeLessThan(data.length + data.length / 64 + 64);
  });

  test("compression is deterministic", () => {
    const data = Uint8Array.from(RANDOM_STR, (c) => c.charCodeAt(0));
    expect(Array.from(lz4Compress(data))).toEqual(Array.from(lz4Compress(data)));
  });
});

describe("reg-path LZ4 payload roundtrip", () => {
  for (const fixture of FIXTURES) {
    const t = HAS_LUAU || HAS_PUC ? test : test.skip;
    t(`executes on Luau + PUC: ${fixture.name}`, () => {
      const art = buildReg(fixture.src);
      expect(art).toContain(CLEAN);
      for (const [exe, shim] of [
        [HAS_LUAU ? LUAU : null, false],
        [HAS_PUC ? LUA54 : null, true],
      ]) {
        if (!exe) continue;
        const r = runLua(exe, art, shim);
        expect(r.status).toBe(0);
        expect(r.stderr).toBe("");
        expect(r.stdout).toBe(fixture.expected);
      }
    }, 180000);
  }
});

describe("reg-path LZ4 payload corruption", () => {
  // The FIRST long bracket in a reg artifact is the watermark banner; the
  // blob itself is the LAST long-bracket region (single literal or the final
  // piece of the concat table), so corrupt a char inside that region.
  function corruptBlobChar(art) {
    const re = /\[(=*)\[/g;
    let m = null;
    let last = null;
    while ((m = re.exec(art)) !== null) last = m;
    expect(last).not.toBeNull();
    const pos = last.index + last[0].length + 10;
    const c = art[pos];
    const repl = c === "A" ? "B" : "A";
    return art.slice(0, pos) + repl + art.slice(pos + 1);
  }

  const t = HAS_LUAU || HAS_PUC ? test : test.skip;

  t("corrupted blob reports the clean Quantum error, never a nil-call traceback", () => {
    const art = buildReg("print('LZ4_OK')", 424242);
    const broken = corruptBlobChar(art);
    expect(broken).not.toBe(art);
    for (const [exe, shim] of [
      [HAS_LUAU ? LUAU : null, false],
      [HAS_PUC ? LUA54 : null, true],
    ]) {
      if (!exe) continue;
      const r = runLua(exe, broken, shim);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain(CLEAN);
      expect(r.stderr).not.toContain("attempt to call a nil value");
      expect(r.stdout).toBe("");
    }
  }, 180000);

  t("truncated blob never executes or prints", () => {
    const art = buildReg("print('LZ4_OK')", 555);
    const truncated = art.slice(0, art.lastIndexOf("]") - 600);
    for (const [exe, shim] of [
      [HAS_LUAU ? LUAU : null, false],
      [HAS_PUC ? LUA54 : null, true],
    ]) {
      if (!exe) continue;
      const r = runLua(exe, truncated, shim);
      expect(r.status).not.toBe(0);
      expect(r.stdout).toBe("");
    }
  }, 180000);
});
