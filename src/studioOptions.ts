import { resolveProfile } from "./engine/profiles.js";
import type { ObfuscationTarget, ProtectionProfile } from "./engine/profiles.js";
import type { PipelineOptions, PipelineVmLevel, PipelineVmType } from "./engine/obfuscatePipeline.js";

export type StudioProfile = "TURBO" | "BALANCED" | "MAXIMUM" | "CUSTOM" | "FAST";
export type StudioTurboLevel = "light" | "heavy";
export type StudioAutoTier = "turbo" | "maximum";

export interface StudioLuraphSettings {
  intenseVM: boolean;
  useDebugLib: boolean;
  vmCompression: boolean;
}

export interface StudioPlan {
  profile: StudioProfile;
  pipeline: PipelineOptions;
  target: ObfuscationTarget;
  autoDetectMacros: boolean;
  turboLevel: StudioTurboLevel;
  autoTier: StudioAutoTier;
  luraph: StudioLuraphSettings;
  /** Full normalized request shape used by the server's LRU key. */
  cacheOptions: Record<string, unknown>;
}

export interface StudioPlanContext {
  seed?: number;
  polymorphicSeed?: number | string;
}

export class StudioOptionsError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "StudioOptionsError";
  }
}

function normalizeProfile(raw: unknown): StudioProfile | null {
  if (typeof raw !== "string") return null;
  switch (raw.trim().toLowerCase()) {
    case "turbo":
      return "TURBO";
    case "balanced":
      return "BALANCED";
    case "maximum":
      return "MAXIMUM";
    case "custom":
      return "CUSTOM";
    case "fast":
      return "FAST";
    default:
      return null;
  }
}

function parseTarget(raw: unknown): ObfuscationTarget {
  if (raw === undefined || raw === null) return "generic";
  if (raw === "generic" || raw === "roblox") return raw;
  throw new StudioOptionsError("Invalid 'target' (expected generic or roblox)");
}

function parseVmType(raw: unknown): PipelineVmType | undefined {
  if (raw === undefined || raw === null || raw === "" || raw === "custom") return undefined;
  if (raw === "none" || raw === "stack" || raw === "register") return raw;
  throw new StudioOptionsError("Invalid 'vmType' (expected none, stack, register, or custom)");
}

function parseVmLevel(raw: unknown): PipelineVmLevel | undefined {
  if (raw === undefined || raw === null || raw === "" || raw === "custom") return undefined;
  if (raw === "debug" || raw === "normal") return raw;
  if (raw === "max" || raw === "maximum") return "max";
  throw new StudioOptionsError("Invalid 'vmLevel' (expected debug, normal, max, or custom)");
}

function boolSetting(raw: unknown): boolean {
  return raw === true;
}

function parseLuraph(raw: unknown): StudioLuraphSettings {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    intenseVM: boolSetting(value.intenseVM),
    useDebugLib: boolSetting(value.useDebugLib),
    vmCompression: value.vmCompression !== false,
  };
}

function addForceFeatures(base: PipelineOptions, features: string[]): void {
  const set = new Set<string>(base.forceFeatures ?? []);
  for (const feature of features) set.add(feature);
  base.forceFeatures = [...set];
}

/**
 * Resolve new Studio settings into the existing pipeline contract. Returns null
 * when no profile was supplied so the server can retain its legacy path.
 *
 * Precedence: profile defaults -> explicit VM/level/AST overrides -> Studio
 * hardening toggles. Turbo keeps FAST AST passes and requests the turbo
 * performance tier unless the caller explicitly overrides the VM.
 */
export function buildStudioPlan(raw: Record<string, unknown>, context: StudioPlanContext = {}): StudioPlan | null {
  if (raw.profile === undefined || raw.profile === null || raw.profile === "") return null;
  const profile = normalizeProfile(raw.profile);
  if (!profile) {
    throw new StudioOptionsError("Invalid 'profile' (expected turbo, balanced, maximum, custom, FAST, BALANCED, or MAXIMUM)");
  }

  const target = parseTarget(raw.target);
  const vmType = parseVmType(raw.vmType);
  const vmLevel = parseVmLevel(raw.vmLevel);
  const luraph = parseLuraph(raw.luraph);
  const turboLevel: StudioTurboLevel = raw.turboLevel === "heavy" ? "heavy" : "light";
  const autoTier: StudioAutoTier = turboLevel === "heavy" ? "maximum" : "turbo";
  const autoDetectMacros = raw.autoDetectMacros === true;

  const seed = context.seed;
  const polymorphicSeed = context.polymorphicSeed;

  let base: PipelineOptions;
  if (profile === "TURBO") {
    base = resolveProfile({ profile: "FAST", target, seed, polymorphicSeed });
    if (vmType === undefined && vmLevel === undefined) base.performanceTier = "turbo";
  } else if (profile === "CUSTOM") {
    base = resolveProfile({ profile: "BALANCED", target, seed, polymorphicSeed });
  } else {
    base = resolveProfile({ profile: profile as ProtectionProfile, target, seed, polymorphicSeed });
  }

  if (vmType !== undefined) base.vmType = vmType;
  if (vmLevel !== undefined) base.vmLevel = vmLevel;
  if (raw.noRename !== undefined) base.renameLocals = raw.noRename !== true;
  if (raw.noPreserve !== undefined) base.preserveGlobals = raw.noPreserve !== true;
  if (raw.encodeStrings !== undefined) base.encodeStrings = raw.encodeStrings === true;
  if (raw.scramble !== undefined) base.scramble = raw.scramble === true;
  if (raw.oneLine !== undefined) base.oneLine = raw.oneLine === true;
  if (raw.mba !== undefined) base.mba = raw.mba === true;
  if (Array.isArray(raw.disableFeatures)) {
    base.disableFeatures = raw.disableFeatures.filter((f): f is string => typeof f === "string");
  }

  if (profile === "CUSTOM" && raw.mba === undefined) {
    base.mba = base.vmLevel === "max";
  }

  base.target = target;

  if (base.vmType === "stack") {
    base.noCompression = !luraph.vmCompression;
  }
  if (base.vmType === "register") {
    if (luraph.useDebugLib) addForceFeatures(base, ["antiDebug"]);
    if (luraph.intenseVM) addForceFeatures(base, ["handlerNoise", "antiDebug", "antiTamper"]);
  }

  const cacheOptions: Record<string, unknown> = {
    ...base,
    studioProfile: profile,
    autoDetectMacros,
    turboLevel,
    autoTier,
    luraph,
  };

  return {
    profile,
    pipeline: base,
    target,
    autoDetectMacros,
    turboLevel,
    autoTier,
    luraph,
    cacheOptions,
  };
}
