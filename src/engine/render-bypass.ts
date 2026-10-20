// Hot-path auto-bypass (Luraph-killer performance path).
//
// Two classes of code are lifted out of the VM into synthetic top-level
// factories and stay native:
//   1. shared frame callbacks connected to RenderStepped/Heartbeat/Stepped
//      (direct `:Connect`, `.Connect`, `connect(event, fn)`, and MJ-style
//      `AddToRenderStepped`/`AddToHeartbeat` registries);
//   2. UI construction factories whose bodies create many `Instance.new`
//      objects (aliases like `local InstanceNew = Instance.new` are tracked)
//      or fill table constructors with UI properties. These run once at menu
//      load and are the source of the multi-second VM freeze.
//
// The factory receives the lifted function's captured locals as parameters,
// so the lifted function is a plain (native) Lua closure while the definition
// site remains inside the VM and simply calls the factory once.
//
// Semantics:
//   - stable captured locals are passed by value at lift time; tables and
//     functions keep identity, so field mutation and calls behave normally;
//   - captures that are reassigned elsewhere are read through injected
//     getter closures;
//   - for UI factories, captures written INSIDE the lifted body are wired
//     through injected getter/setter closures, so drag state and counters
//     still update the original variables. Unsupported write shapes (multi-
//     target assignment, exotic compound operators) are vetoed.
//   - recursive local functions are vetoed (the factory would capture the
//     pre-assignment nil value); method recursion through the captured table
//     remains valid.
//
// Supported connection shapes:
//   - `expr.RenderStepped:Connect(fn)` / `game:GetService(...).Heartbeat:Connect(fn)`
//   - `expr.Heartbeat.Connect(fn)`
//   - `connect(expr.RenderStepped, fn)` (local helper idiom)
//   - `obj:AddToRenderStepped(name, fn)` / `obj:AddToHeartbeat(name, fn)`

import type {
  Chunk,
  Expression,
  FunctionExpression,
  Param,
  Statement,
  LastStatement,
} from "../ast/types.js";
import type { Mangler } from "./macros.js";
import { freeVariables, isShadowed, paramNames } from "./macros.js";

type AnyNode = { type: string; [key: string]: any };

interface Binding {
  name: string;
  kind: string;
  stmt: AnyNode | null;
}

interface Scope {
  parent: Scope | null;
  vars: Map<string, Binding>;
  funcs: Map<string, FnDecl>;
}

interface FnDecl {
  kind: "localfn" | "func" | "local" | "assign" | "method";
  name: string;
  fn: FunctionExpression;
  stmt: AnyNode;
  container: (Statement | LastStatement)[];
  index: number;
  valueIndex?: number;
  visible: Map<string, Binding>;
  method?: string;
  basePath?: string;
  rootName?: string;
  rootBinding?: Binding | null;
  rootExpr?: AnyNode;
}

interface Site {
  args: Expression[];
  index: number;
  visible: Map<string, Binding>;
  label: string;
  resolvedDecl?: FnDecl | null;
  member?: { basePath: string; rootName: string; rootBinding: Binding | null };
}

export interface RenderBypassResult {
  ast: Chunk;
  prefixStatements: Statement[];
  mangled: string[];
  lifted: { name: string; captures: string[]; kind: string }[];
  vetoed: { name: string; reason: string }[];
  warnings: string[];
}

function isNode(value: unknown): value is AnyNode {
  return !!value && typeof value === "object" && typeof (value as AnyNode).type === "string";
}

function loc<T>(node: T): any {
  return (node as any).loc;
}

function pathOf(expr: any): string | null {
  if (!expr || typeof expr !== "object") return null;
  if (expr.type === "Identifier") return expr.name as string;
  if (expr.type === "MemberExpression") {
    const base = pathOf(expr.object);
    return base ? `${base}.${expr.property}` : null;
  }
  if (expr.type === "IndexExpression" && expr.index?.type === "StringLiteral") {
    const base = pathOf(expr.object);
    return base ? `${base}.${expr.index.value}` : null;
  }
  if (expr.type === "ParenExpression" || expr.type === "TypeAssertion") return pathOf(expr.expression);
  return null;
}

function leftmostName(expr: any): string | null {
  if (!expr || typeof expr !== "object") return null;
  if (expr.type === "Identifier") return expr.name as string;
  if (expr.type === "MemberExpression") return leftmostName(expr.object);
  if (expr.type === "IndexExpression") return leftmostName(expr.object);
  if (expr.type === "ParenExpression" || expr.type === "TypeAssertion") return leftmostName(expr.expression);
  return null;
}

function unwrap(expr: any): any {
  let e = expr;
  while (e && (e.type === "ParenExpression" || e.type === "TypeAssertion")) e = e.expression;
  return e;
}

const FRAME_EVENTS = new Set(["RenderStepped", "Heartbeat", "Stepped", "PreRender"]);

function isFrameEvent(expr: any): boolean {
  const e = unwrap(expr);
  if (!e || typeof e !== "object") return false;
  if (e.type === "MemberExpression") {
    if (typeof e.property === "string" && FRAME_EVENTS.has(e.property)) return true;
    return isFrameEvent(e.object);
  }
  if (e.type === "IndexExpression") {
    if (e.index?.type === "StringLiteral" && FRAME_EVENTS.has(e.index.value)) return true;
    return isFrameEvent(e.object);
  }
  return false;
}

function makeFn(params: Param[], body: (Statement | LastStatement)[], source: any): FunctionExpression {
  return {
    type: "FunctionExpression",
    loc: source?.loc,
    params,
    body,
  } as FunctionExpression;
}

function selfParam(source: any): Param {
  return { type: "Param", name: "self", loc: source?.loc } as Param;
}

function bindingsOf(scope: Scope | null): Map<string, Binding> {
  const chain: Scope[] = [];
  for (let cur = scope; cur; cur = cur.parent) chain.unshift(cur);
  const out = new Map<string, Binding>();
  for (const s of chain) {
    for (const [name, binding] of s.vars) out.set(name, binding);
  }
  return out;
}

function childScope(parent: Scope, params: Param[] | string[]): Scope {
  const s: Scope = { parent, vars: new Map(), funcs: new Map() };
  for (const p of params) {
    const name = typeof p === "string" ? p : p.name;
    s.vars.set(name, { name, kind: "param", stmt: null });
  }
  return s;
}

function lookupVar(scope: Scope | null, name: string): Binding | null {
  for (let cur = scope; cur; cur = cur.parent) {
    const b = cur.vars.get(name);
    if (b) return b;
  }
  return null;
}

function lookupFn(scope: Scope | null, name: string): FnDecl | null {
  for (let cur = scope; cur; cur = cur.parent) {
    const d = cur.funcs.get(name);
    if (d) return d;
  }
  return null;
}

function collectWrites(fn: FunctionExpression, captures: Set<string>): Set<string> {
  const writes = new Set<string>();

  function expr(node: any, scopes: Set<string>[]): void {
    if (!node || typeof node !== "object") return;
    switch (node.type) {
      case "FunctionExpression": {
        const inner = [...scopes, paramNames(node.params)];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "BinaryExpression":
        expr(node.left, scopes);
        expr(node.right, scopes);
        return;
      case "UnaryExpression":
        expr(node.argument, scopes);
        return;
      case "CallExpression":
        expr(node.callee, scopes);
        for (const a of node.args ?? []) expr(a, scopes);
        return;
      case "MethodCallExpression":
        expr(node.object, scopes);
        for (const a of node.args ?? []) expr(a, scopes);
        return;
      case "IndexExpression":
        expr(node.object, scopes);
        expr(node.index, scopes);
        return;
      case "MemberExpression":
        expr(node.object, scopes);
        return;
      case "TableConstructor":
        for (const f of node.fields ?? []) {
          if (f.kind === "index") {
            expr(f.index, scopes);
            expr(f.value, scopes);
          } else {
            expr(f.value, scopes);
          }
        }
        return;
      case "ParenExpression":
      case "TypeAssertion":
        expr(node.expression, scopes);
        return;
      case "IfElseExpression":
        expr(node.condition, scopes);
        expr(node.thenExp, scopes);
        for (const c of node.elseifClauses ?? []) {
          expr(c.condition, scopes);
          expr(c.value, scopes);
        }
        expr(node.elseExp, scopes);
        return;
      case "StringInterpolation":
        for (const p of node.parts ?? []) if (p && typeof p === "object") expr(p, scopes);
        return;
      default:
        return;
    }
  }

  function stmt(node: any, scopes: Set<string>[]): void {
    if (!node || typeof node !== "object") return;
    switch (node.type) {
      case "AssignmentStatement": {
        for (const v of node.vars ?? []) {
          if (v?.type === "Identifier") {
            if (!isShadowed(v.name, scopes) && captures.has(v.name)) writes.add(v.name);
          } else {
            expr(v, scopes);
          }
        }
        for (const v of node.values ?? []) expr(v, scopes);
        return;
      }
      case "CompoundAssignmentStatement": {
        const v = node.var;
        if (v?.type === "Identifier") {
          if (!isShadowed(v.name, scopes) && captures.has(v.name)) writes.add(v.name);
        } else {
          expr(v, scopes);
        }
        expr(node.value, scopes);
        return;
      }
      case "LocalStatement": {
        for (const v of node.values ?? []) expr(v, scopes);
        const frame = scopes[scopes.length - 1]!;
        for (const v of node.vars ?? []) frame.add(v.name);
        return;
      }
      case "LocalFunctionStatement": {
        const inner = [...scopes, new Set<string>([node.name])];
        for (const st of node.body ?? []) stmt(st, inner);
        scopes[scopes.length - 1]!.add(node.name);
        return;
      }
      case "FunctionStatement": {
        const inner = [...scopes, paramNames(node.params)];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "DoStatement": {
        const inner = [...scopes, new Set<string>()];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "WhileStatement": {
        expr(node.condition, scopes);
        const inner = [...scopes, new Set<string>()];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "RepeatStatement": {
        const inner = [...scopes, new Set<string>()];
        for (const st of node.body ?? []) stmt(st, inner);
        expr(node.condition, inner);
        return;
      }
      case "IfStatement": {
        expr(node.condition, scopes);
        for (const b of [node.thenBody, ...(node.elseifClauses ?? []).map((c: any) => c.body), node.elseBody]) {
          if (!b) continue;
          const inner = [...scopes, new Set<string>()];
          for (const st of b) stmt(st, inner);
        }
        for (const c of node.elseifClauses ?? []) expr(c.condition, scopes);
        return;
      }
      case "ForNumericStatement": {
        expr(node.start, scopes);
        expr(node.end, scopes);
        if (node.step) expr(node.step, scopes);
        const inner = [...scopes, new Set<string>([node.var?.name])];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "ForInStatement": {
        for (const e of node.iter ?? []) expr(e, scopes);
        const frame = new Set<string>((node.vars ?? []).map((v: any) => v.name));
        const inner = [...scopes, frame];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "FunctionCallStatement":
        expr(node.call, scopes);
        return;
      case "ReturnStatement":
        for (const v of node.values ?? []) expr(v, scopes);
        return;
      default:
        return;
    }
  }

  const root = [paramNames(fn.params)];
  for (const st of fn.body ?? []) stmt(st, root);
  return writes;
}

function idExpr(name: string, loc: any): any {
  return { type: "Identifier", name, loc };
}

// UI property keys used by Instance constructors/table configs. A function
// that fills many of these is a UI builder even if it creates few instances
// (layout/animation helpers), so the auto-lift metric scores both.
const UI_PROPERTY_NAMES = new Set([
  "Size", "Position", "AnchorPoint", "BackgroundColor3", "BackgroundTransparency",
  "BorderSizePixel", "BorderColor3", "BorderMode", "Text", "TextColor3",
  "TextSize", "TextTransparency", "TextXAlignment", "TextYAlignment",
  "TextWrapped", "TextScaled", "RichText", "Font", "Parent", "Visible",
  "ZIndex", "AutomaticSize", "ClipsDescendants", "Image", "ImageColor3",
  "ImageTransparency", "ScaleType", "Name", "CornerRadius", "StrokeThickness",
  "FillColor", "OutlineColor", "Rotation", "Transparency", "Shape",
  "Thickness", "Color", "LayoutOrder", "AnchorPoint",
]);

const INSTANCE_ALIAS_HINT = /^(?:InstanceNew|InstNew|NewInstance|newInstance|new_instance|instanceNew)$/;

// Follows `local X = Instance.new` / `X = X2` aliases across the whole file.
function collectInstanceAliases(body: (Statement | LastStatement)[]): Set<string> {
  const aliases = new Set<string>();
  const seen = new Set<unknown>();

  const visit = (node: any): void => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    seen.add(node);
    if (node.type === "LocalStatement" || node.type === "AssignmentStatement") {
      const vars = node.vars ?? [];
      const vals = node.values ?? [];
      for (let i = 0; i < vars.length && i < vals.length; i++) {
        const target = vars[i];
        if (!target || typeof target.name !== "string") continue;
        const value = unwrap(vals[i]);
        if (!value) continue;
        if (
          value.type === "MemberExpression" &&
          value.object?.type === "Identifier" &&
          value.object.name === "Instance" &&
          value.property === "new"
        ) {
          aliases.add(target.name);
        } else if (value.type === "Identifier" && aliases.has(value.name)) {
          aliases.add(target.name);
        }
      }
    }
    for (const key in node) {
      if (key === "loc") continue;
      visit(node[key]);
    }
  };

  for (const st of body) visit(st);
  return aliases;
}

// Counts instance construction and UI-table weight in a function's own body.
// Nested function declarations are scored separately, so they are skipped
// here; anonymous callbacks are skipped too (their weight belongs to the
// closure, not to the factory being lifted).
function countDirectUiNodes(fn: FunctionExpression, aliases: Set<string>): { instances: number; props: number } {
  let instances = 0;
  let props = 0;
  const seen = new Set<unknown>();

  const isInstanceCtor = (callee: any): boolean => {
    if (!callee || typeof callee !== "object") return false;
    if (callee.type === "Identifier") {
      return aliases.has(callee.name) || INSTANCE_ALIAS_HINT.test(callee.name);
    }
    return (
      callee.type === "MemberExpression" &&
      callee.object?.type === "Identifier" &&
      callee.object.name === "Instance" &&
      callee.property === "new"
    );
  };

  const walk = (node: any): void => {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    seen.add(node);
    const type = node.type;
    if (type === "FunctionExpression" || type === "LocalFunctionStatement" || type === "FunctionStatement") {
      return;
    }
    if (type === "CallExpression" && isInstanceCtor(node.callee)) instances++;
    if (type === "TableConstructor") {
      for (const field of node.fields ?? []) {
        let key: unknown = null;
        if (field.kind === "named" && typeof field.name === "string") key = field.name;
        else if (field.index?.type === "StringLiteral") key = field.index.value;
        else if (field.key?.type === "StringLiteral") key = field.key.value;
        if (typeof key === "string" && UI_PROPERTY_NAMES.has(key)) props++;
      }
    }
    for (const key in node) {
      if (key === "loc") continue;
      walk(node[key]);
    }
  };

  for (const st of fn.body ?? []) walk(st);
  return { instances, props };
}

const COMPOUND_OPERATORS = new Set(["+", "-", "*", "/", "%", "^", "..", "//"]);

// Returns a human-readable reason when a capture write cannot be routed
// through a setter closure, or null when every write is rewritable.
function validateCaptureWrites(fn: FunctionExpression, captures: Set<string>): string | null {
  let reason: string | null = null;
  const fail = (msg: string): void => {
    if (!reason) reason = msg;
  };

  function expr(node: any, scopes: Set<string>[]): void {
    if (!node || typeof node !== "object") return;
    switch (node.type) {
      case "FunctionExpression": {
        const inner = [...scopes, paramNames(node.params ?? [])];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "BinaryExpression":
        expr(node.left, scopes);
        expr(node.right, scopes);
        return;
      case "UnaryExpression":
        expr(node.argument, scopes);
        return;
      case "CallExpression":
        expr(node.callee, scopes);
        for (const a of node.args ?? []) expr(a, scopes);
        return;
      case "MethodCallExpression":
        expr(node.object, scopes);
        for (const a of node.args ?? []) expr(a, scopes);
        return;
      case "IndexExpression":
        expr(node.object, scopes);
        expr(node.index, scopes);
        return;
      case "MemberExpression":
        expr(node.object, scopes);
        return;
      case "TableConstructor":
        for (const f of node.fields ?? []) {
          if (f.kind === "index") {
            expr(f.index, scopes);
            expr(f.value, scopes);
          } else {
            expr(f.value, scopes);
          }
        }
        return;
      case "ParenExpression":
      case "TypeAssertion":
        expr(node.expression, scopes);
        return;
      case "IfElseExpression":
        expr(node.condition, scopes);
        expr(node.thenExp, scopes);
        for (const c of node.elseifClauses ?? []) {
          expr(c.condition, scopes);
          expr(c.value, scopes);
        }
        expr(node.elseExp, scopes);
        return;
      case "StringInterpolation":
        for (const p of node.parts ?? []) if (p && typeof p === "object") expr(p, scopes);
        return;
      default:
        return;
    }
  }

  function stmt(node: any, scopes: Set<string>[]): void {
    if (!node || typeof node !== "object") return;
    switch (node.type) {
      case "AssignmentStatement": {
        const captureTargets = (node.vars ?? []).filter(
          (v: any) => v?.type === "Identifier" && !isShadowed(v.name, scopes) && captures.has(v.name),
        );
        if (captureTargets.length > 0) {
          if ((node.vars ?? []).length > 1) {
            fail(`multiple assignment to captured local '${captureTargets[0].name}'`);
          } else if ((node.values ?? []).length > 1) {
            fail(`multi-value assignment to captured local '${captureTargets[0].name}'`);
          }
        }
        for (const v of node.vars ?? []) if (v?.type !== "Identifier") expr(v, scopes);
        for (const v of node.values ?? []) expr(v, scopes);
        return;
      }
      case "CompoundAssignmentStatement": {
        const v = node.var;
        if (v?.type === "Identifier" && !isShadowed(v.name, scopes) && captures.has(v.name)) {
          const op = String(node.operator ?? "").replace(/=$/, "");
          if (!COMPOUND_OPERATORS.has(op)) fail(`unsupported compound operator '${node.operator}' on '${v.name}'`);
        } else if (v?.type !== "Identifier") {
          expr(v, scopes);
        }
        expr(node.value, scopes);
        return;
      }
      case "LocalStatement": {
        for (const v of node.values ?? []) expr(v, scopes);
        const frame = scopes[scopes.length - 1]!;
        for (const v of node.vars ?? []) frame.add(v.name);
        return;
      }
      case "LocalFunctionStatement": {
        scopes[scopes.length - 1]!.add(node.name);
        const inner = [...scopes, paramNames(node.params ?? [])];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "FunctionStatement": {
        expr(node.name?.base, scopes);
        const inner = [...scopes, paramNames(node.params ?? [])];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "DoStatement": {
        const inner = [...scopes, new Set<string>()];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "WhileStatement": {
        expr(node.condition, scopes);
        const inner = [...scopes, new Set<string>()];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "RepeatStatement": {
        const inner = [...scopes, new Set<string>()];
        for (const st of node.body ?? []) stmt(st, inner);
        expr(node.condition, inner);
        return;
      }
      case "IfStatement": {
        expr(node.condition, scopes);
        {
          const inner = [...scopes, new Set<string>()];
          for (const st of node.thenBody ?? []) stmt(st, inner);
        }
        for (const c of node.elseifClauses ?? []) {
          expr(c.condition, scopes);
          const inner = [...scopes, new Set<string>()];
          for (const st of c.body ?? []) stmt(st, inner);
        }
        if (node.elseBody) {
          const inner = [...scopes, new Set<string>()];
          for (const st of node.elseBody) stmt(st, inner);
        }
        return;
      }
      case "ForNumericStatement": {
        expr(node.start, scopes);
        expr(node.end, scopes);
        if (node.step) expr(node.step, scopes);
        const inner = [...scopes, new Set<string>([node.var?.name])];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "ForInStatement": {
        for (const e of node.iter ?? []) expr(e, scopes);
        const frame = new Set<string>((node.vars ?? []).map((v: any) => v.name));
        const inner = [...scopes, frame];
        for (const st of node.body ?? []) stmt(st, inner);
        return;
      }
      case "FunctionCallStatement":
        expr(node.call, scopes);
        return;
      case "ReturnStatement":
        for (const v of node.values ?? []) expr(v, scopes);
        return;
      default:
        return;
    }
  }

  const root = [paramNames(fn.params ?? [])];
  for (const st of fn.body ?? []) stmt(st, root);
  return reason;
}

// Rewrites capture writes to `_set(value)` and `x op= value` to
// `_set(_get() op value)` calls. Must run before rewriteReads so generated
// reads are still plain identifiers and get routed through getters.
function rewriteCaptureWrites(fn: FunctionExpression, setters: Map<string, string>): void {
  function expr(node: any, scopes: Set<string>[]): any {
    if (!node || typeof node !== "object") return node;
    switch (node.type) {
      case "FunctionExpression": {
        const inner = [...scopes, paramNames(node.params ?? [])];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "BinaryExpression":
        node.left = expr(node.left, scopes);
        node.right = expr(node.right, scopes);
        return node;
      case "UnaryExpression":
        node.argument = expr(node.argument, scopes);
        return node;
      case "CallExpression":
        node.callee = expr(node.callee, scopes);
        for (let i = 0; i < (node.args ?? []).length; i++) node.args[i] = expr(node.args[i], scopes);
        return node;
      case "MethodCallExpression":
        node.object = expr(node.object, scopes);
        for (let i = 0; i < (node.args ?? []).length; i++) node.args[i] = expr(node.args[i], scopes);
        return node;
      case "IndexExpression":
        node.object = expr(node.object, scopes);
        node.index = expr(node.index, scopes);
        return node;
      case "MemberExpression":
        node.object = expr(node.object, scopes);
        return node;
      case "TableConstructor":
        for (const f of node.fields ?? []) {
          if (f.kind === "index") {
            f.index = expr(f.index, scopes);
            f.value = expr(f.value, scopes);
          } else {
            f.value = expr(f.value, scopes);
          }
        }
        return node;
      case "ParenExpression":
      case "TypeAssertion":
        node.expression = expr(node.expression, scopes);
        return node;
      case "IfElseExpression":
        node.condition = expr(node.condition, scopes);
        node.thenExp = expr(node.thenExp, scopes);
        for (const c of node.elseifClauses ?? []) {
          c.condition = expr(c.condition, scopes);
          c.value = expr(c.value, scopes);
        }
        node.elseExp = expr(node.elseExp, scopes);
        return node;
      case "StringInterpolation":
        for (let i = 0; i < (node.parts ?? []).length; i++) {
          const p = node.parts[i];
          if (p && typeof p === "object") node.parts[i] = expr(p, scopes);
        }
        return node;
      default:
        return node;
    }
  }

  function stmt(node: any, scopes: Set<string>[]): any {
    if (!node || typeof node !== "object") return node;
    switch (node.type) {
      case "AssignmentStatement": {
        const vars = node.vars ?? [];
        const first = vars[0];
        if (vars.length === 1 && first?.type === "Identifier" && !isShadowed(first.name, scopes) && setters.has(first.name)) {
          const value = expr((node.values ?? [])[0], scopes);
          return {
            type: "FunctionCallStatement",
            loc: node.loc,
            call: {
              type: "CallExpression",
              loc: node.loc,
              callee: idExpr(setters.get(first.name)!, node.loc),
              args: [value],
            },
          };
        }
        for (const v of vars) {
          if (v?.type === "Identifier") continue;
          if (v?.type === "IndexExpression") {
            v.object = expr(v.object, scopes);
            v.index = expr(v.index, scopes);
          } else if (v?.type === "MemberExpression") {
            v.object = expr(v.object, scopes);
          }
        }
        for (let i = 0; i < (node.values ?? []).length; i++) node.values[i] = expr(node.values[i], scopes);
        return node;
      }
      case "CompoundAssignmentStatement": {
        const v = node.var;
        if (v?.type === "Identifier" && !isShadowed(v.name, scopes) && setters.has(v.name)) {
          const op = String(node.operator ?? "").replace(/=$/, "");
          const value = expr(node.value, scopes);
          return {
            type: "FunctionCallStatement",
            loc: node.loc,
            call: {
              type: "CallExpression",
              loc: node.loc,
              callee: idExpr(setters.get(v.name)!, node.loc),
              args: [
                {
                  type: "BinaryExpression",
                  loc: node.loc,
                  operator: op,
                  left: idExpr(v.name, node.loc),
                  right: value,
                },
              ],
            },
          };
        }
        if (v?.type !== "Identifier") {
          if (v?.type === "IndexExpression") {
            v.object = expr(v.object, scopes);
            v.index = expr(v.index, scopes);
          } else if (v?.type === "MemberExpression") {
            v.object = expr(v.object, scopes);
          }
        }
        node.value = expr(node.value, scopes);
        return node;
      }
      case "LocalStatement": {
        for (let i = 0; i < (node.values ?? []).length; i++) node.values[i] = expr(node.values[i], scopes);
        const frame = scopes[scopes.length - 1]!;
        for (const v of node.vars ?? []) frame.add(v.name);
        return node;
      }
      case "LocalFunctionStatement": {
        scopes[scopes.length - 1]!.add(node.name);
        const inner = [...scopes, paramNames(node.params ?? [])];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "FunctionStatement": {
        node.name.base = expr(node.name.base, scopes);
        const inner = [...scopes, paramNames(node.params ?? [])];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "DoStatement": {
        const inner = [...scopes, new Set<string>()];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "WhileStatement": {
        node.condition = expr(node.condition, scopes);
        const inner = [...scopes, new Set<string>()];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "RepeatStatement": {
        const inner = [...scopes, new Set<string>()];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        node.condition = expr(node.condition, inner);
        return node;
      }
      case "IfStatement": {
        node.condition = expr(node.condition, scopes);
        {
          const inner = [...scopes, new Set<string>()];
          for (let i = 0; i < (node.thenBody ?? []).length; i++) node.thenBody[i] = stmt(node.thenBody[i], inner);
        }
        for (const c of node.elseifClauses ?? []) {
          c.condition = expr(c.condition, scopes);
          const inner = [...scopes, new Set<string>()];
          for (let i = 0; i < (c.body ?? []).length; i++) c.body[i] = stmt(c.body[i], inner);
        }
        if (node.elseBody) {
          const inner = [...scopes, new Set<string>()];
          for (let i = 0; i < node.elseBody.length; i++) node.elseBody[i] = stmt(node.elseBody[i], inner);
        }
        return node;
      }
      case "ForNumericStatement": {
        node.start = expr(node.start, scopes);
        node.end = expr(node.end, scopes);
        if (node.step) node.step = expr(node.step, scopes);
        const inner = [...scopes, new Set<string>([node.var?.name])];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "ForInStatement": {
        for (let i = 0; i < (node.iter ?? []).length; i++) node.iter[i] = expr(node.iter[i], scopes);
        const inner = [...scopes, new Set<string>((node.vars ?? []).map((v: any) => v.name))];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "FunctionCallStatement":
        node.call = expr(node.call, scopes);
        return node;
      case "ReturnStatement":
        for (let i = 0; i < (node.values ?? []).length; i++) node.values[i] = expr(node.values[i], scopes);
        return node;
      default:
        return node;
    }
  }

  const root = [paramNames(fn.params ?? [])];
  for (let i = 0; i < (fn.body ?? []).length; i++) fn.body[i] = stmt(fn.body[i], root);
}

// Replaces every read of a captured local with a call to an injected getter
// parameter, while respecting shadowing. Captured locals that are reassigned
// somewhere outside the callback must be read through a getter (a value copy
// taken at connect time would go stale); writes to captures are vetoed
// separately, so assignment targets are left untouched.
function rewriteReads(fn: FunctionExpression, rewrites: Map<string, string>): void {
  function expr(node: any, scopes: Set<string>[]): any {
    if (!node || typeof node !== "object") return node;
    switch (node.type) {
      case "Identifier": {
        const getter = rewrites.get(node.name);
        if (getter && !isShadowed(node.name, scopes)) {
          return {
            type: "CallExpression",
            loc: node.loc,
            callee: idExpr(getter, node.loc),
            args: [],
          };
        }
        return node;
      }
      case "FunctionExpression": {
        const inner = [...scopes, paramNames(node.params ?? [])];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "BinaryExpression":
        node.left = expr(node.left, scopes);
        node.right = expr(node.right, scopes);
        return node;
      case "UnaryExpression":
        node.argument = expr(node.argument, scopes);
        return node;
      case "CallExpression":
        node.callee = expr(node.callee, scopes);
        for (let i = 0; i < (node.args ?? []).length; i++) node.args[i] = expr(node.args[i], scopes);
        return node;
      case "MethodCallExpression":
        node.object = expr(node.object, scopes);
        for (let i = 0; i < (node.args ?? []).length; i++) node.args[i] = expr(node.args[i], scopes);
        return node;
      case "IndexExpression":
        node.object = expr(node.object, scopes);
        node.index = expr(node.index, scopes);
        return node;
      case "MemberExpression":
        node.object = expr(node.object, scopes);
        return node;
      case "TableConstructor":
        for (const f of node.fields ?? []) {
          if (f.kind === "index") {
            f.index = expr(f.index, scopes);
            f.value = expr(f.value, scopes);
          } else {
            f.value = expr(f.value, scopes);
          }
        }
        return node;
      case "ParenExpression":
      case "TypeAssertion":
        node.expression = expr(node.expression, scopes);
        return node;
      case "IfElseExpression":
        node.condition = expr(node.condition, scopes);
        node.thenExp = expr(node.thenExp, scopes);
        for (const c of node.elseifClauses ?? []) {
          c.condition = expr(c.condition, scopes);
          c.value = expr(c.value, scopes);
        }
        node.elseExp = expr(node.elseExp, scopes);
        return node;
      case "StringInterpolation":
        for (let i = 0; i < (node.parts ?? []).length; i++) {
          const p = node.parts[i];
          if (p && typeof p === "object") node.parts[i] = expr(p, scopes);
        }
        return node;
      default:
        return node;
    }
  }

  function stmt(node: any, scopes: Set<string>[]): any {
    if (!node || typeof node !== "object") return node;
    switch (node.type) {
      case "LocalStatement": {
        for (let i = 0; i < (node.values ?? []).length; i++) node.values[i] = expr(node.values[i], scopes);
        const frame = scopes[scopes.length - 1]!;
        for (const v of node.vars ?? []) frame.add(v.name);
        return node;
      }
      case "LocalFunctionStatement": {
        scopes[scopes.length - 1]!.add(node.name);
        const inner = [...scopes, paramNames(node.params ?? [])];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "FunctionStatement": {
        node.name.base = expr(node.name.base, scopes);
        const inner = [...scopes, paramNames(node.params ?? [])];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "AssignmentStatement": {
        for (const v of node.vars ?? []) {
          if (v?.type === "Identifier") continue;
          if (v?.type === "IndexExpression") {
            v.object = expr(v.object, scopes);
            v.index = expr(v.index, scopes);
          } else if (v?.type === "MemberExpression") {
            v.object = expr(v.object, scopes);
          }
        }
        for (let i = 0; i < (node.values ?? []).length; i++) node.values[i] = expr(node.values[i], scopes);
        return node;
      }
      case "CompoundAssignmentStatement": {
        const v = node.var;
        if (v?.type === "Identifier") {
          // write target: a capture write would have been vetoed already
        } else if (v?.type === "IndexExpression") {
          v.object = expr(v.object, scopes);
          v.index = expr(v.index, scopes);
        } else if (v?.type === "MemberExpression") {
          v.object = expr(v.object, scopes);
        }
        node.value = expr(node.value, scopes);
        return node;
      }
      case "FunctionCallStatement":
        node.call = expr(node.call, scopes);
        return node;
      case "ReturnStatement":
        for (let i = 0; i < (node.values ?? []).length; i++) node.values[i] = expr(node.values[i], scopes);
        return node;
      case "DoStatement": {
        const inner = [...scopes, new Set<string>()];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "WhileStatement": {
        node.condition = expr(node.condition, scopes);
        const inner = [...scopes, new Set<string>()];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "RepeatStatement": {
        const inner = [...scopes, new Set<string>()];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        node.condition = expr(node.condition, inner);
        return node;
      }
      case "IfStatement": {
        node.condition = expr(node.condition, scopes);
        {
          const inner = [...scopes, new Set<string>()];
          for (let i = 0; i < (node.thenBody ?? []).length; i++) node.thenBody[i] = stmt(node.thenBody[i], inner);
        }
        for (const c of node.elseifClauses ?? []) {
          c.condition = expr(c.condition, scopes);
          const inner = [...scopes, new Set<string>()];
          for (let i = 0; i < (c.body ?? []).length; i++) c.body[i] = stmt(c.body[i], inner);
        }
        if (node.elseBody) {
          const inner = [...scopes, new Set<string>()];
          for (let i = 0; i < node.elseBody.length; i++) node.elseBody[i] = stmt(node.elseBody[i], inner);
        }
        return node;
      }
      case "ForNumericStatement": {
        node.start = expr(node.start, scopes);
        node.end = expr(node.end, scopes);
        if (node.step) node.step = expr(node.step, scopes);
        const inner = [...scopes, new Set<string>([node.var?.name])];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      case "ForInStatement": {
        for (let i = 0; i < (node.iter ?? []).length; i++) node.iter[i] = expr(node.iter[i], scopes);
        const inner = [...scopes, new Set<string>((node.vars ?? []).map((v: any) => v.name))];
        for (let i = 0; i < (node.body ?? []).length; i++) node.body[i] = stmt(node.body[i], inner);
        return node;
      }
      default:
        return node;
    }
  }

  const root = [paramNames(fn.params ?? [])];
  for (let i = 0; i < (fn.body ?? []).length; i++) fn.body[i] = stmt(fn.body[i], root);
}

export function autoBypassRenderStepped(
  ast: Chunk,
  mangle: Mangler,
  onWarning?: (message: string) => void,
): RenderBypassResult {
  const warnings: string[] = [];
  const vetoed: { name: string; reason: string }[] = [];
  const lifted: { name: string; captures: string[]; kind: string }[] = [];
  const prefixStatements: Statement[] = [];
  const mangled: string[] = [];
  const sites: Site[] = [];
  const methodDecls: FnDecl[] = [];
  const globalFuncs: FnDecl[] = [];
  const allDecls: FnDecl[] = [];
  const liftedDecls = new Set<FnDecl>();
  const liftedInline = new Set<FunctionExpression>();
  let counter = 0;

  const warn = (msg: string) => {
    warnings.push(msg);
    onWarning?.(msg);
  };

  const root: Scope = { parent: null, vars: new Map(), funcs: new Map() };
  const writtenBindings = new Set<Binding>();

  function addSite(args: Expression[] | undefined, index: number, scope: Scope, label: string, visible: Map<string, Binding>) {
    if (!args || index < 0 || index >= args.length) return;
    const callback = unwrap(args[index]);
    if (!isNode(callback)) return;
    const site: Site = { args, index, visible, label };
    if (callback.type === "Identifier") {
      site.resolvedDecl = lookupFn(scope, callback.name);
      if (!site.resolvedDecl) {
        const globals = globalFuncs.filter((d) => d.name === callback.name);
        if (globals.length === 1) site.resolvedDecl = globals[0]!;
      }
    } else if (callback.type === "MemberExpression") {
      const basePath = pathOf(callback.object);
      const rootName = leftmostName(callback.object);
      if (basePath && rootName) {
        site.member = {
          basePath,
          rootName,
          rootBinding: lookupVar(scope, rootName),
        };
      }
    }
    sites.push(site);
  }

  function scanExpr(node: any, scope: Scope): void {
    if (!node || typeof node !== "object") return;
    switch (node.type) {
      case "FunctionExpression": {
        const inner = childScope(scope, node.params ?? []);
        (node.body ?? []).forEach((st: any, i: number) => scanStmt(st, inner, node.body, i));
        return;
      }
      case "CallExpression": {
        scanExpr(node.callee, scope);
        for (const a of node.args ?? []) scanExpr(a, scope);
        const callee = unwrap(node.callee);
        if (callee?.type === "Identifier" && callee.name === "connect" && isFrameEvent(node.args?.[0])) {
          addSite(node.args, 1, scope, "connect(frame event)", bindingsOf(scope));
        } else if (callee?.type === "MemberExpression" && callee.property === "Connect" && isFrameEvent(callee.object)) {
          addSite(node.args, 0, scope, "frame event.Connect", bindingsOf(scope));
        }
        return;
      }
      case "MethodCallExpression": {
        scanExpr(node.object, scope);
        for (const a of node.args ?? []) scanExpr(a, scope);
        if (node.method === "Connect" && isFrameEvent(node.object)) {
          addSite(node.args, 0, scope, "frame event:Connect", bindingsOf(scope));
        } else if (node.method === "AddToRenderStepped" || node.method === "AddToHeartbeat" || node.method === "AddToStepped") {
          addSite(node.args, 1, scope, node.method, bindingsOf(scope));
        }
        return;
      }
      case "MemberExpression":
        scanExpr(node.object, scope);
        return;
      case "IndexExpression":
        scanExpr(node.object, scope);
        scanExpr(node.index, scope);
        return;
      case "TableConstructor":
        for (const f of node.fields ?? []) {
          if (f.kind === "index") {
            scanExpr(f.index, scope);
            scanExpr(f.value, scope);
          } else {
            scanExpr(f.value, scope);
          }
        }
        return;
      case "ParenExpression":
      case "TypeAssertion":
        scanExpr(node.expression, scope);
        return;
      case "BinaryExpression":
        scanExpr(node.left, scope);
        scanExpr(node.right, scope);
        return;
      case "UnaryExpression":
        scanExpr(node.argument, scope);
        return;
      case "IfElseExpression":
        scanExpr(node.condition, scope);
        scanExpr(node.thenExp, scope);
        for (const c of node.elseifClauses ?? []) {
          scanExpr(c.condition, scope);
          scanExpr(c.value, scope);
        }
        scanExpr(node.elseExp, scope);
        return;
      case "StringInterpolation":
        for (const p of node.parts ?? []) if (p && typeof p === "object") scanExpr(p, scope);
        return;
      default:
        return;
    }
  }

  function scanStmt(
    node: any,
    scope: Scope,
    container: (Statement | LastStatement)[],
    index: number,
    visible: Map<string, Binding> = bindingsOf(scope),
  ): void {
    if (!node || typeof node !== "object") return;
    switch (node.type) {
      case "LocalStatement": {
        for (const v of node.values ?? []) scanExpr(v, scope);
        const frames: FnDecl[] = [];
        if (node.values) {
          for (let i = 0; i < node.vars.length && i < node.values.length; i++) {
            const value = unwrap(node.values[i]);
            if (value?.type !== "FunctionExpression") continue;
            const d: FnDecl = {
              kind: "local",
              name: node.vars[i].name,
              fn: value,
              stmt: node,
              container,
              index,
              valueIndex: i,
              visible,
            };
            frames.push(d);
            allDecls.push(d);
          }
        }
        for (const v of node.vars ?? []) {
          scope.vars.set(v.name, { name: v.name, kind: "local", stmt: node });
        }
        for (const d of frames) scope.funcs.set(d.name, d);
        return;
      }
      case "LocalFunctionStatement": {
        const binding: Binding = { name: node.name, kind: "localfn", stmt: node };
        scope.vars.set(node.name, binding);
        const fn = makeFn(node.params ?? [], node.body ?? [], node);
        const visibleHere = new Map(visible);
        visibleHere.set(node.name, binding);
        const d: FnDecl = {
          kind: "localfn",
          name: node.name,
          fn,
          stmt: node,
          container,
          index,
          visible: visibleHere,
        };
        scope.funcs.set(node.name, d);
        allDecls.push(d);
        const inner = childScope(scope, node.params ?? []);
        (node.body ?? []).forEach((st: any, i: number) => scanStmt(st, inner, node.body, i));
        return;
      }
      case "FunctionStatement": {
        const nameNode = node.name;
        if (nameNode?.method) {
          scanExpr(nameNode.base, scope);
          const basePath = pathOf(nameNode.base);
          const rootName = leftmostName(nameNode.base);
          if (basePath && rootName) {
            const fn = makeFn([selfParam(node), ...(node.params ?? [])], node.body ?? [], node);
            const d: FnDecl = {
              kind: "method",
              name: `${basePath}:${nameNode.method}`,
              fn,
              stmt: node,
              container,
              index,
              visible,
              method: nameNode.method,
              basePath,
              rootName,
              rootBinding: lookupVar(scope, rootName),
              rootExpr: nameNode.base,
            };
            methodDecls.push(d);
            allDecls.push(d);
          }
          const inner = childScope(scope, [selfParam(node), ...(node.params ?? [])]);
          (node.body ?? []).forEach((st: any, i: number) => scanStmt(st, inner, node.body, i));
          return;
        }
        if (nameNode?.base?.type === "Identifier") {
          const global = !lookupVar(scope, nameNode.base.name);
          const fn = makeFn(node.params ?? [], node.body ?? [], node);
          const d: FnDecl = {
            kind: "func",
            name: nameNode.base.name,
            fn,
            stmt: node,
            container,
            index,
            visible,
          };
          scope.funcs.set(d.name, d);
          if (global) globalFuncs.push(d);
          allDecls.push(d);
          const inner = childScope(scope, node.params ?? []);
          (node.body ?? []).forEach((st: any, i: number) => scanStmt(st, inner, node.body, i));
          return;
        }
        scanExpr(nameNode?.base, scope);
        return;
      }
      case "AssignmentStatement": {
        for (const v of node.vars ?? []) {
          if (v?.type === "Identifier") continue;
          scanExpr(v, scope);
        }
        for (const v of node.values ?? []) scanExpr(v, scope);
        const isFunctionDef =
          node.vars?.length === 1 &&
          node.values?.length === 1 &&
          unwrap(node.vars[0])?.type === "Identifier" &&
          unwrap(node.values[0])?.type === "FunctionExpression";
        if (!isFunctionDef) {
          for (const v of node.vars ?? []) {
            if (v?.type !== "Identifier") continue;
            const b = lookupVar(scope, v.name);
            if (b) writtenBindings.add(b);
          }
        }
        if (node.vars?.length === 1 && node.values?.length === 1) {
          const target = unwrap(node.vars[0]);
          const value = unwrap(node.values[0]);
          if (target?.type === "Identifier" && value?.type === "FunctionExpression") {
            const global = !lookupVar(scope, target.name);
            const d: FnDecl = {
              kind: "assign",
              name: target.name,
              fn: value,
              stmt: node,
              container,
              index,
              valueIndex: 0,
              visible,
            };
            scope.funcs.set(d.name, d);
            if (global) globalFuncs.push(d);
            allDecls.push(d);
          } else if (target?.type === "MemberExpression" && value?.type === "FunctionExpression") {
            const basePath = pathOf(target.object);
            const rootName = leftmostName(target.object);
            if (basePath && rootName) {
              const methodDecl: FnDecl = {
                kind: "method",
                name: `${basePath}:${target.property}`,
                fn: value,
                stmt: node,
                container,
                index,
                valueIndex: 0,
                visible,
                method: target.property,
                basePath,
                rootName,
                rootBinding: lookupVar(scope, rootName),
                rootExpr: target.object,
              };
              methodDecls.push(methodDecl);
              allDecls.push(methodDecl);
            }
          }
        }
        return;
      }
      case "CompoundAssignmentStatement": {
        if (node.var?.type === "Identifier") {
          const b = lookupVar(scope, node.var.name);
          if (b) writtenBindings.add(b);
        } else {
          scanExpr(node.var, scope);
        }
        scanExpr(node.value, scope);
        return;
      }
      case "FunctionCallStatement":
        scanExpr(node.call, scope);
        return;
      case "DoStatement": {
        const inner = childScope(scope, []);
        (node.body ?? []).forEach((st: any, i: number) => scanStmt(st, inner, node.body, i));
        return;
      }
      case "WhileStatement": {
        scanExpr(node.condition, scope);
        const inner = childScope(scope, []);
        (node.body ?? []).forEach((st: any, i: number) => scanStmt(st, inner, node.body, i));
        return;
      }
      case "RepeatStatement": {
        const inner = childScope(scope, []);
        (node.body ?? []).forEach((st: any, i: number) => scanStmt(st, inner, node.body, i));
        scanExpr(node.condition, inner);
        return;
      }
      case "IfStatement": {
        scanExpr(node.condition, scope);
        {
          const inner = childScope(scope, []);
          (node.thenBody ?? []).forEach((st: any, i: number) => scanStmt(st, inner, node.thenBody, i));
        }
        for (const c of node.elseifClauses ?? []) {
          scanExpr(c.condition, scope);
          const inner = childScope(scope, []);
          (c.body ?? []).forEach((st: any, i: number) => scanStmt(st, inner, c.body, i));
        }
        if (node.elseBody) {
          const inner = childScope(scope, []);
          (node.elseBody ?? []).forEach((st: any, i: number) => scanStmt(st, inner, node.elseBody, i));
        }
        return;
      }
      case "ForNumericStatement": {
        scanExpr(node.start, scope);
        scanExpr(node.end, scope);
        if (node.step) scanExpr(node.step, scope);
        const inner = childScope(scope, [node.var?.name ?? "_"]);
        {
          const b = inner.vars.get(node.var?.name ?? "_");
          if (b) writtenBindings.add(b);
        }
        (node.body ?? []).forEach((st: any, i: number) => scanStmt(st, inner, node.body, i));
        return;
      }
      case "ForInStatement": {
        for (const e of node.iter ?? []) scanExpr(e, scope);
        const inner = childScope(scope, (node.vars ?? []).map((v: any) => v.name));
        for (const v of node.vars ?? []) {
          const b = inner.vars.get(v.name);
          if (b) writtenBindings.add(b);
        }
        (node.body ?? []).forEach((st: any, i: number) => scanStmt(st, inner, node.body, i));
        return;
      }
      case "ReturnStatement":
        for (const v of node.values ?? []) scanExpr(v, scope);
        return;
      default:
        return;
    }
  }

  for (let i = 0; i < ast.body.length; i++) {
    scanStmt(ast.body[i], root, ast.body, i);
  }

  function reject(name: string, reason: string): null {
    vetoed.push({ name, reason });
    warn(`Hot-path auto-bypass: '${name}' ${reason}; stays in VM`);
    return null;
  }

  // Builds the top-level factory for a callback/factory. Captures that are
  // never reassigned are copied by value; captures that are reassigned
  // elsewhere are read through injected getter closures; captures written by
  // the lifted body use injected setter closures (UI auto-lift only), so the
  // original variables keep receiving updates. Unsupported write shapes veto.
  function planFactory(
    fn: FunctionExpression,
    visible: Map<string, Binding>,
    name: string,
    kind: string,
    opts?: { allowCaptureWrites?: boolean },
  ): { call: any } | null {
    const free = freeVariables(fn);
    const captures = [...free].filter((n) => visible.has(n) && n !== "self").sort();
    const captureSet = new Set(captures);
    const writes = collectWrites(fn, captureSet);
    if (writes.size > 0) {
      if (!opts?.allowCaptureWrites) {
        return reject(name, `writes captured local(s): ${[...writes].sort().join(", ")}`);
      }
      const unsupported = validateCaptureWrites(fn, captureSet);
      if (unsupported) {
        return reject(name, `cannot lift captured write (${unsupported})`);
      }
    }
    const isMutable = (n: string) => {
      const b = visible.get(n);
      return !!b && writtenBindings.has(b);
    };
    const mutable = captures.filter((n) => isMutable(n) || writes.has(n));
    const written = captures.filter((n) => writes.has(n));
    const mutableSet = new Set(mutable);
    const stable = captures.filter((n) => !mutableSet.has(n));
    const mangledName = mangle("render", counter++);
    const getterParams = mutable.map((_, i) => `${mangledName}_g${i}`);
    const setterParams = written.map((_, i) => `${mangledName}_s${i}`);
    if (written.length > 0) {
      const map = new Map<string, string>();
      for (let i = 0; i < written.length; i++) map.set(written[i]!, setterParams[i]!);
      rewriteCaptureWrites(fn, map);
    }
    if (mutable.length > 0) {
      const map = new Map<string, string>();
      for (let i = 0; i < mutable.length; i++) map.set(mutable[i]!, getterParams[i]!);
      rewriteReads(fn, map);
    }
    const params: Param[] = [...stable, ...getterParams, ...setterParams].map(
      (paramName) => ({ type: "Param", name: paramName, loc: fn.loc } as Param),
    );
    const factory: FunctionExpression = {
      type: "FunctionExpression",
      loc: fn.loc,
      params,
      body: [{ type: "ReturnStatement", loc: fn.loc, values: [fn] } as any],
    } as FunctionExpression;
    prefixStatements.push({
      type: "AssignmentStatement",
      loc: fn.loc,
      vars: [{ type: "Identifier", name: mangledName, loc: fn.loc } as any],
      values: [factory],
    } as any);
    mangled.push(mangledName);
    lifted.push({
      name,
      captures: [
        ...stable,
        ...mutable.map((n) => `${n}*`),
        ...written.filter((n) => !mutableSet.has(n)).map((n) => `${n}~`),
      ],
      kind,
    });
    const args: any[] = stable.map((n) => idExpr(n, fn.loc));
    for (let i = 0; i < mutable.length; i++) {
      args.push({
        type: "FunctionExpression",
        loc: fn.loc,
        params: [],
        body: [{ type: "ReturnStatement", loc: fn.loc, values: [idExpr(mutable[i]!, fn.loc)] } as any],
      });
    }
    for (let i = 0; i < written.length; i++) {
      const valueParam = `${mangledName}_v${i}`;
      args.push({
        type: "FunctionExpression",
        loc: fn.loc,
        params: [{ type: "Param", name: valueParam, loc: fn.loc } as Param],
        body: [
          {
            type: "AssignmentStatement",
            loc: fn.loc,
            vars: [idExpr(written[i]!, fn.loc)],
            values: [idExpr(valueParam, fn.loc)],
          } as any,
        ],
      });
    }
    return {
      call: { type: "CallExpression", loc: fn.loc, callee: idExpr(mangledName, fn.loc), args },
    };
  }

  function liftDecl(decl: FnDecl, opts?: { allowCaptureWrites?: boolean }): boolean {
    if (liftedDecls.has(decl)) return true;
    const free = freeVariables(decl.fn);
    const captures = [...free]
      .filter((name) => decl.visible.has(name))
      .filter((name) => name !== "self")
      .sort();
    if (decl.kind === "localfn" && captures.includes(decl.name)) {
      reject(decl.name, `recursive local function '${decl.name}'`);
      return false;
    }
    if ((decl.kind === "func" || decl.kind === "assign" || decl.kind === "local") && captures.includes(decl.name)) {
      reject(decl.name, `recursive local '${decl.name}'`);
      return false;
    }
    const planned = planFactory(decl.fn, decl.visible, decl.name, decl.kind, opts);
    if (!planned) return false;
    const call = planned.call;
    switch (decl.kind) {
      case "localfn":
        decl.container[decl.index] = {
          type: "LocalStatement",
          loc: decl.stmt.loc,
          vars: [{ name: decl.name }],
          values: [call],
        } as any;
        break;
      case "func":
        decl.container[decl.index] = {
          type: "AssignmentStatement",
          loc: decl.stmt.loc,
          vars: [{ type: "Identifier", name: decl.name, loc: decl.stmt.loc } as any],
          values: [call],
        } as any;
        break;
      case "local":
        decl.stmt.values[decl.valueIndex!] = call;
        break;
      case "assign":
        decl.stmt.values[decl.valueIndex!] = call;
        break;
      case "method":
        decl.container[decl.index] = {
          type: "AssignmentStatement",
          loc: decl.stmt.loc,
          vars: [
            {
              type: "MemberExpression",
              loc: decl.stmt.loc,
              object: decl.rootExpr,
              property: decl.method,
            } as any,
          ],
          values: [call],
        } as any;
        break;
      default:
        break;
    }
    liftedDecls.add(decl);
    return true;
  }

  for (const site of sites) {
    const callback = unwrap(site.args[site.index]);
    if (!callback || typeof callback !== "object") continue;

    if (callback.type === "FunctionExpression") {
      if (liftedInline.has(callback)) continue;
      const planned = planFactory(callback, site.visible, site.label, "inline");
      if (!planned) continue;
      site.args[site.index] = planned.call;
      liftedInline.add(callback);
      continue;
    }

    if (callback.type === "Identifier") {
      const decl = site.resolvedDecl ?? lookupFn(root, callback.name);
      if (decl) {
        liftDecl(decl);
      } else {
        // A parameter of a wrapper such as `Loops:AddToRenderStepped` is not a
        // concrete callback; each caller's actual argument is detected at its
        // own connection site.
        const binding = site.visible.get(callback.name);
        if (binding?.kind !== "param") {
          warn(`RenderStepped auto-bypass: callback '${callback.name}' is not a resolvable local function; stays in VM`);
        }
      }
      continue;
    }

    if (callback.type === "MemberExpression" && site.member) {
      const { basePath, rootBinding } = site.member;
      const candidates = methodDecls.filter(
        (d) =>
          d.method === callback.property &&
          d.basePath === basePath &&
          d.rootBinding === rootBinding,
      );
      if (candidates.length === 1) liftDecl(candidates[0]!);
      else if (candidates.length > 1) {
        const reason = `ambiguous method '${basePath}.${callback.property}'`;
        vetoed.push({ name: reason, reason });
        warn(`Hot-path auto-bypass: ${reason}; stays in VM`);
      } else {
        const reason = `unresolved method '${basePath}.${callback.property}'`;
        vetoed.push({ name: reason, reason });
        warn(`Hot-path auto-bypass: ${reason}; stays in VM`);
      }
    }
  }

  // UI auto-lift: instance-heavy builders and UI-property tables run natively
  // even without a frame connection. Outermost candidates are lifted first;
  // any candidate nested inside an already-lifted body is skipped because it
  // now executes in the prefix with its parent.
  const instanceAliases = collectInstanceAliases(ast.body as any[]);
  const liftedRanges: Array<{ start: number; end: number }> = [];
  for (const range of liftedDecls) {
    const loc = range.stmt?.loc;
    if (loc?.start?.offset !== undefined && loc?.end?.offset !== undefined) {
      liftedRanges.push({ start: loc.start.offset, end: loc.end.offset });
    }
  }
  const isInsideRange = (decl: FnDecl): boolean => {
    const loc = decl.stmt?.loc;
    if (loc?.start?.offset === undefined || loc?.end?.offset === undefined) return false;
    return liftedRanges.some((r) => loc.start.offset > r.start && loc.end.offset <= r.end);
  };
  const uiCandidates = allDecls
    .filter((d) => !liftedDecls.has(d))
    .map((decl) => {
      const { instances, props } = countDirectUiNodes(decl.fn, instanceAliases);
      return { decl, instances, props };
    })
    .filter((c) => c.instances >= 2 || c.props >= 4)
    .sort((a, b) => {
      const al = a.decl.stmt?.loc?.start?.offset ?? 0;
      const bl = b.decl.stmt?.loc?.start?.offset ?? 0;
      if (al !== bl) return al - bl;
      const ae = a.decl.stmt?.loc?.end?.offset ?? 0;
      const be = b.decl.stmt?.loc?.end?.offset ?? 0;
      return be - ae;
    });
  for (const c of uiCandidates) {
    if (isInsideRange(c.decl)) continue;
    if (liftDecl(c.decl, { allowCaptureWrites: true })) {
      const loc = c.decl.stmt?.loc;
      if (loc?.start?.offset !== undefined && loc?.end?.offset !== undefined) {
        liftedRanges.push({ start: loc.start.offset, end: loc.end.offset });
      }
    }
  }

  return { ast, prefixStatements, mangled, lifted, vetoed, warnings };
}
