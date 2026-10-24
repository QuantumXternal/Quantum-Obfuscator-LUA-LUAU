import type { Chunk, FunctionExpression, Statement, LastStatement } from "../ast/types.js";
import { lex } from "../lexer/Lexer.js";
import type { SourceComment } from "../lexer/Lexer.js";
import { parseWithErrors } from "../parser/Parser.js";
import type { Token } from "../tokens.js";

export type IifeRefactorTier = "turbo" | "maximum";

export interface IifeRefactorOptions {
  tier?: IifeRefactorTier;
  line?: number;
}

export interface IifeSite {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  safe: boolean;
  reason: string | null;
}

export interface IifeRefactorResult {
  code: string;
  refactored: number;
  remaining: number;
  warnings: string[];
  tier: IifeRefactorTier;
  line: number | null;
}

export interface IifeLexedSource {
  tokens: Token[];
  comments: SourceComment[];
}

type Loc = {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
};

type AnyNode = { type: string; loc?: Loc; [key: string]: unknown };

interface InternalIifeSite extends IifeSite {
  callStart: number;
  callEnd: number;
  calleeEnd: number;
  functionStart: number;
  functionEnd: number;
  statementStart: number;
  indent: string;
  directiveTier: IifeRefactorTier | null;
}

interface ParseOutcome {
  valid: boolean;
  ast: Chunk | null;
  lexed: IifeLexedSource | null;
  error: string | null;
}

interface Edit {
  offset: number;
  end: number;
  text: string;
  order: number;
}

interface IifeCallee {
  fn: FunctionExpression;
  parenCount: number;
  typeAsserted: boolean;
}

const STATEMENT_TYPES = new Set([
  "AssignmentStatement",
  "CompoundAssignmentStatement",
  "FunctionCallStatement",
  "DoStatement",
  "WhileStatement",
  "RepeatStatement",
  "IfStatement",
  "ForNumericStatement",
  "ForInStatement",
  "FunctionStatement",
  "LocalFunctionStatement",
  "LocalStatement",
  "TypeStatement",
  "ExportTypeStatement",
  "TypeFunctionStatement",
  "ExportTypeFunctionStatement",
  "ReturnStatement",
  "BreakStatement",
  "ContinueStatement",
]);

const DIRECT_TOP_LEVEL_STATEMENTS = new Set([
  "AssignmentStatement",
  "CompoundAssignmentStatement",
  "FunctionCallStatement",
  "LocalStatement",
  "ReturnStatement",
]);

const MAX_PASSES = 64;

const HOISTABLE_PARENT_TYPES = new Set([
  "DoStatement",
  "WhileStatement",
  "IfStatement",
  "ForNumericStatement",
  "ForInStatement",
]);

function isNode(value: unknown): value is AnyNode {
  return !!value && typeof value === "object" && typeof (value as AnyNode).type === "string";
}

function isStatement(value: AnyNode): boolean {
  return STATEMENT_TYPES.has(value.type);
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

function lineStartsFor(code: string): number[] {
  const starts = [0];
  for (let i = 0; i < code.length; i++) {
    if (code.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function positionAt(starts: number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (starts[mid]! <= offset) low = mid + 1;
    else high = mid - 1;
  }
  const index = Math.max(0, high);
  return { line: index + 1, column: offset - starts[index]! + 1 };
}

function directiveTier(comment: SourceComment): IifeRefactorTier | null {
  if (comment.long) return null;
  const body = comment.text.startsWith("--") ? comment.text.slice(2) : comment.text;
  const match = /^@quantum\s*:\s*(turbo|maximum)\b/i.exec(body.trim());
  return match ? (match[1]!.toLowerCase() as IifeRefactorTier) : null;
}

function makeDirectiveLookup(code: string, tokens: Token[], comments: SourceComment[]) {
  const sourceLines = code.split(/\r?\n/);
  const codeLines = new Set<number>();
  for (const token of tokens) {
    if (token.type !== "EOF") codeLines.add(token.loc.start.line);
  }

  const directiveLines = new Map<number, IifeRefactorTier[]>();
  for (const comment of comments) {
    if (comment.long) continue;
    const line = comment.loc.start.line;
    const before = (sourceLines[line - 1] ?? "").slice(0, Math.max(0, comment.loc.start.column - 1));
    if (before.trim().length > 0) continue;
    if (codeLines.has(line)) continue;
    const tier = directiveTier(comment);
    if (!tier) continue;
    const hits = directiveLines.get(line) ?? [];
    hits.push(tier);
    directiveLines.set(line, hits);
  }

  return (line: number): { tier: IifeRefactorTier | null; conflict: boolean } => {
    const tiers = new Set<IifeRefactorTier>();
    for (let current = line - 1; current >= 1; current--) {
      if (codeLines.has(current)) break;
      const hits = directiveLines.get(current);
      if (!hits) continue;
      for (const hit of hits) tiers.add(hit);
    }
    if (tiers.size > 1) return { tier: null, conflict: true };
    if (tiers.size === 1) return { tier: [...tiers][0]!, conflict: false };
    return { tier: null, conflict: false };
  };
}

function unwrapIifeCallee(value: unknown): IifeCallee | null {
  let current = value;
  let parenCount = 0;
  let typeAsserted = false;
  while (isNode(current)) {
    if (current.type === "ParenExpression") {
      parenCount++;
      current = current.expression;
      continue;
    }
    if (current.type === "TypeAssertion") {
      typeAsserted = true;
      current = current.expression;
      continue;
    }
    break;
  }
  if (!isNode(current) || current.type !== "FunctionExpression") return null;
  return {
    fn: current as unknown as FunctionExpression,
    parenCount,
    typeAsserted,
  };
}

function parseSource(code: string): ParseOutcome {
  try {
    const lexed = lex(code);
    if (lexed.errors.length > 0) {
      return { valid: false, ast: null, lexed, error: lexed.errors[0]!.message };
    }
    const parsed = parseWithErrors(lexed.tokens);
    if (parsed.errors.length > 0) {
      return { valid: false, ast: null, lexed, error: parsed.errors[0]!.message };
    }
    return { valid: true, ast: parsed.ast, lexed, error: null };
  } catch (err: any) {
    return { valid: false, ast: null, lexed: null, error: String(err?.message ?? err) };
  }
}

function collectNames(ast: Chunk): Set<string> {
  const names = new Set<string>();
  const visit = (node: AnyNode) => {
    if (node.type === "Identifier" && typeof node.name === "string") names.add(node.name);
    if (node.type === "LocalFunctionStatement" && typeof node.name === "string") names.add(node.name);
    if (node.type === "LocalStatement" && Array.isArray(node.vars)) {
      for (const variable of node.vars) {
        if (isNode(variable) && typeof variable.name === "string") names.add(variable.name);
        else if (variable && typeof variable === "object" && typeof (variable as any).name === "string") {
          names.add((variable as any).name);
        }
      }
    }
    const params = node.params;
    if (Array.isArray(params)) {
      for (const param of params) {
        if (param && typeof param === "object" && typeof (param as any).name === "string") {
          names.add((param as any).name);
        }
      }
    }
    forEachChild(node, visit);
  };
  for (const statement of ast.body as unknown as AnyNode[]) visit(statement);
  return names;
}

interface IifeWrapper {
  start: number;
  end: number;
  functionEnd: number;
  callEnd: number;
}

function matchingCloseIndex(tokens: Token[], openIndex: number): number {
  const open = tokens[openIndex];
  if (!open || open.type !== "Punctuator") return -1;
  if (open.value !== "(" && open.value !== "{") return -1;
  const close = open.value === "(" ? ")" : "}";
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.type !== "Punctuator") continue;
    if (token.value === open.value) depth++;
    else if (token.value === close) {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findIifeWrapper(
  tokens: Token[],
  functionStart: number,
  parenCount: number,
): IifeWrapper | null {
  if (parenCount < 1) return null;
  let functionIndex = -1;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (
      token.loc.start.offset === functionStart &&
      token.type === "Keyword" &&
      token.value === "function"
    ) {
      functionIndex = index;
      break;
    }
  }
  if (functionIndex < 0) return null;
  const openIndex = functionIndex - parenCount;
  const token = tokens[openIndex];
  if (!token || token.type !== "Punctuator" || token.value !== "(") return null;
  const closeIndex = matchingCloseIndex(tokens, openIndex);
  if (closeIndex < 0) return null;
  const innerCloseIndex = matchingCloseIndex(tokens, functionIndex - 1);
  if (innerCloseIndex < 0) return null;

  const afterIndex = closeIndex + 1;
  const after = tokens[afterIndex];
  let callEnd = tokens[closeIndex]!.loc.end.offset;
  if (after && after.type === "Punctuator" && (after.value === "(" || after.value === "{")) {
    const callCloseIndex = matchingCloseIndex(tokens, afterIndex);
    if (callCloseIndex < 0) return null;
    callEnd = tokens[callCloseIndex]!.loc.end.offset;
  } else if (after && after.type === "String") {
    callEnd = after.loc.end.offset;
  } else {
    return null;
  }

  return {
    start: token.loc.start.offset,
    end: tokens[closeIndex]!.loc.end.offset,
    functionEnd: tokens[innerCloseIndex]!.loc.start.offset,
    callEnd,
  };
}

function collectInternal(
  ast: Chunk,
  code: string,
  lexed: IifeLexedSource,
): InternalIifeSite[] {
  const starts = lineStartsFor(code);
  const lookupDirective = makeDirectiveLookup(code, lexed.tokens, lexed.comments);
  const sites: InternalIifeSite[] = [];
  const statements = new Map<Statement | LastStatement, Set<InternalIifeSite>>();
  let currentStatement: Statement | LastStatement | null = null;

  const addSite = (
    call: AnyNode,
    callee: IifeCallee,
    safeContext: boolean,
    insideIife: boolean,
    statement: Statement | LastStatement,
    insideGeneratedWrapper: boolean,
  ) => {
    if (insideGeneratedWrapper) return;
    const callLoc = (call.loc ?? {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    }) as Loc;
    const fnLoc = callee.fn.loc;
    const functionStart = fnLoc.start.offset;
    const wrapper = findIifeWrapper(lexed.tokens, functionStart, callee.parenCount);
    let functionEnd = fnLoc.end.offset;
    let callEnd = callLoc.end.offset;
    let calleeEnd = (call.callee as AnyNode).loc?.end.offset ?? callLoc.end.offset;
    let callStart = callLoc.start.offset;
    if (wrapper) {
      callStart = wrapper.start;
      callEnd = wrapper.callEnd;
      calleeEnd = wrapper.end;
      functionEnd = wrapper.functionEnd;
    }
    let safe = !insideGeneratedWrapper;
    let reason: string | null = null;

    if (insideGeneratedWrapper) {
      reason = "IIFE is already inside a generated wrapper.";
    } else if (callee.typeAsserted) {
      safe = false;
      reason = "Type-asserted IIFEs are not auto-refactored.";
    } else if (!wrapper) {
      safe = false;
      reason = "Could not determine a safe IIFE call range.";
    }

    const startPos = positionAt(starts, callStart);
    const endPos = positionAt(starts, callEnd);
    const site: InternalIifeSite = {
      line: startPos.line,
      column: startPos.column,
      endLine: endPos.line,
      endColumn: endPos.column,
      safe,
      reason,
      callStart,
      callEnd,
      calleeEnd,
      functionStart,
      functionEnd,
      statementStart: statement.loc?.start.offset ?? callStart,
      indent: "",
      directiveTier: null,
    };
    sites.push(site);
    const group = statements.get(statement);
    if (group) group.add(site);
    else statements.set(statement, new Set([site]));
  };

  function isGeneratedWrapperName(name: unknown): boolean {
    return typeof name === "string" && /^__q_(iife_wrap|do_wrap)_\d+$/.test(name);
  }

  function visitNode(node: AnyNode, safeContext: boolean, insideIife: boolean, insideGeneratedWrapper: boolean): void {
    if (isStatement(node)) {
      visitStatement(node as unknown as Statement | LastStatement, safeContext, insideGeneratedWrapper);
      return;
    }
    if (node.type === "FunctionExpression") {
      for (const child of node.body as unknown as AnyNode[]) {
        visitStatement(child as unknown as Statement | LastStatement, false, insideGeneratedWrapper);
      }
      return;
    }
    if (node.type === "CallExpression") {
      const callee = unwrapIifeCallee(node.callee);
      if (callee) {
        addSite(node, callee, safeContext, insideIife, currentStatement!, insideGeneratedWrapper);
        for (const child of callee.fn.body as unknown as AnyNode[]) {
          visitStatement(child as unknown as Statement | LastStatement, false, insideGeneratedWrapper);
        }
        for (const arg of (node.args as unknown as AnyNode[]) ?? []) {
          visitNode(arg, safeContext, true, insideGeneratedWrapper);
        }
        return;
      }
    }
    forEachChild(node, (child) => visitNode(child, safeContext, insideIife, insideGeneratedWrapper));
  }

  function visitStatement(statement: Statement | LastStatement, safeContext: boolean, insideGeneratedWrapper: boolean): void {
    const previous = currentStatement;
    currentStatement = statement;
    const safe = safeContext && DIRECT_TOP_LEVEL_STATEMENTS.has(statement.type);
    const generatedHere =
      insideGeneratedWrapper ||
      (statement.type === "FunctionStatement" &&
        isGeneratedWrapperName((statement as any).name?.base?.name)) ||
      (statement.type === "LocalFunctionStatement" && isGeneratedWrapperName((statement as any).name)) ||
      (statement.type === "LocalStatement" &&
        (statement as any).vars?.length === 1 &&
        (statement as any).values?.length === 1 &&
        (statement as any).values[0]?.type === "FunctionExpression" &&
        isGeneratedWrapperName((statement as any).vars[0]?.name)) ||
      (statement.type === "AssignmentStatement" &&
        (statement as any).vars?.length === 1 &&
        (statement as any).values?.length === 1 &&
        (statement as any).vars[0]?.type === "Identifier" &&
        (statement as any).values[0]?.type === "FunctionExpression" &&
        isGeneratedWrapperName((statement as any).vars[0]?.name));
    switch (statement.type) {
      case "FunctionStatement":
      case "LocalFunctionStatement": {
        for (const child of ((statement as any).body as AnyNode[]) ?? []) {
          visitStatement(child as unknown as Statement | LastStatement, false, generatedHere);
        }
        break;
      }
      case "FunctionCallStatement":
        visitNode(statement.call as unknown as AnyNode, safe, false, generatedHere);
        break;
      case "AssignmentStatement": {
        const nestedGenerated =
          generatedHere ||
          ((statement as any).vars?.length === 1 &&
            (statement as any).values?.length === 1 &&
            (statement as any).vars[0]?.type === "Identifier" &&
            (statement as any).values[0]?.type === "FunctionExpression" &&
            isGeneratedWrapperName((statement as any).vars[0]?.name));
        for (const variable of (statement.vars as unknown as AnyNode[]) ?? []) {
          visitNode(variable, safe, false, generatedHere);
        }
        for (const value of (statement.values as unknown as AnyNode[]) ?? []) {
          visitNode(value, safe, false, nestedGenerated);
        }
        break;
      }
      case "CompoundAssignmentStatement":
        visitNode(statement.var as unknown as AnyNode, safe, false, generatedHere);
        visitNode(statement.value as unknown as AnyNode, safe, false, generatedHere);
        break;
      case "LocalStatement": {
        const nestedGenerated =
          generatedHere ||
          ((statement as any).vars?.length === 1 &&
            (statement as any).values?.length === 1 &&
            (statement as any).values[0]?.type === "FunctionExpression" &&
            isGeneratedWrapperName((statement as any).vars[0]?.name));
        for (const value of (statement.values as unknown as AnyNode[]) ?? []) {
          visitNode(value, safe, false, nestedGenerated);
        }
        break;
      }
      case "ReturnStatement":
        for (const value of (statement.values as unknown as AnyNode[]) ?? []) {
          visitNode(value, safe, false, generatedHere);
        }
        break;
      default:
        forEachChild(statement as unknown as AnyNode, (child) => visitNode(child, false, false, generatedHere));
        break;
    }
    currentStatement = previous;
  }

  for (const statement of ast.body as unknown as AnyNode[]) {
    visitStatement(statement as unknown as Statement | LastStatement, true, false);
  }

  for (const [statement, group] of statements) {
    let statementStart = statement.loc?.start.offset ?? Number.MAX_SAFE_INTEGER;
    for (const site of group) statementStart = Math.min(statementStart, site.callStart);
    const statementLine = positionAt(starts, statementStart).line;
    const lineStart = starts[statementLine - 1] ?? 0;
    const prefix = code.slice(lineStart, statementStart);
    const indent = /^[ \t]*$/.test(prefix) ? prefix : "";
    const directive = lookupDirective(statementLine);
    for (const site of group) {
      site.statementStart = statementStart;
      site.indent = indent;
      if (directive.conflict) {
        site.safe = false;
        site.reason = "Conflicting Quantum directives above the statement.";
      } else {
        site.directiveTier = directive.tier;
      }
    }
  }

  return sites;
}

export function collectIifeSites(
  ast: Chunk,
  code: string,
  lexed?: IifeLexedSource,
): IifeSite[] {
  const source = lexed ?? lex(code);
  return collectInternal(ast, code, source).map((site) => ({
    line: site.line,
    column: site.column,
    endLine: site.endLine,
    endColumn: site.endColumn,
    safe: site.safe,
    reason: site.reason,
  }));
}

function makeNameFactory(ast: Chunk, prefix = "__q_iife_wrap_"): () => string {
  const used = collectNames(ast);
  let counter = 0;
  return () => {
    let name = "";
    do {
      counter++;
      name = `${prefix}${counter}`;
    } while (used.has(name));
    used.add(name);
    return name;
  };
}

function applySites(
  code: string,
  ast: Chunk,
  sites: InternalIifeSite[],
  eol: string,
  tier: IifeRefactorTier = "turbo",
): { code: string; refactored: number } {
  const nextName = makeNameFactory(ast);
  const insertions = new Map<number, { indent: string; parts: string[] }>();
  const edits: Edit[] = [];
  let refactored = 0;

  for (const site of [...sites].sort((a, b) => a.callStart - b.callStart)) {
    const originalCall = code.slice(site.callStart, site.callEnd);
    if (!originalCall.trim()) {
      continue;
    }
    const name = nextName();
    const insertion = insertions.get(site.statementStart) ?? { indent: site.indent, parts: [] };
    insertion.parts.push(`${site.indent}local function ${name}() return ${originalCall} end${eol}`);
    insertions.set(site.statementStart, insertion);

    edits.push({
      offset: site.callStart,
      end: site.callEnd,
      text: `${name}()`,
      order: 0,
    });
    refactored++;
  }

  for (const [offset, insertion] of insertions) {
    edits.push({
      offset,
      end: offset,
      text: insertion.parts.join(""),
      order: 1,
    });
  }

  edits.sort((a, b) => {
    if (a.offset !== b.offset) return b.offset - a.offset;
    return a.order - b.order;
  });

  let output = code;
  for (const edit of edits) {
    output = output.slice(0, edit.offset) + edit.text + output.slice(edit.end);
  }
  return { code: output, refactored };
}

function skipWarning(sites: InternalIifeSite[], warnings: string[]): void {
  const skipped = sites.filter((site) => !site.safe);
  if (skipped.length === 0) return;
  const firstReason = skipped.find((site) => site.reason)?.reason;
  warnings.push(
    `${skipped.length} IIFE${skipped.length === 1 ? "" : "s"} could not be refactored safely${
      firstReason ? `: ${firstReason}` : "."
    }`,
  );
}

export function refactorIifes(
  code: string,
  options: IifeRefactorOptions = {},
): IifeRefactorResult {
  const tier: IifeRefactorTier = options.tier === "maximum" ? "maximum" : "turbo";
  const targetLine =
    Number.isInteger(options.line) && (options.line as number) > 0
      ? (options.line as number)
      : null;
  const warnings: string[] = [];
  if (options.line !== undefined && targetLine === null) {
    warnings.push("Invalid 'line' option; pass a positive integer.");
    return { code, refactored: 0, remaining: 0, warnings, tier, line: null };
  }
  const initial = parseSource(code);
  if (!initial.valid || !initial.ast || !initial.lexed) {
    warnings.push(`Source has syntax errors; no IIFEs were refactored. ${initial.error ?? ""}`.trim());
    return { code, refactored: 0, remaining: 0, warnings, tier, line: targetLine };
  }

  const sites = collectInternal(initial.ast, code, initial.lexed);
  const eol = code.includes("\r\n") ? "\r\n" : "\n";

  if (targetLine !== null) {
    const target = sites.find((site) => site.safe && site.line === targetLine);
    if (!target) {
      const unsafe = sites.find((site) => site.line === targetLine);
      warnings.push(
        unsafe?.reason
          ? `No top-level IIFE starts on line ${targetLine}: ${unsafe.reason}`
          : `No refactorable top-level IIFE starts on line ${targetLine}.`,
      );
      return { code, refactored: 0, remaining: sites.length, warnings, tier, line: targetLine };
    }
    const applied = applySites(code, initial.ast, [target], eol, tier);
    const validation = parseSource(applied.code);
    if (!validation.valid || !validation.ast || !validation.lexed) {
      warnings.push(`Auto-refactor produced invalid code; the source was left unchanged. ${validation.error ?? ""}`.trim());
      return { code, refactored: 0, remaining: sites.length, warnings, tier, line: targetLine };
    }
    const remainingSites = collectInternal(validation.ast, applied.code, validation.lexed);
    skipWarning(remainingSites, warnings);
    return {
      code: applied.code,
      refactored: applied.refactored,
      remaining: remainingSites.length,
      warnings,
      tier,
      line: targetLine,
    };
  }

  let output = code;
  let currentAst = initial.ast;
  let currentSites = sites;
  let refactored = 0;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const safeSites = currentSites.filter((site) => site.safe);
    const targets = safeSites.filter((site) =>
      !safeSites.some(
        (other) =>
          other !== site &&
          site.callStart <= other.callStart &&
          other.callEnd <= site.callEnd,
      ),
    );
    if (targets.length === 0) break;
    const applied = applySites(output, currentAst, targets, eol, tier);
    if (applied.refactored === 0) break;
    const validation = parseSource(applied.code);
    if (!validation.valid || !validation.ast || !validation.lexed) {
      warnings.push(`Auto-refactor produced invalid code; the source was left unchanged. ${validation.error ?? ""}`.trim());
      return { code, refactored: 0, remaining: sites.length, warnings, tier, line: null };
    }
    output = applied.code;
    currentAst = validation.ast;
    refactored += applied.refactored;
    currentSites = collectInternal(validation.ast, output, validation.lexed);
    if (currentSites.every((site) => !site.safe)) break;
  }

  const final = parseSource(output);
  const remainingSites =
    final.valid && final.ast && final.lexed
      ? collectInternal(final.ast, output, final.lexed)
      : currentSites;
  if (refactored === 0) {
    if (remainingSites.length > 0) {
      warnings.push("No safe top-level IIFE was available for automatic refactoring.");
    }
    skipWarning(remainingSites, warnings);
    return { code, refactored: 0, remaining: remainingSites.length, warnings, tier, line: null };
  }
  skipWarning(remainingSites, warnings);
  return {
    code: output,
    refactored,
    remaining: remainingSites.length,
    warnings,
    tier,
    line: null,
  };
}

export interface DoHoistResult {
  code: string;
  hoisted: number;
  warnings: string[];
  tier: IifeRefactorTier;
  line: number | null;
  parentLine: number | null;
}

function isFunctionLike(node: AnyNode): boolean {
  return (
    node.type === "FunctionExpression" ||
    node.type === "FunctionStatement" ||
    node.type === "LocalFunctionStatement"
  );
}

function containsDirect(node: AnyNode, type: string): boolean {
  let found = false;
  const visit = (current: AnyNode) => {
    if (found) return;
    if (current !== node && isFunctionLike(current)) return;
    if (current.type === type) {
      found = true;
      return;
    }
    forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function isLoopOrFunctionStatement(type: string): boolean {
  return (
    type === "WhileStatement" ||
    type === "ForNumericStatement" ||
    type === "ForInStatement" ||
    type === "FunctionStatement" ||
    type === "LocalFunctionStatement"
  );
}

function doOwners(ast: Chunk): Map<AnyNode, AnyNode> {
  const owners = new Map<AnyNode, AnyNode>();
  const visit = (node: AnyNode, ancestor: AnyNode | null) => {
    const nextAncestor = isLoopOrFunctionStatement(node.type) ? node : ancestor;
    if (node.type === "DoStatement") owners.set(node, ancestor ?? node);
    forEachChild(node, (child) => visit(child, nextAncestor));
  };
  for (const statement of ast.body as unknown as AnyNode[]) visit(statement, null);
  return owners;
}

function rangeSize(node: AnyNode): number {
  const loc = node.loc;
  if (!loc) return Number.MAX_SAFE_INTEGER;
  return Math.abs(loc.end.offset - loc.start.offset);
}

function findDoForLine(owners: Map<AnyNode, AnyNode>, line: number): AnyNode | null {
  const candidates = [...owners.keys()].filter((node) => {
    const loc = node.loc;
    return !!loc && line >= loc.start.line && line <= loc.end.line;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => rangeSize(a) - rangeSize(b));
  return candidates[0] ?? null;
}

function ifExpressionStarts(ast: Chunk): Set<number> {
  const starts = new Set<number>();
  const visit = (node: AnyNode) => {
    if (node.type === "IfElseExpression" && node.loc) starts.add(node.loc.start.offset);
    forEachChild(node, visit);
  };
  for (const statement of ast.body as unknown as AnyNode[]) visit(statement);
  return starts;
}

function findBlockEndOffset(
  tokens: Token[],
  startOffset: number,
  type: string,
  expressionIfStarts: Set<number>,
): number | null {
  const startIndex = tokens.findIndex((token) => token.loc.start.offset === startOffset);
  if (startIndex < 0) return null;
  let depth = type === "DoStatement" || type === "IfStatement" ? 1 : 0;
  const loop = type === "WhileStatement" || type === "ForNumericStatement" || type === "ForInStatement";
  for (let index = startIndex + 1; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.type !== "Keyword") continue;
    const value = String(token.value);
    if (value === "if" && expressionIfStarts.has(token.loc.start.offset)) continue;
    if (value === "function" || value === "if" || value === "repeat") {
      depth++;
      continue;
    }
    if (value === "do") {
      if (loop && depth === 0) depth = 1;
      else depth++;
      continue;
    }
    if (value === "until") {
      if (depth > 0) depth--;
      continue;
    }
    if (value === "end") {
      depth--;
      if (depth === 0) return token.loc.end.offset;
    }
  }
  return null;
}

export function hoistDoBlockParent(
  code: string,
  options: IifeRefactorOptions = {},
): DoHoistResult {
  const tier: IifeRefactorTier = options.tier === "maximum" ? "maximum" : "turbo";
  const targetLine =
    Number.isInteger(options.line) && (options.line as number) > 0
      ? (options.line as number)
      : null;
  const warnings: string[] = [];
  if (targetLine === null) {
    warnings.push("A positive 'line' option pointing at the do block is required.");
    return { code, hoisted: 0, warnings, tier, line: null, parentLine: null };
  }

  const initial = parseSource(code);
  if (!initial.valid || !initial.ast || !initial.lexed) {
    warnings.push(`Source has syntax errors; no parent block was hoisted. ${initial.error ?? ""}`.trim());
    return { code, hoisted: 0, warnings, tier, line: targetLine, parentLine: null };
  }

  const owners = doOwners(initial.ast);
  const doBlock = findDoForLine(owners, targetLine);
  if (!doBlock) {
    warnings.push(`No do block starts on or contains line ${targetLine}.`);
    return { code, hoisted: 0, warnings, tier, line: targetLine, parentLine: null };
  }
  const parent = owners.get(doBlock)!;
  const parentLine = parent.loc?.start.line ?? null;
  if (!HOISTABLE_PARENT_TYPES.has(parent.type)) {
    const hint =
      parent.type === "FunctionStatement" || parent.type === "LocalFunctionStatement"
        ? "Use the normal function macro fix instead."
        : "Refactor the enclosing IIFE or assignment first.";
    warnings.push(`Cannot hoist line ${targetLine}: its top-level statement is ${parent.type}. ${hint}`);
    return { code, hoisted: 0, warnings, tier, line: targetLine, parentLine };
  }

  const iifeSites = collectInternal(initial.ast, code, initial.lexed);
  if (iifeSites.some((site) => targetLine >= site.line && targetLine <= site.endLine)) {
    warnings.push(
      `Cannot hoist line ${targetLine}: the do block is inside an IIFE. Refactor the enclosing IIFE first.`,
    );
    return { code, hoisted: 0, warnings, tier, line: targetLine, parentLine };
  }

  const parentStart = parent.loc?.start.offset;
  if (parentStart === undefined) {
    warnings.push("Could not determine the parent block source range.");
    return { code, hoisted: 0, warnings, tier, line: targetLine, parentLine };
  }

  const statements = initial.ast.body as unknown as AnyNode[];
  const parentIndex = statements.indexOf(parent);
  const wrapSuffix = containsDirect(doBlock, "ReturnStatement");
  const parentEnd = findBlockEndOffset(
    initial.lexed.tokens,
    parentStart,
    parent.type,
    ifExpressionStarts(initial.ast),
  );
  if (parentEnd === null) {
    warnings.push("Could not find the end of the parent block; the source was left unchanged.");
    return { code, hoisted: 0, warnings, tier, line: targetLine, parentLine };
  }
  let endOffset = wrapSuffix ? code.length : parentEnd;
  if (endOffset < parentStart) {
    warnings.push("Could not determine a safe source range for the hoisted wrapper.");
    return { code, hoisted: 0, warnings, tier, line: targetLine, parentLine };
  }

  const contentNodes =
    wrapSuffix && parentIndex >= 0 ? statements.slice(parentIndex) : [parent];
  const hasVararg = contentNodes.some((node) => containsDirect(node, "VarargExpression"));
  const starts = lineStartsFor(code);
  const parentStartLine = parent.loc?.start.line ?? 1;
  const lineStart = starts[parentStartLine - 1] ?? 0;
  const prefix = code.slice(lineStart, parentStart);
  const indent = /^[ \t]*$/.test(prefix) ? prefix : "";
  const lookupDirective = makeDirectiveLookup(code, initial.lexed.tokens, initial.lexed.comments);
  const directive = lookupDirective(parentStartLine);
  if (directive.conflict) {
    warnings.push("Conflicting Quantum directives above the parent block; the source was left unchanged.");
    return { code, hoisted: 0, warnings, tier, line: targetLine, parentLine };
  }
  const resolvedTier = directive.tier ?? tier;

  const nextName = makeNameFactory(initial.ast, "__q_do_wrap_");
  const name = nextName();
  const eol = code.includes("\r\n") ? "\r\n" : "\n";
  const body = code.slice(parentStart, endOffset);
  const params = hasVararg ? "..." : "";
  const callArgs = hasVararg ? "(...)" : "()";
  let replacement = `${indent}local function ${name}(${params})${eol}${body}`;
  if (!/[\r\n]$/.test(body)) replacement += eol;
  replacement += `${indent}end${eol}`;
  replacement += wrapSuffix
    ? `${indent}return ${name}(...)${eol}`
    : `${indent}${name}()${eol}`;

  const output = code.slice(0, parentStart) + replacement + code.slice(endOffset);
  const validation = parseSource(output);
  if (!validation.valid || !validation.ast) {
    warnings.push(
      `Parent hoisting produced invalid code; the source was left unchanged. ${validation.error ?? ""}`.trim(),
    );
    return { code, hoisted: 0, warnings, tier, line: targetLine, parentLine };
  }

  return {
    code: output,
    hoisted: 1,
    warnings,
    tier: resolvedTier,
    line: targetLine,
    parentLine,
  };
}
