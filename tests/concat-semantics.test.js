// Stage 11D-2 CONCAT semantic matrix (audit only — no production changes).
//
// Three behavior columns, kept explicit:
//   Luau source semantics : LANGUAGE-SPEC REASONING (no Luau executor exists
//                           here). Native `..` coerces strings/numbers,
//                           dispatches __concat, and ERRORS on bool/nil/tables
//                           without __concat.
//   Unfused generated h15 : src/vm/vm-gen.ts:2273 — pcall(a..b), else
//                           tostring(a)..tostring(b) fallback (coercive).
//   Fused generated h63   : src/vm/vm-gen.ts:2373 — raw `..` (native).
// The reference runner (dist/vm/vm-runner.js) MODELS both generated paths;
// runner results are never presented as real Luau execution.
//
// Opcodes are numeric: Op is a const enum (erased at compile).
// PUSH_K=4 LOAD_L=5 STORE_L=6 CONCAT=15 RETURN=31 fused-63=[63,a,b,c,0,0,0].
import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { obfuscate } from "../dist/obfuscator/index.js";
import { compile } from "../dist/vm/Compiler.js";
import { runVM } from "../dist/vm/vm-runner.js";

function localsChunk(K, pairs, rest) {
  const code = [];
  for (const [slot, ki] of pairs) code.push(4, ki, 6, slot);
  return { K, code: code.concat(rest) };
}
function tail(slot) { return [5, slot, 31, 1]; }

// Run the same operand pair through the unfused window
// [LOAD_L,LOAD_L,CONCAT,STORE_L] and the fused [63,a,b,c]+pads.
function runBoth(K, aSlot, bSlot, cSlot) {
  const pre = [];
  for (const [slot, ki] of [[aSlot, 0], [bSlot, 1]]) pre.push(4, ki, 6, slot);
  const runU = () => runVM(K, pre.concat([5, aSlot, 5, bSlot, 15, 6, cSlot], tail(cSlot)), {}, 0, []);
  const runF = () => runVM(K, pre.concat([63, aSlot, bSlot, cSlot, 0, 0, 0], tail(cSlot)), {}, 0, []);
  return { runU, runF };
}
function outcome(fn) {
  try { return { ok: true, val: fn() }; }
  catch { return { ok: false }; } // error PRESENCE only — never message text
}

// --- Harness replication of the fusion matcher (vm-gen.ts:53-105,121-126)
// for hand-fusing real compiler output exactly the way fuseOpcodes would.
// Measurement/test duplication only; production is untouched.
const OPCODES_1ARG = new Set([
  4, 5, 6, 7, 8, 30, 31, 32, 33, 34, 35, 37, 38, 40, 41, 42, 43,
  44, 45, 47, 49, 50, 52, 54, 55, 65, 67,
]);
const OPCODES_2ARG = new Set([39, 53, 60, 61, 66]);
const OPCODES_3ARG = new Set([56, 57, 58, 59, 62, 63]);
function collectJumpTargets(code) {
  const targets = new Set();
  let i = 0;
  while (i < code.length) {
    const op = code[i];
    i++;
    if (op === 32 || op === 33 || op === 42 || op === 43) { targets.add(code[i]); i++; }
    else if (op === 53) { i++; targets.add(code[i]); i++; }
    else { i += OPCODES_3ARG.has(op) ? 3 : OPCODES_2ARG.has(op) ? 2 : OPCODES_1ARG.has(op) ? 1 : 0; }
  }
  return targets;
}
// Fuse every jump-safe [LOAD_L,LOAD_L,CONCAT,STORE_L] window into 63.
// Returns { code, fused }.
function fuseConcatWindows(code) {
  const out = code.slice();
  const jt = collectJumpTargets(out);
  let fused = 0;
  let i = 0;
  while (i + 6 < out.length) {
    if (out[i] === 5 && out[i + 2] === 5 && out[i + 4] === 15 && out[i + 5] === 6) {
      let safe = true;
      for (let k = i + 1; k < i + 7; k++) if (jt.has(k)) { safe = false; break; }
      if (safe) {
        // Mirror vm-gen.ts fuseOpcodes exactly: [63,a,b,c,0,0,0].
        const a = out[i + 1], b = out[i + 3], c = out[i + 6];
        out[i] = 63; out[i + 1] = a; out[i + 2] = b; out[i + 3] = c;
        out[i + 4] = 0; out[i + 5] = 0; out[i + 6] = 0;
        fused++;
        i += 7;
        continue;
      }
    }
    i++;
  }
  return { code: out, fused };
}
function compileSrc(src) {
  const { tokens, errors } = lex(src);
  if (errors.length) throw new Error("lex: " + JSON.stringify(errors));
  return compile(obfuscate(parse(tokens), { renameLocals: false, preserveGlobals: true }));
}

describe("concat semantics matrix (11D-2 audit)", () => {
  test("agreement: string/number operand categories", () => {
    const rows = [
      [["a", "b"], "ab"],
      [["", ""], ""],
      [["x", ""], "x"],
      [["n=", 7], "n=7"],
      [[12, 34], "1234"],
      [[1.5, "x"], "1.5x"],
      [["12", 34], "1234"], // numeric strings coerce on both paths
    ];
    for (const [K, expected] of rows) {
      const { runU, runF } = runBoth(K, 0, 1, 2);
      expect(runU()).toBe(expected);
      expect(runF()).toBe(expected);
    }
  });

  test("agreement: __concat on left operand", () => {
    let calls = 0;
    const cat = { __metatable: { __concat: (a, b) => { calls++; return "L"; } } };
    const { runU, runF } = runBoth([cat, "!"], 0, 1, 2);
    expect(runU()).toBe("L");
    expect(runF()).toBe("L");
    expect(calls).toBe(2);
  });

  test("agreement: __concat on right operand", () => {
    let calls = 0;
    const cat = { __metatable: { __concat: (a, b) => { calls++; return "R"; } } };
    const { runU, runF } = runBoth(["?", cat], 0, 1, 2);
    expect(runU()).toBe("R");
    expect(runF()).toBe("R");
    expect(calls).toBe(2);
  });

  test("agreement: both operands carry __concat (left consulted)", () => {
    // Runner models `getMM(a) ?? getMM(b)` — left first. Native-Luau rule
    // (first operand's __concat preferred) is REASONED, not executed here.
    const order = [];
    const L = { __metatable: { __concat: () => { order.push("L"); return "L"; } } };
    const R = { __metatable: { __concat: () => { order.push("R"); return "R"; } } };
    const { runU, runF } = runBoth([L, R], 0, 1, 2);
    expect(runU()).toBe("L");
    expect(runF()).toBe("L");
    expect(order).toEqual(["L", "L"]);
  });

  test("divergence: boolean operands (unfused coerces, fused throws)", () => {
    // Luau REASONED: native `..` on booleans ERRORS — fused h63 conforms,
    // unfused h15 extends the language via its tostring fallback.
    for (const K of [[true, "x"], ["x", false], [true, true]]) {
      const { runU, runF } = runBoth(K, 0, 1, 2);
      const u = outcome(runU);
      const f = outcome(runF);
      expect(u.ok).toBe(true);
      expect(f.ok).toBe(false);
    }
    const { runU } = runBoth([true, "x"], 0, 1, 2);
    expect(runU()).toBe("truex");
  });

  test("divergence: nil operands (unfused coerces, fused throws)", () => {
    for (const K of [[null, "x"], ["x", null], [null, null]]) {
      const { runU, runF } = runBoth(K, 0, 1, 2);
      expect(outcome(runU).ok).toBe(true);
      expect(outcome(runF).ok).toBe(false);
    }
  });

  test("divergence: plain tables (unfused coerces, fused throws)", () => {
    for (const K of [[{ v: 1 }, "x"], ["x", { v: 1 }], [{}, {}]]) {
      const { runU, runF } = runBoth(K, 0, 1, 2);
      expect(outcome(runU).ok).toBe(true);
      expect(outcome(runF).ok).toBe(false);
    }
  });

  test("agreement: nested concatenation on strings", () => {
    // (a..b)..c, each step through both paths
    const inner = runBoth(["a", "b"], 0, 1, 2);
    expect(inner.runU()).toBe("ab");
    expect(inner.runF()).toBe("ab");
    const outer = runBoth(["ab", "c"], 0, 1, 2);
    expect(outer.runU()).toBe("abc");
    expect(outer.runF()).toBe("abc");
  });

  test("compiled source: simple concat agrees after hand-fusion", () => {
    const chunk = compileSrc('local a = "x" local b = "y" local s = a .. b return s');
    const { code, fused } = fuseConcatWindows(chunk.code);
    expect(fused).toBeGreaterThan(0);
    expect(runVM(chunk.K, chunk.code, {}, 0, chunk.protos || [])).toBe("xy");
    expect(runVM(chunk.K, code, {}, 0, chunk.protos || [])).toBe("xy");
  });

  test("compiled source: concat in call arguments agrees", () => {
    // NOTE: fusion only fires on local-local-STORE windows, so the concat
    // is bound to a local first (same shape production fuses). A bare
    // `id(a .. b)` emits CONCAT feeding CALL and never becomes h63.
    const chunk = compileSrc('local function id(x) return x end local a = "v=" local b = 41 local t = a .. b return id(t)');
    const { code, fused } = fuseConcatWindows(chunk.code);
    expect(fused).toBeGreaterThan(0);
    expect(runVM(chunk.K, chunk.code, {}, 0, chunk.protos || [])).toBe("v=41");
    expect(runVM(chunk.K, code, {}, 0, chunk.protos || [])).toBe("v=41");
  });

  test("compiled source: concat in return position agrees", () => {
    // Same locality note: `return a .. b` feeds RETURN directly and never
    // fuses; the fusable shape stores to a local first.
    const chunk = compileSrc('local a = "n=" local n = 7 local s = a .. n return s');
    const { code, fused } = fuseConcatWindows(chunk.code);
    expect(fused).toBeGreaterThan(0);
    expect(runVM(chunk.K, chunk.code, {}, 0, chunk.protos || [])).toBe("n=7");
    expect(runVM(chunk.K, code, {}, 0, chunk.protos || [])).toBe("n=7");
  });

  test("compiled source: concat in loop agrees", () => {
    const chunk = compileSrc('local s = "" for i = 1, 3 do s = s .. i end return s');
    const { code, fused } = fuseConcatWindows(chunk.code);
    expect(fused).toBeGreaterThan(0);
    expect(runVM(chunk.K, chunk.code, {}, 0, chunk.protos || [])).toBe("123");
    expect(runVM(chunk.K, code, {}, 0, chunk.protos || [])).toBe("123");
  });

  test("compiled source: concat in conditional branches agrees", () => {
    const chunk = compileSrc('local f = true local s = "n" local one = "=1" local zero = "=0" if f then s = s .. one else s = s .. zero end return s');
    const { code, fused } = fuseConcatWindows(chunk.code);
    expect(fused).toBeGreaterThan(0);
    expect(runVM(chunk.K, chunk.code, {}, 0, chunk.protos || [])).toBe("n=1");
    expect(runVM(chunk.K, code, {}, 0, chunk.protos || [])).toBe("n=1");
  });

  test("compiled source: boolean concat diverges (documents the h63 scope)", () => {
    // Luau REASONED: this program ERRORS natively. Unfused h15 returns
    // "v=true" (language extension); fused h63 throws (conforming).
    const chunk = compileSrc('local f = true local p = "v=" local t = p .. f return t');
    const { code, fused } = fuseConcatWindows(chunk.code);
    expect(fused).toBeGreaterThan(0);
    expect(runVM(chunk.K, chunk.code, {}, 0, chunk.protos || [])).toBe("v=true");
    expect(() => runVM(chunk.K, code, {}, 0, chunk.protos || [])).toThrow();
  });

  test("error presence is asserted without message dependence", () => {
    const { runF } = runBoth([true, "x"], 0, 1, 2);
    expect(runF).toThrow(); // bare — no message string asserted anywhere
    expect(runF).toThrow();
  });

  test("reproducibility: repeated fused/unfused runs agree with themselves", () => {
    const { runU, runF } = runBoth(["a", 1], 0, 1, 2);
    expect(runU()).toBe(runU());
    expect(runF()).toBe(runF());
    const d = runBoth([false, "x"], 0, 1, 2);
    expect(outcome(d.runU).ok).toBe(outcome(d.runU).ok);
    expect(outcome(d.runF).ok).toBe(outcome(d.runF).ok);
  });
});
