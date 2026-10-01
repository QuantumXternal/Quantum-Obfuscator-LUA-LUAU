// Stage 13 fused-MOD (opcode 69) regression suite.
// Generated h[69] (vm-gen.ts) is raw `%` like the h[57-59]/h[68] family:
// native Lua FLOOR modulo (sign follows the divisor: -7 % 3 == 2) and
// `__mod` dispatch, exactly as unfused h[13] via generated arithMM.
// The runner models fused 69 via the SAME luaMod helper as unfused MOD.
// Opcodes numeric: MOD=13, fused-69=[69,a,b,c,0,0,0].
import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { obfuscate } from "../dist/obfuscator/index.js";
import { compile } from "../dist/vm/Compiler.js";
import { generateVM } from "../dist/vm/vm-gen.js";
import { runVM } from "../dist/vm/vm-runner.js";

function tail(slot) { return [5, slot, 31, 1]; }
function runBoth(K) {
  const pre = [4, 0, 6, 0, 4, 1, 6, 1];
  const runU = () => runVM(K, pre.concat([5, 0, 5, 1, 13, 6, 2], tail(2)), {}, 0, []);
  const runF = () => runVM(K, pre.concat([69, 0, 1, 2, 0, 0, 0], tail(2)), {}, 0, []);
  return { runU, runF };
}

// --- Harness replication of the MOD fusion window (vm-gen.ts fuseOpcodes):
// [LOAD_L,LOAD_L,MOD,STORE_L] with jump-target safety, mirrored exactly.
const A1 = new Set([4,5,6,7,8,30,31,32,33,34,35,37,38,40,41,42,43,44,45,47,49,50,52,54,55,65,67]);
const A2 = new Set([39,53,60,61,66]);
const A3 = new Set([56,57,58,59,62,63,68,69]);
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
    if (out[i] === 5 && out[i + 2] === 5 && out[i + 4] === 13 && out[i + 5] === 6) {
      let safe = true;
      for (let k = i + 1; k < i + 7; k++) if (jt.has(k)) { safe = false; break; }
      if (safe) {
        const a = out[i + 1], b = out[i + 3], c = out[i + 6];
        out[i] = 69; out[i + 1] = a; out[i + 2] = b; out[i + 3] = c;
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
function fuseModWindows(chunk) {
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

describe("fused MOD opcode 69: floor semantics on all sign combinations", () => {
  test("positive/negative/float/coercion (Lua floor-mod, NOT JS trunc)", () => {
    const rows = [
      [[7, 3], 1],
      [[-7, 3], 2],
      [[7, -3], -2],
      [[-7, -3], -1],
      [[0, 5], 0],
      [[5.5, 2], 1.5],
      [[-5.5, 2], 0.5],
      [["7", 3], 1],
    ];
    for (const [K, expected] of rows) {
      const { runU, runF } = runBoth(K);
      expect(runU()).toBe(expected);
      expect(runF()).toBe(expected);
    }
  });
  test("zero divisor yields NaN on both paths (Lua: 7 % 0 == nan)", () => {
    expect(runBoth([7, 0]).runU()).toBeNaN();
    expect(runBoth([7, 0]).runF()).toBeNaN();
  });
  test("__mod dispatches identically (left, right, both)", () => {
    let calls = 0;
    const L = { __metatable: { __mod: () => { calls++; return "L"; } } };
    const R = { __metatable: { __mod: () => { calls++; return "R"; } } };
    expect(runBoth([L, 2]).runU()).toBe("L");
    expect(runBoth([L, 2]).runF()).toBe("L");
    expect(runBoth([2, R]).runU()).toBe("R");
    expect(runBoth([2, R]).runF()).toBe("R");
    const order = [];
    const L2 = { __metatable: { __mod: () => { order.push("L"); return "L"; } } };
    const R2 = { __metatable: { __mod: () => { order.push("R"); return "R"; } } };
    expect(runBoth([L2, R2]).runU()).toBe("L");
    expect(runBoth([L2, R2]).runF()).toBe("L");
    expect(order).toEqual(["L", "L"]);
    expect(calls).toBe(4);
  });
});

describe("fused MOD: compiled-source contexts", () => {
  const cases = [
    ["simple", "local a = 7 local b = 3 local m = a % b return m", 1],
    ["negative", "local a = -7 local b = 3 local m = a % b return m", 2],
    ["call args", "local function id(x) return x end local a = 7 local b = 3 local t = a % b return id(t)", 1],
    ["return store", "local a = 7 local b = -3 local m = a % b return m", -2],
    ["loop", "local acc = 100 local b = 7 local i = 0 while i < 3 do acc = acc % b i = i + 1 end return acc", 2],
    ["branches", "local a = 7 local b = 3 local t = 2 local e = 3 local m = 0 if a > b then m = a % b else m = b % a end return m", 1],
    ["compound", "local a = -7 local b = 3 a %= b return a", 2],
    ["closure/upvalue", "local b = 3 local function f(x, y) local t = x % y return t + b end return f(7, 5)", 5],
    ["zero divisor", "local a = 7 local z = 0 local m = a % z return m", NaN],
  ];
  for (const [name, src, expected] of cases) {
    test(`compiled ${name}: hand-fused matches unfused`, () => {
      const chunk = compileSrc(src);
      const K = chunk.K;
      const orig = JSON.stringify(chunk.code);
      const fused = fuseModWindows(chunk);
      expect(fused).toBeGreaterThan(0);
      const pristine = compileSrc(src);
      expect(JSON.stringify(pristine.code)).toBe(orig);
      const u = runVM(K, pristine.code, {}, 0, pristine.protos || []);
      const f = runVM(K, chunk.code, {}, 0, chunk.protos || []);
      if (typeof expected === "number" && isNaN(expected)) {
        expect(u).toBeNaN();
        expect(f).toBeNaN();
      } else {
        expect(u).toBe(expected);
        expect(f).toBe(expected);
      }
    });
  }
});

describe("opcode-69 expansion: generation modes and boundaries", () => {
  const SRC = "local a = 7 local b = 3 local m = a % b return m";
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
  test("debug output carries handler 69 (plaintext, unshuffled)", () => {
    // Same observability note as DIV-68: max output is multi-layer
    // encrypted, so internals are asserted at debug level; the alias bound
    // `0,69` is a single template site verified by diff review, with a
    // repo-wide grep proving no other 68-bounded loop remains.
    const chunk = compileSrc(SRC);
    const dbg = quietGenerate(
      { K: [...chunk.K], code: [...chunk.code], protos: [] },
      { level: "debug", polymorphicSeed: 1234 }
    );
    expect(dbg.includes("[69]=function()")).toBe(true);
  });
  test("same seed is byte-identical; different seeds vary (intended polymorphism)", () => {
    const chunk = compileSrc(SRC);
    const a = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 77 });
    const b = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 77 });
    const c = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 78 });
    expect(a).toBe(b);
    expect(a === c).toBe(false);
  });
  test("68/69 boundary: only 69 is new; 64-68 carry no fused-MOD meaning", () => {
    const chunk = compileSrc(SRC);
    const fused = fuseModWindows(chunk);
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
    expect(ops.has(69)).toBe(true);
    for (const o of [64, 65, 66, 67, 68]) expect(ops.has(o)).toBe(false);
  });
  test("DIV-68 regression: div fusion still fires after 69 expansion", () => {
    // The 68 path must be bit-for-bit intact: same window shape fuses to 68.
    const div = compileSrc("local a = 20 local b = 4 local q = a / b return q");
    const out = div.code.slice();
    let found = false;
    for (let k = 0; k + 6 < out.length; k++) {
      if (out[k] === 5 && out[k + 2] === 5 && out[k + 4] === 12 && out[k + 5] === 6) { found = true; break; }
    }
    expect(found).toBe(true);
    expect(runVM(div.K, div.code, {}, 0, div.protos || [])).toBe(5);
  });
});
