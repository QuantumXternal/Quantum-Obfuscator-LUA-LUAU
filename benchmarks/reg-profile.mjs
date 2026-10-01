// Register-VM profiling: static opcode mix per fixture + runtime microbenchmarks
// via the reference runner (measures interpreter + dispatch logic in Node;
// Luau-VM wall time will differ, but op mix and relative hot spots transfer).
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { runReg } = await import("../dist/vm/reg-runner.js");

const names = ["NOP","LOADK","LOADNIL","LOADBOOL","MOVE","GETGLOBAL","SETGLOBAL","GETTABLE","SETTABLE","NEWTABLE","ADD","SUB","MUL","DIV","MOD","POW","IDIV","UNM","NOT","LEN","CONCAT","JMP","EQ","LT","LE","TEST","TESTSET","CALL","TAILCALL","RETURN","FORPREP","FORLOOP","TFORLOOP","SETLIST","CLOSURE","VARARG","SELF","GETUPVAL","SETUPVAL","CLOSEUPVAL","PCALL","XPCALL","ITERPREP","LOADKX","EXTRAARG"];
const env = {
  print: () => {}, type: (v) => (v === null || v === undefined ? "nil" : typeof v),
  math: { floor: Math.floor }, table: {}, string: {}, pairs: (t) => { const ks = Object.keys(t); let i = 0; return [(..._) => { if (i >= ks.length) return [null]; const k = ks[i++]; return [k, t[k]]; }, t, null]; },
};
env._G = env;

console.log("=== static opcode mix (regCompile output, all fixtures) ===");
const total = {};
for (const f of readdirSync(join(__dirname, "fixtures")).filter((x) => x.endsWith(".lua")).sort()) {
  const chunk = regCompile(parse(lex(readFileSync(join(__dirname, "fixtures", f), "utf8")).tokens));
  const walk = (c) => {
    for (let i = 0; i < c.code.length; i += 4) { const n = names[c.code[i]]; total[n] = (total[n] || 0) + 1; }
    for (const p of c.protos || []) walk(p);
  };
  walk(chunk);
}
const sum = Object.values(total).reduce((a, b) => a + b, 0);
for (const [op, n] of Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${op.padEnd(12)} ${n} (${(100 * n / sum).toFixed(1)}%)`);
}

console.log("=== runtime microbenchmarks (runReg, median of 5, ms) ===");
const micros = {
  "arith-loop": "local s = 0 for i = 1, 200000 do s = s + i end return s",
  "call-heavy": "local function id(x) return x end local s = 0 for i = 1, 50000 do s = s + id(i) end return s",
  "global-heavy": "local s = 0 for i = 1, 50000 do s = s + math.floor(i / 2) end return s",
  "closure-alloc": "local s = 0 for i = 1, 20000 do local f = function() return i end s = s + f() end return s",
  "str-concat": 'local s = "" for i = 1, 20000 do s = s .. "x" end return #s',
  "cmp-heavy": "local s = 0 for i = 1, 100000 do if i % 2 == 0 then s = s + 1 end if i > 50000 then s = s + 0 end end return s",
};
for (const [name, src] of Object.entries(micros)) {
  const chunk = regCompile(parse(lex(src).tokens));
  const times = [];
  let ret;
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    ret = runReg(chunk, env);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  console.log(`  ${name.padEnd(14)} median=${times[2].toFixed(1)}ms min=${times[0].toFixed(1)} max=${times[4].toFixed(1)} ret=${JSON.stringify(ret)}`);
}
