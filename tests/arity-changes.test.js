// Phase 1.2(d): per-op wire-arity changes. This file starts with the reg VM
// lead-salt half (stack VM decoys are appended in the stack arity commit).
//
// Contract under test:
// - REG_LEAD_SALT is exactly the selected five normal ops (LOADK, MOVE,
//   NEWTABLE, UNM, GETUPVAL), each with delta 1;
// - wire arity of every op = popcount(mask) + lead, pinned per op
//   (LOADK/MOVE/UNM/GETUPVAL 2->3, NEWTABLE 1->2);
// - selection constraints: no fused op, no skip op, no jump op,
//   popcount + lead <= 3 (s1..s3 operand window);
// - reg wire ceiling restated: H = 127*16 + 11 = 2043 (fused argc 11 still
//   dominates; lead-salted normal ops stay <= 3);
// - seed determinism: same seed regenerates a byte-identical reg artifact.
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM, REG_LEAD_SALT, regPackedArgc } = await import("../dist/vm/reg-vm-gen.js");
const { REG_OPCODE_COUNT, REG_OP_MASK, REG_FUSED_SLOTS, REG_SKIP_OPS } = await import("../dist/vm/bytecode.js");
const { lex: lex2 } = await import("../dist/lexer/Lexer.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM, STACK_LEAD_DECOY, stackWireArgc } = await import("../dist/vm/vm-gen.js");

// Wire-visible RegOp numbers (RegOp is a const enum, erased from dist).
const OP_LOADK = 1, OP_MOVE = 4, OP_NEWTABLE = 9, OP_UNM = 17, OP_GETUPVAL = 37;
const OP_JMP = 21, OP_FORPREP = 30, OP_FORLOOP = 31;

// Wire-visible stack Op numbers (same const-enum caveat).
const S_LOAD_G = 7, S_STORE_G = 8, S_UNM = 25, S_LEN = 26;
const S_JUMP_OPS = [32, 33, 42, 43, 53];
const S_TERMINATORS = [31, 41, 32];

const SRC = readFileSync(join(ROOT, "benchmarks", "fixtures", "small.lua"), "utf8");
const rcl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(rcl) });
const quiet = (fn) => {
  const lo = console.log, lw = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = lo; console.warn = lw; }
};
const genReg = (seed) =>
  quiet(() => generateRegVM(rcl(regCompile(parse(lex(SRC).tokens))), { level: "max", polymorphicSeed: seed }));
const popcount = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
const effectiveMask = (op) => REG_OP_MASK[op] ?? 0b111;

describe("(d) reg VM lead-salt arity", () => {
  test("selection is exactly five ops with delta 1", () => {
    const expected = new Map([
      [OP_LOADK, 1], [OP_MOVE, 1], [OP_NEWTABLE, 1], [OP_UNM, 1], [OP_GETUPVAL, 1],
    ]);
    expect(REG_LEAD_SALT.size).toBe(expected.size);
    for (const [op, d] of expected) expect(REG_LEAD_SALT.get(op)).toBe(d);
  });

  test("wire arity pins: LOADK 3, MOVE 3, NEWTABLE 2, UNM 3, GETUPVAL 3", () => {
    const pins = [
      [OP_LOADK, 3], [OP_MOVE, 3], [OP_NEWTABLE, 2], [OP_UNM, 3], [OP_GETUPVAL, 3],
    ];
    for (const [op, argc] of pins) expect(regPackedArgc(op)).toBe(argc);
  });

  test("normal unmapped ops keep popcount arity; H ceiling restated", () => {
    for (let op = 0; op < REG_OPCODE_COUNT; op++) {
      if (REG_LEAD_SALT.has(op) || REG_FUSED_SLOTS.has(op)) continue;
      expect(regPackedArgc(op)).toBe(popcount(effectiveMask(op)));
    }
    expect(127 * 16 + 11).toBe(2043);
    for (const op of REG_LEAD_SALT.keys()) expect(regPackedArgc(op)).toBeLessThanOrEqual(3);
  });

  test("selection constraints: non-fused, non-skip, non-jump, <= s1..s3", () => {
    for (const [op, delta] of REG_LEAD_SALT) {
      expect(REG_FUSED_SLOTS.has(op)).toBe(false);
      expect(REG_SKIP_OPS.has(op)).toBe(false);
      expect(op).not.toBe(OP_JMP);
      expect(op).not.toBe(OP_FORPREP);
      expect(op).not.toBe(OP_FORLOOP);
      expect(delta).toBeGreaterThanOrEqual(1);
      expect(popcount(effectiveMask(op)) + delta).toBeLessThanOrEqual(3);
    }
  });

  test("same seed regenerates byte-identical reg artifact", () => {
    expect(genReg(1234)).toBe(genReg(1234));
    expect(genReg(7)).toBe(genReg(7));
    expect(genReg(1234)).not.toBe(genReg(7));
  });
});

const scl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(scl) });
const genStack = (seed) =>
  quiet(() => {
    const base = compile(obfuscate(parse(lex2(SRC).tokens), { renameLocals: false, preserveGlobals: true }));
    return generateVM(scl(base), { level: "max", polymorphicSeed: seed, executorGlobals: false });
  });

describe("(d) stack VM lead-decoy arity", () => {
  test("selection is exactly four ops with one decoy word each", () => {
    const expected = new Map([[S_LOAD_G, 1], [S_STORE_G, 1], [S_UNM, 1], [S_LEN, 1]]);
    expect(STACK_LEAD_DECOY.size).toBe(expected.size);
    for (const [op, d] of expected) expect(STACK_LEAD_DECOY.get(op)).toBe(d);
  });

  test("wire arity pins: LOAD_G 2, STORE_G 2, UNM 1, LEN 1", () => {
    expect(stackWireArgc(S_LOAD_G)).toBe(2);
    expect(stackWireArgc(S_STORE_G)).toBe(2);
    expect(stackWireArgc(S_UNM)).toBe(1);
    expect(stackWireArgc(S_LEN)).toBe(1);
  });

  test("selection constraints: no jump, no terminator, no camo/context op", () => {
    for (const op of STACK_LEAD_DECOY.keys()) {
      expect(S_JUMP_OPS).not.toContain(op);
      expect(S_TERMINATORS).not.toContain(op);
      expect(op >= 64 && op <= 67).toBe(false);
    }
  });

  test("same seed regenerates byte-identical stack artifact", () => {
    expect(genStack(1234)).toBe(genStack(1234));
    expect(genStack(7)).toBe(genStack(7));
    expect(genStack(1234)).not.toBe(genStack(7));
  });
});

describe("(d) determinism under new arities (numeric + string seeds)", () => {
  test("string seeds are deterministic on both VMs and distinct across seeds", () => {
    const s1 = "d-phase-seed-alpha-0123456789";
    const s2 = "another-seed-abcdefghijklmnopqrstuvwxyz";
    expect(genReg(s1)).toBe(genReg(s1));
    expect(genStack(s1)).toBe(genStack(s1));
    expect(genReg(s2)).toBe(genReg(s2));
    expect(genStack(s2)).toBe(genStack(s2));
    expect(genReg(s1)).not.toBe(genReg(s2));
    expect(genStack(s1)).not.toBe(genStack(s2));
  });
});
