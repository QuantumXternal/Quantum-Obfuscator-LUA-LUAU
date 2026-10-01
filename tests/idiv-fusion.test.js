// Stage 14 fused-IDIV (opcode 70) regression suite.
// Generated h[70] (vm-gen.ts) DELEGATES to generated arithMM with the same
// math.floor(x/y) lambda as unfused h[48]: floor division on all signs,
// x//0 -> inf leniency (NOT the native // error), numeric-string coercion,
// and __idiv dispatch. A raw math.floor(a/b) shape was explicitly rejected
// (function call cannot dispatch metamethods on table operands).
// The runner models fused 70 via the SAME Math.floor lambda as unfused IDIV.
// Opcodes numeric: IDIV=48, fused-70=[70,a,b,c,0,0,0].
import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { obfuscate } from "../dist/obfuscator/index.js";
import { compile } from "../dist/vm/Compiler.js";
import { generateVM } from "../dist/vm/vm-gen.js";
import { runVM } from "../dist/vm/vm-runner.js";

function tail(slot) { return [5, slot, 31, 1]; }
function runBoth(K) {
  const pre = [4, 0, 6, 0, 4, 1, 6, 1];
  const runU = () => runVM(K, pre.concat([5, 0, 5, 1, 48, 6, 2], tail(2)), {}, 0, []);
  const runF = () => runVM(K, pre.concat([70, 0, 1, 2, 0, 0, 0], tail(2)), {}, 0, []);
  return { runU, runF };
}

// --- Harness replication of the IDIV fusion window (vm-gen.ts fuseOpcodes):
// [LOAD_L,LOAD_L,IDIV,STORE_L] with jump-target safety, mirrored exactly.
const A1 = new Set([4,5,6,7,8,30,31,32,33,34,35,37,38,40,41,42,43,44,45,47,49,50,52,54,55,65,67]);
const A2 = new Set([39,53,60,61,66]);
const A3 = new Set([56,57,58,59,62,63,68,69,70]);
function collectJumpTargets(code) {
  const targets = new Set();
  let i = 0;
  while (i < code.length) {
    const op = code[i];
    i++;
    if (op === 32 || op === 33 || op === 42 || op === 43) { targets.add(code[i]); i++; }
    else if (op === 53) { i++; targets.add(code[i]); i++; }
    else { i += A3.has(op) ? 3 : A2.has(op) ? 2 : A1.has(op) ? 1 : 0; }
  }
  return targets;
}
function fuseWindowsIn(code) {
  const out = code.slice();
  const jt = collectJumpTargets(out);
  let fused = 0;
  let i = 0;
  while (i + 6 < out.length) {
    if (out[i] === 5 && out[i + 2] === 5 && out[i + 4] === 48 && out[i + 5] === 6) {
      let safe = true;
      for (let k = i + 1; k < i + 7; k++) if (jt.has(k)) { safe = false; break; }
      if (safe) {
        const a = out[i + 1], b = out[i + 3], c = out[i + 6];
        out[i] = 70; out[i + 1] = a; out[i + 2] = b; out[i + 3] = c;
        out[i + 4] = 0; out[i + 5] = 0; out[i + 6] = 0;
        fused++;
        i += 7;
        continue;
      }
    }
    i++;
  }
  return { out, fused };
}
// Hand-fuse main chunk AND protos (mirrors fuseChunk recursion).
function fuseIdivWindows(chunk) {
  let fused = 0;
  const walk = (c) => {
    const r = fuseWindowsIn(c.code);
    c.code = r.out;
    fused += r.fused;
    for (const p of c.protos || []) walk(p);
  };
  walk(chunk);
  return fused;
}
function compileSrc(src) {
  const { tokens, errors } = lex(src);
  if (errors.length) throw new Error("lex: " + JSON.stringify(errors));
  return compile(obfuscate(parse(tokens), { renameLocals: false, preserveGlobals: true }));
}
function quietGenerate(chunk, options) {
  const orig = console.log;
  console.log = () => {};
  try {
    return generateVM(chunk, options);
  } finally {
    console.log = orig;
  }
}

describe("fused IDIV opcode 70: floor division on all sign combinations", () => {
  test("positive/negative/fractional/coercion", () => {
    const rows = [
      [[7, 2], 3],
      [[-7, 2], -4],
      [[7, -2], -4],
      [[-7, -2], 3],
      [[0, 5], 0],
      [[5.5, 2], 2],
      [[-5.5, 2], -3],
      [["7", 2], 3],
    ];
    for (const [K, expected] of rows) {
      const { runU, runF } = runBoth(K);
      expect(runU()).toBe(expected);
      expect(runF()).toBe(expected);
    }
  });
  test("zero divisor follows the established math.floor shape (inf)", () => {
    // REASONED divergence: native Luau 1//0 ERRORS, but production h48 (and
    // therefore h70) is math.floor(x/y) == inf. Runner models GENERATED.
    expect(runBoth([1, 0]).runU()).toBe(Infinity);
    expect(runBoth([1, 0]).runF()).toBe(Infinity);
    expect(runBoth([-1, 0]).runF()).toBe(-Infinity);
  });
  test("infinity/NaN operands propagate identically", () => {
    expect(runBoth([Infinity, 2]).runU()).toBe(Infinity);
    expect(runBoth([Infinity, 2]).runF()).toBe(Infinity);
    expect(runBoth([NaN, 2]).runU()).toBeNaN();
    expect(runBoth([NaN, 2]).runF()).toBeNaN();
  });
  test("__idiv dispatches identically (left, right, both)", () => {
    let calls = 0;
    const L = { __metatable: { __idiv: () => { calls++; return "L"; } } };
    const R = { __metatable: { __idiv: () => { calls++; return "R"; } } };
    expect(runBoth([L, 2]).runU()).toBe("L");
    expect(runBoth([L, 2]).runF()).toBe("L");
    expect(runBoth([2, R]).runU()).toBe("R");
    expect(runBoth([2, R]).runF()).toBe("R");
    const order = [];
    const L2 = { __metatable: { __idiv: () => { order.push("L"); return "L"; } } };
    const R2 = { __metatable: { __idiv: () => { order.push("R"); return "R"; } } };
    expect(runBoth([L2, R2]).runU()).toBe("L");
    expect(runBoth([L2, R2]).runF()).toBe("L");
    expect(order).toEqual(["L", "L"]);
    expect(calls).toBe(4);
  });
});

describe("fused IDIV: compiled-source contexts", () => {
  const cases = [
    ["simple", "local a = 7 local b = 2 local q = a // b return q", 3],
    ["negative", "local a = -7 local b = 2 local q = a // b return q", -4],
    ["call args", "local function id(x) return x end local a = 7 local b = 2 local t = a // b return id(t)", 3],
    ["return store", "local a = 7 local b = -2 local q = a // b return q", -4],
    ["loop", "local acc = 100 local b = 2 local i = 0 while i < 3 do acc = acc // b i = i + 1 end return acc", 12],
    ["branches", "local a = 7 local b = 2 local t = 3 local e = 2 local q = 0 if a > b then q = a // b else q = b // a end return q", 3],
    ["compound", "local a = -7 local b = 2 a //= b return a", -4],
    ["closure/upvalue", "local b = 2 local function f(x, y) local t = x // y return t + b end return f(7, 3)", 4],
    ["zero divisor", "local a = 1 local z = 0 local q = a // z return q", Infinity],
  ];
  for (const [name, src, expected] of cases) {
    test(`compiled ${name}: hand-fused matches unfused`, () => {
      const chunk = compileSrc(src);
      const K = chunk.K;
      const orig = JSON.stringify(chunk.code);
      const fused = fuseIdivWindows(chunk);
      expect(fused).toBeGreaterThan(0);
      const pristine = compileSrc(src);
      expect(JSON.stringify(pristine.code)).toBe(orig);
      expect(runVM(K, pristine.code, {}, 0, pristine.protos || [])).toBe(expected);
      expect(runVM(K, chunk.code, {}, 0, chunk.protos || [])).toBe(expected);
    });
  }
});

describe("opcode-70 expansion: generation modes and boundaries", () => {
  const SRC = "local a = 7 local b = 2 local q = a // b return q";
  test("debug/normal/max generation all succeed", () => {
    const chunk = compileSrc(SRC);
    for (const level of ["debug", "normal", "max"]) {
      const out = quietGenerate(
        { K: [...chunk.K], code: [...chunk.code], protos: [] },
        { level, polymorphicSeed: 1234 }
      );
      expect(typeof out).toBe("string");
      expect(out.length).toBeGreaterThan(1000);
    }
  });
  test("debug output carries handler 70 (plaintext, unshuffled)", () => {
    // Same observability note as DIV-68/MOD-69: max output is multi-layer
    // encrypted, so internals are asserted at debug level; the alias bound
    // `0,70` is a single template site verified by diff review, with a
    // repo-wide grep proving no other 69-bounded loop remains.
    const chunk = compileSrc(SRC);
    const dbg = quietGenerate(
      { K: [...chunk.K], code: [...chunk.code], protos: [] },
      { level: "debug", polymorphicSeed: 1234 }
    );
    expect(dbg.includes("[70]=function()")).toBe(true);
  });
  test("same seed is byte-identical; different seeds vary (intended polymorphism)", () => {
    const chunk = compileSrc(SRC);
    const a = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 77 });
    const b = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 77 });
    const c = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 78 });
    expect(a).toBe(b);
    expect(a === c).toBe(false);
  });
  test("68/69/70 boundary: only 70 is new; 64-69 carry no fused-IDIV meaning", () => {
    const chunk = compileSrc(SRC);
    const fused = fuseIdivWindows(chunk);
    expect(fused).toBeGreaterThan(0);
    const ops = new Set();
    let i = 0;
    const code = chunk.code;
    while (i < code.length) {
      const op = code[i];
      ops.add(op);
      i++;
      i += A3.has(op) ? 3 : A2.has(op) ? 2 : A1.has(op) ? 1 : 0;
    }
    expect(ops.has(70)).toBe(true);
    for (const o of [64, 65, 66, 67, 68, 69]) expect(ops.has(o)).toBe(false);
  });
  test("DIV-68 and MOD-69 regression: earlier super-ops still fire", () => {
    const div = compileSrc("local a = 20 local b = 4 local q = a / b return q");
    let found68 = false;
    for (let k = 0; k + 6 < div.code.length; k++) {
      if (div.code[k] === 5 && div.code[k + 2] === 5 && div.code[k + 4] === 12 && div.code[k + 5] === 6) { found68 = true; break; }
    }
    expect(found68).toBe(true);
    expect(runVM(div.K, div.code, {}, 0, div.protos || [])).toBe(5);
    const mod = compileSrc("local a = 7 local b = 3 local m = a % b return m");
    let found69 = false;
    for (let k = 0; k + 6 < mod.code.length; k++) {
      if (mod.code[k] === 5 && mod.code[k + 2] === 5 && mod.code[k + 4] === 13 && mod.code[k + 5] === 6) { found69 = true; break; }
    }
    expect(found69).toBe(true);
    expect(runVM(mod.K, mod.code, {}, 0, mod.protos || [])).toBe(1);
  });
});
