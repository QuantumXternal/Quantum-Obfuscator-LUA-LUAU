// Temporary prize-sizing: narrow-pattern share + MOVE counts per fixture.
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");

const PURE = new Set(["NilLiteral", "BooleanLiteral", "NumberLiteral", "StringLiteral", "Identifier"]);
function walk(stmts, fn) {
  for (const s of stmts) {
    fn(s);
    for (const k of ["body", "thenBody", "elseBody"]) if (Array.isArray(s[k])) walk(s[k], fn);
    for (const c of s.elseifClauses || []) { walk(c.body, fn); }
  }
}
for (const f of readdirSync(join(__dirname, "fixtures")).filter((x) => x.endsWith(".lua")).sort()) {
  const src = readFileSync(join(__dirname, "fixtures", f), "utf8");
  const ast = parse(lex(src).tokens);
  let assign = 0, narrow = 0;
  walk(ast.body, (s) => {
    if (s.type === "AssignmentStatement") {
      assign++;
      if (s.vars.length === 1 && s.values.length === 1 && s.vars[0].type === "Identifier" && PURE.has(s.values[0].type)) narrow++;
    }
  });
  const chunk = regCompile(ast);
  let moves = 0, total = 0;
  const scan = (c) => { for (let i = 0; i < c.code.length; i += 4) { total++; if (c.code[i] === 4) moves++; } for (const p of c.protos || []) scan(p); };
  scan(chunk);
  console.log(`${f}: assignStmts=${assign} narrowEligible=${narrow} moves=${moves} totalInstrs=${total} narrowShare=${total ? (100 * narrow / total).toFixed(2) : 0}%`);
}
