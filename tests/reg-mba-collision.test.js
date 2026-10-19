// MBA seed-variable collision regressions.
//
// applyMBA used to inject a fixed top-level `local _mba`. A script local
// (or global reference) named `_mba` then shadowed it, so every MBA form
// read user data instead of the numeric seed - e.g. ("shadow" - "shadow")
// -> arithmetic on a string. The injected name must be collision-free.
import { existsSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const HAS_LUAU = existsSync(LUAU);
const t = HAS_LUAU ? test : test.skip;

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { applyMBA } = await import("../dist/obfuscator/MBAEncoder.js");
const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");

const TMP = mkdtempSync(join(tmpdir(), "mbacol-"));
const quiet = (fn) => {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; }
};
function runLuau(code, tag) {
  const f = join(TMP, `mba-${tag}.luau`);
  writeFileSync(f, code);
  const r = spawnSync(LUAU, [f], { timeout: 180000, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  return { code: r.status, out: (r.stdout || "").replace(/\r\n/g, "\n") };
}

const COLLIDING = "local _mba = 'shadow'\nlocal function f() return _mba end\nprint(f(), 2 + 2)\n";

test("MBA injects a unique seed variable when _mba is taken", () => {
  const ast = parse(lex(COLLIDING).tokens);
  const out = applyMBA(ast, { enabled: true, seed: 1 });
  const seedDecl = out.body[0];
  expect(seedDecl.type).toBe("LocalStatement");
  expect(seedDecl.vars[0].name).not.toBe("_mba");
  expect(seedDecl.vars[0].name.startsWith("_mba")).toBe(true);
});

test("MBA keeps the historical name when _mba is free", () => {
  const ast = parse(lex("print(1 + 1)").tokens);
  const out = applyMBA(ast, { enabled: true, seed: 1 });
  expect(out.body[0].vars[0].name).toBe("_mba");
});

t("MBA with a _mba script local executes on Luau", () => {
  const want = runLuau(COLLIDING, "raw");
  expect(want.code).toBe(0);
  const opts = {
    renameLocals: false,
    preserveGlobals: true,
    encodeStrings: false,
    scramble: false,
    oneLine: true,
    vmType: "register",
    vmLevel: "max",
    seed: 4242,
    mba: true,
  };
  const art = quiet(() => runObfuscatePipeline(COLLIDING, opts));
  const got = runLuau(art, "art");
  expect(got.code).toBe(0);
  expect(got.out).toBe(want.out);
}, 240000);
