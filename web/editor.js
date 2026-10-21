import { basicSetup } from "codemirror";
import { Compartment, EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, placeholder } from "@codemirror/view";
import { StreamLanguage, indentUnit } from "@codemirror/language";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { lintGutter, linter, setDiagnostics } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";

const luaLanguage = StreamLanguage.define(lua);

const setJumpLine = StateEffect.define();
const jumpLineDecoration = Decoration.line({ class: "cm-jump-line" });

const jumpLineField = StateField.define({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setJumpLine)) continue;
      if (effect.value === null) return Decoration.none;
      const lineNumber = clamp(Number(effect.value) || 1, 1, transaction.state.doc.lines);
      next = Decoration.set([jumpLineDecoration.range(transaction.state.doc.line(lineNumber).from)]);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const studioTheme = EditorView.theme(
  {
    "&": {
      color: "#d9e6f5",
      backgroundColor: "#0a1019",
      height: "100%",
      fontSize: "13px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      fontFamily: '"Cascadia Code", "JetBrains Mono", "SFMono-Regular", Consolas, monospace',
      lineHeight: "1.62",
      overflow: "auto",
    },
    ".cm-content": { caretColor: "#58d7ff", padding: "14px 0 44px" },
    ".cm-line": { padding: "0 18px 0 14px" },
    ".cm-gutters": {
      backgroundColor: "#080d15",
      color: "#3f4f65",
      border: "none",
      borderRight: "1px solid #172333",
      paddingLeft: "4px",
    },
    ".cm-lineNumbers .cm-gutterElement": { minWidth: "32px", padding: "0 10px 0 6px" },
    ".cm-activeLine": { backgroundColor: "rgba(88, 215, 255, 0.045)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(88, 215, 255, 0.08)", color: "#88dff5" },
    ".cm-jump-line": {
      backgroundColor: "rgba(88, 215, 255, 0.13)",
      boxShadow: "inset 3px 0 0 #58d7ff",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(76, 201, 240, 0.2) !important",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#58d7ff", borderLeftWidth: "2px" },
    ".cm-matchingBracket": { backgroundColor: "rgba(139, 92, 246, 0.24)", outline: "none" },
    ".cm-tooltip": {
      backgroundColor: "#111b29",
      color: "#dce8f7",
      border: "1px solid #26374d",
      borderRadius: "8px",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "#17314a",
      color: "#f4f9ff",
    },
  },
  { dark: true },
);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function serverDiagnosticToRange(state, diagnostic) {
  const doc = state.doc;
  const lineNumber = clamp(Number(diagnostic.line) || 1, 1, doc.lines);
  const line = doc.line(lineNumber);
  const from = clamp(line.from + Math.max((Number(diagnostic.column) || 1) - 1, 0), line.from, line.to);
  const endLineNumber = clamp(Number(diagnostic.endLine) || lineNumber, 1, doc.lines);
  const endLine = doc.line(endLineNumber);
  let to = clamp(endLine.from + Math.max((Number(diagnostic.endColumn) || 1) - 1, 0), endLine.from, endLine.to);
  if (to <= from) to = Math.min(from + 1, doc.length);
  return { from, to };
}

function severityLabel(severity) {
  if (severity === "error") return "Error";
  if (severity === "info") return "Note";
  return "Warning";
}

export function createEditor(host, options = {}) {
  if (!host) throw new Error("Editor host was not found.");
  host.classList.add("editor-host");
  const onChange = options.onChange || (() => {});
  const onFixApplied = options.onFixApplied || (() => {});
  const readOnly = options.readOnly === true;
  const readOnlyCompartment = new Compartment();
  let serverDiagnostics = [];
  let currentDiagnostics = [];
  let hideTimer = null;
  let hoverTimer = null;
  let jumpRequest = 0;
  let jumpHighlightTimer = null;
  let activeDiagnostic = null;
  let lastPointer = null;

  const popover = document.createElement("div");
  popover.className = "lint-popover";
  popover.hidden = true;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Diagnostic details");
  popover.innerHTML = `
    <div class="lint-popover-head">
      <span class="lint-severity" data-lint-severity>Warning</span>
      <span class="lint-location" data-lint-location></span>
      <button type="button" class="icon-button lint-close" aria-label="Dismiss diagnostic" data-lint-close>×</button>
    </div>
    <p class="lint-message" data-lint-message></p>
    <div class="lint-actions">
      <button type="button" class="btn btn-primary btn-xs" data-lint-fix>Apply fix</button>
      <span class="lint-note" data-lint-note></span>
    </div>
  `;
  host.appendChild(popover);

  const fixButton = popover.querySelector("[data-lint-fix]");
  const severityEl = popover.querySelector("[data-lint-severity]");
  const locationEl = popover.querySelector("[data-lint-location]");
  const messageEl = popover.querySelector("[data-lint-message]");
  const noteEl = popover.querySelector("[data-lint-note]");

  const state = EditorState.create({
    doc: options.value || "",
    extensions: [
      basicSetup,
      luaLanguage,
      indentUnit.of("  "),
      EditorState.tabSize.of(2),
      oneDark,
      studioTheme,
      jumpLineField,
      lintGutter({ tooltipFilter: () => [] }),
      linter(null, { tooltipFilter: () => [] }),
      placeholder(options.placeholder || "-- Paste or drop a Luau script here"),
      readOnlyCompartment.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString());
      }),
      EditorView.contentAttributes.of({ "aria-label": options.label || "Luau source editor" }),
    ],
  });

  const view = new EditorView({ state, parent: host });

  function lineForDiagnostic(diagnostic) {
    const lineNumber = clamp(Number(diagnostic.line) || 1, 1, view.state.doc.lines);
    return view.state.doc.line(lineNumber);
  }

  function hidePopover() {
    clearTimeout(hoverTimer);
    popover.hidden = true;
    activeDiagnostic = null;
    host.classList.remove("has-lint-popover");
  }

  function showPopover(diagnostic, event) {
    if (!diagnostic) return;
    activeDiagnostic = diagnostic;
    severityEl.textContent = severityLabel(diagnostic.severity);
    severityEl.className = `lint-severity severity-${diagnostic.severity}`;
    locationEl.textContent = `line ${diagnostic.line}${diagnostic.functionName ? ` · ${diagnostic.functionName}` : ""}`;
    messageEl.textContent = diagnostic.message;
    if (diagnostic.fix) {
      fixButton.hidden = false;
      fixButton.textContent = `Apply ${diagnostic.fix.tier === "maximum" ? "Maximum" : "Turbo"} fix`;
      noteEl.textContent = "Inserts a macro above the function.";
    } else {
      fixButton.hidden = true;
      noteEl.textContent = "Manual change required.";
    }
    popover.hidden = false;
    host.classList.add("has-lint-popover");
    const rect = popover.getBoundingClientRect();
    const anchorX = event?.clientX ?? lastPointer?.clientX ?? window.innerWidth / 2;
    const anchorY = event?.clientY ?? lastPointer?.clientY ?? window.innerHeight / 2;
    const left = clamp(anchorX + 14, 12, window.innerWidth - rect.width - 12);
    const top = clamp(anchorY + 16, 12, window.innerHeight - rect.height - 12);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!popover.matches(":hover")) hidePopover();
    }, 240);
  }

  function diagnosticAtPosition(pos) {
    let best = null;
    for (const diagnostic of serverDiagnostics) {
      const range = serverDiagnosticToRange(view.state, diagnostic);
      if (pos >= range.from && pos <= range.to) {
        if (!best || (diagnostic.severity === "error" && best.severity !== "error")) best = diagnostic;
      }
    }
    return best;
  }

  function applyFix(fix) {
    if (!fix || !fix.insertText) return false;
    const line = lineForDiagnostic(fix);
    view.dispatch({
      changes: { from: line.from, insert: fix.insertText },
      selection: { anchor: line.from + fix.insertText.length },
      scrollIntoView: true,
    });
    hidePopover();
    onFixApplied(fix);
    return true;
  }

  fixButton.addEventListener("click", () => {
    if (activeDiagnostic?.fix) applyFix(activeDiagnostic.fix);
  });
  popover.querySelector("[data-lint-close]").addEventListener("click", hidePopover);
  popover.addEventListener("mouseenter", () => clearTimeout(hideTimer));
  popover.addEventListener("mouseleave", scheduleHide);

  view.dom.addEventListener("mousemove", (event) => {
    if (readOnly) return;
    if (popover.contains(event.target)) return;
    lastPointer = { clientX: event.clientX, clientY: event.clientY };
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return;
      const diagnostic = diagnosticAtPosition(pos);
      if (diagnostic && !popover.matches(":hover")) showPopover(diagnostic, event);
      else if (!diagnostic) scheduleHide();
    }, 90);
  });

  view.dom.addEventListener("mouseleave", () => {
    clearTimeout(hoverTimer);
    scheduleHide();
  });

  view.dom.addEventListener("click", (event) => {
    if (readOnly) return;
    if (popover.contains(event.target)) return;
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;
    const diagnostic = diagnosticAtPosition(pos);
    if (diagnostic) showPopover(diagnostic, event);
    else hidePopover();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !popover.hidden) hidePopover();
  });
  document.addEventListener("click", (event) => {
    if (!popover.hidden && !popover.contains(event.target) && !view.dom.contains(event.target)) hidePopover();
  });
  view.scrollDOM.addEventListener("scroll", hidePopover, { passive: true });

  function setValue(text) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text || "" },
      selection: { anchor: 0 },
    });
  }

  function getValue() {
    return view.state.doc.toString();
  }

  function setReadOnly(value) {
    view.dispatch({
      effects: readOnlyCompartment.reconfigure([
        EditorState.readOnly.of(value),
        EditorView.editable.of(!value),
      ]),
    });
  }

  function setServerDiagnostics(diagnostics) {
    serverDiagnostics = Array.isArray(diagnostics) ? diagnostics : [];
    currentDiagnostics = serverDiagnostics.map((diagnostic) => {
      const range = serverDiagnosticToRange(view.state, diagnostic);
      const cmDiagnostic = {
        from: range.from,
        to: range.to,
        severity: diagnostic.severity,
        source: "Quantum Analyzer",
        message: diagnostic.message,
      };
      if (diagnostic.fix) {
        cmDiagnostic.actions = [
          {
            name: "Apply fix",
            apply: () => applyFix(diagnostic.fix),
          },
        ];
      }
      return cmDiagnostic;
    });
    view.dispatch(setDiagnostics(view.state, currentDiagnostics));
  }

  function clearServerDiagnostics() {
    serverDiagnostics = [];
    currentDiagnostics = [];
    view.dispatch(setDiagnostics(view.state, []));
  }

  function centerLine(lineNumber) {
    const current = view.state.doc.line(clamp(lineNumber, 1, view.state.doc.lines));
    view.dispatch({ effects: EditorView.scrollIntoView(current.from, { y: "center" }) });
    return current;
  }

  function goToLine(lineNumber, reveal = false) {
    const request = ++jumpRequest;
    clearTimeout(jumpHighlightTimer);
    const requested = clamp(Number(lineNumber) || 1, 1, view.state.doc.lines);
    const line = view.state.doc.line(requested);

    view.dispatch({
      selection: { anchor: line.from, head: Math.min(line.from + 1, line.to) },
      effects: [
        EditorView.scrollIntoView(line.from, { y: "center" }),
        setJumpLine.of(requested),
      ],
    });
    host.scrollIntoView({ block: "center", inline: "nearest" });
    view.focus();

    jumpHighlightTimer = setTimeout(() => {
      if (request !== jumpRequest) return;
      view.dispatch({ effects: setJumpLine.of(null) });
    }, 1600);

    const revealAtLine = (attempt = 0) => {
      if (request !== jumpRequest) return;
      const current = view.state.doc.line(clamp(requested, 1, view.state.doc.lines));
      const coords = view.coordsAtPos(current.from);
      if (!coords && attempt < 6) {
        setTimeout(() => revealAtLine(attempt + 1), 30);
        return;
      }
      const diagnostic = serverDiagnostics.find((item) => Number(item.line) === requested);
      if (!diagnostic) return;
      showPopover(
        diagnostic,
        coords ? { clientX: coords.left + 24, clientY: coords.bottom - 4 } : { clientX: window.innerWidth / 2, clientY: 180 },
      );
    };

    requestAnimationFrame(() => {
      if (request !== jumpRequest) return;
      centerLine(requested);
      requestAnimationFrame(() => {
        if (request !== jumpRequest) return;
        centerLine(requested);
        if (reveal) setTimeout(revealAtLine, 30);
      });
    });
  }

  function applyFixes(fixes) {
    const seen = new Set();
    const unique = fixes
      .filter((fix) => fix && Number.isFinite(fix.line) && fix.insertText)
      .filter((fix) => {
        const key = `${fix.line}:${fix.insertText}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.line - a.line);
    if (!unique.length) return 0;
    for (const fix of unique) {
      const line = view.state.doc.line(clamp(fix.line, 1, view.state.doc.lines));
      view.dispatch({ changes: { from: line.from, insert: fix.insertText } });
    }
    view.focus();
    hidePopover();
    onFixApplied(unique[unique.length - 1]);
    return unique.length;
  }

  function focus() {
    view.focus();
  }

  function destroy() {
    jumpRequest++;
    clearTimeout(jumpHighlightTimer);
    hidePopover();
    view.destroy();
  }

  return {
    view,
    getValue,
    setValue,
    setReadOnly,
    setServerDiagnostics,
    clearServerDiagnostics,
    goToLine,
    showDiagnostic: (diagnostic) => {
      if (!diagnostic) return;
      goToLine(diagnostic.line, true);
    },
    applyFix,
    applyFixes,
    focus,
    destroy,
    getDiagnostics: () => serverDiagnostics.slice(),
    getLineCount: () => view.state.doc.lines,
  };
}
