import { buildStudioPlan, StudioOptionsError } from "../dist/studioOptions.js";

test("no profile keeps the legacy server path", () => {
  expect(buildStudioPlan({})).toBeNull();
  expect(buildStudioPlan({ profile: "" })).toBeNull();
});

test("Turbo defaults to FAST plus the native performance tier", () => {
  const plan = buildStudioPlan({ profile: "turbo" });
  expect(plan).not.toBeNull();
  expect(plan.profile).toBe("TURBO");
  expect(plan.pipeline).toMatchObject({
    vmType: "none",
    vmLevel: "normal",
    performanceTier: "turbo",
    target: "generic",
  });
  expect(plan.autoDetectMacros).toBe(false);
  expect(plan.autoTier).toBe("turbo");
});

test("Turbo explicit VM overrides suppress the native preset tier", () => {
  const plan = buildStudioPlan({ profile: "turbo", vmType: "register", vmLevel: "normal" });
  expect(plan.pipeline.vmType).toBe("register");
  expect(plan.pipeline.performanceTier).toBeUndefined();
});

test("Maximum resolves Roblox executor globals and heavy auto macros", () => {
  const plan = buildStudioPlan({
    profile: "maximum",
    target: "roblox",
    autoDetectMacros: true,
    turboLevel: "heavy",
  });
  expect(plan.profile).toBe("MAXIMUM");
  expect(plan.pipeline).toMatchObject({
    vmType: "register",
    vmLevel: "max",
    mba: true,
    executorGlobals: true,
    target: "roblox",
  });
  expect(plan.autoDetectMacros).toBe(true);
  expect(plan.autoTier).toBe("maximum");
  expect(plan.cacheOptions).toMatchObject({ studioProfile: "MAXIMUM", autoTier: "maximum" });
});

test("Custom derives MBA from grade and honors an explicit override", () => {
  const derived = buildStudioPlan({ profile: "custom", vmType: "register", vmLevel: "max" });
  expect(derived.pipeline.mba).toBe(true);

  const overridden = buildStudioPlan({ profile: "custom", vmLevel: "max", mba: false });
  expect(overridden.pipeline.mba).toBe(false);
});

test("register VM Luraph-Killers force hardening features", () => {
  const plan = buildStudioPlan({
    profile: "balanced",
    vmType: "register",
    luraph: { intenseVM: true, useDebugLib: true, vmCompression: false },
  });
  expect(plan.pipeline.forceFeatures).toEqual(expect.arrayContaining(["handlerNoise", "antiDebug", "antiTamper"]));
  expect(plan.luraph.intenseVM).toBe(true);
  expect(plan.pipeline.noCompression).toBeUndefined();
});

test("VM Compression maps to noCompression only on the stack VM", () => {
  const stack = buildStudioPlan({ profile: "custom", vmType: "stack", luraph: { vmCompression: false } });
  expect(stack.pipeline.noCompression).toBe(true);

  const enabled = buildStudioPlan({ profile: "custom", vmType: "stack", luraph: { vmCompression: true } });
  expect(enabled.pipeline.noCompression).toBe(false);
});

test("invalid targets, architectures, and profiles return StudioOptionsError", () => {
  expect(() => buildStudioPlan({ profile: "balanced", target: "browser" })).toThrow(StudioOptionsError);
  expect(() => buildStudioPlan({ profile: "balanced", vmType: "quantum" })).toThrow(StudioOptionsError);
  expect(() => buildStudioPlan({ profile: "ultra" })).toThrow(StudioOptionsError);
});

test("Unsupported Luraph-Killer flags are ignored rather than mapped", () => {
  const plan = buildStudioPlan({
    profile: "balanced",
    luraph: { gcFixes: true, hardcodeGlobals: true, staticEnv: true },
  });
  expect(plan.luraph).toEqual({ intenseVM: false, useDebugLib: false, vmCompression: true });
});
