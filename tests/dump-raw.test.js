// DUMP_RAW hardening contract tests (reg VM only; stack VM has no dump path).
// Enforced properties (see the DUMP_RAW block in src/vm/reg-vm-gen.ts):
//  (1) location: dumps land in os.tmpdir(), never CWD;
//  (2) overwrite protection: unique per-call names + exclusive 'wx' creation;
//  (3) cleanup: the exact path is logged; dumps are caller-owned (this test
//      removes everything it creates and asserts removal);
//  (4) exposure: the dump is the PRE-CIPHER stage (differs from the returned
//      final output) — debug-only material, never production.
// Level gate: `debug` never dumps even with DUMP_RAW=1.
import { existsSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

const PREFIX = "quantum-vm-raw-p";
function tmpDumps() {
  return readdirSync(tmpdir()).filter((f) => f.startsWith(PREFIX)).map((f) => join(tmpdir(), f));
}
function cwdDumps() {
  return readdirSync(process.cwd()).filter((f) => f.startsWith(PREFIX) || f === "debug-vm-raw.lua");
}
function genReg(level) {
  const src = "local x = 1 + 2 print(x)";
  const base = regCompile(parse(lex(src).tokens));
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const logs = [];
  const olog = console.log;
  const owarn = console.warn;
  console.log = (...a) => { logs.push(a.join(" ")); };
  console.warn = (...a) => { logs.push(a.join(" ")); };
  try {
    const out = generateRegVM(cl(base), { level, polymorphicSeed: 1234 });
    return { out, logs };
  } finally {
    console.log = olog;
    console.warn = owarn;
  }
}
function withEnv(v, fn) {
  const prev = process.env.DUMP_RAW;
  try {
    if (v === undefined) delete process.env.DUMP_RAW;
    else process.env.DUMP_RAW = v;
    return fn();
  } finally {
    if (prev === undefined) delete process.env.DUMP_RAW;
    else process.env.DUMP_RAW = prev;
  }
}
function cleanup(paths) {
  for (const p of paths) if (existsSync(p)) rmSync(p);
}

test("default: no dump files, no DUMP_RAW log", () => {
  const beforeTmp = tmpDumps();
  const beforeCwd = cwdDumps();
  const { logs } = withEnv(undefined, () => genReg("normal"));
  expect(tmpDumps()).toEqual(beforeTmp);
  expect(cwdDumps()).toEqual(beforeCwd);
  expect(logs.some((l) => l.includes("DUMP_RAW"))).toBe(false);
});

test("DUMP_RAW=1 at debug level: still no dump (level gate)", () => {
  const beforeTmp = tmpDumps();
  const { logs } = withEnv("1", () => genReg("debug"));
  expect(tmpDumps()).toEqual(beforeTmp);
  expect(logs.some((l) => l.includes("DUMP_RAW"))).toBe(false);
});

test("DUMP_RAW=1 at normal: unique tmpdir dump, CWD clean, path logged, pre-cipher content", () => {
  const beforeTmp = new Set(tmpDumps());
  const beforeCwd = cwdDumps();
  const { out, logs } = withEnv("1", () => genReg("normal"));
  const fresh = tmpDumps().filter((p) => !beforeTmp.has(p));
  // (1) location: exactly one new dump, in tmpdir, never CWD.
  expect(fresh.length).toBe(1);
  expect(cwdDumps()).toEqual(beforeCwd);
  expect(basename(fresh[0]).startsWith(PREFIX)).toBe(true);
  const body = readFileSync(fresh[0], "utf8");
  expect(body.length).toBeGreaterThan(0);
  // (3) cleanup contract: the logged path is the created file.
  const logged = logs.find((l) => l.includes("DUMP_RAW"));
  expect(logged).toBeDefined();
  expect(logged.includes(fresh[0])).toBe(true);
  // (4) exposure: dump is the pre-cipher stage, not the final artifact.
  expect(body).not.toBe(out);
  cleanup(fresh);
  // (3) cleanup verified: files are gone afterwards.
  expect(existsSync(fresh[0])).toBe(false);
});

test("DUMP_RAW=1 twice: distinct names, first file never overwritten", () => {
  const beforeTmp = new Set(tmpDumps());
  const first = withEnv("1", () => genReg("normal"));
  const afterFirst = tmpDumps().filter((p) => !beforeTmp.has(p));
  expect(afterFirst.length).toBe(1);
  const bodyBefore = readFileSync(afterFirst[0], "utf8");
  void first;
  withEnv("1", () => genReg("normal"));
  const afterSecond = tmpDumps().filter((p) => !beforeTmp.has(p));
  // (2) overwrite protection: two distinct files, first bytes untouched.
  expect(afterSecond.length).toBe(2);
  expect(afterSecond[0]).not.toBe(afterSecond[1]);
  expect(readFileSync(afterFirst[0], "utf8")).toBe(bodyBefore);
  cleanup(afterSecond);
  expect(afterSecond.every((p) => !existsSync(p))).toBe(true);
});
