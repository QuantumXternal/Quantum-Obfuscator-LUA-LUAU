// Honeypot emission-order regression tests.
// Defect: wrapNestedVM emitted honeypot lines BEFORE the bit32 method
// aliases they reference were declared (use-before-declaration). Affected
// variants (those calling vBxor/vBand/vBor — 7 of 14) crashed every host
// with "attempt to call a nil value" whenever drawn (~65% of artifacts).
// These tests execute stack/max artifacts on real Luau and assert correct
// output — not merely absence of crash. PUC-Lua is excluded here because
// this test runs artifacts RAW (no shim) and stock PUC lacks bit32
// (harness scope, not product behavior); shimmed PUC coverage lives in
// tests/stackmax-puc.test.js. Skipped gracefully when the
// vendor binary is absent.
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const HAS_RT = existsSync(LUAU);
const t = HAS_RT ? test : test.skip;

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "honeypot-"));
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
const SMALL = readFileSync(join(ROOT, "benchmarks", "fixtures", "small.lua"), "utf8");

t("stack/max executes correctly on Luau across emission-order-sensitive seeds", () => {
  // 11 fixed seeds incl. 2024: 2024 drew nested execV0 (`(...)()`-leading
  // line) after a `...end)()` honeypot tail and failed every host with
  // "ambiguous syntax" -> "attempt to call a nil value" before the
  // `do...end` wrap fix (vm-gen.ts wrapNestedVM). Pre-fix, P(clean) ~ 0.35
  // per artifact, so a pre-fix run fails with near-certainty; post-fix all
  // must print 45.
  for (const seed of [1234, 1, 7, 42, 99, 5, 6, 8, 77, 4242, 2024]) {
    const f = join(TMP, `small-max-${seed}.lua`);
    writeFileSync(f, genMax(SMALL, seed));
    const r = runRT(LUAU, f);
    expect(r.timeout).toBe(false);
    expect(r.code).toBe(0);
    expect(r.out).toBe("45\n");
  }
});
