import { analyzeCode, hoistDoParent, refactorIifes } from "../api.js";
import {
  buildFindingView,
  dedupeFixes,
  describeGroup,
  fixesForView,
  formatApplyAllLabel,
} from "../analyzer-findings.js";
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
  const refactorAllButton = document.querySelector("[data-refactor-all-iifes]");
  const logList = document.querySelector("[data-analyzer-log]");

  let settings = loadSettings();
  let analysisController = null;
  let lastResult = null;
  let lastView = null;
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

  function cancelScheduledAnalysis() {
    scheduleLiveAnalysis.cancel?.();
    scheduleAnalysis.cancel?.();
  }

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

  function updateSummary(result, elapsed, view = null) {
    const summary = result.summary;
    const values = {
      lines: summary.lines,
      functions: summary.functions,
      heavy: summary.heavyFunctions,
      instanceNew: summary.instanceNew,
      renderStepped: summary.renderStepped,
      fixable: view ? view.groups.length : summary.autoFixable,
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

  function updateIifeWarning(count, refactorable = 0) {
    if (!iifeWarning) return;
    const total = Number(count) || 0;
    const safe = Number(refactorable) || 0;
    iifeWarning.hidden = total === 0;
    if (iifeCount && total > 0) {
      iifeCount.textContent =
        safe > 0
          ? `${safe} of ${total} IIFE${total === 1 ? "" : "s"} can be refactored safely`
          : `${total} IIFE${total === 1 ? "" : "s"} detected; none are safe for automatic refactoring`;
    }
    if (refactorAllButton) refactorAllButton.disabled = safe === 0;
  }

  async function applyRefactor(code, line, button) {
    if (!code.trim()) {
      toast("Add some Luau before refactoring IIFEs.", "error");
      return;
    }
    if (button) setButtonBusy(button, true);
    try {
      const tier = settings.turboLevel === "heavy" ? "maximum" : "turbo";
      const result = await refactorIifes(code, tier, line);
      if (!result.refactored) {
        const warning = result.warnings?.[0] || "No safe top-level IIFE matched that location.";
        toast(warning, "info", 5200);
        log(warning, "info");
        return;
      }
      cancelScheduledAnalysis();
      suppressFixAnalysis = true;
      editor.setValue(result.code);
      suppressFixAnalysis = false;
      saveDraft("analyzer", result.code);
      updateSourceMeta(result.code);
      const message = `Refactored ${result.refactored} IIFE${result.refactored === 1 ? "" : "s"} into named local functions.`;
      toast(message, "success");
      log(message, "success");
      await runAnalysis({ source: "refactor" });
    } catch (err) {
      if (err?.name === "AbortError") return;
      toast(err.message || "IIFE refactor failed.", "error", 5200);
      log(err.message || "IIFE refactor failed.", "error");
    } finally {
      if (button) setButtonBusy(button, false);
    }
  }

  async function applyHoist(code, line, button) {
    if (!code.trim()) {
      toast("Add some Luau before hoisting a do block.", "error");
      return;
    }
    if (button) setButtonBusy(button, true);
    try {
      const tier = settings.turboLevel === "heavy" ? "maximum" : "turbo";
      const result = await hoistDoParent(code, tier, line);
      if (!result.hoisted) {
        const warning = result.warnings?.[0] || `No hoistable do block found at line ${line}.`;
        toast(warning, "info", 5200);
        log(warning, "info");
        return;
      }
      cancelScheduledAnalysis();
      suppressFixAnalysis = true;
      editor.setValue(result.code);
      suppressFixAnalysis = false;
      saveDraft("analyzer", result.code);
      updateSourceMeta(result.code);
      const message = `Hoisted the do block at line ${line} into a tagged top-level wrapper.`;
      toast(message, "success");
      log(message, "success");
      await runAnalysis({ source: "hoist" });
    } catch (err) {
      if (err?.name === "AbortError") return;
      toast(err.message || "Do block hoist failed.", "error", 5200);
      log(err.message || "Do block hoist failed.", "error");
    } finally {
      if (button) setButtonBusy(button, false);
    }
  }

  async function refactorAtLine(line, button) {
    await applyRefactor(editor.getValue(), line, button);
  }

  async function refactorAll(button) {
    await applyRefactor(editor.getValue(), undefined, button);
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
      fix.className = "btn btn-primary btn-xs finding-fix finding-action finding-action-fix";
      fix.dataset.findingAction = "fix";
      fix.textContent = "Apply fix";
      fix.setAttribute("aria-label", `Apply macro tag above line ${diagnostic.fix.line}`);
      fix.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.currentTarget?.dataset.findingAction !== "fix") return;
        if (editor.applyFix(diagnostic.fix)) {
          log(`Inserted ${diagnostic.fix.insertText.trim()} above line ${diagnostic.fix.line}.`, "success");
        }
      });
      row.appendChild(fix);
    } else if (diagnostic.refactor) {
      const refactor = document.createElement("button");
      refactor.type = "button";
      refactor.className = "btn btn-secondary btn-xs finding-fix finding-action finding-action-refactor";
      refactor.dataset.findingAction = "refactor";
      refactor.textContent = "Refactor IIFE";
      refactor.setAttribute("aria-label", `Refactor top-level IIFE at line ${diagnostic.refactor.line}`);
      refactor.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.currentTarget?.dataset.findingAction !== "refactor") return;
        refactorAtLine(diagnostic.refactor.line, refactor);
      });
      row.appendChild(refactor);
    } else if (diagnostic.hoist) {
      const hoist = document.createElement("button");
      hoist.type = "button";
      hoist.className = "btn btn-secondary btn-xs finding-fix finding-action finding-action-hoist";
      hoist.dataset.findingAction = "hoist";
      hoist.textContent = "Hoist parent";
      hoist.setAttribute("aria-label", `Hoist the do block at line ${diagnostic.hoist.line} into a tagged wrapper`);
      hoist.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.currentTarget?.dataset.findingAction !== "hoist") return;
        applyHoist(editor.getValue(), diagnostic.hoist.line, hoist);
      });
      row.appendChild(hoist);
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

  function createGroupFinding(group, index) {
    const row = document.createElement("div");
    row.className = "finding-row finding-group severity-warning";
    row.tabIndex = 0;
    row.dataset.index = String(index);
    row.dataset.findingGroup = "true";
    row.dataset.fixLine = String(group.fix.line);
    row.dataset.fixCount = String(group.count);
    row.setAttribute("role", "button");

    const lineText = group.lines.map((line) => `L${line}`).join(", ");
    const label = group.functionName
      ? `Function: ${group.functionName}`
      : `Fix target at line ${group.fix.line}`;
    row.setAttribute("aria-label", `${label}, ${describeGroup(group)}. ${lineText}.`);

    const line = document.createElement("span");
    line.className = "finding-line";
    line.textContent = `L${group.lines[0]}`;
    line.title = lineText;

    const body = document.createElement("div");
    body.className = "finding-body";
    const message = document.createElement("span");
    message.className = "finding-message";
    message.textContent = `${label} (${describeGroup(group)})`;
    const meta = document.createElement("span");
    meta.className = "finding-meta";
    const lines = document.createElement("span");
    lines.className = "finding-code";
    const shown = group.lines.slice(0, 4).map((item) => `L${item}`).join(", ");
    const remaining = group.lines.length - 4;
    lines.textContent = remaining > 0 ? `${shown} +${remaining}` : shown;
    lines.title = lineText;
    const count = document.createElement("span");
    count.className = "finding-count";
    count.textContent = `${group.count} finding${group.count === 1 ? "" : "s"}`;
    meta.append(lines, count);
    body.append(message, meta);

    const fix = document.createElement("button");
    fix.type = "button";
    fix.className = "btn btn-primary btn-xs finding-fix finding-action finding-action-fix";
    fix.dataset.findingAction = "fix";
    fix.textContent = "Apply fix";
    fix.setAttribute(
      "aria-label",
      `Apply ${group.fix.tier} macro tag to ${group.functionName || `line ${group.fix.line}`} for ${group.count} finding${group.count === 1 ? "" : "s"}`,
    );
    fix.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget?.dataset.findingAction !== "fix") return;
      if (editor.applyFix(group.fix)) {
        log(`Inserted ${group.fix.insertText.trim()} above line ${group.fix.line} for ${group.count} finding${group.count === 1 ? "" : "s"}.`, "success");
      }
    });

    row.append(line, body, fix);
    const reveal = () => editor.showDiagnostic(group.diagnostics[0]);
    row.addEventListener("click", reveal);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        reveal();
      }
    });
    return row;
  }

  function renderFindings(view) {
    if (!results) return;
    results.replaceChildren();
    if (!view.rows.length) {
      const empty = document.createElement("div");
      empty.className = "findings-empty";
      empty.innerHTML = `<span class="empty-glyph">✓</span><strong>No hot paths detected</strong><p>The analyzer found no Instance.new or RenderStepped hot spots.</p>`;
      results.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    view.rows.forEach((row, index) => {
      fragment.appendChild(
        row.kind === "group" ? createGroupFinding(row.group, index) : createFinding(row.diagnostic, index),
      );
    });
    results.appendChild(fragment);
  }

  function render(result, elapsed) {
    const view = buildFindingView(result.diagnostics);
    lastView = view;
    if (emptyState) emptyState.hidden = true;
    const findingCount = result.diagnostics.length;
    const groupCount = view.groups.length;
    document.querySelector("[data-results-count]").textContent =
      `${findingCount} finding${findingCount === 1 ? "" : "s"}` +
      (groupCount ? ` · ${groupCount} fix group${groupCount === 1 ? "" : "s"}` : "");
    updateSummary(result, elapsed, view);
    updateIifeWarning(result.summary.iifeCount, result.summary.iifeRefactorable);
    renderFindings(view);
    if (applyAllButton) {
      applyAllButton.disabled = view.applyAllCount === 0;
      applyAllButton.textContent = formatApplyAllLabel(view.applyAllCount);
      applyAllButton.dataset.fixCount = String(view.applyAllCount);
      applyAllButton.dataset.findingCount = String(view.totalFixable);
      applyAllButton.setAttribute(
        "aria-label",
        view.applyAllCount
          ? `Apply ${view.applyAllCount} macro tag${view.applyAllCount === 1 ? "" : "s"} covering ${view.totalFixable} finding${view.totalFixable === 1 ? "" : "s"}`
          : "Apply all fixes",
      );
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
    lastView = null;
    updateIifeWarning(0, 0);
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
          iifeCount: 0,
          iifeRefactorable: 0,
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
      applyAllButton.textContent = formatApplyAllLabel(0);
      delete applyAllButton.dataset.fixCount;
      delete applyAllButton.dataset.findingCount;
      applyAllButton.setAttribute("aria-label", "Apply all fixes");
    }
  }

  async function runAnalysis({ applyFixes = false, button = null, source = "manual" } = {}) {
    cancelScheduledAnalysis();
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

  analyzeButton?.addEventListener("click", () => runAnalysis({ source: "manual", button: analyzeButton }));
  refactorAllButton?.addEventListener("click", () => refactorAll(refactorAllButton));
  applyAllButton?.addEventListener("click", async () => {
    const fixes = lastView ? fixesForView(lastView) : [];
    const findingCount = lastView?.totalFixable ?? 0;
    if (!fixes.length) {
      toast("There are no safe auto-fixes to apply.", "info");
      return;
    }
    suppressFixAnalysis = true;
    const applied = editor.applyFixes(fixes);
    suppressFixAnalysis = false;
    toast(
      `Applied ${applied} macro tag${applied === 1 ? "" : "s"} covering ${findingCount} finding${findingCount === 1 ? "" : "s"}.`,
      "success",
    );
    log(
      `Applied ${applied} macro tag${applied === 1 ? "" : "s"} covering ${findingCount} finding${findingCount === 1 ? "" : "s"} from the findings panel.`,
      "success",
    );
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
      runAnalysis({ source: "manual", button: analyzeButton });
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
