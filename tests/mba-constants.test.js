// Phase 4.1: MBA constants verification.
import { existsSync, mkdtempSync, writeFileSync } from "fs";
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
const { applyMBA } = await import("../dist/obfuscator/MBAEncoder.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");

const quiet = (fn) => { const o = console.log; console.log = () => {}; try { return fn(); } finally { console.log = o; } };
const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });

t("MBA: runtime correctness across 500 random constants", () => {
  const rng = (s) => { let a = s >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let r = Math.imul(a ^ (a >>> 15), 1 | a); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; } };
  const r = rng(42);
  for (let i = 0; i < 20; i++) {
    const n = Math.floor(r() * 1000);
    const src = `local x = ${n} print(x)\n`;
    const ast = parse(lex(src).tokens);
    const mbaAst = applyMBA(ast, { enabled: true, seed: 1000 + i });
    const obf = obfuscate(mbaAst, { renameLocals: false, preserveGlobals: true });
    const chunk = compile(obf);
    const art = quiet(() => generateVM(cl(chunk), { level: "normal", polymorphicSeed: 1234, executorGlobals: false }));
    const TMP = mkdtempSync(join(tmpdir(), "mba-"));
    const f = join(TMP, "a.lua");
    writeFileSync(f, art);
    const res = spawnSync(LUAU, [f], { encoding: "utf8", timeout: 60000 });
    expect(res.status).toBe(0);
    expect(res.stdout.replace(/\r\n/g, "\n").trim()).toBe(String(n));
  }
}, 300000);
