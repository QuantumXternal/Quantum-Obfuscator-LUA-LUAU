// Reg-runner comparison-metamethod mirror tests.
// SCOPE: differential parity between the stack and register reference
// runners, plus the mirror-defined literals below. This file does NOT prove
// Lua/Luau language-level comparison semantics.
//
// Reference-backed semantic deltas, verified against the Lua 5.4 manual
// (§2.4) and the Luau/Roblox metatable docs before implementation, that this
// mirror deliberately inherits from the stack runner (parity first):
//   (a) either-side firing with NO same-metamethod / both-tables requirement
//       (Lua 5.4 requires both-tables/userdata for __eq; Luau requires the
//       SAME metamethod function — our mirrors fire left-priority instead);
//       MEASURED on both runtimes (ph3-cmp P2: different __eq fns -> Luau
//       calls neither and yields false; PUC calls the FIRST operand's mm
//       and yields its result — our runners match PUC exactly, so aligning
//       to Luau would break PUC parity: mutually unsatisfiable, hence
//       deferred, not merely undocumented);
//   (b) RESOLVED via runtime evidence (Luau 0.742 + PUC 5.4.8 both coerce
//       truthy mm results to boolean): both runners now apply Lua truthiness
//       (isTruthy) instead of `=== true`. Same-metamethod/rawequal rules below
//       remain approximations by design.
//   (c) EQ identity fast-path matches Lua 5.4 ("not primitively equal") but
//       NOT Luau ("__eq called even when rawequal"); MEASURED (ph3-cmp P1:
//       A==A with counting __eq -> PUC calls mm 0x, Luau calls it 1x; both
//       yield true). Same mutual-unsatisfiability as (a): deferred.
//   (d) __eq consulted on the FIRST operand only; MEASURED (ph3-cmp P2/P3):
//       PUC calls the first operand's mm and never the second alone, and
//       both hosts skip mm for mixed number/table — i.e. our rule matches
//       both measured hosts on the probed cases; only (a)/(c) above are true
//       divergences. LT/LE consult either side, matching the manual's order rule.
// Confirmed matches: GT/GE-via-swapped-LT/LE (relational identities in both
// manuals), string-string lexicographic order, numeric compare, NE inversion.
// Realigning (a)/(c): runtime truth is now IN (ph3-cmp P1/P2 above) and it
// proves mutual unsatisfiability — one runner cannot match both hosts — so
// these stay deferred by evidence, pending a per-host-modes design decision.
import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { obfuscate } from "../dist/obfuscator/index.js";
import { compile } from "../dist/vm/Compiler.js";
import { regCompile } from "../dist/vm/RegCompiler.js";
import { runVM } from "../dist/vm/vm-runner.js";
import { runReg } from "../dist/vm/reg-runner.js";

function stackRun(src, env) {
  const lr = lex(src);
  if (lr.errors.length) throw new Error("lex: " + JSON.stringify(lr.errors));
  const obf = obfuscate(parse(lr.tokens), { renameLocals: true, preserveGlobals: true });
  const chunk = compile(obf);
  return runVM(chunk.K, chunk.code, env, 0, chunk.protos || []);
}
function regVal(src, env) {
  const lr = lex(src);
  if (lr.errors.length) throw new Error("lex: " + JSON.stringify(lr.errors));
  return runReg(regCompile(parse(lr.tokens)), env)[0];
}
function expectBoth(src, env, want) {
  const sv = stackRun(src, env);
  const rv = regVal(src, env);
  expect(rv).toBe(sv);
  expect(sv).toBe(want);
}
function mmObj(tag) {
  const o = { tag: tag };
  o.__metatable = {};
  return o;
}
function withMM(o, name, fn) {
  o.__metatable[name] = fn;
  return o;
}
function mkEnv(entries) {
  const env = {};
  for (const k of Object.keys(entries)) env[k] = entries[k];
  env._G = env;
  return env;
}
// Records (a-tag, b-tag) per metamethod call. expectBoth executes the source
// twice (stack, then reg) through the same recording closure, so order tests
// expect two identical entries — proving dispatch order on BOTH runners.
// Records (tag(a), tag(b)) per metamethod call against a registry of known
// objects (identity-compared; JSON.stringify would misleadingly drop the
// function-valued metamethod keys, so never use it to inspect operands).
function recorder(box, objs) {
  const tag = (v) => {
    for (const k of Object.keys(objs)) if (objs[k] === v) return k;
    return typeof v;
  };
  return (a, b) => {
    box.push([tag(a), tag(b)]);
    return true;
  };
}

describe("reg comparison dispatch matches stack (__eq)", () => {
  test("left metamethod wins", () => {
    const A = withMM(mmObj("L"), "__eq", () => true);
    expectBoth("return A == 1", mkEnv({ A: A }), true);
  });
  test("right-only metamethod does NOT fire (a-side-only rule, documented parity)", () => {
    // Stack consults getMM(a) only for __eq (unlike LT/LE and unlike the Lua
    // manual's first-then-second rule) — the mirror inherits this exactly.
    const B = withMM(mmObj("R"), "__eq", () => true);
    expectBoth("return 1 == B", mkEnv({ B: B }), false);
  });
  test("left priority with unrelated metatables (documented parity)", () => {
    const A = withMM(mmObj("L"), "__eq", () => true);
    const B = withMM(mmObj("R"), "__eq", () => false);
    expectBoth("return A == B", mkEnv({ A: A, B: B }), true);
  });
  test("operands passed in source order", () => {
    const A = mmObj("L");
    const B = mmObj("R");
    const seen = [];
    withMM(A, "__eq", recorder(seen, { A: A, B: B }));
    expectBoth("return A == B", mkEnv({ A: A, B: B }), true);
    expect(seen).toEqual([["A", "B"], ["A", "B"]]);
  });
  test("identity fast-path bypasses metamethod", () => {
    const A = withMM(mmObj("L"), "__eq", () => { throw new Error("mm called"); });
    expectBoth("return A == A", mkEnv({ A: A }), true);
  });
  test("truthy non-true converts to true (runtime-verified)", () => {
    const A = withMM(mmObj("L"), "__eq", () => 1);
    const B = mmObj("R");
    expectBoth("return A == B", mkEnv({ A: A, B: B }), true);
  });
  test("~=: metamethod true inverts to false", () => {
    const A = withMM(mmObj("L"), "__eq", () => true);
    expectBoth("return A ~= 1", mkEnv({ A: A }), false);
  });
  test("~=: identity stays false without calling mm", () => {
    const A = withMM(mmObj("L"), "__eq", () => { throw new Error("mm called"); });
    expectBoth("return A ~= A", mkEnv({ A: A }), false);
  });
});

describe("reg comparison dispatch matches stack (__lt)", () => {
  test("left metamethod wins", () => {
    const A = withMM(mmObj("L"), "__lt", () => true);
    expectBoth("return A < 1", mkEnv({ A: A }), true);
  });
  test("right metamethod wins", () => {
    const B = withMM(mmObj("R"), "__lt", () => true);
    expectBoth("return 1 < B", mkEnv({ B: B }), true);
  });
  test("left priority with unrelated metatables (documented parity)", () => {
    const A = withMM(mmObj("L"), "__lt", () => true);
    const B = withMM(mmObj("R"), "__lt", () => false);
    expectBoth("return A < B", mkEnv({ A: A, B: B }), true);
  });
  test("operands passed in source order", () => {
    const A = mmObj("L");
    const B = mmObj("R");
    const seen = [];
    withMM(A, "__lt", recorder(seen, { A: A, B: B }));
    expectBoth("return A < B", mkEnv({ A: A, B: B }), true);
    expect(seen).toEqual([["A", "B"], ["A", "B"]]);
  });
  test("truthy non-true converts to true (runtime-verified)", () => {
    const A = withMM(mmObj("L"), "__lt", () => 1);
    const B = mmObj("R");
    expectBoth("return A < B", mkEnv({ A: A, B: B }), true);
  });
  test("string-string lexicographic order", () => {
    expectBoth('return "b" < "a"', mkEnv({}), false);
    expectBoth('return "a" < "b"', mkEnv({}), true);
  });
  test("mixed number-string parity only", () => {
    expectBoth('return 2 < "10"', mkEnv({}), true);
  });
});

describe("reg comparison dispatch matches stack (__le)", () => {
  test("left metamethod wins", () => {
    const A = withMM(mmObj("L"), "__le", () => true);
    expectBoth("return A <= 1", mkEnv({ A: A }), true);
  });
  test("right metamethod wins", () => {
    const B = withMM(mmObj("R"), "__le", () => true);
    expectBoth("return 1 <= B", mkEnv({ B: B }), true);
  });
  test("left priority with unrelated metatables (documented parity)", () => {
    const A = withMM(mmObj("L"), "__le", () => true);
    const B = withMM(mmObj("R"), "__le", () => false);
    expectBoth("return A <= B", mkEnv({ A: A, B: B }), true);
  });
  test("operands passed in source order", () => {
    const A = mmObj("L");
    const B = mmObj("R");
    const seen = [];
    withMM(A, "__le", recorder(seen, { A: A, B: B }));
    expectBoth("return A <= B", mkEnv({ A: A, B: B }), true);
    expect(seen).toEqual([["A", "B"], ["A", "B"]]);
  });
  test("string-string lexicographic order", () => {
    expectBoth('return "a" <= "a"', mkEnv({}), true);
    expectBoth('return "b" <= "a"', mkEnv({}), false);
  });
});

describe("reg swapped/inverted comparisons match stack (> >=)", () => {
  test("> fires swapped __lt with (B,A) order", () => {
    const A = mmObj("L");
    const B = mmObj("R");
    const seen = [];
    withMM(B, "__lt", recorder(seen, { A: A, B: B }));
    expectBoth("return A > B", mkEnv({ A: A, B: B }), true);
    expect(seen).toEqual([["B", "A"], ["B", "A"]]);
  });
  test("> finds __lt on the unswapped side too", () => {
    const A = mmObj("L");
    const B = mmObj("R");
    const seen = [];
    withMM(A, "__lt", recorder(seen, { A: A, B: B }));
    expectBoth("return A > B", mkEnv({ A: A, B: B }), true);
    expect(seen).toEqual([["B", "A"], ["B", "A"]]);
  });
  test(">= fires swapped __le with (B,A) order", () => {
    const A = mmObj("L");
    const B = mmObj("R");
    const seen = [];
    withMM(B, "__le", recorder(seen, { A: A, B: B }));
    expectBoth("return A >= B", mkEnv({ A: A, B: B }), true);
    expect(seen).toEqual([["B", "A"], ["B", "A"]]);
  });
  test(">= finds __le on the unswapped side too", () => {
    const A = mmObj("L");
    const B = mmObj("R");
    const seen = [];
    withMM(A, "__le", recorder(seen, { A: A, B: B }));
    expectBoth("return A >= B", mkEnv({ A: A, B: B }), true);
    expect(seen).toEqual([["B", "A"], ["B", "A"]]);
  });
  test("plain numeric > and >= agree", () => {
    expectBoth("return 5 > 2", mkEnv({}), true);
    expectBoth("return 2 >= 5", mkEnv({}), false);
  });
});
