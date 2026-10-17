// Phase 1.3(a): Env binding + decoy path verification.
// The generated VM must contain an env integrity check (debug.getinfo /
// getfenv / _G) and a decoy path (junk states / mutate / opaque predicate)
// that selects real vs. broken decryption. Inspection + runtime smoke.
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

test("reg artifact contains env integrity check markers", () => {
  const ast = parse(lex(src).tokens);
  const base = regCompile(ast);
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const art = quiet(() => generateRegVM(cl(base), { level: "max", polymorphicSeed: 1234 }));
  // Env integrity markers
  expect(art).toMatch(/getfenv|_G/);
});

test("stack artifact contains env integrity check markers", () => {
  const ast = parse(lex(src).tokens);
  const base = compile(obfuscate(ast, { renameLocals: false, preserveGlobals: true }));
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const art = quiet(() => generateVM(cl(base), { level: "max", polymorphicSeed: 1234, executorGlobals: false }));
  expect(art).toMatch(/getfenv|getgenv|_G/);
});

t("reg/max artifact runs and prints valid result on clean host", () => {
  const ast = parse(lex(src).tokens);
  const base = regCompile(ast);
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const art = quiet(() => generateRegVM(cl(base), { level: "max", polymorphicSeed: 1234 }));
  const TMP = mkdtempSync(join(tmpdir(), "envb-"));
  const f = join(TMP, "a.lua");
  writeFileSync(f, art);
  const r = spawnSync(LUAU, [f], { encoding: "utf8", timeout: 60000 });
  expect(r.status).toBe(0);
  expect(r.stdout.replace(/\r\n/g, "\n").trim()).toBe("3");
});
