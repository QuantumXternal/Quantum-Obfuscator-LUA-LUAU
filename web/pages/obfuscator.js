import { obfuscateCode } from "../api.js";
import { createEditor } from "../editor.js";
import {
  buildObfuscateOptions,
  loadDraft,
  loadSettings,
  saveDraft,
} from "../state.js";
import { renderProtectionSettings } from "../settings.js";
import {
  byteLength,
  copyToClipboard,
  debounce,
  downloadText,
  formatBytes,
  formatDuration,
  setButtonBusy,
  setupDropZone,
  setupFileInput,
  toast,
} from "../ui.js";

function randomSeed() {
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(2);
    window.crypto.getRandomValues(values);
    return `q${values[0].toString(16)}${values[1].toString(16)}`;
  }
  return `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function describeError(err) {
  const details = err?.details;
  if (details && typeof details === "object") {
    const line = details.line ?? details.loc?.start?.line;
    const column = details.column ?? details.loc?.start?.column;
    if (line) return `${err.message} (line ${line}${column ? `, column ${column}` : ""})`;
  }
  return err?.message || String(err);
}

export function initObfuscator() {
  const inputHost = document.querySelector("[data-obfuscator-input]");
  const outputHost = document.querySelector("[data-obfuscator-output]");
  const runButton = document.querySelector("[data-run-obfuscator]");
  const copyButton = document.querySelector("[data-copy-output]");
  const downloadButton = document.querySelector("[data-download-output]");
  const clearButton = document.querySelector("[data-clear-obfuscator]");
  const fileInput = document.querySelector("[data-obfuscator-file]");
  const openFileButton = document.querySelector("[data-open-obfuscator-file]");
  const settingsHost = document.querySelector("[data-obfuscator-settings]");
  const outputEmpty = document.querySelector("[data-output-empty]");
  const errorBox = document.querySelector("[data-obfuscator-error]");
  const errorText = document.querySelector("[data-obfuscator-error-text]");
  const logList = document.querySelector("[data-obfuscator-log]");

  let settings = loadSettings();
  let controller = null;
  let lastOutput = "";
  let requestCounter = 0;
  let loadedFromHandoff = false;

  let source = loadDraft("obfuscator") ?? "";
  const pending = window.sessionStorage.getItem("quantum.studio.pendingSource");
  if (pending) {
    try {
      const parsed = JSON.parse(pending);
      if (typeof parsed.code === "string") {
        source = parsed.code;
        loadedFromHandoff = true;
      }
    } catch {
      /* ignore malformed handoff */
    }
    window.sessionStorage.removeItem("quantum.studio.pendingSource");
  }

  function log(message, type = "info") {
    if (!logList) return;
    const item = document.createElement("li");
    item.className = `log-item log-${type}`;
    const time = document.createElement("span");
    time.className = "log-time";
    time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const text = document.createElement("span");
    text.textContent = message;
    item.append(time, text);
    logList.prepend(item);
    while (logList.children.length > 8) logList.lastElementChild.remove();
  }

  const outputEditor = createEditor(outputHost, {
    value: "",
    readOnly: true,
    label: "Obfuscated output",
    placeholder: "-- Protected Luau will appear here",
  });

  const inputEditor = createEditor(inputHost, {
    value: source,
    label: "Obfuscator source editor",
    placeholder: "-- Paste a script, drop a .lua/.luau file, or send one from the analyzer",
    onChange: (code) => {
      updateInputMeta(code);
      saveDraftDebounced(code);
      markStale();
    },
  });

  const saveDraftDebounced = debounce((code) => saveDraft("obfuscator", code), 450);

  function updateInputMeta(code) {
    const lines = code ? code.split(/\r?\n/).length : 0;
    document.querySelectorAll("[data-input-lines]").forEach((el) => (el.textContent = String(lines)));
    document.querySelectorAll("[data-input-bytes]").forEach((el) => (el.textContent = formatBytes(byteLength(code))));
  }

  function updateOutputMeta(output, result, seed) {
    const lines = output ? output.split(/\r?\n/).length : 0;
    document.querySelectorAll("[data-output-lines]").forEach((el) => (el.textContent = String(lines)));
    document.querySelectorAll("[data-output-bytes]").forEach((el) => (el.textContent = formatBytes(byteLength(output))));
    document.querySelectorAll("[data-run-duration]").forEach((el) => (el.textContent = formatDuration(result?.durationMs ?? 0)));
    document.querySelectorAll("[data-run-seed]").forEach((el) => {
      el.textContent = seed ? `${seed}` : "random";
      el.title = seed || "";
    });
    const meta = result?.meta;
    document.querySelectorAll("[data-run-profile]").forEach((el) => {
      el.textContent = meta?.profile || settings.profile.toUpperCase();
    });
    document.querySelectorAll("[data-run-vm]").forEach((el) => {
      el.textContent = meta ? `${meta.vmType}/${meta.vmLevel}` : "—";
    });
  }

  function markStale() {
    if (!lastOutput) return;
    document.querySelector("[data-output-panel]")?.classList.add("is-stale");
    document.querySelectorAll("[data-run-state]").forEach((el) => {
      el.textContent = "Source changed";
      el.dataset.tone = "warning";
    });
  }

  function showEmptyOutput() {
    lastOutput = "";
    outputEditor.setValue("");
    if (outputEmpty) outputEmpty.hidden = false;
    document.querySelectorAll("[data-output-actions] button").forEach((button) => {
      button.disabled = true;
    });
    document.querySelectorAll("[data-output-lines]").forEach((el) => (el.textContent = "0"));
    document.querySelectorAll("[data-output-bytes]").forEach((el) => (el.textContent = "0 B"));
  }

  function showError(message, err) {
    if (errorBox) errorBox.hidden = false;
    if (errorText) errorText.textContent = message;
    const detail = err?.details;
    document.querySelectorAll("[data-obfuscator-error-detail]").forEach((el) => {
      el.textContent = detail ? JSON.stringify(detail, null, 2) : "";
      el.hidden = !detail;
    });
    document.querySelectorAll("[data-run-state]").forEach((el) => {
      el.textContent = "Obfuscation failed";
      el.dataset.tone = "error";
    });
    log(message, "error");
  }

  function clearError() {
    if (errorBox) errorBox.hidden = true;
    if (errorText) errorText.textContent = "";
  }

  async function run() {
    const code = inputEditor.getValue();
    if (!code.trim()) {
      toast("Add a Luau script before obfuscating.", "error");
      inputEditor.focus();
      return;
    }
    const bytes = byteLength(code);
    if (bytes > 20 * 1024 * 1024) {
      toast(`Script is ${formatBytes(bytes)}; the server limit is 20 MB.`, "error", 5200);
      return;
    }
    controller?.abort();
    const localController = new AbortController();
    controller = localController;
    const requestId = ++requestCounter;
    clearError();
    setButtonBusy(runButton, true);
    document.querySelectorAll("[data-run-state]").forEach((el) => {
      el.textContent = "Obfuscating…";
      el.dataset.tone = "busy";
    });
    document.querySelector("[data-output-panel]")?.classList.remove("is-stale");
    const seed = settings.seed.trim() || randomSeed();
    const started = performance.now();
    try {
      const result = await obfuscateCode(code, buildObfuscateOptions(settings, seed), localController.signal);
      if (requestId !== requestCounter) return;
      lastOutput = result.output || "";
      outputEditor.setValue(lastOutput);
      if (outputEmpty) outputEmpty.hidden = !!lastOutput;
      document.querySelectorAll("[data-output-actions] button").forEach((button) => {
        button.disabled = !lastOutput;
      });
      updateOutputMeta(lastOutput, result, seed);
      document.querySelectorAll("[data-run-state]").forEach((el) => {
        el.textContent = result.cached ? "Cached result" : "Protected";
        el.dataset.tone = "success";
      });
      const elapsed = result.durationMs ?? performance.now() - started;
      const meta = result.meta;
      log(
        `Protected ${result.summary?.lines ?? inputEditor.getLineCount()} source lines in ${formatDuration(elapsed)}${result.cached ? " (cache hit)" : ""}.`,
        "success",
      );
      if (meta) {
        log(`Profile ${meta.profile} · VM ${meta.vmType}/${meta.vmLevel} · target ${meta.target}.`, "info");
      }
      if (result.cached) toast("Served from the local engine cache.", "info");
      saveDraft("obfuscator", code);
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (requestId !== requestCounter) return;
      showEmptyOutput();
      showError(describeError(err), err);
      toast(describeError(err), "error", 5200);
    } finally {
      if (controller === localController) controller = null;
      if (requestId === requestCounter) setButtonBusy(runButton, false);
    }
  }

  runButton?.addEventListener("click", run);
  copyButton?.addEventListener("click", async () => {
    try {
      await copyToClipboard(lastOutput || outputEditor.getValue());
      toast("Protected script copied.", "success");
    } catch (err) {
      toast(err.message || String(err), "error");
    }
  });
  downloadButton?.addEventListener("click", () => {
    try {
      const profile = settings.profile || "custom";
      downloadText(`quantum-${profile}-${Date.now()}.lua`, lastOutput || outputEditor.getValue());
      toast("Download started.", "success");
    } catch (err) {
      toast(err.message || String(err), "error");
    }
  });
  clearButton?.addEventListener("click", () => {
    if (!inputEditor.getValue().trim() && !lastOutput) return;
    if (!window.confirm("Clear the source and protected output?")) return;
    inputEditor.setValue("");
    saveDraft("obfuscator", "");
    showEmptyOutput();
    clearError();
    updateInputMeta("");
    document.querySelectorAll("[data-run-state]").forEach((el) => {
      el.textContent = "Ready";
      el.dataset.tone = "neutral";
    });
    inputEditor.focus();
  });

  openFileButton?.addEventListener("click", () => fileInput?.click());
  setupFileInput(fileInput, ({ name, text, bytes }) => {
    inputEditor.setValue(text);
    saveDraft("obfuscator", text);
    updateInputMeta(text);
    clearError();
    toast(`Loaded ${name} (${formatBytes(bytes)}).`, "success");
  }, { acceptExtensions: [".lua", ".luau", ".txt"] });
  setupDropZone(document.querySelector("[data-obfuscator-drop]") || inputHost, ({ name, text, bytes }) => {
    inputEditor.setValue(text);
    saveDraft("obfuscator", text);
    updateInputMeta(text);
    clearError();
    toast(`Loaded ${name} (${formatBytes(bytes)}).`, "success");
  }, { acceptExtensions: [".lua", ".luau", ".txt"] });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    }
  });

  renderProtectionSettings(settingsHost, settings, (next) => {
    settings = next;
  }, { showSeed: true });

  showEmptyOutput();
  updateInputMeta(source);
  document.querySelectorAll("[data-run-state]").forEach((el) => {
    el.dataset.tone = "neutral";
  });
  if (loadedFromHandoff) {
    toast("Source and selected settings carried over from the analyzer.", "success", 4200);
    log("Source received from analyzer; settings restored.", "info");
  }
  log("Obfuscator ready. Press Ctrl+Enter to protect the script.", "info");
}
