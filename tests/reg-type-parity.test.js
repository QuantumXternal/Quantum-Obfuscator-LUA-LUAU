// Register-VM type-system parity regressions.
//
// 1. Falsy RK constants: false was stored in K and the generator's
//    `(x>=thr and K[...] or R[x+1])` inline fell through to nil, so
//    `x == false` behaved like `x == nil`. false must stay in a register.
// 2. Shared K reuse: the rotation used to copy `_nk` back into the shared
//    proto K, corrupting constants for re-entrant/concurrent runs of the
//    same proto. The run must rebind K to its own table.
// 3. IDIV must use native `//` (subtype, div-by-zero, __idiv), and CONCAT
//    >2 operands must right-fold `..` (__concat and native errors), not
//    table.concat.
// 4. Anti-tamper must not flag a clean host with an executor-style debug
//    hook active.
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
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

const TMP = mkdtempSync(join(tmpdir(), "regtypes-"));
const SHIMTEXT = HAS_RT ? readFileSync(SHIM, "utf8") : "";
const quiet = (fn) => {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
};
function compile(src) {
  return quiet(() => regCompile(parse(lex(src).tokens)));
}
function cloneChunk(c) {
  return { ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cloneChunk) };
}
function genRaw(src, level, seed) {
  const prev = process.env.NO_CIPHER;
  process.env.NO_CIPHER = "1";
  try {
    return quiet(() => generateRegVM(cloneChunk(compile(src)), { level, polymorphicSeed: seed }));
  } finally {
    if (prev === undefined) delete process.env.NO_CIPHER; else process.env.NO_CIPHER = prev;
  }
}
function genArtifact(src, level, seed) {
  return quiet(() => generateRegVM(cloneChunk(compile(src)), { level, polymorphicSeed: seed }));
}
function runRT(exe, file) {
  const r = spawnSync(exe, [file], { timeout: 180000, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return { code: r.status, out: (r.stdout || "").replace(/\r\n/g, "\n"), err: (r.stderr || "").replace(/\r\n/g, "\n"), timeout: !!r.error };
}
function writeCase(tag, src) {
  const raw = join(TMP, `raw-${tag}.lua`);
  writeFileSync(raw, src);
  writeFileSync(raw + ".shim", SHIMTEXT + "\n" + src);
  return raw;
}
function runRaw(raw) {
  return { luau: runRT(LUAU, raw), puc: runRT(LUA54, raw + ".shim") };
}
function runArtifact(src, tag, level, seed) {
  const art = genArtifact(src, level, seed);
  const af = join(TMP, `art-${tag}-${level}-${seed}.lua`);
  writeFileSync(af, art);
  writeFileSync(af + ".shim", SHIMTEXT + "\n" + art);
  return { luau: runRT(LUAU, af), puc: runRT(LUA54, af + ".shim") };
}

const PRELUDE = [
  "local function show(v)",
  "  if type(v) == 'number' then",
  "    return (math.type and math.type(v) or 'number') .. ':' .. string.format('%.17g', v)",
  "  end",
  "  return tostring(v)",
  "end",
  "local function cat(e)",
  "  local s = tostring(e):lower()",
  "  if s:find('arithmetic') then return 'ARITH' end",
  "  if s:find('concatenate') or s:find('invalid value') then return 'CONCAT' end",
  "  if s:find('divide') or s:find('division') then return 'DIVZERO' end",
  "  if s:find('compare') then return 'COMPARE' end",
  "  return 'OTHER:' .. (tostring(e):match('^[^:]*:%d+: (.*)$') or tostring(e))",
  "end",
  "local function try(label, f)",
  "  local ok, r = pcall(f)",
  "  if ok then print(label, 'OK', show(r)) else print(label, 'ERR', cat(r)) end",
  "end",
].join("\n");

const FALSY_SRC = [
  PRELUDE,
  "local x = false",
  "print('f1', x == false, x ~= false, x == true, not x, x and 'T' or 'F')",
  "local y = nil",
  "print('f2', y == nil, y == false, x == y, y ~= false)",
  "local t = {[false] = 'FB', [true] = 'TB'}",
  "print('f3', t[false], t[true], #t)",
  "local vals = {false, true, 0}",
  "print('f4', vals[1], vals[2], vals[3], #vals)",
  "local function pick(c)",
  "  if c == false then return 'no' end",
  "  return 'yes'",
  "end",
  "print('f5', pick(false), pick(true), pick(nil))",
  "local z = (x and 1 or 2)",
  "print('f6', z)",
].join("\n");

const ARITH_SRC = [
  PRELUDE,
  "try('a1', function() return '5' + 5 end)",
  "try('a2', function() return '5' * 2 end)",
  "try('a3', function() return {} + 1 end)",
  "try('a4', function() return 7 // 2 end)",
  "try('a5', function() return -7 // 2 end)",
  "try('a6', function() local a = 7 / 1; return a // 2 end)",
  "try('a7', function() local one = 1; return one // 0 end)",
  "try('a8', function() local a = 1 / 1; return a // 0 end)",
  "try('a9', function() return '7' // 2 end)",
  "local mtAdd = setmetatable({}, {__add = function() return 'ADDMM' end})",
  "try('a10', function() return mtAdd + 1 end)",
  "local mtId = setmetatable({}, {__idiv = function() return 'IDIVMM' end})",
  "try('a11', function() return mtId // 2 end)",
  "local mtId2 = setmetatable({}, {__idiv = function() return 'IDIVMM2' end})",
  "try('a12', function() return 2 // mtId2 end)",
  "try('a13', function() return 5 % 0 end)",
  "print('c1', 1 .. 2 .. 3 .. 4)",
  "print('c2', 'a' .. 1 .. 2.5)",
  "try('c3', function() return 'a' .. 1 .. 2.5 .. true end)",
  "local mtC = setmetatable({}, {__concat = function() return 'CC' end})",
  "print('c4', tostring(mtC .. 'x'))",
  "print('c5', tostring('x' .. mtC))",
  "local order = {}",
  "local t1 = setmetatable({}, {__concat = function() order[#order + 1] = 'A'; return '1' end})",
  "local t2 = setmetatable({}, {__concat = function() order[#order + 1] = 'B'; return '2' end})",
  "local r = t1 .. t2 .. 'z'",
  "print('c6', r, table.concat(order, ','))",
  "try('c7', function() return {} .. 'x' end)",
  "try('c8', function() return nil .. 'x' end)",
  "try('c9', function() return true .. 'x' end)",
].join("\n");

const REENTRANT_SRC = [
  "local function g(n)",
  "  local s = 0",
  "  for i = 1, 300 do s = s + i * 3 end",
  "  print('G', n, s)",
  "end",
  "local function outer()",
  "  local z = 0",
  "  for i = 1, 420 do z = z + i * 2 end",
  "  g(1)",
  "  g(2)",
  "  print('O', z)",
  "end",
  "outer()",
  "local function f(n)",
  "  local acc = 0",
  "  for i = 1, 600 do acc = acc + i * 2 + n end",
  "  if n == 0 then f(1) end",
  "  print('F', n, acc)",
  "end",
  "f(0)",
].join("\n");

const HOOK_SRC = [
  "debug.sethook(function() end, '', 1000)",
  "local s = 0",
  "for i = 1, 600 do s = s + i * 2 end",
  "print('H', s)",
].join("\n");

t("false never enters the constant table", () => {
  const chunk = compile("local x = false\nprint(x == false, x ~= false, x == nil)");
  const all = [];
  const walk = (c) => { all.push(...c.K); (c.protos || []).forEach(walk); };
  walk(chunk);
  expect(all.some((v) => v === false)).toBe(false);
});

for (const seed of [10001, 1234, 2024, 7]) {
  t(`falsy-comparison parity (seed ${seed})`, () => {
    const rawFile = writeCase(`falsy-${seed}`, FALSY_SRC);
    const want = runRaw(rawFile);
    expect(want.luau.code).toBe(0);
    expect(want.puc.code).toBe(0);
    for (const level of ["normal", "max"]) {
      const got = runArtifact(FALSY_SRC, `falsy-${seed}`, level, seed);
      expect(got.luau.timeout).toBe(false);
      expect(got.puc.timeout).toBe(false);
      expect(got.luau.code).toBe(0);
      expect(got.puc.code).toBe(0);
      expect(got.luau.out).toBe(want.luau.out);
      expect(got.puc.out).toBe(want.puc.out);
    }
  }, 180000);

  t(`arith/concat/IDIV parity (seed ${seed})`, () => {
    const rawFile = writeCase(`arith-${seed}`, ARITH_SRC);
    const want = runRaw(rawFile);
    expect(want.luau.code).toBe(0);
    expect(want.puc.code).toBe(0);
    for (const level of ["normal", "max"]) {
      const got = runArtifact(ARITH_SRC, `arith-${seed}`, level, seed);
      expect(got.luau.timeout).toBe(false);
      expect(got.puc.timeout).toBe(false);
      expect(got.luau.code).toBe(0);
      expect(got.puc.code).toBe(0);
      expect(got.luau.out).toBe(want.luau.out);
      expect(got.puc.out).toBe(want.puc.out);
    }
  }, 180000);
}

t("rotation rebinds K instead of mutating the shared table", () => {
  for (const level of ["normal", "max"]) {
    const raw = genRaw(REENTRANT_SRC, level, 10001);
    const line = raw.split("\n").find((l) => l.includes("local _nk={}"));
    expect(line).toBeDefined();
    expect(line).toContain("=_nk end end");
    expect(line).not.toContain("=_nk[_ji]");
  }
});

t("generated RK threshold names cannot shadow fixed handler locals", () => {
  for (const level of ["normal", "max"]) {
    for (const seed of [10001, 1234]) {
      const raw = genRaw(REENTRANT_SRC, level, seed);
      const m = raw.match(/local function [A-Za-z_][A-Za-z0-9_]*\(x\) if x>=([A-Za-z_][A-Za-z0-9_]*)/);
      expect(m).not.toBeNull();
      expect(m[1][0]).not.toBe("_");
    }
  }
});

for (const seed of [10001, 1234, 2024]) {
  t(`re-entrant same-proto calls keep constants isolated (seed ${seed})`, () => {
    const rawFile = writeCase(`reentrant-${seed}`, REENTRANT_SRC);
    const want = runRaw(rawFile);
    expect(want.luau.code).toBe(0);
    expect(want.puc.code).toBe(0);
    for (const level of ["normal", "max"]) {
      const got = runArtifact(REENTRANT_SRC, `reentrant-${seed}`, level, seed);
      expect(got.luau.timeout).toBe(false);
      expect(got.puc.timeout).toBe(false);
      expect(got.luau.code).toBe(0);
      expect(got.puc.code).toBe(0);
      expect(got.luau.out).toBe(want.luau.out);
      expect(got.puc.out).toBe(want.puc.out);
    }
  }, 240000);
}

for (const seed of [10001, 1234, 2024, 7]) {
  t(`anti-tamper ignores a clean host debug hook (seed ${seed})`, () => {
    const raw = join(TMP, `hook-raw-${seed}.lua`);
    writeFileSync(raw, HOOK_SRC);
    const want = runRT(LUA54, raw);
    expect(want.code).toBe(0);
    const art = genArtifact(HOOK_SRC, "max", seed);
    const af = join(TMP, `hook-art-${seed}.lua`);
    writeFileSync(af, art);
    writeFileSync(af + ".shim", SHIMTEXT + "\n" + art);
    const got = runRT(LUA54, af + ".shim");
    expect(got.timeout).toBe(false);
    expect(got.code).toBe(0);
    expect(got.out).toBe(want.out);
  }, 180000);
}
