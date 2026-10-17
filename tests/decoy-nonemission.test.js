// Phase 1.2(f): compiler non-emission proof for decoy opcodes.
// The compiler must never emit a decoy opcode in its bytecode output.
// Decoys exist only to pad the opcode domain (generation-time).
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const REG_DECOYS = new Set([59, 60, 61, 62]);
const STACK_DECOYS = new Set([64, 65, 66, 73, 74, 75, 76]);

function walkCode(chunk, visit) {
  visit(chunk.code);
  for (const p of chunk.protos || []) walkCode(p, visit);
}

const REG_A1 = new Set([4,5,6,7,8,30,31,32,33,34,35,37,38,40,41,42,43,44,45,47,49,50,52,54,55,65,67]);
const REG_A2 = new Set([39,53,60,61,66]);
const REG_A3 = new Set([56,57,58,59,62,63]);
function regArgc(op) {
  if (REG_A3.has(op)) return 3;
  if (REG_A2.has(op)) return 2;
  if (REG_A1.has(op)) return 1;
  // decoys
  if (op === 59) return 0;
  if (op === 60) return 1;
  if (op === 61) return 2;
  if (op === 62) return 3;
  return 0;
}
const STACK_A1 = new Set([4,5,6,7,8,30,31,32,33,34,35,37,38,40,41,42,43,44,45,47,49,50,52,54,55,65,67,74]);
const STACK_A2 = new Set([39,53,60,61,66,72,75]);
const STACK_A3 = new Set([56,57,58,59,62,63,68,69,70,71,76]);
function stackArgc(op) {
  if (STACK_A3.has(op)) return 3;
  if (STACK_A2.has(op)) return 2;
  if (STACK_A1.has(op)) return 1;
  return 0;
}

function collectOpcodes(chunk, argcFn) {
  const ops = [];
  walkCode(chunk, (code) => {
    let i = 0;
    while (i < code.length) {
      ops.push(code[i]);
      // reg bytecode is fixed 4 words per instruction; stack is variable.
      if (argcFn === null) {
        i += 4;
      } else {
        i += 1 + argcFn(code[i]);
      }
    }
  });
  return ops;
}

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");

const files = readdirSync(join(ROOT, "benchmarks", "fixtures")).filter((f) => f.endsWith(".lua"));

test("reg compiler never emits decoy opcodes across corpus", () => {
  for (const f of files) {
    const src = readFileSync(join(ROOT, "benchmarks", "fixtures", f), "utf8");
    const ast = parse(lex(src).tokens);
    const chunk = regCompile(obfuscate(ast, { renameLocals: true, preserveGlobals: true }));
    const ops = collectOpcodes(chunk, null);
    for (const op of ops) {
      expect(REG_DECOYS.has(op)).toBe(false);
    }
  }
});

test("stack compiler never emits decoy opcodes across corpus", () => {
  for (const f of files) {
    const src = readFileSync(join(ROOT, "benchmarks", "fixtures", f), "utf8");
    const ast = parse(lex(src).tokens);
    const chunk = compile(obfuscate(ast, { renameLocals: true, preserveGlobals: true }));
    const ops = collectOpcodes(chunk, stackArgc);
    for (const op of ops) {
      expect(STACK_DECOYS.has(op)).toBe(false);
    }
  }
});

test("reg compiler emits real ops only (no decoy) on complex control flow", () => {
  const src = `
    local function f(x)
      if x > 0 then
        for i = 1, 10 do x = x + i end
      else
        while x < 0 do x = x + 1 end
      end
      return x
    end
    print(f(5))
  `;
  const ast = parse(lex(src).tokens);
  const chunk = regCompile(obfuscate(ast, { renameLocals: true, preserveGlobals: true }));
  const ops = collectOpcodes(chunk, regArgc);
  for (const op of ops) expect(REG_DECOYS.has(op)).toBe(false);
});

test("stack compiler emits real ops only (no decoy) on complex control flow", () => {
  const src = `
    local function f(x)
      if x > 0 then
        for i = 1, 10 do x = x + i end
      else
        while x < 0 do x = x + 1 end
      end
      return x
    end
    print(f(5))
  `;
  const ast = parse(lex(src).tokens);
  const chunk = compile(obfuscate(ast, { renameLocals: true, preserveGlobals: true }));
  const ops = collectOpcodes(chunk, regArgc);
  for (const op of ops) expect(STACK_DECOYS.has(op)).toBe(false);
});
