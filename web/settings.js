import { DEFAULT_SETTINGS, PROFILE_DEFAULTS, saveSettings } from "./state.js";

const PROFILE_HINTS = {
  turbo: "AST optimization plus native extraction. No VM bytecode.",
  balanced: "Register VM with balanced hardening and stable output.",
  maximum: "Register VM, maximum grade, and aggressive VM metadata checks.",
  custom: "Use the architecture and grade selected below.",
};

const PROFILE_LABELS = {
  turbo: "Turbo",
  balanced: "Balanced",
  maximum: "Maximum",
  custom: "Custom",
};

function option(value, label) {
  return `<option value="${value}">${label}</option>`;
}

export function renderSettings(container, initialSettings, onChange, options = {}) {
  if (!container) return null;
  let settings = structuredClone(initialSettings);
  let lastChangeSource = "init";

  container.innerHTML = `
    <div class="settings-group">
      <div class="settings-group-head">
        <div>
          <span class="eyebrow">Engine</span>
          <h3>Protection profile</h3>
        </div>
        <span class="profile-chip" data-profile-chip>${PROFILE_LABELS[settings.profile] || "Balanced"}</span>
      </div>
      <label class="field">
        <span class="field-label">Profile</span>
        <select data-setting="profile">
          ${option("turbo", "Turbo — native, fastest")}
          ${option("balanced", "Balanced — stable VM")}
          ${option("maximum", "Maximum — hardened VM")}
          ${option("custom", "Custom — explicit controls")}
        </select>
        <span class="field-help" data-profile-help>${PROFILE_HINTS[settings.profile] || ""}</span>
      </label>
      <div class="field-grid">
        <label class="field">
          <span class="field-label">VM architecture</span>
          <select data-setting="vmType">
            ${option("register", "Register VM")}
            ${option("stack", "Stack VM")}
            ${option("none", "Native / no VM")}
            ${option("custom", "Profile default")}
          </select>
        </label>
        <label class="field">
          <span class="field-label">Hardening grade</span>
          <select data-setting="vmLevel">
            ${option("debug", "Debug")}
            ${option("normal", "Normal")}
            ${option("max", "Maximum")}
            ${option("custom", "Profile default")}
          </select>
        </label>
      </div>
      <div class="field-grid">
        <label class="field">
          <span class="field-label">Target environment</span>
          <select data-setting="target">
            ${option("roblox", "Roblox Studio")}
            ${option("generic", "Generic Luau")}
          </select>
        </label>
        ${
          options.showSeed
            ? `<label class="field">
                <span class="field-label">Seed <span class="optional">optional</span></span>
                <input data-setting="seed" type="text" spellcheck="false" autocomplete="off" placeholder="Random each run" />
              </label>`
            : ""
        }
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-head">
        <div>
          <span class="eyebrow">Compatibility</span>
          <h3>Luraph-Killers</h3>
        </div>
        <span class="tag tag-beta">Engine mapped</span>
      </div>
      <label class="check-row" data-check-row="intenseVM">
        <input type="checkbox" data-luraph="intenseVM" />
        <span class="check-copy">
          <span class="check-title">Intense VM</span>
          <span class="check-help">Registers handler noise, anti-debug, and anti-tamper features.</span>
        </span>
      </label>
      <label class="check-row is-disabled" data-check-row="gcFixes">
        <input type="checkbox" data-luraph="gcFixes" disabled />
        <span class="check-copy">
          <span class="check-title">GC Fixes <span class="tag">Unavailable</span></span>
          <span class="check-help">No engine equivalent in this build. The flag is shown for parity only.</span>
        </span>
      </label>
      <label class="check-row is-disabled" data-check-row="hardcodeGlobals">
        <input type="checkbox" data-luraph="hardcodeGlobals" disabled />
        <span class="check-copy">
          <span class="check-title">Hardcode Globals <span class="tag">Unavailable</span></span>
          <span class="check-help">No engine equivalent in this build. The flag is shown for parity only.</span>
        </span>
      </label>
      <label class="check-row is-disabled" data-check-row="staticEnv">
        <input type="checkbox" data-luraph="staticEnv" disabled />
        <span class="check-copy">
          <span class="check-title">Static Environment <span class="tag">Unavailable</span></span>
          <span class="check-help">No engine equivalent in this build. The flag is shown for parity only.</span>
        </span>
      </label>
      <label class="check-row" data-check-row="useDebugLib">
        <input type="checkbox" data-luraph="useDebugLib" />
        <span class="check-copy">
          <span class="check-title">Use Debug Library</span>
          <span class="check-help">Adds the anti-debug feature to the register VM feature set.</span>
        </span>
      </label>
      <label class="check-row" data-check-row="vmCompression">
        <input type="checkbox" data-luraph="vmCompression" />
        <span class="check-copy">
          <span class="check-title">VM Compression</span>
          <span class="check-help">Stack VM only. Disabling it maps to <code>noCompression</code>.</span>
        </span>
      </label>
    </div>

    <div class="settings-group">
      <div class="settings-group-head">
        <div>
          <span class="eyebrow">Automation</span>
          <h3>Quantum exclusives</h3>
        </div>
      </div>
      <label class="switch-row">
        <span class="switch-copy">
          <span class="check-title">Auto-detect macros</span>
          <span class="check-help">Analyze safe heavy functions and inject Turbo tags before obfuscation.</span>
        </span>
        <span class="switch">
          <input type="checkbox" data-setting="autoDetectMacros" />
          <span class="switch-track"></span>
        </span>
      </label>
      <label class="field">
        <span class="field-label">Auto Turbo level</span>
        <select data-setting="turboLevel">
          ${option("light", "Turbo — native extraction")}
          ${option("heavy", "Maximum — native + maximum grade")}
        </select>
        <span class="field-help">Applied only to functions the analyzer marks as safe.</span>
      </label>
    </div>

    <div class="settings-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-reset-settings>Reset defaults</button>
      <span class="settings-saved" data-settings-saved>Saved locally</span>
    </div>
  `;

  const get = (name) => container.querySelector(`[data-setting="${name}"]`);
  const getLuraph = (name) => container.querySelector(`[data-luraph="${name}"]`);
  const savedLabel = container.querySelector("[data-settings-saved]");
  const profileChip = container.querySelector("[data-profile-chip]");
  const profileHelp = container.querySelector("[data-profile-help]");

  function syncDisabled() {
    const register = settings.vmType === "register";
    const stack = settings.vmType === "stack";
    const intense = getLuraph("intenseVM");
    const debug = getLuraph("useDebugLib");
    const compression = getLuraph("vmCompression");
    if (intense) intense.disabled = !register;
    if (debug) debug.disabled = !register;
    if (compression) compression.disabled = !stack;
    container.querySelector('[data-check-row="intenseVM"]')?.classList.toggle("is-disabled", !register);
    container.querySelector('[data-check-row="useDebugLib"]')?.classList.toggle("is-disabled", !register);
    container.querySelector('[data-check-row="vmCompression"]')?.classList.toggle("is-disabled", !stack);
    const turbo = get("turboLevel");
    if (turbo) turbo.disabled = !settings.autoDetectMacros;
  }

  function applyToForm() {
    get("profile").value = settings.profile;
    get("vmType").value = settings.vmType;
    get("vmLevel").value = settings.vmLevel;
    get("target").value = settings.target;
    const seed = get("seed");
    if (seed) seed.value = settings.seed || "";
    get("autoDetectMacros").checked = settings.autoDetectMacros === true;
    get("turboLevel").value = settings.turboLevel;
    for (const name of ["intenseVM", "gcFixes", "hardcodeGlobals", "staticEnv", "useDebugLib", "vmCompression"]) {
      const checkbox = getLuraph(name);
      if (checkbox) checkbox.checked = settings.luraph[name] === true;
    }
    profileChip.textContent = PROFILE_LABELS[settings.profile] || "Custom";
    profileHelp.textContent = PROFILE_HINTS[settings.profile] || PROFILE_HINTS.custom;
    syncDisabled();
  }

  function commit(source) {
    lastChangeSource = source;
    saveSettings(settings);
    if (savedLabel) {
      savedLabel.textContent = "Saved locally";
      savedLabel.classList.add("is-flash");
      setTimeout(() => savedLabel.classList.remove("is-flash"), 700);
    }
    onChange?.(structuredClone(settings), { source });
  }

  get("profile").addEventListener("change", (event) => {
    settings.profile = event.target.value;
    if (settings.profile !== "custom") {
      const defaults = PROFILE_DEFAULTS[settings.profile];
      settings.vmType = defaults.vmType;
      settings.vmLevel = defaults.vmLevel;
    }
    applyToForm();
    commit("profile");
  });
  get("vmType").addEventListener("change", (event) => {
    settings.vmType = event.target.value;
    syncDisabled();
    commit("vmType");
  });
  get("vmLevel").addEventListener("change", (event) => {
    settings.vmLevel = event.target.value;
    commit("vmLevel");
  });
  get("target").addEventListener("change", (event) => {
    settings.target = event.target.value;
    commit("target");
  });
  const seed = get("seed");
  if (seed) {
    seed.addEventListener("input", (event) => {
      settings.seed = event.target.value;
      commit("seed");
    });
  }
  get("autoDetectMacros").addEventListener("change", (event) => {
    settings.autoDetectMacros = event.target.checked;
    syncDisabled();
    commit("autoDetectMacros");
  });
  get("turboLevel").addEventListener("change", (event) => {
    settings.turboLevel = event.target.value;
    commit("turboLevel");
  });
  for (const checkbox of container.querySelectorAll("[data-luraph]")) {
    checkbox.addEventListener("change", (event) => {
      settings.luraph[event.target.dataset.luraph] = event.target.checked;
      commit("luraph");
    });
  }
  container.querySelector("[data-reset-settings]").addEventListener("click", () => {
    settings = structuredClone(DEFAULT_SETTINGS);
    applyToForm();
    commit("reset");
  });

  applyToForm();

  return {
    getSettings: () => structuredClone(settings),
    getLastChangeSource: () => lastChangeSource,
    setSettings(next) {
      settings = structuredClone(next);
      applyToForm();
    },
  };
}
