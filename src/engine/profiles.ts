import type { PipelineOptions, PipelineVmType, PipelineVmLevel } from "./obfuscatePipeline.js";

export type ProtectionProfile = "FAST" | "BALANCED" | "MAXIMUM";
export type ObfuscationTarget = "generic" | "roblox";

export interface ProfileRequest {
  profile: ProtectionProfile;
  /** Environment the output must run in. Default "generic". */
  target?: ObfuscationTarget;
  /** Deterministic seed. Omitted = legacy random. */
  seed?: number;
  /** Exact polymorphic seed override. Omitted = derived from seed (or random). */
  polymorphicSeed?: number;
  /** Explicit VM overrides. Omitted fields fall back to profile defaults. */
  vmType?: PipelineVmType;
  vmLevel?: PipelineVmLevel;
}

/**
 * Explicit protection profiles. Each profile is a deliberate tradeoff —
 * no hidden MAXIMUM-only features in lower tiers:
 *
 * FAST:     AST transforms only where cheap (rename), no VM. Fastest build,
 *           smallest output, weakest structural protection.
 * BALANCED: rename + string/AST transforms + register VM at normal level
 *           (shuffle, string cipher, fusion, flattening, dead-handler
 *           elimination). No nesting, no lazy/fragment pools, no
 *           environment-specific behavior. This is the web UI default.
 * MAXIMUM:  BALANCED + register VM at max level. Still generic unless
 *           target === "roblox", which additionally enables executor
 *           globals and the Roblox anti-tamper bootstrap block.
 */
export function resolveProfile(req: ProfileRequest): PipelineOptions {
  const target: ObfuscationTarget = req.target ?? "generic";
  const seed = req.seed;
  const polymorphicSeed = req.polymorphicSeed;

  switch (req.profile) {
    case "FAST":
      return {
        renameLocals: true,
        preserveGlobals: true,
        encodeStrings: false,
        scramble: false,
        oneLine: false,
        vmType: req.vmType ?? "none",
        vmLevel: req.vmLevel ?? "normal",
        seed,
        polymorphicSeed,
        target,
        executorGlobals: false,
      };
    case "BALANCED":
      return {
        renameLocals: true,
        preserveGlobals: true,
        encodeStrings: true,
        scramble: true,
        oneLine: false,
        vmType: req.vmType ?? "register",
        vmLevel: req.vmLevel ?? "normal",
        seed,
        polymorphicSeed,
        target,
        executorGlobals: false,
      };
    case "MAXIMUM":
      return {
        renameLocals: true,
        preserveGlobals: true,
        encodeStrings: true,
        scramble: true,
        oneLine: false,
        vmType: req.vmType ?? "register",
        vmLevel: req.vmLevel ?? "max",
        seed,
        polymorphicSeed,
        target,
        // Executor globals and the Roblox bootstrap block are strictly
        // opt-in via target === "roblox". Generic MAXIMUM stays generic.
        executorGlobals: target === "roblox",
      };
  }
}

/** UI select defaults per profile (vmType, vmLevel). */
export function profileDefaults(profile: ProtectionProfile): { vmType: PipelineVmType; vmLevel: PipelineVmLevel } {
  switch (profile) {
    case "FAST":
      return { vmType: "none", vmLevel: "normal" };
    case "BALANCED":
      return { vmType: "register", vmLevel: "normal" };
    case "MAXIMUM":
      return { vmType: "register", vmLevel: "max" };
  }
}
