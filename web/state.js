export const PROFILE_DEFAULTS = {
  turbo: { vmType: "none", vmLevel: "normal" },
  balanced: { vmType: "register", vmLevel: "normal" },
  maximum: { vmType: "register", vmLevel: "max" },
  custom: { vmType: "register", vmLevel: "normal" },
};

export const DEFAULT_SETTINGS = {
  profile: "balanced",
  vmType: "register",
  vmLevel: "normal",
  target: "roblox",
  seed: "",
  autoDetectMacros: true,
  turboLevel: "light",
  luraph: {
    intenseVM: false,
    gcFixes: false,
    hardcodeGlobals: false,
    staticEnv: false,
    useDebugLib: false,
    vmCompression: true,
  },
};

const SETTINGS_KEY = "quantum.studio.settings";
const PENDING_KEY = "quantum.studio.pendingSource";
const DRAFT_PREFIX = "quantum.studio.draft.";

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemove(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    /* unavailable */
  }
}

export function loadSettings() {
  const raw = safeGet(window.localStorage, SETTINGS_KEY);
  if (!raw) return structuredClone(DEFAULT_SETTINGS);
  try {
    const parsed = JSON.parse(raw);
    const merged = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      luraph: { ...DEFAULT_SETTINGS.luraph, ...(parsed.luraph || {}) },
    };
    if (!Object.prototype.hasOwnProperty.call(PROFILE_DEFAULTS, merged.profile)) merged.profile = "balanced";
    if (!["register", "stack", "none", "custom"].includes(merged.vmType)) merged.vmType = "register";
    if (!["debug", "normal", "max", "custom"].includes(merged.vmLevel)) merged.vmLevel = "normal";
    if (!["roblox", "generic"].includes(merged.target)) merged.target = "roblox";
    if (!["light", "heavy"].includes(merged.turboLevel)) merged.turboLevel = "light";
    return merged;
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  safeSet(window.localStorage, SETTINGS_KEY, JSON.stringify(settings));
}

export function resetSettings() {
  const next = structuredClone(DEFAULT_SETTINGS);
  saveSettings(next);
  return next;
}

export function setPendingSource(code) {
  const payload = JSON.stringify({ code, ts: Date.now() });
  return safeSet(window.sessionStorage, PENDING_KEY, payload);
}

export function peekPendingSource() {
  const raw = safeGet(window.sessionStorage, PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.code === "string" ? parsed.code : null;
  } catch {
    return null;
  }
}

export function consumePendingSource() {
  const code = peekPendingSource();
  safeRemove(window.sessionStorage, PENDING_KEY);
  return code;
}

export function saveDraft(name, code) {
  return safeSet(window.sessionStorage, DRAFT_PREFIX + name, code);
}

export function loadDraft(name) {
  return safeGet(window.sessionStorage, DRAFT_PREFIX + name);
}

export function clearDraft(name) {
  safeRemove(window.sessionStorage, DRAFT_PREFIX + name);
}

export function buildObfuscateOptions(settings, seed) {
  const options = {
    profile: settings.profile,
    target: settings.target,
    luraph: {
      intenseVM: settings.luraph.intenseVM === true,
      useDebugLib: settings.luraph.useDebugLib === true,
      vmCompression: settings.luraph.vmCompression !== false,
    },
  };
  // Turbo's native-fastest preset relies on the server applying its
  // performanceTier when both VM fields are omitted.
  const turboPreset =
    settings.profile === "turbo" && settings.vmType === "none" && settings.vmLevel === "normal";
  if (settings.vmType !== "custom" && !turboPreset) options.vmType = settings.vmType;
  if (settings.vmLevel !== "custom" && !turboPreset) options.vmLevel = settings.vmLevel;
  if (seed !== null && seed !== undefined && seed !== "") {
    const parsed = typeof seed === "string" && /^\d+$/.test(seed.trim()) ? Number(seed.trim()) : seed;
    const safeSeed = typeof parsed === "number" && !Number.isSafeInteger(parsed) ? seed : parsed;
    options.seed = safeSeed;
    options.polymorphicSeed = safeSeed;
  }
  return options;
}
