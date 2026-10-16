// Lexer must report invalid \\u{} escapes as LexErrors, never throw.
// Provenance: '\\u{110000}' (0x110000 > String.fromCodePoint's 0x10FFFF
// domain) threw RangeError out of readEscapeSequence, escaping as a 500
// through the server instead of a mapped 400. Out-of-range codepoints stay
// unsupported (matching fromCodePoint's domain; Lua 5.4's <2^31 original
// UTF-8 forms have no demand) — but they must be REPORTED, not thrown.
import { lex } from "../dist/lexer/Lexer.js";
import { runObfuscatePipeline, PipelineLexError } from "../dist/engine/obfuscatePipeline.js";

test("out-of-range \\u{} escape yields LexError, not throw", () => {
  let lr = null;
  expect(() => { lr = lex("'\\u{110000}'"); }).not.toThrow();
  expect(lr.errors.length).toBeGreaterThan(0);
  expect(lr.errors.some((e) => (e.message || "").includes("\\u"))).toBe(true);
});

test("max valid \\u{10FFFF} still lexes clean", () => {
  const lr = lex("'\\u{10FFFF}'");
  expect(lr.errors.length).toBe(0);
});

test("malformed \\u{} shapes keep existing behavior", () => {
  expect(lex("'\\ux'").errors.length).toBe(0);
  expect(lex("'\\u{}'").errors.length).toBe(0);
});

test("pipeline maps the escape failure to PipelineLexError (server 400 path)", () => {
  expect(() => runObfuscatePipeline("'\\u{110000}'", {})).toThrow(PipelineLexError);
});
