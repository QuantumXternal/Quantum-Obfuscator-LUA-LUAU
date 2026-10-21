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

const LURAPH_FLAGS = ["intenseVM", "gcFixes", "hardcodeGlobals", "staticEnv", "useDebugLib", "vmCompression"];

function option(value, label) {
  return `<option value="${value}">${label}</option>`;
}

function createSession(container, initialSettings, onChange) {
  let settings = structuredClone(initialSettings);
  let lastChangeSource = "init";
  const savedLabel = container.querySelector("[data-settings-saved]");

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

  return {
    get settings() {
      return settings;
    },
    getLastChangeSource: () => lastChangeSource,
    setSettings(next) {
      settings = structuredClone(next);
    },
    commit,
  };
}

function luraphMarkup() {
  return `
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
  `;
}

export function renderAutomationSettings(container, initialSettings, onChange) {
  if (!container) return null;
  const session = createSession(container, initialSettings, onChange);

  container.innerHTML = `
    <div class="settings-group">
      <label class="switch-row">
        <span class="switch-copy">
          <span class="check-title">Auto-detect macros</span>
          <span class="check-help">Tag safe top-level functions when you press Analyze. Top-level IIFEs can be refactored from the banner; nested IIFEs stay manual.</span>
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
      <span class="settings-saved" data-settings-saved>Saved locally</span>
      <span class="settings-saved">Analyzer only</span>
    </div>
  `;

  const get = (name) => container.querySelector(`[data-setting="${name}"]`);

  function syncDisabled() {
    const turbo = get("turboLevel");
    if (turbo) turbo.disabled = !session.settings.autoDetectMacros;
  }

  function applyToForm() {
    get("autoDetectMacros").checked = session.settings.autoDetectMacros === true;
    get("turboLevel").value = session.settings.turboLevel;
    syncDisabled();
  }

  get("autoDetectMacros").addEventListener("change", (event) => {
    session.settings.autoDetectMacros = event.target.checked;
    syncDisabled();
    session.commit("autoDetectMacros");
  });
  get("turboLevel").addEventListener("change", (event) => {
    session.settings.turboLevel = event.target.value;
    session.commit("turboLevel");
  });

  applyToForm();

  return {
    getSettings: () => structuredClone(session.settings),
    getLastChangeSource: session.getLastChangeSource,
    setSettings(next) {
      session.setSettings(next);
      applyToForm();
    },
  };
}

export function renderProtectionSettings(container, initialSettings, onChange, options = {}) {
  if (!container) return null;
  const session = createSession(container, initialSettings, onChange);

  container.innerHTML = `
    <div class="settings-group">
      <div class="settings-group-head">
        <div>
          <span class="eyebrow">Engine</span>
          <h3>Protection profile</h3>
        </div>
        <span class="profile-chip" data-profile-chip></span>
      </div>
      <label class="field">
        <span class="field-label">Profile</span>
        <select data-setting="profile">
          ${option("turbo", "Turbo — native, fastest")}
          ${option("balanced", "Balanced — stable VM")}
          ${option("maximum", "Maximum — hardened VM")}
          ${option("custom", "Custom — explicit controls")}
        </select>
        <span class="field-help" data-profile-help></span>
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

    ${luraphMarkup()}

    <div class="settings-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-reset-settings>Reset defaults</button>
      <span class="settings-saved" data-settings-saved>Saved locally</span>
    </div>
  `;

  const get = (name) => container.querySelector(`[data-setting="${name}"]`);
  const getLuraph = (name) => container.querySelector(`[data-luraph="${name}"]`);
  const profileChip = container.querySelector("[data-profile-chip]");
  const profileHelp = container.querySelector("[data-profile-help]");

  function syncDisabled() {
    const register = session.settings.vmType === "register";
    const stack = session.settings.vmType === "stack";
    const intense = getLuraph("intenseVM");
    const debug = getLuraph("useDebugLib");
    const compression = getLuraph("vmCompression");
    if (intense) intense.disabled = !register;
    if (debug) debug.disabled = !register;
    if (compression) compression.disabled = !stack;
    container.querySelector('[data-check-row="intenseVM"]')?.classList.toggle("is-disabled", !register);
    container.querySelector('[data-check-row="useDebugLib"]')?.classList.toggle("is-disabled", !register);
    container.querySelector('[data-check-row="vmCompression"]')?.classList.toggle("is-disabled", !stack);
  }

  function applyToForm() {
    get("profile").value = session.settings.profile;
    get("vmType").value = session.settings.vmType;
    get("vmLevel").value = session.settings.vmLevel;
    get("target").value = session.settings.target;
    const seed = get("seed");
    if (seed) seed.value = session.settings.seed || "";
    for (const name of LURAPH_FLAGS) {
      const checkbox = getLuraph(name);
      if (checkbox) checkbox.checked = session.settings.luraph[name] === true;
    }
    profileChip.textContent = PROFILE_LABELS[session.settings.profile] || "Custom";
    profileHelp.textContent = PROFILE_HINTS[session.settings.profile] || PROFILE_HINTS.custom;
    syncDisabled();
  }

  get("profile").addEventListener("change", (event) => {
    session.settings.profile = event.target.value;
    if (session.settings.profile !== "custom") {
      const defaults = PROFILE_DEFAULTS[session.settings.profile];
      session.settings.vmType = defaults.vmType;
      session.settings.vmLevel = defaults.vmLevel;
    }
    applyToForm();
    session.commit("profile");
  });
  get("vmType").addEventListener("change", (event) => {
    session.settings.vmType = event.target.value;
    syncDisabled();
    session.commit("vmType");
  });
  get("vmLevel").addEventListener("change", (event) => {
    session.settings.vmLevel = event.target.value;
    session.commit("vmLevel");
  });
  get("target").addEventListener("change", (event) => {
    session.settings.target = event.target.value;
    session.commit("target");
  });
  const seed = get("seed");
  if (seed) {
    seed.addEventListener("input", (event) => {
      session.settings.seed = event.target.value;
      session.commit("seed");
    });
  }
  for (const checkbox of container.querySelectorAll("[data-luraph]")) {
    checkbox.addEventListener("change", (event) => {
      session.settings.luraph[event.target.dataset.luraph] = event.target.checked;
      session.commit("luraph");
    });
  }
  container.querySelector("[data-reset-settings]").addEventListener("click", () => {
    const next = structuredClone(session.settings);
    next.profile = DEFAULT_SETTINGS.profile;
    next.vmType = DEFAULT_SETTINGS.vmType;
    next.vmLevel = DEFAULT_SETTINGS.vmLevel;
    next.target = DEFAULT_SETTINGS.target;
    next.seed = DEFAULT_SETTINGS.seed;
    next.luraph = structuredClone(DEFAULT_SETTINGS.luraph);
    session.setSettings(next);
    applyToForm();
    session.commit("reset");
  });

  applyToForm();

  return {
    getSettings: () => structuredClone(session.settings),
    getLastChangeSource: session.getLastChangeSource,
    setSettings(next) {
      session.setSettings(next);
      applyToForm();
    },
  };
}
