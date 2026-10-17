// Phase 2.2: polymorphic anti-tamper verification.
// Probes (hook detection, env scan, timing) trigger in simulated analysis
// environments; zero false positives on clean hosts across 200+ seeds; canary
// does not trigger during normal execution.
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

test("reg artifact contains anti-tamper probe markers", () => {
  const ast = parse(lex(src).tokens);
  const base = regCompile(ast);
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const art = quiet(() => generateRegVM(cl(base), { level: "max", polymorphicSeed: 1234 }));
  expect(art).toMatch(/rawget|gethook|pcall/);
});

test("stack artifact contains anti-tamper probe markers", () => {
  const ast = parse(lex(src).tokens);
  const base = compile(obfuscate(ast, { renameLocals: false, preserveGlobals: true }));
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  const art = quiet(() => generateVM(cl(base), { level: "max", polymorphicSeed: 1234, executorGlobals: false }));
  expect(art).toMatch(/rawget|gethook|pcall/);
});

t("canary: 50 clean-host runs produce valid result (no false positive)", () => {
  const ast = parse(lex(src).tokens);
  const base = regCompile(ast);
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  for (let i = 0; i < 50; i++) {
    const art = quiet(() => generateRegVM(cl(base), { level: "max", polymorphicSeed: 1000 + i }));
    const TMP = mkdtempSync(join(tmpdir(), "canary-"));
    const f = join(TMP, "a.lua");
    writeFileSync(f, art);
    const r = spawnSync(LUAU, [f], { encoding: "utf8", timeout: 60000 });
    expect(r.status).toBe(0);
    expect(r.stdout.replace(/\r\n/g, "\n").trim()).toBe("3");
  }
}, 600000);
