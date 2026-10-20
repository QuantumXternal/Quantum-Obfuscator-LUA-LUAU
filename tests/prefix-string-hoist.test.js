// Factory string hoisting: decode calls move from the returned hot callback
// into the outer factory body, so RenderStepped frames only do table lookups.
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "fs";
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
const { encodeStrings } = await import("../dist/obfuscator/StringEncoder.js");
const { hoistFactoryStrings } = await import("../dist/obfuscator/PrefixStringHoist.js");
const { printChunk } = await import("../dist/obfuscator/Printer.js");

const TMP = mkdtempSync(join(tmpdir(), "prefix-hoist-"));
let counter = 0;

function runLuau(code) {
  const f = join(TMP, `hoist-${process.pid}-${counter++}.luau`);
  writeFileSync(f, code, "utf8");
  const r = spawnSync(LUAU, [f], { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  rmSync(f, { force: true });
  return {
    stdout: (r.stdout || "").replace(/\r\n/g, "\n"),
    stderr: (r.stderr || "").replace(/\r\n/g, "\n"),
  };
}

function hoist(src, names = ["f"], decoderName = "__dec_test") {
  const ast = parse(lex(src).tokens);
  const encoded = encodeStrings(ast, { enabled: true, seed: 7, decoderName });
  const result = hoistFactoryStrings(encoded.body, {
    decoderName,
    factoryNames: new Set(names),
    mangle: (i) => `__hoisted_${i}`,
  });
  return { result, chunk: { ...encoded, body: result.statements }, code: printChunk({ ...encoded, body: result.statements }) };
}

t("decodes unique literals in the outer factory and indexes them on the hot path", () => {
  const { result, code } = hoist(`
f = function()
  return function()
    print("frame-token", "dup", "dup")
  end
end
f()()
`);
  expect(result.hoisted).toBe(2);
  expect(code).toContain("local __hoisted_0 = {}");
  expect(code).toMatch(/__hoisted_0\[1\] = __dec_test\(/);
  const callback = code.slice(code.indexOf("return function"));
  expect(callback).not.toContain("__dec_test");
  expect(callback).toContain("__hoisted_0[1]");
  expect(callback).toContain("__hoisted_0[2]");
  const r = runLuau(code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("frame-token\tdup\tdup\n");
});

t("keeps duplicate literals to a single decode", () => {
  const { code } = hoist(`
f = function()
  return function()
    print("dup", "dup")
  end
end
`);
  const initializer = code.slice(code.indexOf("local __hoisted_0"), code.indexOf("return function"));
  expect((initializer.match(/__dec_test\(/g) || []).length).toBe(1);
});

t("gives each factory its own hoist table", () => {
  const { result, code } = hoist(
    `
f = function()
  return function() print("first") end
end
g = function()
  return function() print("second") end
end
`,
    ["f", "g"],
  );
  expect(result.hoisted).toBe(2);
  expect(code).toContain("local __hoisted_0");
  expect(code).toContain("local __hoisted_1");
  expect(code).not.toMatch(/__hoisted_0\[1\][\s\S]*second/);
});

t("is a no-op when encoding is disabled", () => {
  const ast = parse(lex(`
f = function()
  return function() print("plain") end
end
`).tokens);
  const result = hoistFactoryStrings(ast.body, {
    decoderName: "__dec_test",
    factoryNames: new Set(["f"]),
    mangle: () => "__hoisted",
  });
  expect(result.hoisted).toBe(0);
  expect(result.statements).toEqual(ast.body);
});
