// Stage 18B/18B.5 grid evaluation (measurement only — no production changes).
// Part A: opcode frequencies corpus-wide + per workload (unfused compile mix
//   + replicated fusion => fused mix used for selection).
// Part B: rule grid (target% x Kmax): selection, coverage, weighted work.
//   Rule (locked form): smallest set covering target% of fused-mix
//   dispatches, ties by (-count, opcode), hard cap Kmax. Decoys 64-66 and
//   NOP pads excluded from candidacy by policy (obfuscation overhead, not
//   program ops; rng-driven frequency would destabilize selection).
// Part C: call-cost sensitivity + break-even per combo.
//   Model (compare=1 unit): baseline hot/cold op = 35.5 compares, no call
//   (71-chain always-hit). Proposed: hot = (K+1)/2 + C, cold = K + L + C
//   with lookup L=3, call C in {5,10,20}. Static model only — generated
//   runtime speed is UNMEASURED (no Luau executor; see Part D probe).
// Part D: native-runtime availability probe (informational only).
// Part E: dispatch-size model from a real normal-level output (per-op
//   closure body chars; inline bodies are the same text unwrapped).
// Usage: node benchmarks/dispatch-grid.mjs
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");

const A1 = new Set([4,5,6,7,8,30,31,32,33,34,35,37,38,40,41,42,43,44,45,47,49,50,52,54,55,65,67]);
const A2 = new Set([39,53,60,61,66]);
const A3 = new Set([56,57,58,59,62,63,68,69,70]);
const argc = (op) => (A3.has(op) ? 3 : A2.has(op) ? 2 : A1.has(op) ? 1 : 0);
const OP_NAMES = { 0:"NOP",1:"PUSH_NIL",2:"PUSH_TRUE",3:"PUSH_FALSE",4:"PUSH_K",5:"LOAD_L",6:"STORE_L",7:"LOAD_G",8:"STORE_G",9:"ADD",10:"SUB",11:"MUL",12:"DIV",13:"MOD",14:"POW",15:"CONCAT",16:"EQ",17:"NE",18:"LT",19:"LE",20:"GT",21:"GE",22:"AND",23:"OR",24:"NOT",25:"UNM",26:"LEN",27:"NEW_TABLE",28:"GET_TABLE",29:"SET_TABLE",30:"CALL",31:"RETURN",32:"JMP",33:"JMP_F",34:"POP",35:"CLOSURE",36:"DUP",37:"LOAD_UPVAL",38:"STORE_UPVAL",39:"CALL_MULTI",40:"LOAD_VARARG",41:"TAILCALL",42:"FORPREP",43:"FORLOOP",44:"CONCAT_MULTI",45:"PUSH_NILS",46:"MARK",47:"CALL_DYNAMIC",48:"IDIV",49:"CLOSE_UPVAL",50:"SETLIST",51:"SWAP",52:"NAMECALL",53:"TFOR",54:"PCALL",55:"XPCALL",56:"ITER_PREP",57:"ADD_F",58:"SUB_F",59:"MUL_F",60:"LOADK_F",61:"MOVE_F",62:"LOADK_ARITH",63:"CONCAT_F",64:"DECOY0",65:"DECOY1",66:"DECOY2",67:"CTX_ALIAS",68:"DIV_F",69:"MOD_F",70:"IDIV_F" };
const EXCLUDED = new Set([0, 64, 65, 66]); // NOP pads + camo/decoy ops: never hot candidates
function makeRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function collectJumpTargets(code) {
  const targets = new Set();
  let i = 0;
  while (i < code.length) {
    const op = code[i];
    i++;
    if (op === 32 || op === 33 || op === 42 || op === 43) { targets.add(code[i]); i++; }
    else if (op === 53) { i++; targets.add(code[i]); i++; }
    else { i += argc(op); }
  }
  return targets;
}
// Production-identical fusion replication (mutating), returns fused op list.
function replicateFuse(code, rng) {
  const result = [...code];
  const jt = collectJumpTargets(code);
  const canFuse = (s, len) => {
    for (let k = s + 1; k < s + len; k++) if (jt.has(k)) return false;
    return true;
  };
  const fusedOps = [];
  let i = 0;
  while (i < result.length) {
    const op = result[i];
    if (op === 5 && i + 6 < result.length) {
      if (result[i + 2] === 5 && result[i + 5] === 6) {
        const arith = result[i + 4];
        const superOp = arith === 9 ? 57 : arith === 10 ? 58 : arith === 11 ? 59
          : arith === 12 ? 68 : arith === 13 ? 69 : arith === 48 ? 70
          : arith === 15 ? 63 : -1;
        if (superOp !== -1) {
          if (canFuse(i, 7) && rng() > 0.25) {
            result[i] = superOp; result[i+1] = result[i+1]; result[i+2] = result[i+3];
            result[i+3] = result[i+6]; result[i+4] = 0; result[i+5] = 0; result[i+6] = 0;
            fusedOps.push(superOp);
            i += 7; continue;
          }
        }
      }
      if (result[i + 2] === 4 && result[i + 4] === 9 && result[i + 5] === 6) {
        if (canFuse(i, 7) && rng() > 0.25) { result[i] = 62; fusedOps.push(62); i += 7; continue; }
      }
      if (result[i + 2] === 6) {
        if (canFuse(i, 4) && rng() > 0.25) { result[i] = 61; fusedOps.push(61); i += 4; continue; }
      }
    }
    if (op === 4 && i + 3 < result.length && result[i + 2] === 6) {
      if (canFuse(i, 4) && rng() > 0.25) { result[i] = 60; fusedOps.push(60); i += 4; continue; }
    }
    i++;
    i += argc(op);
  }
  return { code: result, fusedOps };
}
function countOps(code, hist) {
  let i = 0;
  while (i < code.length) {
    const op = code[i];
    hist[op] = (hist[op] || 0) + 1;
    i += 1 + argc(op);
  }
}

// ---- Part A: frequencies ----
const corpusHist = {};
const perFileTop = {};
for (const file of readdirSync(join(__dirname, "fixtures")).filter((f) => f.endsWith(".lua")).sort()) {
  const src = readFileSync(join(__dirname, "fixtures", file), "utf8");
  const chunk = compile(obfuscate(parse(lex(src).tokens), { renameLocals: false, preserveGlobals: true }));
  const hist = {};
  const walk = (c) => {
    // fused mix: replicate production fusion with seed 1234 (burn incl.)
    const rng = makeRng(1234);
    for (let b = 0; b < 8; b++) rng();
    const { code } = replicateFuse(c.code, rng);
    countOps(code, hist);
    for (const p of c.protos || []) {
      const prng = makeRng(1234); // NOTE: production shares one stream across
      for (let b = 0; b < 8; b++) prng(); // protos; per-proto reseed here is an
      const { code: pc } = replicateFuse(p.code, prng); // approximation (see report)
      countOps(pc, hist);
    }
  };
  walk(chunk);
  for (const [op, n] of Object.entries(hist)) corpusHist[op] = (corpusHist[op] || 0) + n;
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([op, n]) => `${OP_NAMES[op] || op}=${n}`).join(" ");
  perFileTop[file] = top;
}
const total = Object.values(corpusHist).reduce((a, b) => a + b, 0);
const ranked = Object.entries(corpusHist).map(([op, n]) => [+op, n]).sort((a, b) => b[1] - a[1]);
console.log("== Part A: corpus fused-mix frequencies ==");
for (const [op, n] of ranked.slice(0, 15)) {
  console.log(`  ${String(OP_NAMES[op] || op).padEnd(12)} ${n} (${(100 * n / total).toFixed(1)}%)${EXCLUDED.has(op) ? " [excluded]" : ""}`);
}
console.log("== per-file top-5 ==");
for (const [f, t] of Object.entries(perFileTop)) console.log(`  ${f}: ${t}`);

// ---- Part B: grid ----
function selectHot(hist, totalN, targetPct, kmax) {
  const cands = Object.entries(hist).map(([op, n]) => [+op, n])
    .filter(([op]) => !EXCLUDED.has(op))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const set = [];
  let covered = 0;
  for (const [op, n] of cands) {
    if (covered / totalN >= targetPct / 100) break;
    if (set.length >= kmax) break;
    set.push(op);
    covered += n;
  }
  return { set, covered, covPct: covered / totalN };
}
console.log("== Part B: rule grid (target% x Kmax) ==");
const grid = [];
for (const target of [70, 80, 90]) {
  for (const kmax of [4, 8, 12]) {
    const { set, covered, covPct } = selectHot(corpusHist, total, target, kmax);
    grid.push({ target, kmax, set, covered, covPct });
    console.log(`  target=${target}% Kmax=${kmax}: K=${set.length} cov=${(100 * covPct).toFixed(1)}% [${set.map((o) => OP_NAMES[o] || o).join(",")}]`);
  }
}

// ---- Part E: dispatch-size model from real normal output ----
console.log("== Part E: per-op closure body sizes (normal output) ==");
const quiet = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
const probeSrc = readFileSync(join(__dirname, "fixtures", "medium.lua"), "utf8");
const probeChunk = compile(obfuscate(parse(lex(probeSrc).tokens), { renameLocals: false, preserveGlobals: true }));
const normalOut = quiet(() => generateVM({ K: [...probeChunk.K], code: [...probeChunk.code], protos: [] }, { level: "normal", polymorphicSeed: 1234 }));
// handler assignments look like `<tbl>[<num>]=function() BODY end` (possibly wrapped)
const bodyLen = {};
const re = /\[(\d+)\]=(function\(\) (.*?) end)(?=;|do local|\n|$)/gs;
let m;
while ((m = re.exec(normalOut)) !== null) {
  const op = +m[1];
  if (op >= 0 && op <= 70 && (bodyLen[op] === undefined || m[2].length < bodyLen[op])) {
    bodyLen[op] = m[2].length;
  }
}
const sizedOps = Object.keys(bodyLen).length;
console.log(`  parsed body sizes for ${sizedOps} opcodes`);
const topBody = Object.entries(bodyLen).map(([op, n]) => [+op, n]).sort((a, b) => b[1] - a[1]).slice(0, 8);
for (const [op, n] of topBody) console.log(`  ${String(OP_NAMES[op] || op).padEnd(12)} ${n} chars`);
const gridBody = grid.map((g) => {
  // chain scaffolding: ~2 lines per hot op (~45 chars) + fallback (fixed);
  // removed inline bodies: full 71-chain bodies disappear (call-based design
  // has NO inline bodies at all — hot chain calls handlers).
  const removedInline = Object.entries(bodyLen).reduce((a, [, n]) => a + n, 0);
  const hotScaffold = g.set.length * 90; // ~`if opA==N then local h=...;h() end` per op
  return { ...g, removedInline, hotScaffold, netDispatchDelta: hotScaffold - removedInline };
});
console.log("== dispatch-size model per grid combo ==");
for (const g of gridBody) {
  console.log(`  target=${g.target}% Kmax=${g.kmax}: K=${g.set.length} removedInline~${g.removedInline}B hotScaffold~${g.hotScaffold}B net~${g.netDispatchDelta}B`);
}

// ---- Part C: sensitivity + break-even ----
console.log("== Part C: weighted work (compare=1, lookup L=3, call C in {5,10,20}) ==");
const BASELINE = 35.5; // 71-chain always-hit average position, no call
for (const g of grid) {
  const K = g.set.length;
  const cov = g.covPct;
  const hotSet = new Set(g.set);
  // expected compares: hot ops avg (K+1)/2, cold ops K (full hot-chain miss)
  let hotW = 0, coldW = 0, hotN = 0, coldN = 0;
  for (const [op, n] of ranked) {
    if (EXCLUDED.has(op)) continue;
    if (hotSet.has(op)) { hotW += n * ((K + 1) / 2); hotN += n; }
    else { coldW += n * K; coldN += n; }
  }
  const tot = hotN + coldN;
  const avgCmp = (hotW + coldW) / tot;
  const line = { target: g.target, kmax: g.kmax, K, cov: +(100 * cov).toFixed(1) };
  for (const C of [5, 10, 20]) {
    // hot: compares + 1 call; cold: compares + 1 lookup + 1 call
    const w = ((hotW + hotN * C) + (coldW + coldN * (3 + C))) / tot;
    line["C" + C] = +w.toFixed(1);
  }
  // break-even call cost: solve cov*((K+1)/2+C) + (1-cov)*(K+3+C) = 35.5
  const be = (BASELINE - (cov * ((K + 1) / 2) + (1 - cov) * (K + 3))) / 1;
  line.breakEvenC = +be.toFixed(1);
  console.log(`  target=${g.target}% Kmax=${g.kmax}: K=${K} cov=${line.cov}% compares=${avgCmp.toFixed(1)} work(C5/C10/C20)=${line.C5}/${line.C10}/${line.C20} vs base=${BASELINE} breakEvenC=${line.breakEvenC}`);
}

// ---- Part D: native runtime probe ----
console.log("== Part D: native Luau runtime availability ==");
import { execSync } from "child_process";
for (const bin of ["luau", "lua", "luajit", "lua5.1", "lua5.3", "lua5.4"]) {
  try {
    const v = execSync(`${bin} -v`, { timeout: 8000, stdio: ["ignore", "pipe", "pipe"] }).toString().trim().split("\n")[0];
    console.log(`  FOUND ${bin}: ${v}`);
  } catch { console.log(`  absent: ${bin}`); }
}
