import { analyzeCode } from "../api.js";
import { createEditor } from "../editor.js";
import { loadSettings, loadDraft, saveDraft, setPendingSource } from "../state.js";
import { renderAutomationSettings } from "../settings.js";
import {
  byteLength,
  debounce,
  formatBytes,
  setButtonBusy,
  setupDropZone,
  setupFileInput,
  toast,
} from "../ui.js";

const SAMPLE_SCRIPT = `-- Quantum Studio sample
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local function createRoot()
  local screen = Instance.new("ScreenGui")
  screen.Name = "QuantumDemo"
  screen.ResetOnSpawn = false
  screen.Parent = playerGui
  return screen
end

local root = createRoot()

local function buildPanel()
  local frame = Instance.new("Frame")
  frame.Size = UDim2.fromOffset(340, 190)
  frame.Position = UDim2.new(0.5, -170, 0.5, -95)
  frame.BackgroundColor3 = Color3.fromRGB(13, 18, 27)
  frame.BorderSizePixel = 0
  frame.Parent = root

  local title = Instance.new("TextLabel")
  title.Size = UDim2.new(1, -32, 0, 44)
  title.Position = UDim2.fromOffset(16, 14)
  title.BackgroundTransparency = 1
  title.Font = Enum.Font.GothamBold
  title.Text = "Quantum Studio"
  title.TextColor3 = Color3.fromRGB(235, 244, 255)
  title.TextSize = 20
  title.TextXAlignment = Enum.TextXAlignment.Left
  title.Parent = frame
  return frame
end

buildPanel()

RunService.RenderStepped:Connect(function(deltaTime)
  local camera = workspace.CurrentCamera
  if camera then
    camera.FieldOfView = 70 + math.sin(os.clock() * 0.5) * 2
  end
end)
`;

function dedupeFixes(diagnostics) {
  const seen = new Set();
  const fixes = [];
  for (const diagnostic of diagnostics) {
    if (!diagnostic.fix) continue;
    const key = `${diagnostic.fix.line}:${diagnostic.fix.insertText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fixes.push(diagnostic.fix);
  }
  return fixes;
}

export function initAnalyzer() {
  const host = document.querySelector("[data-analyzer-editor]");
  const results = document.querySelector("[data-analysis-results]");
  const emptyState = document.querySelector("[data-analysis-empty]");
  const applyAllButton = document.querySelector("[data-apply-all]");
  const analyzeButton = document.querySelector("[data-analyze]");
  const sendButton = document.querySelector("[data-send-to-obfuscator]");
  const clearButton = document.querySelector("[data-clear-source]");
  const fileInput = document.querySelector("[data-analyzer-file]");
  const openFileButton = document.querySelector("[data-open-file]");
  const exampleButton = document.querySelector("[data-load-example]");
  const settingsHost = document.querySelector("[data-analyzer-settings]");
  const iifeWarning = document.querySelector("[data-iife-warning]");
  const iifeCount = document.querySelector("[data-iife-count]");
  const logList = document.querySelector("[data-analyzer-log]");

  let settings = loadSettings();
  let analysisController = null;
  let lastResult = null;
  let suppressFixAnalysis = false;
  let analysisRequest = 0;

  const pending = window.sessionStorage.getItem("quantum.studio.pendingSource");
  let initialSource = null;
  if (pending) {
    try {
      initialSource = JSON.parse(pending).code;
    } catch {
      initialSource = null;
    }
    window.sessionStorage.removeItem("quantum.studio.pendingSource");
  }
  if (typeof initialSource !== "string") initialSource = loadDraft("analyzer");
  if (initialSource === null || initialSource === undefined) initialSource = SAMPLE_SCRIPT;

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

  const editor = createEditor(host, {
    value: initialSource,
    label: "Analyzer Luau source editor",
    placeholder: "-- Drop a .lua or .luau file, or paste a script to analyze",
    onChange: (code) => {
      updateSourceMeta(code);
      saveDraftDebounced(code);
      if (!suppressFixAnalysis) scheduleLiveAnalysis();
    },
    onFixApplied: () => {
      if (suppressFixAnalysis) return;
      log("Fix applied. Re-analyzing…", "success");
      scheduleAnalysis();
    },
  });

  const saveDraftDebounced = debounce((code) => saveDraft("analyzer", code), 450);
  const scheduleLiveAnalysis = debounce(() => runAnalysis({ source: "live" }), 1000);
  const scheduleAnalysis = debounce(() => runAnalysis({ source: "fix" }), 180);

  function updateSourceMeta(code) {
    const lines = code ? code.split(/\r?\n/).length : 0;
    const bytes = byteLength(code);
    document.querySelectorAll("[data-source-lines]").forEach((el) => {
      el.textContent = String(lines);
    });
    document.querySelectorAll("[data-source-bytes]").forEach((el) => {
      el.textContent = formatBytes(bytes);
    });
  }

  function setAnalysisStatus(label, tone = "neutral") {
    document.querySelectorAll("[data-analysis-status]").forEach((el) => {
      el.textContent = label;
      el.dataset.tone = tone;
    });
  }

  function updateSummary(result, elapsed) {
    const summary = result.summary;
    const values = {
      lines: summary.lines,
      functions: summary.functions,
      heavy: summary.heavyFunctions,
      instanceNew: summary.instanceNew,
      renderStepped: summary.renderStepped,
      fixable: summary.autoFixable,
      errors: summary.errors,
      turbos: result.macros.turbos.length,
      maximums: result.macros.maximums.length,
      elapsed: elapsed < 1000 ? `${Math.round(elapsed)}ms` : `${(elapsed / 1000).toFixed(2)}s`,
    };
    for (const [key, value] of Object.entries(values)) {
      document.querySelectorAll(`[data-stat="${key}"]`).forEach((el) => {
        el.textContent = String(value);
      });
    }
    document.querySelectorAll("[data-macro-summary]").forEach((el) => {
      el.textContent = `${result.macros.turbos.length} Turbo · ${result.macros.maximums.length} Maximum`;
    });
    document.querySelectorAll("[data-analysis-badge]").forEach((el) => {
      const valid = result.valid;
      el.textContent = valid ? "Script analyzed" : "Syntax errors found";
      el.className = `badge ${valid ? "badge-success" : "badge-error"}`;
    });
  }

  function updateIifeWarning(count) {
    if (!iifeWarning) return;
    const total = Number(count) || 0;
    iifeWarning.hidden = total === 0;
    if (iifeCount && total > 0) {
      iifeCount.textContent = `${total} IIFE${total === 1 ? "" : "s"} detected`;
    }
  }

  function createFinding(diagnostic, index) {
    const row = document.createElement("div");
    row.className = `finding-row severity-${diagnostic.severity}`;
    row.tabIndex = 0;
    row.dataset.index = String(index);
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Line ${diagnostic.line}: ${diagnostic.message}`);

    const line = document.createElement("span");
    line.className = "finding-line";
    line.textContent = `L${diagnostic.line}`;

    const body = document.createElement("div");
    body.className = "finding-body";
    const message = document.createElement("span");
    message.className = "finding-message";
    message.textContent = diagnostic.message;
    const meta = document.createElement("span");
    meta.className = "finding-meta";
    const code = document.createElement("span");
    code.className = "finding-code";
    code.textContent = diagnostic.code;
    meta.appendChild(code);
    if (diagnostic.functionName) {
      const fn = document.createElement("span");
      fn.className = "finding-function";
      fn.textContent = diagnostic.functionName;
      meta.appendChild(fn);
    }
    body.append(message, meta);

    row.append(line, body);

    if (diagnostic.fix) {
      const fix = document.createElement("button");
      fix.type = "button";
      fix.className = "btn btn-primary btn-xs finding-fix";
      fix.textContent = "Apply fix";
      fix.addEventListener("click", (event) => {
        event.stopPropagation();
        editor.applyFix(diagnostic.fix);
        log(`Inserted ${diagnostic.fix.insertText.trim()} above line ${diagnostic.fix.line}.`, "success");
      });
      row.appendChild(fix);
    } else {
      const tag = document.createElement("span");
      tag.className = `finding-state ${diagnostic.severity}`;
      tag.textContent = diagnostic.severity === "error" ? "Error" : diagnostic.severity === "info" ? "Note" : "Review";
      row.appendChild(tag);
    }

    const reveal = () => editor.showDiagnostic(diagnostic);
    row.addEventListener("click", reveal);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        reveal();
      }
    });
    return row;
  }

  function renderFindings(result) {
    if (!results) return;
    results.replaceChildren();
    const diagnostics = result.diagnostics;
    if (!diagnostics.length) {
      const empty = document.createElement("div");
      empty.className = "findings-empty";
      empty.innerHTML = `<span class="empty-glyph">✓</span><strong>No hot paths detected</strong><p>The analyzer found no Instance.new or RenderStepped hot spots.</p>`;
      results.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    diagnostics.forEach((diagnostic, index) => fragment.appendChild(createFinding(diagnostic, index)));
    results.appendChild(fragment);
    if (result.summary.truncated) {
      const note = document.createElement("div");
      note.className = "findings-note";
      note.textContent = "Diagnostics were capped at 500 items.";
      results.appendChild(note);
    }
  }

  function render(result, elapsed) {
    if (emptyState) emptyState.hidden = true;
    document.querySelector("[data-results-count]").textContent = `${result.diagnostics.length} finding${result.diagnostics.length === 1 ? "" : "s"}`;
    updateSummary(result, elapsed);
    updateIifeWarning(result.summary.iifeCount);
    renderFindings(result);
    const fixCount = result.summary.autoFixable;
    if (applyAllButton) {
      applyAllButton.disabled = fixCount === 0;
      applyAllButton.textContent = fixCount ? `Apply all fixes (${fixCount})` : "Apply all fixes";
    }
    setAnalysisStatus(result.valid ? "Analysis complete" : "Fix syntax errors first", result.valid ? "success" : "error");
    if (result.valid) {
      log(`Analyzed ${result.summary.lines.toLocaleString()} lines in ${Math.round(elapsed)} ms.`, "success");
    } else {
      log(`${result.summary.errors} syntax error${result.summary.errors === 1 ? "" : "s"} found.`, "error");
    }
  }

  function clearResults() {
    lastResult = null;
    updateIifeWarning(0);
    if (emptyState) emptyState.hidden = false;
    if (results) results.replaceChildren();
    editor.clearServerDiagnostics();
    setAnalysisStatus("Waiting for source", "neutral");
    updateSummary(
      {
        summary: {
          lines: 0,
          functions: 0,
          heavyFunctions: 0,
          instanceNew: 0,
          renderStepped: 0,
          autoFixable: 0,
          errors: 0,
        },
        macros: { turbos: [], maximums: [] },
      },
      0,
    );
    document.querySelectorAll("[data-results-count]").forEach((el) => {
      el.textContent = "No findings";
    });
    if (applyAllButton) {
      applyAllButton.disabled = true;
      applyAllButton.textContent = "Apply all fixes";
    }
  }

  async function runAnalysis({ applyFixes = false, button = null, source = "manual" } = {}) {
    const code = editor.getValue();
    if (!code.trim()) {
      clearResults();
      return;
    }
    analysisController?.abort();
    const controller = new AbortController();
    analysisController = controller;
    const requestId = ++analysisRequest;
    if (button) setButtonBusy(button, true);
    if (source !== "live") setAnalysisStatus("Analyzing…", "busy");
    const started = performance.now();
    try {
      const tier = settings.turboLevel === "heavy" ? "maximum" : "turbo";
      let result = await analyzeCode(code, tier, controller.signal);
      if (controller.signal.aborted || requestId !== analysisRequest) return;
      if (applyFixes && settings.autoDetectMacros && result.valid) {
        const fixes = dedupeFixes(result.diagnostics);
        if (fixes.length) {
          suppressFixAnalysis = true;
          const applied = editor.applyFixes(fixes);
          suppressFixAnalysis = false;
          if (applied) {
            toast(`Applied ${applied} safe macro tag${applied === 1 ? "" : "s"}.`, "success");
            log(`Auto-applied ${applied} macro tag${applied === 1 ? "" : "s"}.`, "success");
            result = await analyzeCode(editor.getValue(), tier, controller.signal);
          }
        }
      }
      if (controller.signal.aborted || requestId !== analysisRequest) return;
      lastResult = result;
      editor.setServerDiagnostics(result.diagnostics);
      updateSourceMeta(editor.getValue());
      render(result, performance.now() - started);
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (requestId !== analysisRequest) return;
      setAnalysisStatus("Analysis failed", "error");
      log(err.message || String(err), "error");
      toast(err.message || "Analysis failed.", "error");
    } finally {
      if (analysisController === controller) analysisController = null;
      if (button && requestId === analysisRequest) setButtonBusy(button, false);
    }
  }

  analyzeButton?.addEventListener("click", () => runAnalysis({ applyFixes: true, button: analyzeButton }));
  applyAllButton?.addEventListener("click", async () => {
    const fixes = lastResult ? dedupeFixes(lastResult.diagnostics) : [];
    if (!fixes.length) {
      toast("There are no safe auto-fixes to apply.", "info");
      return;
    }
    suppressFixAnalysis = true;
    const applied = editor.applyFixes(fixes);
    suppressFixAnalysis = false;
    toast(`Applied ${applied} macro tag${applied === 1 ? "" : "s"}.`, "success");
    log(`Applied ${applied} macro tag${applied === 1 ? "" : "s"} from the findings panel.`, "success");
    await runAnalysis({ source: "manual" });
  });

  sendButton?.addEventListener("click", () => {
    const code = editor.getValue();
    if (!code.trim()) {
      toast("Add some Luau before sending to the obfuscator.", "error");
      return;
    }
    if (!setPendingSource(code)) {
      toast("Could not hand off this script through browser storage. Copy it into the obfuscator instead.", "error", 5200);
      return;
    }
    saveDraft("analyzer", code);
    window.location.href = "/obfuscator";
  });

  clearButton?.addEventListener("click", () => {
    if (editor.getValue().trim() && !window.confirm("Clear the current script and analysis?")) return;
    editor.setValue("");
    saveDraft("analyzer", "");
    clearResults();
    editor.focus();
  });

  openFileButton?.addEventListener("click", () => fileInput?.click());
  setupFileInput(fileInput, ({ name, text, bytes }) => {
    editor.setValue(text);
    saveDraft("analyzer", text);
    updateSourceMeta(text);
    toast(`Loaded ${name} (${formatBytes(bytes)}).`, "success");
    runAnalysis({ source: "file" });
  }, { acceptExtensions: [".lua", ".luau", ".txt"] });

  setupDropZone(host?.closest("[data-analyzer-drop]") || host, ({ name, text, bytes }) => {
    editor.setValue(text);
    saveDraft("analyzer", text);
    updateSourceMeta(text);
    toast(`Loaded ${name} (${formatBytes(bytes)}).`, "success");
    runAnalysis({ source: "file" });
  }, { acceptExtensions: [".lua", ".luau", ".txt"] });

  exampleButton?.addEventListener("click", () => {
    editor.setValue(SAMPLE_SCRIPT);
    saveDraft("analyzer", SAMPLE_SCRIPT);
    updateSourceMeta(SAMPLE_SCRIPT);
    toast("Example script loaded.", "success");
    runAnalysis({ source: "example" });
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      runAnalysis({ applyFixes: true, button: analyzeButton });
    }
  });

  renderAutomationSettings(settingsHost, settings, (next) => {
    settings = next;
    scheduleAnalysis();
  });

  updateSourceMeta(editor.getValue());
  log("Analyzer ready. Drop a script or press Analyze.", "info");
  if (initialSource.trim() && !pending) runAnalysis({ source: "load" });
  if (pending) runAnalysis({ source: "handoff" });
}
