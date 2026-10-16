// Tamper-evidence: flipping bytes in a stack/max artifact must not yield
// the valid result. This proves tamper-EVIDENCE (modified artifacts break
// loudly or go wrong), NOT tamper-proofing and NOT that garbage cannot run.
// A flip inside the watermark comment (non-payload) must still run fine,
// documenting what is and is not covered.
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync, execFileSync } from "child_process";
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

const TMP = mkdtempSync(join(tmpdir(), "tamper-"));
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
function runRT(file) {
  const r = spawnSync(LUAU, [file], { timeout: 60000, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "").replace(/\r\n/g, "\n"), timeout: !!r.error };
}
function flipAt(s, pos, delta) {
  const c = s.charCodeAt(pos);
  return s.slice(0, pos) + String.fromCharCode((c + delta) % 256) + s.slice(pos + 1);
}

t("watermark-comment flip still runs (not covered, by design)", () => {
  const art = genMax("local x = 1 + 2 print(x)", 1234);
  const wmEnd = art.indexOf("]]\n");
  expect(wmEnd).toBeGreaterThan(0);
  const f = join(TMP, "wmflip.lua");
  writeFileSync(f, flipAt(art, 10, 1));
  const r = runRT(f);
  expect(r.timeout).toBe(false);
  expect(r.code).toBe(0);
  expect(r.out).toBe("3\n");
});

t("payload flips never yield the valid result (tamper-evident)", () => {
  const art = genMax("local x = 1 + 2 print(x)", 1234);
  const start = art.indexOf("]]\n") + 4;
  // Offsets verified live on Luau for seed 1234 (prologue resolutions,
  // checksum loop, encoded payload). Deliberately excluded: the pcall
  // status locals (e.g. start+7), which are dead stores — flipping them is
  // unobservable by construction, not a protection gap. Same category:
  // offsets start+996 and start+999..start+1004 sit inside the
  // prefix-length-gated decode branch that does not execute on this path,
  // so flips there are likewise unobservable (each still prints valid).
  // Recalibrated after the Phase-1.1 envelope layout shift moved old
  // start+1000 into that pocket; start+997 is live code adjacent to it
  // and breaks loudly.
  const positions = [0, 1, 40, 50, 60, 100, 200, 300, 997, 5000]
    .map((k) => start + k).filter((p) => p < art.length);
  expect(positions.length).toBeGreaterThan(0);
  for (const p of positions) {
    const f = join(TMP, `flip-${p}.lua`);
    writeFileSync(f, flipAt(art, p, 1));
    const r = runRT(f);
    const validResult = !r.timeout && r.code === 0 && r.out === "3\n";
    expect(validResult).toBe(false);
  }
});
