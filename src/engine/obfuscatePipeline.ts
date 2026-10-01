import { lex } from "../lexer/Lexer.js";
import { parse } from "../parser/Parser.js";
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

export interface PipelineOptions {
  renameLocals: boolean;
  preserveGlobals: boolean;
  encodeStrings: boolean;
  scramble: boolean;
  oneLine: boolean;
  vmType: PipelineVmType;
  vmLevel: PipelineVmLevel;
  /** Deterministic seed for encode/scramble/polymorphic generation. Omitted = legacy random. */
  seed?: number;
  /** VM polymorphic seed override. Defaults to seed ?? Date.now(). */
  polymorphicSeed?: number;
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
}

export class PipelineLexError extends Error {
  details: unknown[];
  constructor(details: unknown[]) {
    super("Lexer error");
    this.name = "PipelineLexError";
    this.details = details;
  }
}

/**
 * Single shared obfuscation engine used by the server and all CLIs.
 * Sequence: lex -> parse -> [encode] -> [scramble] -> rename ->
 *   stack: compile + generateVM | register: regCompile + generateRegVM | none: print.
 * Throws PipelineLexError on lex errors; lets parse errors propagate.
 */
export function runObfuscatePipeline(code: string, opts: PipelineOptions): string {
  const { tokens, errors: lexErrors } = lex(code);
  if (lexErrors.length > 0) {
    throw new PipelineLexError(lexErrors);
  }

  let ast = parse(tokens);

  if (opts.encodeStrings) {
    ast = encodeStrings(ast, opts.seed !== undefined ? { enabled: true, seed: opts.seed } : { enabled: true });
  }

  if (opts.scramble) {
    ast = scrambleControlFlow(ast, opts.seed !== undefined ? { enabled: true, seed: opts.seed } : { enabled: true });
  }

  const obfuscated = obfuscate(ast, {
    renameLocals: opts.renameLocals,
    preserveGlobals: opts.preserveGlobals,
  });

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
    const chunk = regCompile(obfuscated);
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
      disableFeatures: disableFeatures as any[],
      ...(opts.debugTrace !== undefined ? { debugTrace: opts.debugTrace } : {}),
      ...(opts.target !== undefined ? { target: opts.target } : {}),
    });
  }

  return opts.oneLine ? printChunkOneLine(obfuscated) : printChunk(obfuscated);
}
