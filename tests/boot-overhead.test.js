// Phase 1.3(b): bytecode encryption at rest + boot-time overhead.
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const HAS_RT = existsSync(LUAU);
const t = HAS_RT ? test : test.skip;

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

const quiet = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
const src = "local x = 1 + 2 print(x)";

test("reg artifact is encrypted at rest (no plaintext source)", () => {
  const ast = parse(lex(src).tokens);
  const base = regCompile(ast);
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const art = quiet(() => generateRegVM(cl(base), { level: "max", polymorphicSeed: 1234 }));
  expect(art).not.toContain("local x = 1 + 2 print(x)");
});

test("stack artifact is encrypted at rest (no plaintext source)", () => {
  const ast = parse(lex(src).tokens);
  const base = compile(obfuscate(ast, { renameLocals: false, preserveGlobals: true }));
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const art = quiet(() => generateVM(cl(base), { level: "max", polymorphicSeed: 1234, executorGlobals: false }));
  expect(art).not.toContain("local x = 1 + 2 print(x)");
});

t("boot-time overhead: reg/normal under 50ms", () => {
  const ast = parse(lex(src).tokens);
  const base = regCompile(ast);
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const art = quiet(() => generateRegVM(cl(base), { level: "normal", polymorphicSeed: 1234 }));
  const TMP = mkdtempSync(join(tmpdir(), "boot-"));
  const f = join(TMP, "a.lua");
  writeFileSync(f, art);
  const times = [];
  for (let r = 0; r < 5; r++) {
    const t0 = Date.now();
    spawnSync(LUAU, [f], { encoding: "utf8", timeout: 60000 });
    times.push(Date.now() - t0);
  }
  times.sort((a, b) => a - b);
  expect(times[2]).toBeLessThan(50);
});

t("boot-time overhead: stack/normal under 50ms", () => {
  const ast = parse(lex(src).tokens);
  const base = compile(obfuscate(ast, { renameLocals: false, preserveGlobals: true }));
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const art = quiet(() => generateVM(cl(base), { level: "normal", polymorphicSeed: 1234, executorGlobals: false }));
  const TMP = mkdtempSync(join(tmpdir(), "boot-"));
  const f = join(TMP, "a.lua");
  writeFileSync(f, art);
  const times = [];
  for (let r = 0; r < 5; r++) {
    const t0 = Date.now();
    spawnSync(LUAU, [f], { encoding: "utf8", timeout: 60000 });
    times.push(Date.now() - t0);
  }
  times.sort((a, b) => a - b);
  expect(times[2]).toBeLessThan(50);
});
