// Stage 16B/16G metric layer: stack traffic mix + candidate-sequence census
// per micro-fixture. Candidates: A (ForIn STORE/LOAD spill tail), C (step
// STORE/LOAD adjacency), D (literal-step numeric-for via AST), B (compound
// spill DUP/STORE + LOAD×3/SET_TABLE), C2 (consecutive PUSH_NIL runs).
// Also records raw fusion windows, max-level bytes/gen time, and executes
// every fixture under runVM (validates them as semantic fixtures too).
// Usage: node benchmarks/stack-traffic.mjs
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");
const { runVM } = await import("../dist/vm/vm-runner.js");

const FILES = ["forin-heavy.lua", "fornum-heavy.lua", "compound-table.lua", "repeat-assign.lua", "expr-heavy.lua", "calls-returns.lua", "loop-carried.lua", "closure-upvalue.lua", "table-access.lua", "multiret-vararg.lua"];
const SEED = 1234;
const A1 = new Set([4,5,6,7,8,30,31,32,33,34,35,37,38,40,41,42,43,44,45,47,49,50,52,54,55,65,67]);
const A2 = new Set([39,53,60,61,66]);
const A3 = new Set([56,57,58,59,62,63,68,69,70]);
const argc = (op) => (A3.has(op) ? 3 : A2.has(op) ? 2 : A1.has(op) ? 1 : 0);
// NOTE (corrected): production OPCODES_3ARG has contained 56 all along —
// all production walkers handle ITER_PREP correctly. Only the reference
// runner lacked an op-56 branch (fixed Stage 16: arg-skip + h56 table
// setup mirror). This script's arity sets match production.
const NAMES = { 1: "PUSH_NIL", 4: "PUSH_K", 5: "LOAD_L", 6: "STORE_L", 29: "SET_TABLE", 34: "POP", 36: "DUP", 44: "CONCAT_MULTI", 45: "PUSH_NILS", 51: "SWAP" };

// Decode code[] into [{op, args}] instruction list.
function decode(code) {
  const out = [];
  let i = 0;
  while (i < code.length) {
    const op = code[i];
    const ac = argc(op);
    out.push({ op, args: code.slice(i + 1, i + 1 + ac) });
    i += 1 + ac;
  }
  return out;
}
const env = {
  print: () => {},
  pairs: (t) => { const ks = Object.keys(t); let i = 0; return [(..._) => { if (i >= ks.length) return [null]; const k = ks[i++]; return [k, t[k]]; }, t, null]; },
  ipairs: (t) => { let i = 0; return [(..._) => { i++; const v = t[i]; if (v === undefined || v === null) return [null]; return [i, v]; }, t, 0]; },
};

for (const file of FILES) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  const ast = parse(lex(src).tokens);
  const chunk = compile(obfuscate(ast, { renameLocals: false, preserveGlobals: true }));
  const chunks = [chunk, ...(chunk.protos || [])];
  const mix = {};
  let words = 0;
  const seqA = [], seqC = [], seqBload3 = [], seqDupStore = [];
  let pushNilMaxRun = 0, pushNilRuns3 = 0;
  let arithWindows = 0;
  for (const c of chunks) {
    const ins = decode(c.code);
    words += c.code.length;
    const ops = ins.map((x) => x.op);
    for (let i = 0; i < ins.length; i++) {
      const n = NAMES[ins[i].op] || `op${ins[i].op}`;
      mix[n] = (mix[n] || 0) + 1;
    }
    // A: STORE a, LOAD a, STORE b, LOAD a (a != b) — ForIn tail shape.
    for (let i = 0; i + 3 < ins.length; i++) {
      const w = ins.slice(i, i + 4);
      if (w[0].op === 6 && w[1].op === 5 && w[2].op === 6 && w[3].op === 5 &&
          w[0].args[0] === w[1].args[0] && w[1].args[0] === w[3].args[0] && w[0].args[0] !== w[2].args[0]) {
        seqA.push(`${file}@${i}`);
      }
    }
    // C: adjacent STORE s, LOAD s (same slot) anywhere.
    for (let i = 0; i + 1 < ins.length; i++) {
      if (ins[i].op === 6 && ins[i + 1].op === 5 && ins[i].args[0] === ins[i + 1].args[0]) {
        seqC.push(`${file}@${i}`);
      }
    }
    // B: LOAD,LOAD,LOAD,SET_TABLE windows + DUP,STORE pairs.
    for (let i = 0; i + 3 < ins.length; i++) {
      if (ins[i].op === 5 && ins[i + 1].op === 5 && ins[i + 2].op === 5 && ins[i + 3].op === 29) {
        seqBload3.push(`${file}@${i}`);
      }
    }
    for (let i = 0; i + 1 < ins.length; i++) {
      if (ins[i].op === 36 && ins[i + 1].op === 6) seqDupStore.push(`${file}@${i}`);
    }
    // C2: consecutive PUSH_NIL runs (op-level, 0-arg each).
    let run = 0;
    const flush = () => { if (run > pushNilMaxRun) pushNilMaxRun = run; if (run >= 3) pushNilRuns3++; run = 0; };
    for (const o of ops) { if (o === 1) run++; else flush(); }
    flush();
    // raw fusable arith windows [LOAD,LOAD,arith,STORE].
    for (let i = 0; i + 3 < ins.length; i++) {
      if (ins[i].op === 5 && ins[i + 1].op === 5 && [9,10,11,12,13,14,15,48].includes(ins[i + 2].op) && ins[i + 3].op === 6) {
        arithWindows++;
      }
    }
  }
  // D: literal-step numeric-for count via AST.
  let litStep = 0, compStep = 0;
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const e of node) walk(e); return; }
    if (node.type === "ForNumericStatement" || node.type === "NumericForStatement") {
      if (!node.step || node.step.type === "NumberLiteral") litStep++;
      else compStep++;
    }
    for (const k of Object.keys(node)) { if (k !== "loc") walk(node[k]); }
  };
  walk(ast);
  // execution check + max-level bytes/gen.
  let execOk = true, execVal = "?";
  try { execVal = JSON.stringify(runVM(chunk.K, chunk.code, { ...env }, 0, chunk.protos || [])); }
  catch (e) { execOk = false; execVal = "THROW:" + String(e.message || e).slice(0, 50); }
  const orig = console.log;
  console.log = () => {};
  const t0 = performance.now();
  let out = "";
  try { out = generateVM({ K: [...chunk.K], code: [...chunk.code], protos: [] }, { level: "max", polymorphicSeed: SEED }); }
  finally { console.log = orig; }
  const genMs = performance.now() - t0;
  const focus = ["PUSH_K", "LOAD_L", "STORE_L", "DUP", "SWAP", "POP", "PUSH_NIL", "PUSH_NILS", "CONCAT_MULTI"].map((k) => `${k}=${mix[k] || 0}`).join(" ");
  console.log(`${file}: words=${words} exec=${execOk ? "OK" : "FAIL"}(${execVal}) maxBytes=${out.length} genMs=${genMs.toFixed(0)}`);
  console.log(`  mix: ${focus}`);
  console.log(`  A[STORE,LOAD,STORE,LOAD]=${seqA.length} C[STORE,LOAD adj]=${seqC.length} D[litStep=${litStep},compStep=${compStep}] B[LOADx3+SET=${seqBload3.length},DUP+STORE=${seqDupStore.length}] C2[maxNilRun=${pushNilMaxRun},runs>=3:${pushNilRuns3}] arithWin=${arithWindows}`);
}
