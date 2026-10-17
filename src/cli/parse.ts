#!/usr/bin/env node

import { readFileSync } from "fs";
import { lex } from "../lexer/Lexer.js";
import { parseWithErrors } from "../parser/Parser.js";
import { checkTruncatedInput } from "../engine/obfuscatePipeline.js";

const args = process.argv.slice(2);
const validateOnly = args.includes("--validate");
const file = args.find((a) => !a.startsWith("-"));

const source = file
  ? readFileSync(file, "utf-8")
  : `local x = 42
print("Hello " .. x)
function foo(a, b)
  return a + b
end
`;

const { tokens, errors } = lex(source);
if (errors.length > 0) {
  console.error("Lexer-Fehler:", errors);
  process.exit(1);
}

const { ast, errors: parseErrors } = parseWithErrors(tokens);
const truncated = checkTruncatedInput(tokens);
if (truncated) parseErrors.push(truncated);
if (parseErrors.length > 0) {
  console.error("Parser-Fehler:", parseErrors);
  process.exit(1);
}

if (validateOnly) {
  console.log("OK – Parse erfolgreich");
} else {
  console.log(JSON.stringify(ast, null, 2));
}
