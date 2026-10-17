// Phase 1.2(h): 200-seed uniqueness proof.
// 200 distinct string seeds -> 200 distinct sparse opcode maps for both VMs.
// Permutation space: reg 128!/(128-59)! ~ 2^390, stack 128!/(128-77)! ~ 2^510.
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateVM, takeRecordedOpcodeMaps } = await import("../dist/vm/vm-gen.js");
const { generateRegVM, takeRecordedOpcodeMaps: takeRegMaps } = await import("../dist/vm/reg-vm-gen.js");

const SRC = "local a = 1 + 2 print(a)\n";
const quiet = (fn) => { const lo = console.log, lw = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = lo; console.warn = lw; } };
const scl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(scl) });
const rcl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(rcl) });

const BASE_STACK = compile(obfuscate(parse(lex(SRC).tokens), { renameLocals: false, preserveGlobals: true }));
const BASE_REG = regCompile(parse(lex(SRC).tokens));

const N = 200;

test("200-seed uniqueness: all reg maps distinct", () => {
  const seen = new Set();
  for (let i = 0; i < N; i++) {
    const seed = `uniqueness-reg-seed-${i}`;
    const maps = quiet(() => {
      takeRegMaps();
      generateRegVM(rcl(BASE_REG), { level: "normal", polymorphicSeed: seed });
      return takeRegMaps();
    });
    const key = JSON.stringify(maps[0]);
    expect(seen.has(key)).toBe(false);
    seen.add(key);
  }
  expect(seen.size).toBe(N);
}, 600000);

test("200-seed uniqueness: all stack maps distinct", () => {
  const seen = new Set();
  for (let i = 0; i < N; i++) {
    const seed = `uniqueness-stack-seed-${i}`;
    const maps = quiet(() => {
      takeRecordedOpcodeMaps();
      generateVM(scl(BASE_STACK), { level: "max", nesting: 1, polymorphicSeed: seed, executorGlobals: false });
      return takeRecordedOpcodeMaps();
    });
    const key = JSON.stringify(maps[0]);
    expect(seen.has(key)).toBe(false);
    seen.add(key);
  }
  expect(seen.size).toBe(N);
}, 600000);
