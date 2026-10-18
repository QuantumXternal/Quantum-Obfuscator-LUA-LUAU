// v3.2.0 loader-compat: physical line bounds for BOTH layers of the shipped
// artifact:
//   (1) the artifact text itself (envelope pieces + flattening) — limits unit
//       tests in large-input.test.js cover splitLongLiteral/joinBounded;
//   (2) the DECRYPTED VM runtime the executor loadstrings at boot — bound by
//       boundCommaSeparatedLine (comma-boundary wraps) and luaQuotedFromBytes
//       (byte-atomic chunking of giant string literals).
// Integration fixtures are sized to previously produce > MAX_OUTPUT_LINE_BYTES
// inner lines (giant string constant + 3k-entry number table).
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

const { MAX_OUTPUT_LINE_BYTES, luaQuotedFromBytes, boundCommaSeparatedLine } = await import("../dist/vm/limits.js");
const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");
const { adaptRkOffset } = await import("../dist/vm/reg-offset.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "linewidth-"));
const quiet = (fn) => { const o = console.log; const w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = o; console.warn = w; } };

// Legacy emitter mapping (pre-chunking), replicated verbatim for identity tests.
function legacyEscUnit(b) {
  if (b === 34) return '\\"';
  if (b === 92) return "\\\\";
  if (b === 10) return "\\n";
  if (b === 13) return "\\r";
  if (b === 0) return "\\000";
  if (b < 32 || b > 126) return `\\${b.toString().padStart(3, "0")}`;
  return String.fromCharCode(b);
}

describe("luaQuotedFromBytes", () => {
  test("short sequences are byte-identical to the legacy emitter", () => {
    for (const s of ["", "abc", "quote\" back\\slash", "nl\ncr\r nul\0", "high\u00ff\u20ac", "comma,comma"]) {
      const bytes = Array.from(Buffer.from(s, "utf8"));
      const legacy = '"' + bytes.map(legacyEscUnit).join("") + '"';
      expect(luaQuotedFromBytes(bytes)).toBe(legacy);
    }
  });

  test("full byte sweep matches the legacy mapping", () => {
    const all = Array.from({ length: 256 }, (_, i) => i);
    const legacy = '"' + all.map(legacyEscUnit).join("") + '"';
    expect(luaQuotedFromBytes(all)).toBe(legacy);
  });

  test("giant sequences chunk into bounded literals that concat back to the source", async () => {
    const bytes = Array.from({ length: 40000 }, (_, i) => i % 256);
    const lit = luaQuotedFromBytes(bytes);
    const pieces = lit.split('"..\n"');
    expect(pieces.length).toBeGreaterThan(1);
    expect(Math.max(...lit.split("\n").map((l) => l.length))).toBeLessThanOrEqual(MAX_OUTPUT_LINE_BYTES);
    // Reconstruct each piece's byte stream through the escape grammar and
    // verify the union is byte-identical to the input.
    const left = lit.slice(0);
    const out = [];
    for (const raw of pieces) {
      const p = raw.replace(/^"/, "").replace(/"$/, "");
      for (let i = 0; i < p.length; i++) {
        if (p[i] !== "\\") {
          out.push(p.charCodeAt(i));
          continue;
        }
        const rest = p.slice(i + 1);
        const m = /^(\d{1,3})/.exec(rest);
        if (p[i + 1] === "\\") { out.push(92); i++; }
        else if (p[i + 1] === '"') { out.push(34); i++; }
        else if (p[i + 1] === "n") { out.push(10); i++; }
        else if (p[i + 1] === "r") { out.push(13); i++; }
        else {
          out.push(Number(m[1]) & 0xff);
          i += m[1].length;
        }
      }
    }
    expect(out).toEqual(bytes);
    void left;
  });
});

describe("boundCommaSeparatedLine", () => {
  test("short input is returned byte-identical (fast path)", () => {
    const code = ["local a = {1,2,3}", "local s = \"a,b\"", "print(a[1], s)"].join("\n");
    expect(boundCommaSeparatedLine(code)).toBe(code);
  });

  test("wraps a long number table at comma boundaries, losing nothing", () => {
    const nums = Array.from({ length: 20000 }, (_, i) => i % 1000).join(",");
    const line = `local t={${nums}}`;
    const out = boundCommaSeparatedLine(line);
    for (const l of out.split("\n")) expect(l.length).toBeLessThanOrEqual(MAX_OUTPUT_LINE_BYTES);
    expect(out.replace(/\n/g, "")).toBe(line);
  });

  test("never splits inside a quoted string (commas, escapes, escaped quotes)", () => {
    // ~5.6 KB of raw commas + an escaped quote + an escaped backslash inside
    // one literal, padded on both sides with split-friendly tables.
    const inside = 'x,"q\\\\z",'.repeat(400);
    const lit = '"' + inside.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    const full = `local t={${"7,".repeat(3000)}${lit},${"8,".repeat(3000)}9}`;
    const out = boundCommaSeparatedLine(full);
    for (const l of out.split("\n")) expect(l.length).toBeLessThanOrEqual(MAX_OUTPUT_LINE_BYTES);
    expect(out.replace(/\n/g, "")).toBe(full);
    // The literal (with its raw commas and escapes) survives on one line.
    expect(out.includes(lit)).toBe(true);
  });

  test("long-bracket strings and comments are not split points", () => {
    const bracket = `local s=[[${",a".repeat(8000)}]]`;
    const out = boundCommaSeparatedLine(bracket);
    expect(out).toBe(bracket);
    const commented = `local t={${"1,".repeat(8000)} } -- tail,comment ${"z".repeat(20000)}`;
    const out2 = boundCommaSeparatedLine(commented);
    for (const l of out2.split("\n")) expect(l.length).toBeLessThanOrEqual(MAX_OUTPUT_LINE_BYTES + 20000 + 20);
    expect(out2.replace(/\n/g, "")).toBe(commented);
  });

  test("idempotent", () => {
    const nums = Array.from({ length: 10000 }, (_, i) => i).join(",");
    const line = `local t={${nums}}`;
    const once = boundCommaSeparatedLine(line);
    expect(boundCommaSeparatedLine(once)).toBe(once);
  });
});

// Regression corpus: giant string constant + numeric table previously emitted
// as single multi-10KB inner lines. Two sizes:
//   heavy (4000/3000): width assertion only — this shape trips PRE-EXISTING
//     reg-VM runtime bugs independent of line wrapping (verified failing
//     identically on the v3.1.0 build), so it is not executed here;
//   moderate (400/250): executes on both runtimes (verified on v3.1.0).
function fixture(nseg, nnum) {
  const segs = Array.from({ length: nseg }, (_, i) => `seg${i},quote"back\\slash`).join("\n");
  const esc = segs.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const nums = Array.from({ length: nnum }, (_, i) => i + 1).join(",");
  return {
    src: [
      `local big = "${esc}"`,
      `local nums = {${nums}}`,
      "local s = 0",
      "for i = 1, #nums do s = s + nums[i] end",
      "print(#big, s)",
      "",
    ].join("\n"),
    expected: `${segs.length}\t${(nnum * (nnum + 1)) / 2}`,
  };
}
const HEAVY = fixture(4000, 3000);
const MODERATE = fixture(400, 250);

function runLua(exe, file, shim) {
  const path = join(TMP, `${Math.floor(Math.random() * 1e9)}.lua`);
  writeFileSync(path, (shim ? SHIM + "\n" : "") + readFileSync(file, "utf8"));
  const r = spawnSync(exe, [path], { encoding: "utf8", timeout: 120000, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").slice(0, 300) };
}

function regChunk(src, cipher) {
  const base = regCompile(parse(lex(src).tokens));
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const chunk = cl(base);
  const { rkOffset } = adaptRkOffset(chunk, 2049);
  const prev = process.env.NO_CIPHER;
  if (cipher) delete process.env.NO_CIPHER;
  else process.env.NO_CIPHER = "1";
  try {
    return quiet(() => generateRegVM(chunk, { level: "normal", polymorphicSeed: 777, rkOffset }));
  } finally {
    if (prev === undefined) delete process.env.NO_CIPHER;
    else process.env.NO_CIPHER = prev;
  }
}

describe("reg inner source line width + semantics", () => {
  const hasCi = HAS_LUAU || HAS_PUC;
  const t = hasCi ? test : test.skip;

  t("pre-cipher inner source has no line above the bound (heavy)", () => {
    const art = regChunk(HEAVY.src, false);
    const lens = art.split("\n").map((l) => l.length);
    expect(Math.max(...lens)).toBeLessThanOrEqual(MAX_OUTPUT_LINE_BYTES);
  }, 120000);

  t("enveloped artifact executes (PUC-Lua 5.4 + Luau)", () => {
    const art = regChunk(MODERATE.src, true);
    const f = join(TMP, "inner-reg.lua");
    writeFileSync(f, art);
    if (HAS_PUC) {
      const r = runLua(LUA54, f, true);
      expect(r.stderr).toBe("");
      expect(r.stdout).toBe(MODERATE.expected);
    }
    if (HAS_LUAU) {
      const r = runLua(LUAU, f, false);
      expect(r.stderr).toBe("");
      expect(r.stdout).toBe(MODERATE.expected);
    }
  }, 120000);
});

describe("stack artifact line width + semantics", () => {
  const t = HAS_LUAU ? test : test.skip;

  function genStack(src) {
    const base = compile(parse(lex(src).tokens));
    const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
    return quiet(() => generateVM(cl(base), { level: "normal", polymorphicSeed: 777, executorGlobals: false }));
  }

  t("no line above the bound (heavy) and execution is intact (moderate)", () => {
    const heavy = genStack(HEAVY.src);
    const lens = heavy.split("\n").map((l) => l.length);
    expect(Math.max(...lens)).toBeLessThanOrEqual(MAX_OUTPUT_LINE_BYTES);
    const art = genStack(MODERATE.src);
    const f = join(TMP, "stack-art.lua");
    writeFileSync(f, art);
    const r = runLua(LUAU, f, false);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe(MODERATE.expected);
  }, 120000);
});
