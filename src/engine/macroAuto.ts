import { analyzeScript } from "./analyzer.js";
import type { AnalyzerTier } from "./analyzer.js";

export interface AutoMacroResult {
  code: string;
  injected: number;
  warnings: string[];
  tier: AnalyzerTier;
}

function lineStarts(code: string): number[] {
  const starts = [0];
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/**
 * Add safe Turbo/Maximum markers above top-level named functions containing
 * hot UI or RenderStepped work. Existing directives, nested functions, IIFEs,
 * duplicate names, and scripts with syntax errors are left untouched.
 */
export function injectHeavyMacros(code: string, tier: AnalyzerTier = "turbo"): AutoMacroResult {
  const analysis = analyzeScript(code, { tier });
  const warnings = [...analysis.macros.warnings];

  if (!analysis.valid) {
    warnings.push("Auto-detect skipped: source has syntax errors.");
    return { code, injected: 0, warnings, tier };
  }

  const fixes = new Map<number, AnalyzerTier>();
  for (const diag of analysis.diagnostics) {
    if (diag.fix) fixes.set(diag.fix.line, diag.fix.tier);
  }

  if (fixes.size === 0) {
    if (
      analysis.summary.instanceNew > 0 ||
      analysis.summary.renderStepped > 0 ||
      analysis.summary.heartbeat > 0
    ) {
      warnings.push("Heavy code was detected, but no safe top-level function was available for automatic tagging.");
    }
    return { code, injected: 0, warnings, tier };
  }

  const eol = code.includes("\r\n") ? "\r\n" : "\n";
  const starts = lineStarts(code);
  const edits = [...fixes.entries()]
    .map(([line, fixTier]) => ({
      offset: starts[line - 1],
      text: `--@quantum:${fixTier}${eol}`,
    }))
    .filter((edit) => typeof edit.offset === "number")
    .sort((a, b) => b.offset - a.offset);

  let output = code;
  for (const edit of edits) {
    output = output.slice(0, edit.offset) + edit.text + output.slice(edit.offset);
  }

  return {
    code: output,
    injected: edits.length,
    warnings,
    tier,
  };
}
