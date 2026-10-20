import { lex } from "../lexer/Lexer.js";
import { parseWithErrors } from "../parser/Parser.js";
import type { Token, SourceLocation } from "../tokens.js";
import { obfuscate } from "../obfuscator/Obfuscator.js";
import { encodeStrings } from "../obfuscator/StringEncoder.js";
import { renameLocalMethods } from "../obfuscator/LocalMethodRenamer.js";
import { scrambleControlFlow } from "../obfuscator/ControlFlowScrambler.js";
import { applyMBA } from "../obfuscator/MBAEncoder.js";
import { printChunk, printChunkOneLine } from "../obfuscator/Printer.js";
import { adaptRkOffset } from "../vm/reg-offset.js";
import { compile } from "../vm/Compiler.js";
import { regCompile } from "../vm/RegCompiler.js";
import { generateVM } from "../vm/vm-gen.js";
import type { VMGenLevel } from "../vm/vm-gen.js";
import { generateRegVM } from "../vm/reg-vm-gen.js";
import type { RegVMLevel } from "../vm/reg-vm-gen.js";
import { prependOutputHeader } from "../vm/watermark.js";
import { applyFunctionMacroTiers, extractNativeFunctions, makeSeedMangler, rootCopyLua } from "./macros.js";
import type { Chunk, Statement } from "../ast/types.js";

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
  /** Phase 4.1: apply Mixed Boolean-Arithmetic to numeric constants. */
  mba?: boolean;
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
  /** Register-VM feature gates forced ON. */
  forceFeatures?: string[];
  /** Phase 3.2(b): advisory sink for macro decisions (vetoes, fallbacks). */
  onWarning?: (message: string) => void;
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
const PREFIX_LOADER_WRAPPER = String.raw`
local _0q_orig = loadstring or load
if type(_0q_orig) == "function" then
  local function _0q_wrap(_0q_code, _0q_name, _0q_mode)
    local _0q_env
    if type(getgenv) == "function" then
      local _0q_ok
      _0q_ok, _0q_env = pcall(getgenv)
      if not _0q_ok then _0q_env = nil end
    end
    local _0q_fn, _0q_err = _0q_orig(_0q_code, _0q_name, _0q_mode, _0q_env)
    if type(_0q_fn) == "function" and type(_0q_env) == "table" and type(setfenv) == "function" then
      pcall(setfenv, _0q_fn, _0q_env)
    end
    return _0q_fn, _0q_err
  end
  loadstring = _0q_wrap
  load = _0q_wrap
end
`;

function prefixLoaderWrapperStatements(): Statement[] {
  const lr = lex(PREFIX_LOADER_WRAPPER);
  if (lr.errors.length > 0) throw new PipelineLexError(lr.errors);
  const parsed = parseWithErrors(lr.tokens);
  if (parsed.errors.length > 0) throw new PipelineParseError(parsed.errors);
  return parsed.ast.body as Statement[];
}

export function runObfuscatePipeline(code: string, opts: PipelineOptions): string {
  const { tokens, errors: lexErrors, comments } = lex(code);
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

  const macroTiers = applyFunctionMacroTiers(code, ast, comments, tokens, opts.onWarning);

  if (opts.performanceTier) {
    if (opts.performanceTier === "turbo") { opts.vmType = "none"; opts.vmLevel = "normal"; }
    else if (opts.performanceTier === "balanced") { opts.vmType = "stack"; opts.vmLevel = "normal"; }
    else { opts.vmType = "register"; opts.vmLevel = "max"; }
  }
  if (opts.vmLevel !== "debug" && macroTiers.maximums.length > 0) {
    opts.vmType = "register";
    opts.vmLevel = "max";
  }

  const debugNative = opts.vmLevel === "debug";
  const executorGlobals = opts.executorGlobals ?? opts.vmLevel !== "debug";
  const polySeed = opts.polymorphicSeed ?? opts.seed ?? Date.now();

  const nativeNames = new Set<string>(macroTiers.turbos);
  if (debugNative) {
    for (const name of macroTiers.maximums) nativeNames.add(name);
  }

  let workingAst = ast;
  let nativeStatements: Statement[] = [];
  const nativeMangled: string[] = [];
  if (nativeNames.size > 0) {
    const extraction = extractNativeFunctions(
      workingAst,
      nativeNames,
      makeSeedMangler(polySeed),
      opts.onWarning,
    );
    workingAst = extraction.ast;
    nativeStatements = extraction.prefixStatements;
    for (const fn of extraction.extracted) nativeMangled.push(fn.mangled);
  }

  const debugPlaintextNative = debugNative && nativeStatements.length > 0;
  if (nativeStatements.length > 0) {
    if (!debugPlaintextNative) {
      const nativeChunk: Chunk = { type: "Chunk", loc: ast.loc, body: nativeStatements };
      const methodRename = renameLocalMethods([workingAst, nativeChunk], {
        onWarning: opts.onWarning,
      });
      workingAst = methodRename.chunks[0]!;
      nativeStatements = methodRename.chunks[1]!.body as Statement[];
    }
  } else {
    workingAst = renameLocalMethods([workingAst], {
      onWarning: opts.onWarning,
    }).chunks[0]!;
  }

  if (opts.encodeStrings) {
    workingAst = encodeStrings(workingAst, opts.seed !== undefined ? { enabled: true, seed: opts.seed } : { enabled: true });
  }

  if (opts.scramble) {
    workingAst = scrambleControlFlow(workingAst, opts.seed !== undefined ? { enabled: true, seed: opts.seed } : { enabled: true });
  }

  if (opts.mba) {
    workingAst = applyMBA(workingAst, { enabled: true, seed: typeof opts.seed === "number" ? opts.seed : 0 });
  }

  if (nativeStatements.length > 0) {
    let nativeChunk: Chunk = { type: "Chunk", loc: ast.loc, body: nativeStatements };
    if (!debugPlaintextNative) {
      const turboDecoder = makeSeedMangler(polySeed, "td")("dec", 0);
      nativeChunk = encodeStrings(nativeChunk, {
        enabled: true,
        ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
        decoderName: turboDecoder,
      });
      nativeChunk = applyMBA(nativeChunk, {
        enabled: true,
        seed: typeof opts.seed === "number" ? opts.seed : 0,
      });
    }
    nativeStatements = [...prefixLoaderWrapperStatements(), ...(nativeChunk.body as Statement[])];
  }

  const obfuscated = obfuscate(workingAst, {
    renameLocals: opts.renameLocals,
    preserveGlobals: opts.preserveGlobals,
  });

  let nativePrefix = "";
  if (nativeStatements.length > 0) {
    const prefixChunk: Chunk = { type: "Chunk", loc: ast.loc, body: nativeStatements };
    const obfuscatedPrefix = obfuscate(prefixChunk, {
      renameLocals: debugPlaintextNative ? false : opts.renameLocals,
      preserveGlobals: opts.preserveGlobals,
      nameStyle: "hex",
    });
    nativePrefix = printChunk(obfuscatedPrefix);
    nativePrefix += "\n" + rootCopyLua(nativeMangled) + "\n";
  }

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
      _nativePrefix: nativePrefix,
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
    const chunk0 = regCompile(obfuscated, { rkOffset });
    // Large-input rescue: if the compiled constant table (or register count)
    // does not fit below the seeded offset, widen the offset and recompile
    // so operand baking and the runtime threshold agree. Ordinary scripts
    // keep the seeded draw untouched (widened === false, single compile).
    const adapt = adaptRkOffset(chunk0, rkOffset);
    const finalRkOffset = adapt.rkOffset;
    const chunk = adapt.widened ? regCompile(obfuscated, { rkOffset: finalRkOffset }) : chunk0;
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
    const forceFeatures = [...(opts.forceFeatures ?? [])];
    return generateRegVM(chunk, {
      level: opts.vmLevel as RegVMLevel,
      executorGlobals,
      polymorphicSeed: polySeed,
      rkOffset: finalRkOffset,
      disableFeatures: disableFeatures as any[],
      ...(forceFeatures.length > 0 ? { forceFeatures: forceFeatures as any[] } : {}),
      ...(opts.debugTrace !== undefined ? { debugTrace: opts.debugTrace } : {}),
      ...(opts.target !== undefined ? { target: opts.target } : {}),
      _nativePrefix: nativePrefix,
    });
  }

  const printed = opts.oneLine ? printChunkOneLine(obfuscated) : printChunk(obfuscated);
  return nativePrefix.length > 0 ? prependOutputHeader(printed, nativePrefix) : printed;
}
