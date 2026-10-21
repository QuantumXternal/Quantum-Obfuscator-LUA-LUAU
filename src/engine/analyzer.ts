import type { Chunk, Statement, LastStatement } from "../ast/types.js";
import { lex } from "../lexer/Lexer.js";
import { parseWithErrors } from "../parser/Parser.js";
import type { SourceComment } from "../lexer/Lexer.js";
import type { Token } from "../tokens.js";
import { applyFunctionMacroTiers } from "./macros.js";
import type { MacroScanResult } from "./macros.js";
import { collectIifeSites, type IifeSite } from "./iifeRefactor.js";

export type AnalyzerTier = "turbo" | "maximum";

export interface AnalyzerIifeRefactor {
  line: number;
}

export interface AnalyzerFix {
  /** 1-based source line where the directive should be inserted. */
  line: number;
  /** Text to insert at the start of the line (usually a macro + newline). */
  insertText: string;
  tier: AnalyzerTier;
}

export interface AnalyzerDiagnostic {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  functionName: string | null;
  fix: AnalyzerFix | null;
  refactor?: AnalyzerIifeRefactor | null;
}

export interface AnalyzerSummary {
  lines: number;
  tokens: number;
  functions: number;
  iifeCount: number;
  iifeRefactorable: number;
  instanceNew: number;
  renderStepped: number;
  heavyFunctions: number;
  autoFixable: number;
  errors: number;
  truncated: boolean;
}

export interface AnalyzerResult {
  valid: boolean;
  diagnostics: AnalyzerDiagnostic[];
  macros: MacroScanResult;
  summary: AnalyzerSummary;
}

export interface AnalyzerOptions {
  tier?: AnalyzerTier;
}

type AnyNode = { type: string; loc?: SourceLoc; [key: string]: unknown };
type SourceLoc = {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
};

interface FunctionSite {
  node: AnyNode;
  name: string | null;
  topLevel: boolean;
  startLine: number;
  endLine: number;
}

interface HeavyHit {
  code: "instance-new" | "render-stepped";
  node: AnyNode;
  detail: string;
}

const MAX_DIAGNOSTICS = 500;

function isNode(value: unknown): value is AnyNode {
  return !!value && typeof value === "object" && typeof (value as AnyNode).type === "string";
}

function forEachChild(node: AnyNode, cb: (child: AnyNode) => void): void {
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "type") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!item || typeof item !== "object") continue;
        if (isNode(item)) cb(item);
        else if (typeof item === "object") forEachChild(item as AnyNode, cb);
      }
    } else if (isNode(value)) {
      cb(value);
    }
  }
}

function walk(node: AnyNode, cb: (child: AnyNode) => void): void {
  cb(node);
  forEachChild(node, (child) => walk(child, cb));
}

function nodeLoc(node: AnyNode): SourceLoc {
  if (node.loc) return node.loc;
  const pos = { line: 1, column: 1, offset: 0 };
  return { start: pos, end: pos };
}

function isIdentifier(node: unknown, name: string): boolean {
  return isNode(node) && node.type === "Identifier" && node.name === name;
}

function stringValue(node: unknown): string | null {
  if (!isNode(node) || node.type !== "StringLiteral") return null;
  return typeof node.value === "string" ? node.value : null;
}

function siteFromStatement(stmt: AnyNode): { node: AnyNode; name: string | null } | null {
  if (stmt.type === "FunctionStatement") {
    const funcName = stmt.name;
    let name: string | null = null;
    if (isNode(funcName) && !funcName.method && isNode(funcName.base) && funcName.base.type === "Identifier") {
      name = typeof funcName.base.name === "string" ? funcName.base.name : null;
    }
    return { node: stmt, name };
  }
  if (stmt.type === "LocalFunctionStatement") {
    return { node: stmt, name: typeof stmt.name === "string" ? stmt.name : null };
  }
  if (stmt.type === "LocalStatement") {
    const vars = Array.isArray(stmt.vars) ? stmt.vars : [];
    const values = Array.isArray(stmt.values) ? stmt.values : [];
    if (vars.length === 1 && values.length === 1 && isNode(values[0]) && values[0].type === "FunctionExpression") {
      const v = vars[0];
      return { node: values[0], name: isNode(v) && typeof v.name === "string" ? v.name : null };
    }
  }
  if (stmt.type === "AssignmentStatement") {
    const vars = Array.isArray(stmt.vars) ? stmt.vars : [];
    const values = Array.isArray(stmt.values) ? stmt.values : [];
    if (vars.length === 1 && values.length === 1 && isNode(values[0]) && values[0].type === "FunctionExpression") {
      const target = vars[0];
      const name = isNode(target) && target.type === "Identifier" && typeof target.name === "string" ? target.name : null;
      return { node: values[0], name };
    }
  }
  return null;
}

function functionCount(ast: Chunk): number {
  let count = 0;
  const visit = (node: AnyNode) => {
    if (node.type === "FunctionStatement" || node.type === "LocalFunctionStatement" || node.type === "FunctionExpression") {
      count++;
    }
    forEachChild(node, visit);
  };
  for (const stmt of ast.body as unknown as AnyNode[]) visit(stmt);
  return count;
}

function isFunctionNode(node: AnyNode): boolean {
  return node.type === "FunctionStatement" || node.type === "LocalFunctionStatement" || node.type === "FunctionExpression";
}

function unwrapIifeCallee(node: AnyNode): AnyNode | null {
  let current: unknown = node;
  while (isNode(current) && (current.type === "ParenExpression" || current.type === "TypeAssertion")) {
    current = current.expression;
  }
  return isNode(current) ? current : null;
}

function countIifes(ast: Chunk): number {
  let count = 0;
  walk(ast as unknown as AnyNode, (node) => {
    if (node.type !== "CallExpression" || !isNode(node.callee)) return;
    if (unwrapIifeCallee(node.callee)?.type === "FunctionExpression") count++;
  });
  return count;
}

function likelyRenderStepped(node: AnyNode): boolean {
  if (node.type === "MemberExpression" && node.property === "RenderStepped") return true;
  if (node.type === "MethodCallExpression" && node.method === "RenderStepped") return true;
  if (node.type === "IndexExpression" && stringValue(node.index) === "RenderStepped") return true;
  return false;
}

export function analyzeScript(code: string, options: AnalyzerOptions = {}): AnalyzerResult {
  const tier: AnalyzerTier = options.tier === "maximum" ? "maximum" : "turbo";
  const sourceLines = code.split(/\r?\n/);
  const diagnostics: AnalyzerDiagnostic[] = [];
  let truncated = false;

  const pushDiagnostic = (diag: AnalyzerDiagnostic) => {
    if (diagnostics.length >= MAX_DIAGNOSTICS) {
      truncated = true;
      return;
    }
    diagnostics.push(diag);
  };

  const lexed = lex(code);
  let ast: Chunk = { type: "Chunk", loc: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } }, body: [] };
  let parseErrors: { message: string; loc?: SourceLoc }[] = [];
  try {
    const parsed = parseWithErrors(lexed.tokens);
    ast = parsed.ast;
    parseErrors = parsed.errors;
  } catch (err: any) {
    parseErrors = [{ message: String(err?.message ?? err), loc: undefined }];
  }

  for (const err of lexed.errors) {
    pushDiagnostic({
      line: err.loc.start.line,
      column: err.loc.start.column,
      endLine: err.loc.end.line,
      endColumn: Math.max(err.loc.end.column, err.loc.start.column + 1),
      severity: "error",
      code: "lex-error",
      message: err.message,
      functionName: null,
      fix: null,
    });
  }
  for (const err of parseErrors) {
    const loc = err.loc?.start ?? { line: 1, column: 1, offset: 0 };
    const end = err.loc?.end ?? loc;
    pushDiagnostic({
      line: loc.line,
      column: loc.column,
      endLine: end.line,
      endColumn: Math.max(end.column, loc.column + 1),
      severity: "error",
      code: "parse-error",
      message: err.message,
      functionName: null,
      fix: null,
    });
  }

  let iifeSites: IifeSite[] = [];
  if (lexed.errors.length === 0 && parseErrors.length === 0) {
    try {
      iifeSites = collectIifeSites(ast, code, { tokens: lexed.tokens, comments: lexed.comments });
    } catch {
      iifeSites = [];
    }
  }
  for (const site of iifeSites) {
    const message = site.safe
      ? `Top-level IIFE can be refactored into a named local function and tagged for ${tier.toUpperCase()}.`
      : `IIFE cannot be auto-refactored safely. ${site.reason ?? "Lift it to the top level manually."}`;
    pushDiagnostic({
      line: site.line,
      column: site.column,
      endLine: site.endLine,
      endColumn: Math.max(site.endColumn, site.column + 1),
      severity: "warning",
      code: "iife",
      message,
      functionName: null,
      fix: null,
      refactor: site.safe ? { line: site.line } : null,
    });
  }

  let macros: MacroScanResult = { turbos: [], maximums: [], warnings: [] };
  try {
    macros = applyFunctionMacroTiers(code, ast, lexed.comments as SourceComment[], lexed.tokens as Token[]);
  } catch {
    // Macro scanning is advisory. Structural analysis still works on a
    // partially parsed chunk.
  }

  const sites: FunctionSite[] = [];
  const topLevelNodes = new Map<AnyNode, FunctionSite>();
  for (const stmt of ast.body as unknown as AnyNode[]) {
    const site = siteFromStatement(stmt);
    if (!site) continue;
    const loc = nodeLoc(site.node);
    const entry: FunctionSite = {
      node: site.node,
      name: site.name,
      topLevel: true,
      startLine: loc.start.line,
      endLine: loc.end.line,
    };
    sites.push(entry);
    topLevelNodes.set(stmt, entry);
  }

  const nameCounts = new Map<string, number>();
  for (const site of sites) {
    if (site.name) nameCounts.set(site.name, (nameCounts.get(site.name) ?? 0) + 1);
  }

  const heavyHits: { site: FunctionSite | null; hit: HeavyHit }[] = [];
  const scanNode = (node: AnyNode, site: FunctionSite | null) => {
    // A nested function has its own execution boundary. Do not attribute its
    // heavy calls to the enclosing top-level function: a macro on the outer
    // function is not a safe fix for an unnamed callback or nested helper.
    if (site && node !== site.node && isFunctionNode(node)) {
      forEachChild(node, (child) => scanNode(child, null));
      return;
    }
    if (node.type === "CallExpression") {
      const callee = node.callee;
      if (
        isNode(callee) &&
        callee.type === "MemberExpression" &&
        callee.property === "new" &&
        isIdentifier(callee.object, "Instance")
      ) {
        const className = Array.isArray(node.args) ? stringValue(node.args[0]) : null;
        heavyHits.push({
          site,
          hit: {
            code: "instance-new",
            node,
            detail: className ? `Instance.new("${className}")` : "Instance.new(...)",
          },
        });
      }
    }
    if (likelyRenderStepped(node)) {
      heavyHits.push({
        site,
        hit: { code: "render-stepped", node, detail: "RenderStepped per-frame event" },
      });
    }
    forEachChild(node, (child) => scanNode(child, site));
  };

  for (const stmt of ast.body as unknown as AnyNode[]) {
    const site = topLevelNodes.get(stmt) ?? null;
    if (site) scanNode(site.node, site);
    else scanNode(stmt, null);
  }

  const heavyFunctionKeys = new Set<string>();
  const fixableLines = new Set<number>();
  for (const { site, hit } of heavyHits) {
    const loc = nodeLoc(hit.node);
    const name = site?.name ?? null;
    const label = name ? `'${name}'` : "this code";
    const already = site?.node.tier;
    const duplicate = name ? (nameCounts.get(name) ?? 0) > 1 : false;
    let fix: AnalyzerFix | null = null;
    let message: string;

    if (hit.code === "instance-new") {
      message = `${hit.detail} inside ${label} is hot UI construction.`;
    } else {
      message = `${hit.detail} inside ${label} runs every frame and belongs in native Turbo code.`;
    }

    if (already) {
      message += ` This function is already tagged for ${String(already).toUpperCase()}.`;
    } else if (!site) {
      message += " Move it into a top-level named function or tag the enclosing top-level function manually.";
    } else if (!name) {
      message += " This function has no taggable top-level name; extract it to a named function first.";
    } else if (duplicate) {
      message += " The name is declared more than once; resolve the duplicate before tagging it.";
    } else {
      fix = {
        line: site.startLine,
        insertText: `--@quantum:${tier}\n`,
        tier,
      };
      fixableLines.add(site.startLine);
      message += ` Suggested fix: insert --@quantum:${tier} above the function.`;
    }

    heavyFunctionKeys.add(site ? `site:${site.startLine}` : `top:${loc.start.line}`);
    pushDiagnostic({
      line: loc.start.line,
      column: loc.start.column,
      endLine: loc.end.line,
      endColumn: Math.max(loc.end.column, loc.start.column + 1),
      severity: "warning",
      code: hit.code,
      message,
      functionName: name,
      fix,
    });
  }

  for (const warning of macros.warnings) {
    const match = /line (\d+)/i.exec(warning);
    const line = match ? Number(match[1]) : 1;
    pushDiagnostic({
      line,
      column: 1,
      endLine: line,
      endColumn: Math.max((sourceLines[line - 1] ?? "").length + 1, 2),
      severity: "info",
      code: "macro-warning",
      message: warning,
      functionName: null,
      fix: null,
    });
  }

  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const instanceNew = heavyHits.filter((h) => h.hit.code === "instance-new").length;
  const renderStepped = heavyHits.filter((h) => h.hit.code === "render-stepped").length;

  return {
    valid: errors === 0,
    diagnostics,
    macros,
    summary: {
      lines: sourceLines.length,
      tokens: lexed.tokens.filter((t) => t.type !== "EOF").length,
      functions: functionCount(ast),
      iifeCount: lexed.errors.length === 0 && parseErrors.length === 0 ? iifeSites.length : countIifes(ast),
      iifeRefactorable: iifeSites.filter((site) => site.safe).length,
      instanceNew,
      renderStepped,
      heavyFunctions: heavyFunctionKeys.size,
      autoFixable: fixableLines.size,
      errors,
      truncated,
    },
  };
}
