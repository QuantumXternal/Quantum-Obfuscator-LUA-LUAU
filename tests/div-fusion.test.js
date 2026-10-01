// Stage 12C fused-DIV (opcode 68) regression suite.
// Generated h[68] (vm-gen.ts) is raw `/` like the h[57-59] family: native
// Lua dispatch covers __div; IEEE div-by-zero (inf/nan) matches unfused h[12]
// via generated arithMM. The runner models fused 68 via the SAME arithMM
// helper as unfused DIV. Opcodes numeric: DIV=12, fused-68=[68,a,b,c,0,0,0].
import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { obfuscate } from "../dist/obfuscator/index.js";
import { compile } from "../dist/vm/Compiler.js";
import { generateVM } from "../dist/vm/vm-gen.js";
import { runVM } from "../dist/vm/vm-runner.js";

function localsChunk(K, pairs, rest) {
  const code = [];
  for (const [slot, ki] of pairs) code.push(4, ki, 6, slot);
  return { K, code: code.concat(rest) };
}
function tail(slot) { return [5, slot, 31, 1]; }
function runBoth(K) {
  const pre = [4, 0, 6, 0, 4, 1, 6, 1];
  const runU = () => runVM(K, pre.concat([5, 0, 5, 1, 12, 6, 2], tail(2)), {}, 0, []);
  const runF = () => runVM(K, pre.concat([68, 0, 1, 2, 0, 0, 0], tail(2)), {}, 0, []);
  return { runU, runF };
}

// --- Harness replication of the DIV fusion window (vm-gen.ts fuseOpcodes):
// [LOAD_L,LOAD_L,DIV,STORE_L] with jump-target safety, mirrored exactly.
const A1 = new Set([4,5,6,7,8,30,31,32,33,34,35,37,38,40,41,42,43,44,45,47,49,50,52,54,55,65,67]);
const A2 = new Set([39,53,60,61,66]);
const A3 = new Set([56,57,58,59,62,63,68]);
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
    if (out[i] === 5 && out[i + 2] === 5 && out[i + 4] === 12 && out[i + 5] === 6) {
      let safe = true;
      for (let k = i + 1; k < i + 7; k++) if (jt.has(k)) { safe = false; break; }
      if (safe) {
        const a = out[i + 1], b = out[i + 3], c = out[i + 6];
        out[i] = 68; out[i + 1] = a; out[i + 2] = b; out[i + 3] = c;
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
// Hand-fuse main chunk AND protos (mirrors fuseChunk recursion; production
// fuses closures too — e.g. `x / b` inside a nested function).
function fuseDivWindows(chunk) {
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

describe("fused DIV opcode 68: values and metamethods", () => {
  test("numbers, negatives, fractions, coercion", () => {
    const rows = [
      [[20, 4], 5],
      [[-7, 2], -3.5],
      [[7, -2], -3.5],
      [[5.5, 2], 2.75],
      [["6", 2], 3],
    ];
    for (const [K, expected] of rows) {
      const { runU, runF } = runBoth(K);
      expect(runU()).toBe(expected);
      expect(runF()).toBe(expected);
    }
  });
  test("division by zero: IEEE inf/nan on both paths", () => {
    expect(runBoth([1, 0]).runF()).toBe(Infinity);
    expect(runBoth([-1, 0]).runF()).toBe(-Infinity);
    expect(runBoth([0, 0]).runF()).toBeNaN();
    expect(runBoth([1, 0]).runU()).toBe(Infinity);
  });
  test("__div dispatches identically on fused and unfused", () => {
    let calls = 0;
    const obj = { __metatable: { __div: () => { calls++; return 99; } } };
    const { runU, runF } = runBoth([obj, 2]);
    expect(runU()).toBe(99);
    expect(runF()).toBe(99);
    expect(calls).toBe(2);
  });
});

describe("fused DIV: compiled-source contexts", () => {
  const cases = [
    ["simple", "local a = 20 local b = 4 local q = a / b return q", 5],
    ["call args", "local function id(x) return x end local a = 20 local b = 4 local t = a / b return id(t)", 5],
    ["return store", "local a = 7 local b = 2 local q = a / b return q", 3.5],
    ["loop", "local acc = 100 local b = 2 local i = 0 while i < 3 do acc = acc / b i = i + 1 end return acc", 12.5],
    ["branches", "local a = 20 local b = 4 local t = 2 local e = 4 local q = 1 if a > b then q = a / b else q = b / a end return q", 5],
    ["compound", "local a = 20 local b = 4 a /= b return a", 5],
    ["closure/upvalue", "local b = 4 local function f(x, y) local t = x / y return t + b end return f(20, 4)", 9],
    ["div-zero", "local a = 1 local z = 0 local q = a / z return q", Infinity],
  ];
  for (const [name, src, expected] of cases) {
    test(`compiled ${name}: hand-fused matches unfused`, () => {
      const chunk = compileSrc(src);
      const K = chunk.K;
      const orig = JSON.stringify(chunk.code);
      const fused = fuseDivWindows(chunk);
      expect(fused).toBeGreaterThan(0);
      // run the pristine code first: recompile (compile is deterministic)
      const pristine = compileSrc(src);
      expect(JSON.stringify(pristine.code)).toBe(orig);
      expect(runVM(K, pristine.code, {}, 0, pristine.protos || [])).toBe(expected);
      expect(runVM(K, chunk.code, {}, 0, chunk.protos || [])).toBe(expected);
    });
  }
});

describe("opcode-68 expansion: generation modes and boundaries", () => {
  const SRC = "local a = 20 local b = 4 local q = a / b return q";
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
  test("debug output carries handler 68 (plaintext, unshuffled)", () => {
    // Debug level: no shuffle, no encryption — the emission loop's `h[68]`
    // assignment is directly observable. Max-level output is multi-layer
    // encrypted (doMultiLayer is hardcoded for max), so handler/alias
    // internals are not textually assertable there; the alias bound `0,68`
    // is a single template site (vm-gen.ts) verified by diff review, and a
    // repo-wide grep proves no other `0,67`-bounded loop exists.
    const chunk = compileSrc(SRC);
    const dbg = quietGenerate(
      { K: [...chunk.K], code: [...chunk.code], protos: [] },
      { level: "debug", polymorphicSeed: 1234 }
    );
    expect(dbg.includes("[68]=function()")).toBe(true);
  });
  test("same seed is byte-identical; different seeds vary (intended polymorphism)", () => {
    const chunk = compileSrc(SRC);
    const a = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 77 });
    const b = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 77 });
    const c = quietGenerate({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: 78 });
    expect(a).toBe(b);
    expect(a === c).toBe(false);
  });
  test("decoys 64-67 and context alias 67 are untouched by the expansion", () => {
    // 68 is the ONLY new opcode: fused DIV must decode to 68 and nothing
    // else in the 64+ range may appear in fused output positions.
    const chunk = compileSrc(SRC);
    const fused = fuseDivWindows(chunk);
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
    expect(ops.has(68)).toBe(true);
    for (const o of [64, 65, 66, 67]) expect(ops.has(o)).toBe(false);
  });
});
