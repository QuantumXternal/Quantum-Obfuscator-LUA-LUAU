// Stage 11C semantic matrix: unfused-runner vs fused-runner behavior per
// operand category, plus generated-behavior expectation (language-spec
// reasoning — UNMEASURED, no Luau executor exists here).
// Hand-built chunks only. Compares value-or-throw outcomes, not messages.
import { runVM } from "../dist/vm/vm-runner.js";

// opcodes: PUSH_K=4 LOAD_L=5 STORE_L=6 ADD=9 SUB=10 MUL=11 CONCAT=15 super 57/63
function setup(Kvals, storeSlots) {
  // PUSH_K ki; STORE_L slot for each pair
  const code = [];
  for (const [slot, ki] of storeSlots) code.push(4, ki, 6, slot);
  return code;
}
function tail(slot) { return [5, slot, 31, 1]; } // LOAD_L; RETURN 1

function outcome(fn) {
  try { return { ok: true, val: fn() }; }
  catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 60) }; }
}
const show = (o) => (o.ok ? `value=${JSON.stringify(o.val)}` : `THROW(${o.err})`);

const mm = (name, f) => ({ __metatable: { [name]: f } });
const unbox = (x) => (x && typeof x === "object" && "v" in x ? x.v : x);
const T = (v) => ({ v, __metatable: { __add: (a, b) => unbox(a) + unbox(b) } });

const cases = [
  ["num+num", [6, 7], (K) => [57, 0, 1, 2, 0, 0, 0], [[0, 0], [1, 1]], 2],
  ["numstr+num", ["2", 3], (K) => [57, 0, 1, 2, 0, 0, 0], [[0, 0], [1, 1]], 2],
  ["badstr+num", ["x", 3], (K) => [57, 0, 1, 2, 0, 0, 0], [[0, 0], [1, 1]], 2],
  ["bool+bool", [true, true], (K) => [57, 0, 1, 2, 0, 0, 0], [[0, 0], [1, 1]], 2],
  ["nil+num", [null, 1], (K) => [57, 0, 1, 2, 0, 0, 0], [[0, 0], [1, 1]], 2],
  ["tableMM+num", [T(3), 1], (K) => [57, 0, 1, 2, 0, 0, 0], [[0, 0], [1, 1]], 2],
  ["num+tableMM", [1, T(3)], (K) => [57, 0, 1, 2, 0, 0, 0], [[0, 0], [1, 1]], 2],
  ["tableMM+tableMM", [T(3), T(4)], (K) => [57, 0, 1, 2, 0, 0, 0], [[0, 0], [1, 1]], 2],
  ["tableNoMM+num", [{ v: 3 }, 1], (K) => [57, 0, 1, 2, 0, 0, 0], [[0, 0], [1, 1]], 2],
  ["str..str", ["a", "b"], (K) => [63, 0, 1, 2, 0, 0, 0], [[0, 0], [1, 1]], 2],
  ["num..num", [12, 34], (K) => [63, 0, 1, 2, 0, 0, 0], [[0, 0], [1, 1]], 2],
  ["bool..str", [true, "x"], (K) => [63, 0, 1, 2, 0, 0, 0], [[0, 0], [1, 1]], 2],
];

console.log("case | unfused-runner | fused-runner | generated-expectation | class");
for (const [name, K, fusedOp, stores, retSlot] of cases) {
  const pre = setup(K, stores);
  const unfusedAdd = name.includes("..") ? [5, 0, 5, 1, 15, 6, 2] : [5, 0, 5, 1, 9, 6, 2];
  const unfused = outcome(() => runVM(K, pre.concat(unfusedAdd, tail(retSlot)), {}, 0, []));
  const fused = outcome(() => runVM(K, pre.concat(fusedOp(K), tail(retSlot)), {}, 0, []));
  const same = unfused.ok === fused.ok && JSON.stringify(unfused.val) === JSON.stringify(fused.val);
  console.log(`${name} | ${show(unfused)} | ${show(fused)} | <reasoned> | ${same ? "MATCH" : "MISMATCH"}`);
}
