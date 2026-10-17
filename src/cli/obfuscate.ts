#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { runObfuscatePipeline, PipelineLexError, PipelineParseError } from "../engine/obfuscatePipeline.js";
import type { PipelineVmLevel } from "../engine/obfuscatePipeline.js";
import { resolveProfile } from "../engine/profiles.js";
import { DEFAULT_MAX_INPUT_BYTES, envInt, parseByteSize } from "../engine/inputLimits.js";

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

// Input-size guard: large scripts make the tokenizer/parser and the
// (optional) VM generation balloon; refuse upfront with an actionable
// override instead of thrashing. Mirrors the server cap.
const maxSizeRaw = args.find((a) => a.startsWith("--max-size="))?.slice("--max-size=".length) ?? null;
let maxInputBytes = envInt("MAX_INPUT_BYTES", DEFAULT_MAX_INPUT_BYTES);
if (maxSizeRaw !== null) {
  const parsed = parseByteSize(maxSizeRaw);
  if (parsed === null) {
    console.error(`Invalid --max-size value: ${maxSizeRaw} (expected e.g. 262144, 256kb, 2mb)`);
    process.exit(1);
  }
  maxInputBytes = parsed;
}
const sourceBytes = Buffer.byteLength(source, "utf8");
if (sourceBytes > maxInputBytes) {
  console.error(`Input too large: ${sourceBytes} bytes exceeds ${maxInputBytes} (raise with --max-size=<bytes|KB|MB> or MAX_INPUT_BYTES)`);
  process.exit(1);
}

const vmDebug = args.includes("--vm-debug");

// Protection profile + deterministic seed (UI parity: a filled seed field
// sends both seed and polymorphicSeed, so the CLI does the same).
const VALID_PROFILES = ["FAST", "BALANCED", "MAXIMUM"] as const;
const profileRaw = args.find((a) => a.startsWith("--profile="))?.slice("--profile=".length) ?? null;
let profile: (typeof VALID_PROFILES)[number] | undefined;
if (profileRaw !== null) {
  if (!(VALID_PROFILES as readonly string[]).includes(profileRaw)) {
    console.error(`Invalid --profile value: ${profileRaw} (expected FAST, BALANCED, or MAXIMUM)`);
    process.exit(1);
  }
  profile = profileRaw as (typeof VALID_PROFILES)[number];
}
const seedRaw = args.find((a) => a.startsWith("--seed="))?.slice("--seed=".length) ?? null;
let seed: number | undefined;
if (seedRaw !== null) {
  seed = Number(seedRaw);
  if (!Number.isFinite(seed)) {
    console.error(`Invalid --seed value: ${seedRaw} (expected a number, e.g. --seed=1234)`);
    process.exit(1);
  }
}
const targetRaw = args.find((a) => a.startsWith("--target="))?.slice("--target=".length) ?? null;
let target: "generic" | "roblox" = "generic";
if (targetRaw !== null) {
  if (targetRaw !== "generic" && targetRaw !== "roblox") {
    console.error(`Invalid --target value: ${targetRaw} (expected generic or roblox)`);
    process.exit(1);
  }
  target = targetRaw;
}

let level: PipelineVmLevel = "normal";
if (vmDebug || args.includes("--no-vm-encode")) level = "debug";
if (maxOpt || advancedOpt || productionOpt) level = "max";

const seedOpts = seed !== undefined ? { seed, polymorphicSeed: seed } : {};

let output: string;
try {
  if (profile !== undefined) {
    // Profile supplies defaults; explicitly provided flags override
    // (same precedence as the server).
    const base = resolveProfile({ profile, target, ...seedOpts }) as unknown as Record<string, unknown>;
    if (vmOpt) base.vmType = "stack";
    if (vmDebug || args.includes("--no-vm-encode")) base.vmLevel = "debug";
    else if (maxOpt || advancedOpt || productionOpt) base.vmLevel = "max";
    if (noRename) base.renameLocals = false;
    if (noPreserve) base.preserveGlobals = false;
    if (encodeStringsOpt) base.encodeStrings = true;
    if (noEncode) base.encodeStrings = false;
    if (scrambleOpt) base.scramble = true;
    if (oneLineOpt) base.oneLine = true;
    if (noCompressOpt) base.noCompression = true;
    output = runObfuscatePipeline(source, base as any);
  } else {
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
      target,
      ...seedOpts,
    });
  }
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
