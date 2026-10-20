// StringEncoder: UTF-8 byte tables, rolling cipher, and char-value sanitizing.
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
const { printChunk } = await import("../dist/obfuscator/Printer.js");

const TMP = mkdtempSync(join(tmpdir(), "string-encoder-"));
let counter = 0;

function runLuau(code) {
  const f = join(TMP, `enc-${process.pid}-${counter++}.luau`);
  writeFileSync(f, code, "utf8");
  const r = spawnSync(LUAU, [f], { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  rmSync(f, { force: true });
  return {
    stdout: (r.stdout || "").replace(/\r\n/g, "\n"),
    stderr: (r.stderr || "").replace(/\r\n/g, "\n"),
  };
}

function encode(src, options = {}) {
  return encodeStrings(parse(lex(src).tokens), { seed: 42, decoderName: "__dec_test", ...options });
}

function decoderCall(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === "__dec_test") {
    return node;
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = decoderCall(item);
        if (hit) return hit;
      }
    } else {
      const hit = decoderCall(value);
      if (hit) return hit;
    }
  }
  return null;
}

t("round-trips Unicode through UTF-8 bytes", () => {
  const text = "héllo 世界 🚀";
  const code = printChunk(encode(`local s = ${JSON.stringify(text)}\nprint(s)\n`));
  const r = runLuau(code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe(`${text}\n`);
});

t("budgets by UTF-8 byte length, not UTF-16 code units", () => {
  const oneByte = encode(`local s = "é"\n`, { maxStringLength: 1 });
  expect(decoderCall(oneByte)).toBeNull();
  const twoBytes = encode(`local s = "é"\n`, { maxStringLength: 2 });
  expect(decoderCall(twoBytes)).not.toBeNull();
});

t("sanitizes byte, key, and char values before string.char", () => {
  const code = printChunk(encode(`local s = "safe"\n`));
  expect(code).toContain("tonumber(t[i])");
  expect(code).toContain("tonumber(k)");
  expect(code).toContain("tonumber(v)");
  expect(code).toContain("string.char");
  expect(code).not.toContain("string.char(bit32.bxor");
});

t("rolling schedule produces different bytes for repeated input", () => {
  const ast = encode(`local s = "aaaa"\n`);
  const call = decoderCall(ast);
  const bytes = call.args[0].fields.map((f) => Number(f.value.value));
  expect(new Set(bytes).size).toBeGreaterThan(1);
});
