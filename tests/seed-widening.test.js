// Seed widening (Phase 1.2b): number | string polymorphic seeds.
//
// Contract under test:
// - numeric seeds keep the legacy 32-bit stream (deterministic re-gen,
//   0 honored, distinct seeds distinct outputs);
// - string seeds (any UTF-16 incl. empty) are deterministic per seed and
//   pairwise distinct across 200 draws per VM (uniqueness, not just
//   determinism — the 2^128 space claim rests on the string path);
// - numeric 1234 and string "1234" route to different streams (type
//   discrimination at generation level; cache level is pinned separately
//   in tests/server-cache.test.js).
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

const SRC = readFileSync(join(ROOT, "benchmarks", "fixtures", "small.lua"), "utf8");
const quiet = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
const rcl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(rcl) });
const scl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(scl) });
function genReg(src, seed) {
  return quiet(() => generateRegVM(rcl(regCompile(parse(lex(src).tokens))), { level: "max", polymorphicSeed: seed }));
}
function genStack(src, seed) {
  return quiet(() => {
    const base = compile(obfuscate(parse(lex(src).tokens), { renameLocals: false, preserveGlobals: true }));
    return generateVM(scl(base), { level: "max", polymorphicSeed: seed, executorGlobals: false });
  });
}
const h = (s) => createHash("sha256").update(s).digest("hex");

const NUMERIC_SEEDS = [1234, 7, 42, 99, 2024, 1, 0, 999, 31337, 555];
const STRING_SEEDS = [
  "quantum-string-seed-01",
  "quantum-string-seed-02",
  "quantum-string-seed-03",
  "quantum-string-seed-04",
  "quantum-string-seed-05",
];

describe("numeric seeds: legacy path deterministic (10/10, both VMs)", () => {
  test.each(NUMERIC_SEEDS)("reg/max seed %p re-generates byte-identical", (s) => {
    expect(genReg(SRC, s)).toBe(genReg(SRC, s));
  });
  test.each(NUMERIC_SEEDS)("stack/max seed %p re-generates byte-identical", (s) => {
    expect(genStack(SRC, s)).toBe(genStack(SRC, s));
  });
  test("seed 0 honored and distinct from seed 1 (both VMs)", () => {
    expect(h(genReg(SRC, 0))).not.toBe(h(genReg(SRC, 1)));
    expect(h(genStack(SRC, 0))).not.toBe(h(genStack(SRC, 1)));
  });
});

describe("string seeds: deterministic (5/5, both VMs)", () => {
  test.each(STRING_SEEDS)("reg/max string seed %p re-generates byte-identical", (s) => {
    expect(genReg(SRC, s)).toBe(genReg(SRC, s));
  });
  test.each(STRING_SEEDS)("stack/max string seed %p re-generates byte-identical", (s) => {
    expect(genStack(SRC, s)).toBe(genStack(SRC, s));
  });
  test("empty string is valid and deterministic (both VMs)", () => {
    expect(genReg(SRC, "")).toBe(genReg(SRC, ""));
    expect(genStack(SRC, "")).toBe(genStack(SRC, ""));
    expect(typeof genReg(SRC, "")).toBe("string");
  });
});

describe("type discrimination: numeric 1234 vs string '1234'", () => {
  test("reg/max outputs differ", () => {
    expect(h(genReg(SRC, 1234))).not.toBe(h(genReg(SRC, "1234")));
  });
  test("stack/max outputs differ", () => {
    expect(h(genStack(SRC, 1234))).not.toBe(h(genStack(SRC, "1234")));
  });
});

describe("string-seed uniqueness: 200/200 distinct hashes per VM", () => {
  test("reg/max: 200 distinct string seeds -> 200 distinct artifacts", () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(h(genReg(SRC, `uniq-reg-seed-${i}-quantum`)));
    expect(seen.size).toBe(200);
  });
  test("stack/max: 200 distinct string seeds -> 200 distinct artifacts", () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(h(genStack(SRC, `uniq-stack-seed-${i}-quantum`)));
    expect(seen.size).toBe(200);
  });
});
