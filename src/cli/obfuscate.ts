#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { runObfuscatePipeline, PipelineLexError, PipelineParseError } from "../engine/obfuscatePipeline.js";
import type { PipelineVmLevel } from "../engine/obfuscatePipeline.js";

const args = process.argv.slice(2);
const noRename = args.includes("--no-rename");
const noPreserve = args.includes("--no-preserve");
const encodeStringsOpt = args.includes("--encode-strings");
const noEncode = args.includes("--no-encode");
const scrambleOpt = args.includes("--scramble");
const vmOpt = args.includes("--vm");
const junkOpt = args.includes("--junk");
const oneLineOpt = args.includes("--one-line");
const productionOpt = args.includes("--production");
const advancedOpt = args.includes("--advanced");
const maxOpt = args.includes("--max");
const compressOpt = args.includes("--compress");
const noCompressOpt = args.includes("--no-compress");
const outIndex = args.findIndex((a) => a === "-o" || a === "--output");
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
const fileArgs = args.filter((a, i) =>
  !a.startsWith("-") && (outIndex < 0 || i < outIndex || i > outIndex + 1)
);
const file = fileArgs[0];

const source = file
  ? readFileSync(file, "utf-8")
  : `local x = 42
local name = "World"
print("Hello " .. name)
function foo(a, b)
  return a + b
end
`;

const vmDebug = args.includes("--vm-debug");

let level: PipelineVmLevel = "normal";
if (vmDebug || args.includes("--no-vm-encode")) level = "debug";
if (maxOpt || advancedOpt || productionOpt) level = "max";

let output: string;
try {
  output = runObfuscatePipeline(source, {
    renameLocals: !noRename,
    preserveGlobals: !noPreserve,
    // NOTE: --one-line is accepted but historically ignored here (always
    // printChunk); preserved. --junk/--compress are accepted no-ops.
    encodeStrings: encodeStringsOpt && !noEncode,
    scramble: scrambleOpt,
    oneLine: false,
    vmType: vmOpt ? "stack" : "none",
    vmLevel: level,
    noCompression: noCompressOpt,
  });
} catch (err: any) {
  if (err instanceof PipelineLexError) {
    console.error("Lexer-Fehler:", err.details);
  } else if (err instanceof PipelineParseError) {
    console.error("Parse-Fehler:", err.details);
  } else {
    console.error("Obfuscation error:", err?.message ?? err);
  }
  process.exit(1);
  throw err;
}

if (outFile) {
  writeFileSync(outFile, output, "utf-8");
  console.error(`Obfuskiert nach ${outFile}`);
} else {
  console.log(output);
}
