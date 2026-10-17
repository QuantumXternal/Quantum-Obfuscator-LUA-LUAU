import { lex } from "../lexer/Lexer.js";
import { parseWithErrors } from "../parser/Parser.js";
import type { Token, SourceLocation } from "../tokens.js";
import { obfuscate } from "../obfuscator/Obfuscator.js";
import { encodeStrings } from "../obfuscator/StringEncoder.js";
import { scrambleControlFlow } from "../obfuscator/ControlFlowScrambler.js";
import { printChunk, printChunkOneLine } from "../obfuscator/Printer.js";
import { compile } from "../vm/Compiler.js";
import { regCompile } from "../vm/RegCompiler.js";
import { generateVM } from "../vm/vm-gen.js";
import type { VMGenLevel } from "../vm/vm-gen.js";
import { generateRegVM } from "../vm/reg-vm-gen.js";
import type { RegVMLevel } from "../vm/reg-vm-gen.js";

export type PipelineVmType = "none" | "stack" | "register";
export type PipelineVmLevel = "debug" | "normal" | "max";
export type PerformanceTier = "turbo" | "balanced" | "maximum";

export interface PipelineOptions {
  renameLocals: boolean;
  preserveGlobals: boolean;
  encodeStrings: boolean;
  scramble: boolean;
  oneLine: boolean;
  vmType: PipelineVmType;
  vmLevel: PipelineVmLevel;
  /** Phase 3.1: performance tier. Overrides vmType/vmLevel when set.
   *  turbo = AST transforms only (no VM); balanced = stack VM;
   *  maximum = register VM + polymorphic dispatch + anti-analysis. */
  performanceTier?: PerformanceTier;
  /** Deterministic seed for encode/scramble/polymorphic generation. Omitted = legacy random. */
  seed?: number;
  /**
   * VM polymorphic seed override. Defaults to seed ?? Date.now().
   * Phase 1.2(b): number | string. Numbers keep the legacy 32-bit stream
   * bit-for-bit; strings (any UTF-16 incl. empty — valid, deterministic,
   * distinct from absent) take the 128-bit sfc32 path (claimed space 2^128;
   * >= 16 chars recommended for full entropy). Passed through to the VM
   * generators, which document the full contract on their options.
   */
  polymorphicSeed?: number | string;
  /** Extra VM feature gates, appended to level-implied defaults. */
  disableFeatures?: string[];
  /** Stack VM only. Passed through to generateVM. */
  noCompression?: boolean;
  /** Override executor-globals default (level !== "debug"). */
  executorGlobals?: boolean;
  /** Register VM only. Passed through to generateRegVM (default: level === "debug"). */
  debugTrace?: boolean;
  /**
   * Output environment. "roblox" enables executor globals handling and the
   * Roblox bootstrap anti-tamper block; anything else stays fully generic.
   * Passed through to generateRegVM (which ignores unknown values).
   */
  target?: string;
  /**
   * Optional telemetry hook invoked with compiled bytecode stats.
   * Used by the register-VM CLI to preserve its `[RegVM] Bytecode:` log line.
   */
  onBytecode?: (info: { instructions: number; constants: number; protos: number; maxRegs: number }) => void;
  /** Phase 3.2: function names to exclude from VM virtualization (macro). */
  noVmFunctions?: string[];
}

export class PipelineLexError extends Error {
  details: unknown[];
  constructor(details: unknown[]) {
    super("Lexer error");
    this.name = "PipelineLexError";
    this.details = details;
  }
}

export class PipelineParseError extends Error {
  details: unknown[];
  constructor(details: unknown[]) {
    super("Parse error");
    this.name = "PipelineParseError";
    this.details = details;
  }
}

/**
 * Truncation guard (CLI exit-code hygiene; Parser.ts intentionally untouched).
 * The parser silently drops failed trailing constructs (`local x =`, `1 + `)
 * without recording an error. A complete chunk can never end with a
 * continuation-demanding token, so such an ending is always invalid input.
 * Returns a parser-shaped diagnostic, or null when the ending is clean.
 * Zero false positives over the benchmark corpus (gated by cli-exit-codes).
 */
const DANGLING_END_TOKENS = new Set([
  "=", "(", ",",
  "+", "-", "*", "/", "%", "^", "..",
  "<", ">", "<=", ">=", "==", "~=",
  "&", "|", "~", ">>", "<<", "//",
  "and", "or", "not",
]);
export function checkTruncatedInput(tokens: Token[]): { message: string; loc: SourceLocation } | null {
  let end = tokens.length - 1;
  while (end >= 0 && tokens[end]!.type === "EOF") end--;
  if (end < 0) return null;
  const t = tokens[end]!;
  if ((t.type === "Punctuator" || t.type === "Keyword") && "value" in t && DANGLING_END_TOKENS.has((t as { value: string }).value)) {
    return { message: "Unexpected end of input", loc: (t as { loc: SourceLocation }).loc };
  }
  return null;
}

/**
 * Single shared obfuscation engine used by the server and all CLIs.
 * Sequence: lex -> parse -> [encode] -> [scramble] -> rename ->
 *   stack: compile + generateVM | register: regCompile + generateRegVM | none: print.
 * Throws PipelineLexError on lex errors and PipelineParseError on parse errors.
 */
export function runObfuscatePipeline(code: string, opts: PipelineOptions): string {
  const { tokens, errors: lexErrors } = lex(code);
  if (lexErrors.length > 0) {
    throw new PipelineLexError(lexErrors);
  }

  const parsed = parseWithErrors(tokens);
  if (parsed.errors.length > 0) {
    throw new PipelineParseError(parsed.errors);
  }
  const truncated = checkTruncatedInput(tokens);
  if (truncated) {
    throw new PipelineParseError([truncated]);
  }
  let ast = parsed.ast;

  if (opts.encodeStrings) {
    ast = encodeStrings(ast, opts.seed !== undefined ? { enabled: true, seed: opts.seed } : { enabled: true });
  }

  if (opts.scramble) {
    ast = scrambleControlFlow(ast, opts.seed !== undefined ? { enabled: true, seed: opts.seed } : { enabled: true });
  }

  // Phase 3.2: macro directive --@quantum:no-vm. Pre-scan raw source for the
  // directive immediately preceding a function declaration; record the
  // function name so it can be excluded from virtualization.
  const noVmFunctions = new Set<string>(opts.noVmFunctions ?? []);
  const lines = code.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (/--@\s*quantum\s*:\s*no-vm/i.test(lines[i])) {
      const m = lines[i + 1].match(/(?:local\s+)?function\s+([A-Za-z_]\w*)/);
      if (m) noVmFunctions.add(m[1]);
    }
  }
  opts.noVmFunctions = [...noVmFunctions];

  const obfuscated = obfuscate(ast, {
    renameLocals: opts.renameLocals,
    preserveGlobals: opts.preserveGlobals,
  });

  // Phase 3.1: resolve performance tier to vmType/vmLevel.
  if (opts.performanceTier) {
    if (opts.performanceTier === "turbo") { opts.vmType = "none"; opts.vmLevel = "normal"; }
    else if (opts.performanceTier === "balanced") { opts.vmType = "stack"; opts.vmLevel = "normal"; }
    else { opts.vmType = "register"; opts.vmLevel = "max"; }
  }
  const executorGlobals = opts.executorGlobals ?? opts.vmLevel !== "debug";
  const polySeed = opts.polymorphicSeed ?? opts.seed ?? Date.now();

  if (opts.vmType === "stack") {
    const chunk = compile(obfuscated);
    opts.onBytecode?.({
      instructions: chunk.code.length,
      constants: chunk.K.length,
      protos: chunk.protos?.length ?? 0,
      maxRegs: 0,
    });
    return generateVM(chunk, {
      level: opts.vmLevel as VMGenLevel,
      executorGlobals,
      noCompression: opts.noCompression,
      polymorphicSeed: polySeed,
    });
  }

  if (opts.vmType === "register") {
    // Phase 1.2(g): per-build RK_OFFSET drawn from odd non-power-of-two
    // domain [2049, 8191], seeded by polySeed. Threaded to both regCompile
    // and generateRegVM so compile-time and runtime thresholds agree.
    const rkOffset = (() => {
      let seedNum = 0;
      if (typeof polySeed === "number") seedNum = polySeed | 0;
      else for (let i = 0; i < String(polySeed).length; i++) seedNum = (seedNum * 31 + String(polySeed).charCodeAt(i)) | 0;
      let v = 2049 + (Math.abs(seedNum) % 3072) * 2;
      if (v % 2 === 0) v += 1;
      if (v > 8191) v = 8191;
      if (v < 2049) v = 2049;
      return v;
    })();
    const chunk = regCompile(obfuscated, { rkOffset });
    opts.onBytecode?.({
      instructions: chunk.code.length / 4,
      constants: chunk.K.length,
      protos: chunk.protos?.length ?? 0,
      maxRegs: chunk.maxRegs,
    });
    const disableFeatures = [...(opts.disableFeatures ?? [])];
    if (opts.vmLevel === "debug" && !disableFeatures.includes("controlFlowFlattening")) {
      disableFeatures.push("controlFlowFlattening");
    }
    return generateRegVM(chunk, {
      level: opts.vmLevel as RegVMLevel,
      executorGlobals,
      polymorphicSeed: polySeed,
      rkOffset,
      disableFeatures: disableFeatures as any[],
      ...(opts.debugTrace !== undefined ? { debugTrace: opts.debugTrace } : {}),
      ...(opts.target !== undefined ? { target: opts.target } : {}),
    });
  }

  return opts.oneLine ? printChunkOneLine(obfuscated) : printChunk(obfuscated);
}
