import { lex } from "../lexer/Lexer.js";
import { parseWithErrors } from "../parser/Parser.js";
import { printChunk } from "../obfuscator/Printer.js";
import type { Chunk, Statement, LastStatement, Expression } from "../ast/types.js";

export interface ValidationError {
  message: string;
  line?: number;
  column?: number;
  severity: "error" | "warning" | "info";
}

export interface ValidationResult {

  valid: boolean;

  errors: ValidationError[];

  output?: string;

  ast?: Chunk;

  stats: {
    tokens: number;
    statements: number;
    functions: number;
    locals: number;
    globals: string[];
    features: string[];
  };
}

function countStatements(body: (Statement | LastStatement)[]): number {
  let count = 0;
  for (const stmt of body) {
    count++;
    if ("body" in stmt && Array.isArray((stmt as any).body)) {
      count += countStatements((stmt as any).body);
    }
    if ("thenBody" in stmt) {
      count += countStatements((stmt as any).thenBody);
    }
    if ("elseBody" in stmt && (stmt as any).elseBody) {
      count += countStatements((stmt as any).elseBody);
    }
    if ("elseifClauses" in stmt) {
      for (const clause of (stmt as any).elseifClauses) {
        count += countStatements(clause.body);
      }
    }
  }
  return count;
}

function countFunctions(body: (Statement | LastStatement)[]): number {
  let count = 0;
  for (const stmt of body) {
    if (stmt.type === "FunctionStatement" || stmt.type === "LocalFunctionStatement") {
      count++;
    }
    if (stmt.type === "TypeFunctionStatement" || stmt.type === "ExportTypeFunctionStatement") {
      count++;
    }
    if ("body" in stmt && Array.isArray((stmt as any).body)) {
      count += countFunctions((stmt as any).body);
    }
    if ("thenBody" in stmt) {
      count += countFunctions((stmt as any).thenBody);
    }
    if ("elseBody" in stmt && (stmt as any).elseBody) {
      count += countFunctions((stmt as any).elseBody);
    }
    if ("elseifClauses" in stmt) {
      for (const clause of (stmt as any).elseifClauses) {
        count += countFunctions(clause.body);
      }
    }
  }
  return count;
}

function countLocals(body: (Statement | LastStatement)[]): number {
  let count = 0;
  for (const stmt of body) {
    if (stmt.type === "LocalStatement") {
      count += stmt.vars.length;
    }
    if ("body" in stmt && Array.isArray((stmt as any).body)) {
      count += countLocals((stmt as any).body);
    }
    if ("thenBody" in stmt) {
      count += countLocals((stmt as any).thenBody);
    }
    if ("elseBody" in stmt && (stmt as any).elseBody) {
      count += countLocals((stmt as any).elseBody);
    }
    if ("elseifClauses" in stmt) {
      for (const clause of (stmt as any).elseifClauses) {
        count += countLocals(clause.body);
      }
    }
  }
  return count;
}

function collectGlobals(body: (Statement | LastStatement)[]): Set<string> {
  const globals = new Set<string>();
  const locals = new Set<string>();

  function walkBody(stmts: (Statement | LastStatement)[], localScope: Set<string>) {

    for (const stmt of stmts) {
      if (stmt.type === "LocalStatement") {
        for (const v of stmt.vars) localScope.add(v.name);
      } else if (stmt.type === "LocalFunctionStatement") {
        localScope.add(stmt.name);
      }
    }
    for (const stmt of stmts) {
      if (stmt.type === "LocalStatement") {
        if (stmt.values) {
          for (const val of stmt.values) walkExpression(val, localScope);
        }
      } else if (stmt.type === "LocalFunctionStatement") {
        const innerScope = new Set(localScope);
        for (const p of stmt.params) innerScope.add(p.name);
        walkBody(stmt.body, innerScope);
      } else if (stmt.type === "FunctionStatement") {
        const innerScope = new Set(localScope);
        for (const p of stmt.params) innerScope.add(p.name);
        walkBody(stmt.body, innerScope);
      } else if (stmt.type === "ForNumericStatement") {
        const innerScope = new Set(localScope);
        innerScope.add(stmt.var.name);
        walkExpression(stmt.start, localScope);
        walkExpression(stmt.end, localScope);
        if (stmt.step) walkExpression(stmt.step, localScope);
        walkBody(stmt.body, innerScope);
      } else if (stmt.type === "ForInStatement") {
        const innerScope = new Set(localScope);
        for (const v of stmt.vars) innerScope.add(v.name);
        for (const e of stmt.iter) walkExpression(e, localScope);
        walkBody(stmt.body, innerScope);
      } else if (stmt.type === "AssignmentStatement") {
        for (const v of stmt.vars) {
          if (v.type === "Identifier" && !localScope.has(v.name)) {
            globals.add(v.name);
          }
          walkExpression(v as unknown as Expression, localScope);
        }
        for (const val of stmt.values) walkExpression(val, localScope);
      } else if (stmt.type === "FunctionCallStatement") {
        walkExpression(stmt.call as unknown as Expression, localScope);
      } else if (stmt.type === "ReturnStatement" && stmt.values) {
        for (const val of stmt.values) walkExpression(val, localScope);
      } else if (stmt.type === "WhileStatement") {
        walkExpression(stmt.condition, localScope);
        walkBody(stmt.body, new Set(localScope));
      } else if (stmt.type === "RepeatStatement") {
        walkBody(stmt.body, new Set(localScope));
        walkExpression(stmt.condition, localScope);
      } else if (stmt.type === "IfStatement") {
        walkExpression(stmt.condition, localScope);
        walkBody(stmt.thenBody, new Set(localScope));
        for (const clause of stmt.elseifClauses) {
          walkExpression(clause.condition, localScope);
          walkBody(clause.body, new Set(localScope));
        }
        if (stmt.elseBody) walkBody(stmt.elseBody, new Set(localScope));
      } else if (stmt.type === "DoStatement") {
        walkBody(stmt.body, new Set(localScope));
      } else if (stmt.type === "CompoundAssignmentStatement") {
        walkExpression(stmt.var as unknown as Expression, localScope);
        walkExpression(stmt.value, localScope);
      }
    }
  }

  function walkExpression(exp: Expression, localScope: Set<string>) {
    if (!exp) return;
    switch (exp.type) {
      case "Identifier":
        if (!localScope.has(exp.name)) globals.add(exp.name);
        break;
      case "BinaryExpression":
        walkExpression(exp.left, localScope);
        walkExpression(exp.right, localScope);
        break;
      case "UnaryExpression":
        walkExpression(exp.argument, localScope);
        break;
      case "CallExpression":
        walkExpression(exp.callee, localScope);
        for (const a of exp.args) walkExpression(a, localScope);
        break;
      case "MethodCallExpression":
        walkExpression(exp.object, localScope);
        for (const a of exp.args) walkExpression(a, localScope);
        break;
      case "IndexExpression":
        walkExpression(exp.object, localScope);
        walkExpression(exp.index, localScope);
        break;
      case "MemberExpression":
        walkExpression(exp.object, localScope);
        break;
      case "TableConstructor":
        for (const f of exp.fields) {
          if (f.kind === "index") {
            walkExpression(f.index, localScope);
            walkExpression(f.value, localScope);
          } else if (f.kind === "named") {
            walkExpression(f.value, localScope);
          } else {
            walkExpression(f.value, localScope);
          }
        }
        break;
      case "FunctionExpression": {
        const innerScope = new Set(localScope);
        for (const p of exp.params) innerScope.add(p.name);
        walkBody(exp.body, innerScope);
        break;
      }
      case "ParenExpression":
        walkExpression(exp.expression, localScope);
        break;
      case "TypeAssertion":
        walkExpression(exp.expression, localScope);
        break;
      case "IfElseExpression":
        walkExpression(exp.condition, localScope);
        walkExpression(exp.thenExp, localScope);
        for (const c of exp.elseifClauses) {
          walkExpression(c.condition, localScope);
          walkExpression(c.value, localScope);
        }
        walkExpression(exp.elseExp, localScope);
        break;
      case "StringInterpolation":
        for (const p of exp.parts) {
          if (typeof p !== "string") walkExpression(p, localScope);
        }
        break;
    }
  }

  walkBody(body, locals);
  return globals;
}

function detectFeatures(body: (Statement | LastStatement)[]): Set<string> {
  const features = new Set<string>();

  function walkBody(stmts: (Statement | LastStatement)[]) {
    for (const stmt of stmts) {
      switch (stmt.type) {
        case "TypeStatement":
        case "ExportTypeStatement":
          features.add("type-annotations");
          break;
        case "TypeFunctionStatement":
        case "ExportTypeFunctionStatement":
          features.add("type-functions");
          break;
        case "ContinueStatement":
          features.add("continue");
          break;
        case "CompoundAssignmentStatement":
          features.add("compound-assignment");
          break;
        case "ForInStatement":
          features.add("for-in");
          break;
        case "ForNumericStatement":
          features.add("for-numeric");
          break;
        case "RepeatStatement":
          features.add("repeat-until");
          break;
      }
      if ("body" in stmt && Array.isArray((stmt as any).body)) {
        walkBody((stmt as any).body);
      }
      if ("thenBody" in stmt) walkBody((stmt as any).thenBody);
      if ("elseBody" in stmt && (stmt as any).elseBody) walkBody((stmt as any).elseBody);
      if ("elseifClauses" in stmt) {
        for (const c of (stmt as any).elseifClauses) walkBody(c.body);
      }
      walkExpressions(stmt);
    }
  }

  function walkExpressions(node: any) {
    if (!node || typeof node !== "object") return;
    if (node.type === "StringInterpolation") features.add("string-interpolation");
    if (node.type === "IfElseExpression") features.add("if-else-expression");
    if (node.type === "TypeAssertion") features.add("type-assertion");
    if (node.type === "FunctionExpression") features.add("anonymous-functions");
    if (node.type === "VarargExpression") features.add("varargs");
    if (node.type === "MethodCallExpression") features.add("method-calls");
    if (node.attributes && node.attributes.length > 0) features.add("attributes");
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === "object" && item.type) walkExpressions(item);
        }
      } else if (val && typeof val === "object" && val.type) {
        walkExpressions(val);
      }
    }
  }

  walkBody(body);
  return features;
}

// Single-pass stats: replaces 5 separate full-tree walks
// (countStatements + countFunctions + countLocals + collectGlobals +
// detectFeatures) with one traversal. Keeps the exact scoping semantics of
// collectGlobals (two-phase local pre-scan per block) and the exact feature
// set of detectFeatures. Old helpers are kept for backwards compatibility.
function collectStatsSinglePass(body: (Statement | LastStatement)[]): {
  statements: number;
  functions: number;
  locals: number;
  globals: Set<string>;
  features: Set<string>;
} {
  let statements = 0;
  let functions = 0;
  let locals = 0;
  const globals = new Set<string>();
  const features = new Set<string>();

  function markStatementFeatures(stmt: Statement | LastStatement): void {
    switch (stmt.type) {
      case "TypeStatement":
      case "ExportTypeStatement":
        features.add("type-annotations");
        break;
      case "TypeFunctionStatement":
      case "ExportTypeFunctionStatement":
        features.add("type-functions");
        functions++;
        break;
      case "FunctionStatement":
      case "LocalFunctionStatement":
        functions++;
        break;
      case "ContinueStatement":
        features.add("continue");
        break;
      case "CompoundAssignmentStatement":
        features.add("compound-assignment");
        break;
      case "ForInStatement":
        features.add("for-in");
        break;
      case "ForNumericStatement":
        features.add("for-numeric");
        break;
      case "RepeatStatement":
        features.add("repeat-until");
        break;
      case "LocalStatement":
        locals += stmt.vars.length;
        break;
    }
  }

  function markExpressionFeatures(node: any): void {
    if (!node || typeof node !== "object") return;
    if (node.type === "StringInterpolation") features.add("string-interpolation");
    if (node.type === "IfElseExpression") features.add("if-else-expression");
    if (node.type === "TypeAssertion") features.add("type-assertion");
    if (node.type === "FunctionExpression") features.add("anonymous-functions");
    if (node.type === "VarargExpression") features.add("varargs");
    if (node.type === "MethodCallExpression") features.add("method-calls");
    if (node.attributes && node.attributes.length > 0) features.add("attributes");
    for (const key of Object.keys(node)) {
      const val = node[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === "object" && (item as any).type) markExpressionFeatures(item);
        }
      } else if (val && typeof val === "object" && (val as any).type) {
        markExpressionFeatures(val);
      }
    }
  }

  function walkExpression(exp: Expression, localScope: Set<string>): void {
    if (!exp) return;
    switch (exp.type) {
      case "Identifier":
        if (!localScope.has(exp.name)) globals.add(exp.name);
        break;
      case "BinaryExpression":
        walkExpression(exp.left, localScope);
        walkExpression(exp.right, localScope);
        break;
      case "UnaryExpression":
        walkExpression(exp.argument, localScope);
        break;
      case "CallExpression":
        walkExpression(exp.callee, localScope);
        for (const a of exp.args) walkExpression(a, localScope);
        break;
      case "MethodCallExpression":
        walkExpression(exp.object, localScope);
        for (const a of exp.args) walkExpression(a, localScope);
        break;
      case "IndexExpression":
        walkExpression(exp.object, localScope);
        walkExpression(exp.index, localScope);
        break;
      case "MemberExpression":
        walkExpression(exp.object, localScope);
        break;
      case "TableConstructor":
        for (const f of exp.fields) {
          if (f.kind === "index") {
            walkExpression(f.index, localScope);
            walkExpression(f.value, localScope);
          } else {
            walkExpression(f.value, localScope);
          }
        }
        break;
      case "FunctionExpression": {
        const innerScope = new Set(localScope);
        for (const p of exp.params) innerScope.add(p.name);
        walkBody(exp.body, innerScope);
        break;
      }
      case "ParenExpression":
        walkExpression(exp.expression, localScope);
        break;
      case "TypeAssertion":
        walkExpression(exp.expression, localScope);
        break;
      case "IfElseExpression":
        walkExpression(exp.condition, localScope);
        walkExpression(exp.thenExp, localScope);
        for (const c of exp.elseifClauses) {
          walkExpression(c.condition, localScope);
          walkExpression(c.value, localScope);
        }
        walkExpression(exp.elseExp, localScope);
        break;
      case "StringInterpolation":
        for (const p of exp.parts) {
          if (typeof p !== "string") walkExpression(p, localScope);
        }
        break;
    }
  }

  function walkBody(stmts: (Statement | LastStatement)[], localScope: Set<string>): void {
    // Phase 1: pre-scan locals (same semantics as collectGlobals).
    for (const stmt of stmts) {
      if (stmt.type === "LocalStatement") {
        for (const v of stmt.vars) localScope.add(v.name);
      } else if (stmt.type === "LocalFunctionStatement") {
        localScope.add(stmt.name);
      }
    }
    for (const stmt of stmts) {
      statements++;
      markStatementFeatures(stmt);
      markExpressionFeatures(stmt);
      if (stmt.type === "LocalStatement") {
        if (stmt.values) {
          for (const val of stmt.values) walkExpression(val, localScope);
        }
      } else if (stmt.type === "LocalFunctionStatement") {
        const innerScope = new Set(localScope);
        for (const p of stmt.params) innerScope.add(p.name);
        walkBody(stmt.body, innerScope);
      } else if (stmt.type === "FunctionStatement") {
        const innerScope = new Set(localScope);
        for (const p of stmt.params) innerScope.add(p.name);
        walkBody(stmt.body, innerScope);
      } else if (stmt.type === "ForNumericStatement") {
        const innerScope = new Set(localScope);
        innerScope.add(stmt.var.name);
        walkExpression(stmt.start, localScope);
        walkExpression(stmt.end, localScope);
        if (stmt.step) walkExpression(stmt.step, localScope);
        walkBody(stmt.body, innerScope);
      } else if (stmt.type === "ForInStatement") {
        const innerScope = new Set(localScope);
        for (const v of stmt.vars) innerScope.add(v.name);
        for (const e of stmt.iter) walkExpression(e, localScope);
        walkBody(stmt.body, innerScope);
      } else if (stmt.type === "AssignmentStatement") {
        for (const v of stmt.vars) {
          if (v.type === "Identifier" && !localScope.has(v.name)) {
            globals.add(v.name);
          }
          walkExpression(v as unknown as Expression, localScope);
        }
        for (const val of stmt.values) walkExpression(val, localScope);
      } else if (stmt.type === "FunctionCallStatement") {
        walkExpression(stmt.call as unknown as Expression, localScope);
      } else if (stmt.type === "ReturnStatement" && stmt.values) {
        for (const val of stmt.values) walkExpression(val, localScope);
      } else if (stmt.type === "WhileStatement") {
        walkExpression(stmt.condition, localScope);
        walkBody(stmt.body, new Set(localScope));
      } else if (stmt.type === "RepeatStatement") {
        walkBody(stmt.body, new Set(localScope));
        walkExpression(stmt.condition, localScope);
      } else if (stmt.type === "IfStatement") {
        walkExpression(stmt.condition, localScope);
        walkBody(stmt.thenBody, new Set(localScope));
        for (const clause of stmt.elseifClauses) {
          walkExpression(clause.condition, localScope);
          walkBody(clause.body, new Set(localScope));
        }
        if (stmt.elseBody) walkBody(stmt.elseBody, new Set(localScope));
      } else if (stmt.type === "DoStatement") {
        walkBody(stmt.body, new Set(localScope));
      } else if (stmt.type === "CompoundAssignmentStatement") {
        walkExpression(stmt.var as unknown as Expression, localScope);
        walkExpression(stmt.value, localScope);
      } else {
        // Type statements and other bodies: recurse generically so nested
        // statement counts match countStatements/countFunctions.
        const anyStmt = stmt as any;
        if (anyStmt && Array.isArray(anyStmt.body)) {
          walkBody(anyStmt.body, new Set(localScope));
        }
        if (anyStmt && anyStmt.thenBody) walkBody(anyStmt.thenBody, new Set(localScope));
        if (anyStmt && anyStmt.elseBody) walkBody(anyStmt.elseBody, new Set(localScope));
        if (anyStmt && anyStmt.elseifClauses) {
          for (const c of anyStmt.elseifClauses) walkBody(c.body, new Set(localScope));
        }
      }
    }
  }

  walkBody(body, new Set<string>());
  return { statements, functions, locals, globals, features };
}

export function validate(source: string): ValidationResult {
  const errors: ValidationError[] = [];

  const lexResult = lex(source);
  if (lexResult.errors.length > 0) {
    for (const err of lexResult.errors) {
      errors.push({
        message: err.message,
        line: err.loc.start.line,
        column: err.loc.start.column,
        severity: "error",
      });
    }
  }

  let ast: Chunk;
  try {
    const parseResult = parseWithErrors(lexResult.tokens);
    ast = parseResult.ast;
    for (const err of parseResult.errors) {
      errors.push({
        message: err.message,
        line: err.loc?.start?.line,
        column: err.loc?.start?.column,
        severity: "error",
      });
    }
  } catch (parseErr: any) {
    errors.push({
      message: `Parser-Fehler: ${parseErr.message}`,
      severity: "error",
    });
    return {
      valid: false,
      errors,
      stats: { tokens: lexResult.tokens.length, statements: 0, functions: 0, locals: 0, globals: [], features: [] },
    };
  }

  const statsSingle = collectStatsSinglePass(ast.body);
  const globals = statsSingle.globals;
  const features = statsSingle.features;
  const stmtCount = statsSingle.statements;
  const funcCount = statsSingle.functions;
  const localCount = statsSingle.locals;

  const knownGlobals = new Set([
    "_G", "true", "false", "nil", "self", "_VERSION",
    "print", "warn", "error", "assert", "type", "typeof", "tostring", "tonumber",
    "pcall", "xpcall", "select", "unpack", "pairs", "ipairs", "next",
    "rawget", "rawset", "rawequal", "rawlen", "setmetatable", "getmetatable",
    "loadstring", "load", "require", "getfenv", "setfenv", "newproxy",
    "string", "table", "math", "bit32", "coroutine", "os", "debug", "utf8", "buffer",
    "tick", "time", "wait", "spawn", "delay", "task", "shared", "settings", "stats",
    "UserSettings", "version",
    "game", "workspace", "script", "plugin",
    "Instance", "Vector3", "Vector2", "CFrame", "Color3", "BrickColor",
    "UDim", "UDim2", "Enum", "Ray", "Region3", "Rect", "TweenInfo",
    "NumberSequence", "ColorSequence", "NumberRange", "Random", "DateTime",
    "RaycastParams", "OverlapParams", "Axes", "Faces",
    "PhysicalProperties", "PathWaypoint", "NumberSequenceKeypoint", "ColorSequenceKeypoint",
    "DockWidgetPluginGuiInfo", "CatalogSearchParams", "Font",
    "Players", "Workspace", "Lighting", "ReplicatedStorage", "ServerStorage",
    "ServerScriptService", "StarterGui", "StarterPlayer", "StarterPack",
    "UserInputService", "TweenService", "HttpService", "MarketplaceService",
    "RunService", "TeleportService", "GuiService", "ContextActionService",
    "GroupService", "PathfindingService", "PathService", "SoundService",
    "Teams", "InsertService", "ChatService", "ProximityPromptService",
    "ContentProvider", "StatsService", "MaterialService", "AvatarEditorService",
    "TextService", "TextChatService", "CaptureService", "VoiceChatService",
    "SocialService", "Debris", "CollectionService", "PhysicsService",
    "LocalizationService", "PolicyService", "BadgeService", "DataStoreService",
    "MemoryStoreService", "MessagingService", "GamePassService", "AssetService",
    "getgenv", "getrenv", "getsenv", "getrawmetatable", "setrawmetatable",
    "hookfunction", "hookmetamethod", "newcclosure", "iscclosure", "islclosure",
    "checkcaller", "cloneref", "getconnections", "firesignal", "replicatesignal",
    "getgc", "get_gc_objects", "getinstances", "getnilinstances",
    "getscripts", "getrunningscripts", "getloadedmodules", "getcallingscript",
    "readfile", "writefile", "appendfile", "loadfile", "listfiles",
    "isfile", "isfolder", "makefolder", "delfolder", "delfile",
    "setclipboard", "toclipboard", "set_clipboard",
    "queue_on_teleport", "queueteleport",
    "setthreadidentity", "getthreadidentity", "setthreadcontext", "syn_context_set",
    "getnamecallmethod", "setnamecallmethod", "get_namecall_method",
    "isreadonly", "setreadonly",
    "identifyexecutor", "request", "syn", "Drawing", "crypt", "base64", "http",
    "httprequest", "http_request",
    "mouse1press", "mouse1release", "mouse1click", "mouse2press", "mouse2release",
    "keypress", "keyrelease",
    "fireclickdetector", "fireproximityprompt", "firetouchinterest",
    "saveinstance", "setfpscap",
    "getproperties", "getprops", "gethiddenproperty", "sethiddenproperty",
    "gethidden", "sethidden", "get_hidden_property", "set_hidden_property",
    "get_hidden_prop", "set_hidden_prop",
    "getconstants", "setconstant", "getupvalues", "setupvalue",
    "gethui", "get_hidden_gui",
    "fluxus", "is_sirhurt_closure",
    "waxwritefile", "waxreadfile", "waxgetcustomasset", "getsynasset",
    "get_signal_cons", "Clipboard", "everyClipboard",
    "Rayfield", "OrionLib", "Fluent", "Kavo",
  ]);

  const unknownGlobals = [...globals].filter(g => !knownGlobals.has(g));
  if (unknownGlobals.length <= 20) {
    for (const g of unknownGlobals) {
      errors.push({
        message: `Unbekannte globale Variable: '${g}' (möglicherweise Tippfehler)`,
        severity: "warning",
      });
    }
  }


  let output: string | undefined;
  try {
    output = printChunk(ast);
  } catch (printErr: any) {
    errors.push({
      message: `Printer-Fehler: ${printErr.message}`,
      severity: "error",
    });
  }

  const hasErrors = errors.some(e => e.severity === "error");

  return {
    valid: !hasErrors,
    errors,
    output,
    ast,
    stats: {
      tokens: lexResult.tokens.length,
      statements: stmtCount,
      functions: funcCount,
      locals: localCount,
      globals: [...globals],
      features: [...features],
    },
  };
}
