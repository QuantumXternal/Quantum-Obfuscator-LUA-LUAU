#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { runObfuscatePipeline, PipelineLexError } from "../engine/obfuscatePipeline.js";
import type { PipelineVmLevel } from "../engine/obfuscatePipeline.js";

const args = process.argv.slice(2);

let level: PipelineVmLevel = "normal";
if (args.includes("--debug")) level = "debug";
if (args.includes("--max")) level = "max";

const outIndex = args.findIndex(a => a === "-o" || a === "--output");
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;
const fileArgs = args.filter((a, i) =>
  !a.startsWith("-") && (outIndex < 0 || i < outIndex || i > outIndex + 1)
);
const file = fileArgs[0];

if (!file) {
  console.error("Usage: node reg-vm-obfuscate.js [--debug|--normal|--max] [-o output.lua] input.lua");
  process.exit(1);
}

const source = readFileSync(file, "utf-8");
console.error(`[RegVM] Input: ${file} (${source.length} chars)`);
console.error(`[RegVM] Level: ${level}`);

const t0 = Date.now();

// Obfuscate AST (rename locals) + compile + generate via shared engine.
// NOTE: no encode/scramble passes here (historical behavior preserved).
const disableFeatures: string[] = [];
if (args.includes("--no-cff")) disableFeatures.push("controlFlowFlattening");
let output: string;
try {
  output = runObfuscatePipeline(source, {
    renameLocals: true,
    preserveGlobals: true,
    encodeStrings: false,
    scramble: false,
    oneLine: false,
    vmType: "register",
    vmLevel: level,
    executorGlobals: level !== "debug",
    polymorphicSeed: Date.now(),
    debugTrace: false,
    disableFeatures,
    onBytecode: (info) => console.error(
      `[RegVM] Bytecode: ${info.instructions} instructions, ${info.constants} constants, ${info.protos} protos, maxRegs=${info.maxRegs}`
    ),
  });
} catch (err: any) {
  if (err instanceof PipelineLexError) {
    console.error("Lexer errors:", (err.details as any[]).map(e => e.message));
  } else {
    console.error("Obfuscation error:", err?.message ?? err);
  }
  process.exit(1);
  throw err;
}

const elapsed = Date.now() - t0;
console.error(`[RegVM] Output: ${output.length} chars (${elapsed}ms)`);

if (outFile) {
  writeFileSync(outFile, output, "utf-8");
  console.error(`[RegVM] Written to ${outFile}`);
} else {
  console.log(output);
}
