// stack/max PUC-Lua number-format compat tests.
// Defect: wrapNestedVM's rInt() emitted `0b...` binary and `1_000`-style
// underscore literals, which PUC-Lua cannot parse (verified: PUC rejects
// both; Luau accepts both). Affected stack/max envelopes failed on PUC at
// load time. The fix maps those formats to portable hex/decimal with
// IDENTICAL rng draws (no stream change), so Luau behavior is untouched.
// PUC needs tests/helpers/lua54-compat.lua (bit32/loadstring/unpack/
// table.create are absent on stock PUC) — a documented harness necessity,
// not product behavior. Skipped gracefully without vendor binaries.
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
const { generateVM } = await import("../dist/vm/vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "pucfmt-"));
const SHIMTEXT = HAS_RT ? readFileSync(SHIM, "utf8") : "";
function genMax(src, seed) {
  const ast = parse(lex(src).tokens);
  const base = compile(obfuscate(ast, { renameLocals: false, preserveGlobals: true }));
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const orig = console.log;
  console.log = () => {};
  try {
    return generateVM(cl(base), { level: "max", polymorphicSeed: seed, executorGlobals: false });
  } finally {
    console.log = orig;
  }
}
function runRT(exe, file) {
  const r = spawnSync(exe, [file], { timeout: 60000, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "").replace(/\r\n/g, "\n"), timeout: !!r.error };
}
const CASES = [
  ["tiny", "local x = 1 + 2 print(x)", "3\n"],
  ["small", null, "45\n"],
];
for (const [name, inlineSrc, want] of CASES) {
  const src = inlineSrc !== null
    ? inlineSrc
    : readFileSync(join(ROOT, "benchmarks", "fixtures", "small.lua"), "utf8");
  t(`stack/max ${name} executes on PUC-Lua across seeds`, () => {
    for (const seed of [1234, 1, 7, 42, 2024]) {
      const f = join(TMP, `${name}-max-${seed}.lua`);
      writeFileSync(f, SHIMTEXT + "\n" + genMax(src, seed));
      const r = runRT(LUA54, f);
      expect(r.timeout).toBe(false);
      expect(r.code).toBe(0);
      expect(r.out).toBe(want);
    }
  });
  t(`stack/max ${name} unchanged on Luau across seeds`, () => {
    for (const seed of [1234, 1, 7, 42, 2024]) {
      const f = join(TMP, `${name}-max-luau-${seed}.lua`);
      writeFileSync(f, genMax(src, seed));
      const r = runRT(LUAU, f);
      expect(r.timeout).toBe(false);
      expect(r.code).toBe(0);
      expect(r.out).toBe(want);
    }
  });
}
