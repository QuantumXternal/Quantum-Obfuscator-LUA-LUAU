// Stack-VM profiling (Stage 10): static opcode mix per fixture + reference-
// runner microbenchmarks. Mirrors reg-profile.mjs methodology; timings are
// reference-interpreter measurements, NOT Luau wall-time.
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { encodeStrings } = await import("../dist/obfuscator/StringEncoder.js");
const { scrambleControlFlow } = await import("../dist/obfuscator/ControlFlowScrambler.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { runVM } = await import("../dist/vm/vm-runner.js");

const SEED = 1234;
const names = ["NOP","PUSH_NIL","PUSH_TRUE","PUSH_FALSE","PUSH_K","LOAD_L","STORE_L","LOAD_G","STORE_G","ADD","SUB","MUL","DIV","MOD","POW","CONCAT","EQ","NE","LT","LE","GT","GE","AND","OR","NOT","UNM","LEN","NEW_TABLE","GET_TABLE","SET_TABLE","CALL","RETURN","JMP","JMP_F","POP","CLOSURE","DUP","LOAD_UPVAL","STORE_UPVAL","CALL_MULTI","LOAD_VARARG","TAILCALL","FORPREP","FORLOOP","CONCAT_MULTI","PUSH_NILS","MARK","CALL_DYNAMIC","IDIV","CLOSE_UPVAL","SETLIST","SWAP","NAMECALL","TFOR","PCALL","XPCALL","ITER_PREP"];
const env = {
  print: () => {}, type: (v) => (v === null || v === undefined ? "nil" : typeof v),
  math: { floor: Math.floor },
  table: { concat: (t, s) => Object.keys(t).filter((k) => !isNaN(Number(k))).map(Number).sort((a, b) => a - b).map((k) => String(t[k])).join(s || "") },
  string: { char: (...c) => String.fromCharCode(...c), len: (s) => s.length },
  bit32: { bxor: (a, b) => a ^ b },
  pairs: (t) => { const ks = Object.keys(t); let i = 0; return [(..._) => { if (i >= ks.length) return [null]; const k = ks[i++]; return [k, t[k]]; }, t, null]; },
};
env._G = env;

function build(src) {
  let ast = parse(lex(src).tokens);
  ast = encodeStrings(ast, { enabled: true, seed: SEED });
  ast = scrambleControlFlow(ast, { enabled: true, seed: SEED });
  return compile(obfuscate(ast, { renameLocals: true, preserveGlobals: true }));
}

console.log("=== static stack opcode mix (compile output, all fixtures) ===");
// Arity sets mirror src/vm/vm-gen.ts OPCODES_1ARG/2ARG/3ARG (else 0 args).
const A1 = new Set([4,5,6,7,8,30,31,32,33,34,35,37,38,40,41,42,43,44,45,47,49,50,52,54,55,65,67]);
const A2 = new Set([39,53,60,61,66]);
const A3 = new Set([56,57,58,59,62,63]);
const total = {};
const codeLen = {};
for (const f of readdirSync(join(__dirname, "fixtures")).filter((x) => x.endsWith(".lua")).sort()) {
  const chunk = build(readFileSync(join(__dirname, "fixtures", f), "utf8"));
  const walk = (c, depth) => {
    codeLen[f] = (codeLen[f] || 0) + c.code.length;
    for (let i = 0; i < c.code.length;) {
      const op = c.code[i];
      total[names[op] ?? `OP${op}`] = (total[names[op] ?? `OP${op}`] || 0) + 1;
      i += 1 + (A3.has(op) ? 3 : A2.has(op) ? 2 : A1.has(op) ? 1 : 0);
    }
    for (const p of c.protos || []) walk(p, depth + 1);
  };
  walk(chunk, 0);
}
const sum = Object.values(total).reduce((a, b) => a + b, 0);
for (const [op, n] of Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, 16)) {
  console.log(`  ${op.padEnd(12)} ${n} (${(100 * n / sum).toFixed(1)}%)`);
}

console.log("=== stack runner microbenchmarks (runVM, median of 5, ms) ===");
const micros = {
  "arith-loop": "local s = 0 for i = 1, 200000 do s = s + i end return s",
  "call-heavy": "local function id(x) return x end local s = 0 for i = 1, 50000 do s = s + id(i) end return s",
  "global-heavy": "local s = 0 for i = 1, 50000 do s = s + math.floor(i / 2) end return s",
  "closure-alloc": "local s = 0 for i = 1, 20000 do local f = function() return i end s = s + f() end return s",
  "str-concat": 'local s = "" for i = 1, 20000 do s = s .. "x" end return #s',
  "cmp-heavy": "local s = 0 for i = 1, 100000 do if i % 2 == 0 then s = s + 1 end if i > 50000 then s = s + 0 end end return s",
};
for (const [name, src] of Object.entries(micros)) {
  const chunk = build(src);
  const times = [];
  let ret;
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    ret = runVM(chunk.K, chunk.code, env, 0, chunk.protos || []);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  console.log(`  ${name.padEnd(14)} median=${times[2].toFixed(1)}ms min=${times[0].toFixed(1)} max=${times[4].toFixed(1)} ret=${JSON.stringify(ret)}`);
}
