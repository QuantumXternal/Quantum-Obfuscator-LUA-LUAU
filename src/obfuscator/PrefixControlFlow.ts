// Native control-flow hardening for auto-lifted prefix factories.
//
// UI/boot factories ("heavy") get block-level if/while state machines:
// flattening a block into a state dispatcher keeps branch-local scope intact.
// RenderStepped/Heartbeat factories ("light") only get opaque conditions and
// dead junk branches: a state loop in a per-frame callback would trade the
// frame-time win we just gained from lifting.

import type {
  Expression,
  FunctionExpression,
  LastStatement,
  Statement,
} from "../ast/types.js";

export interface NativePrefixCffOptions {
  seed?: number;
  factoryNames: Set<string>;
  heavyFactories: Set<string>;
  maxFlattened?: number;
}

export interface NativePrefixCffResult {
  statements: Statement[];
  flattened: number;
  heavy: number;
  light: number;
}

type Block = (Statement | LastStatement)[];

interface CffState {
  seed: number;
  names: number;
  flattened: number;
  maxFlattened: number;
}

function locOf(node: any): any {
  return node?.loc;
}

function id(name: string, loc: any): any {
  return { type: "Identifier", name, loc };
}

function num(value: number, loc: any): any {
  return { type: "NumberLiteral", value, loc };
}

function bool(value: boolean, loc: any): any {
  return { type: "BooleanLiteral", value, loc };
}

function bin(op: string, left: any, right: any, loc: any): any {
  return { type: "BinaryExpression", operator: op, left, right, loc };
}

function call(member: string, args: any[], loc: any): any {
  return {
    type: "CallExpression",
    callee: {
      type: "MemberExpression",
      object: id("os", loc),
      property: member,
      loc,
    },
    args,
    loc,
  };
}

function assign(name: string, value: any, loc: any): any {
  return {
    type: "AssignmentStatement",
    vars: [id(name, loc)],
    values: [value],
    loc,
  };
}

function localStmt(name: string, value: any, loc: any): any {
  return {
    type: "LocalStatement",
    vars: [{ name, type: undefined }],
    values: [value],
    loc,
  };
}

function doBlock(body: Block, loc: any): any {
  return { type: "DoStatement", body, loc };
}

interface IfBranch {
  condition: Expression | null;
  body: Block;
}

function branchesOf(stmt: any): IfBranch[] {
  const branches: IfBranch[] = [];
  branches.push({ condition: stmt.condition, body: stmt.thenBody });
  for (const clause of stmt.elseifClauses ?? []) {
    branches.push({ condition: clause.condition, body: clause.body });
  }
  branches.push({ condition: null, body: stmt.elseBody ?? [] });
  return branches;
}

// A break/continue is safe to leave in a flattened block only when it is
// bound to a loop nested inside that block. Function bodies are separate
// control-flow domains and cannot contain an unbound outer-loop break.
function hasUnboundLoopControl(block: Block, depth = 0): boolean {
  for (const stmt of block) {
    switch (stmt.type) {
      case "BreakStatement":
      case "ContinueStatement":
        if (depth === 0) return true;
        break;
      case "WhileStatement":
      case "RepeatStatement":
      case "ForNumericStatement":
      case "ForInStatement":
        if (hasUnboundLoopControl(stmt.body ?? [], depth + 1)) return true;
        break;
      case "DoStatement":
        if (hasUnboundLoopControl(stmt.body ?? [], depth)) return true;
        break;
      case "IfStatement": {
        for (const branch of branchesOf(stmt)) {
          if (hasUnboundLoopControl(branch.body, depth)) return true;
        }
        break;
      }
      case "LocalFunctionStatement":
      case "FunctionStatement":
      case "TypeFunctionStatement":
      case "ExportTypeFunctionStatement":
        break;
      default:
        break;
    }
  }
  return false;
}

function uniqueName(state: CffState, kind: string): string {
  return `__qnc_${kind}${state.names++}`;
}

function wrapOpaque(condition: Expression, opaque: string, loc: any): any {
  return bin("and", id(opaque, loc), condition, loc);
}

function junkBody(state: CffState, junk: string, loc: any): Block {
  const amount = (state.seed % 7) + 1;
  return [assign(junk, bin("+", id(junk, loc), num(amount, loc), loc), loc)];
}

function stateCheck(stateVar: string, value: number, opaque: string, loc: any): any {
  return bin(
    "and",
    bin("==", id(stateVar, loc), num(value, loc), loc),
    id(opaque, loc),
    loc,
  );
}

function flattenIf(stmt: any, state: CffState, opaque: string, junk: string): any {
  const branches = branchesOf(stmt);
  const conditionals = branches.length - 1;
  const elseState = conditionals + 1;
  const doneState = conditionals + 2;
  const junkState = conditionals + 3;
  const stVar = uniqueName(state, "s");
  const loc = locOf(stmt);

  const dispatch: any = {
    type: "IfStatement",
    condition: branches[0]!.condition,
    thenBody: [assign(stVar, num(1, loc), loc)],
    elseifClauses: [],
    elseBody: [assign(stVar, num(elseState, loc), loc)],
    loc,
  };
  for (let i = 1; i < conditionals; i++) {
    dispatch.elseifClauses.push({
      condition: branches[i]!.condition,
      body: [assign(stVar, num(i + 1, loc), loc)],
    });
  }

  const outer: any = {
    type: "IfStatement",
    condition: stateCheck(stVar, 0, opaque, loc),
    thenBody: [dispatch],
    elseifClauses: [],
    elseBody: [{ type: "BreakStatement", loc }],
    loc,
  };

  for (let i = 0; i < conditionals; i++) {
    const body = [...branches[i]!.body];
    const tail = body[body.length - 1] as { type?: string } | undefined;
    if (!tail || tail.type !== "ReturnStatement") {
      body.push(assign(stVar, num(doneState, loc), loc));
    }
    outer.elseifClauses.push({
      condition: stateCheck(stVar, i + 1, opaque, loc),
      body,
    });
  }
  {
    const body = [...branches[branches.length - 1]!.body];
    const tail = body[body.length - 1] as { type?: string } | undefined;
    if (!tail || tail.type !== "ReturnStatement") {
      body.push(assign(stVar, num(doneState, loc), loc));
    }
    outer.elseifClauses.push({
      condition: stateCheck(stVar, elseState, opaque, loc),
      body,
    });
  }
  outer.elseifClauses.push({
    condition: stateCheck(stVar, junkState, opaque, loc),
    body: [...junkBody(state, junk, loc), assign(stVar, num(doneState, loc), loc)],
  });

  const loop: any = {
    type: "WhileStatement",
    condition: bool(true, loc),
    body: [
      outer,
      {
        type: "IfStatement",
        condition: bin("==", id(stVar, loc), num(doneState, loc), loc),
        thenBody: [{ type: "BreakStatement", loc }],
        elseifClauses: [],
        loc,
      },
    ],
    loc,
  };
  state.flattened++;
  return doBlock([localStmt(stVar, num(0, loc), loc), loop], loc);
}

function flattenWhile(stmt: any, state: CffState, opaque: string, junk: string): any {
  const loc = locOf(stmt);
  const stVar = uniqueName(state, "s");
  const body = [...stmt.body];
  const tail = body[body.length - 1] as { type?: string } | undefined;
  const fallsThrough = !tail || tail.type !== "ReturnStatement";

  const conditionJump: any = {
    type: "IfStatement",
    condition: wrapOpaque(stmt.condition, opaque, loc),
    thenBody: [assign(stVar, num(1, loc), loc)],
    elseifClauses: [],
    elseBody: [{ type: "BreakStatement", loc }],
    loc,
  };

  const outer: any = {
    type: "IfStatement",
    condition: stateCheck(stVar, 0, opaque, loc),
    thenBody: [conditionJump],
    elseifClauses: [
      {
        condition: stateCheck(stVar, 1, opaque, loc),
        body: [...body, ...(fallsThrough ? [assign(stVar, num(0, loc), loc)] : [])],
      },
      {
        condition: stateCheck(stVar, 2, opaque, loc),
        body: [...junkBody(state, junk, loc), assign(stVar, num(0, loc), loc)],
      },
    ],
    elseBody: [{ type: "BreakStatement", loc }],
    loc,
  };

  const loop: any = {
    type: "WhileStatement",
    condition: bool(true, loc),
    body: [outer],
    loc,
  };
  state.flattened++;
  return doBlock([localStmt(stVar, num(0, loc), loc), loop], loc);
}

function transformExpr(node: any, state: CffState, heavy: boolean, opaque: string, junk: string): any {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = transformExpr(node[i], state, heavy, opaque, junk);
    return node;
  }
  if (node.type === "FunctionExpression") {
    transformBlock(node.body ?? [], state, heavy, opaque, junk);
    return node;
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "type") continue;
    const value = node[key];
    if (value && typeof value === "object") node[key] = transformExpr(value, state, heavy, opaque, junk);
  }
  return node;
}

function transformBlock(block: Block, state: CffState, heavy: boolean, opaque: string, junk: string): Block {
  for (let i = 0; i < block.length; i++) block[i] = transformStatement(block[i]!, state, heavy, opaque, junk);
  return block;
}

function transformStatement(
  stmt: Statement | LastStatement,
  state: CffState,
  heavy: boolean,
  opaque: string,
  junk: string,
): Statement | LastStatement {
  switch (stmt.type) {
    case "IfStatement": {
      const safe = !hasUnboundLoopControl(
        branchesOf(stmt).flatMap((b) => b.body),
      );
      for (const branch of branchesOf(stmt)) transformBlock(branch.body, state, heavy, opaque, junk);
      transformExpr(stmt.condition, state, heavy, opaque, junk);
      for (const clause of stmt.elseifClauses ?? []) {
        transformExpr(clause.condition, state, heavy, opaque, junk);
      }
      if (heavy && safe && state.flattened < state.maxFlattened) {
        return flattenIf(stmt, state, opaque, junk);
      }
      stmt.condition = wrapOpaque(stmt.condition, opaque, stmt.loc);
      for (const clause of stmt.elseifClauses ?? []) {
        clause.condition = wrapOpaque(clause.condition, opaque, clause.condition.loc ?? stmt.loc);
      }
      stmt.elseifClauses = stmt.elseifClauses ?? [];
      stmt.elseifClauses.push({
        condition: { type: "UnaryExpression", operator: "not", argument: id(opaque, stmt.loc), loc: stmt.loc } as any,
        body: junkBody(state, junk, stmt.loc),
      });
      return stmt;
    }
    case "WhileStatement": {
      const safe = !hasUnboundLoopControl(stmt.body);
      transformBlock(stmt.body, state, heavy, opaque, junk);
      transformExpr(stmt.condition, state, heavy, opaque, junk);
      if (heavy && safe && state.flattened < state.maxFlattened) {
        return flattenWhile(stmt, state, opaque, junk);
      }
      stmt.condition = wrapOpaque(stmt.condition, opaque, stmt.loc);
      return stmt;
    }
    case "RepeatStatement": {
      transformBlock(stmt.body, state, heavy, opaque, junk);
      transformExpr(stmt.condition, state, heavy, opaque, junk);
      stmt.condition = wrapOpaque(stmt.condition, opaque, stmt.loc);
      return stmt;
    }
    case "DoStatement": {
      transformBlock(stmt.body, state, heavy, opaque, junk);
      return stmt;
    }
    case "ForNumericStatement": {
      transformExpr(stmt.start, state, heavy, opaque, junk);
      transformExpr(stmt.end, state, heavy, opaque, junk);
      if (stmt.step) transformExpr(stmt.step, state, heavy, opaque, junk);
      transformBlock(stmt.body, state, heavy, opaque, junk);
      if (heavy) stmt.body.unshift(...junkBody(state, junk, stmt.loc));
      return stmt;
    }
    case "ForInStatement": {
      for (const e of stmt.iter ?? []) transformExpr(e, state, heavy, opaque, junk);
      transformBlock(stmt.body, state, heavy, opaque, junk);
      if (heavy) stmt.body.unshift(...junkBody(state, junk, stmt.loc));
      return stmt;
    }
    case "LocalFunctionStatement":
    case "FunctionStatement":
    case "TypeFunctionStatement":
    case "ExportTypeFunctionStatement": {
      transformExpr((stmt as any).name?.base, state, heavy, opaque, junk);
      transformBlock((stmt as any).body ?? [], state, heavy, opaque, junk);
      return stmt;
    }
    case "LocalStatement": {
      if (stmt.values) for (const value of stmt.values) transformExpr(value, state, heavy, opaque, junk);
      return stmt;
    }
    case "AssignmentStatement": {
      for (const v of stmt.vars ?? []) {
        if (v.type === "Identifier") continue;
        if (v.type === "IndexExpression") {
          transformExpr(v.object, state, heavy, opaque, junk);
          transformExpr(v.index, state, heavy, opaque, junk);
        } else {
          transformExpr(v.object, state, heavy, opaque, junk);
        }
      }
      for (const value of stmt.values ?? []) transformExpr(value, state, heavy, opaque, junk);
      return stmt;
    }
    case "CompoundAssignmentStatement": {
      if (stmt.var.type === "IndexExpression") {
        transformExpr(stmt.var.object, state, heavy, opaque, junk);
        transformExpr(stmt.var.index, state, heavy, opaque, junk);
      } else if (stmt.var.type === "MemberExpression") {
        transformExpr(stmt.var.object, state, heavy, opaque, junk);
      }
      transformExpr(stmt.value, state, heavy, opaque, junk);
      return stmt;
    }
    case "FunctionCallStatement": {
      transformExpr(stmt.call, state, heavy, opaque, junk);
      return stmt;
    }
    case "ReturnStatement": {
      for (const value of stmt.values ?? []) transformExpr(value, state, heavy, opaque, junk);
      return stmt;
    }
    default:
      return stmt;
  }
}

function factoryFunction(stmt: Statement, names: Set<string>): FunctionExpression | null {
  if (stmt.type !== "AssignmentStatement") return null;
  const target = stmt.vars?.[0];
  if (target?.type !== "Identifier" || !names.has(target.name)) return null;
  const value = stmt.values?.[0];
  return value?.type === "FunctionExpression" ? value : null;
}

function returnedFunction(factory: FunctionExpression): FunctionExpression | null {
  for (const stmt of factory.body ?? []) {
    if (stmt.type !== "ReturnStatement") continue;
    const value = stmt.values?.[0];
    return value?.type === "FunctionExpression" ? value : null;
  }
  return null;
}

export function scrambleNativePrefix(
  statements: Statement[],
  options: NativePrefixCffOptions,
): NativePrefixCffResult {
  const state: CffState = {
    seed: options.seed ?? 0,
    names: 0,
    flattened: 0,
    maxFlattened: options.maxFlattened ?? 1000,
  };
  let heavy = 0;
  let light = 0;

  for (const stmt of statements) {
    const factory = factoryFunction(stmt, options.factoryNames);
    if (!factory) continue;
    const callback = returnedFunction(factory);
    if (!callback) continue;
    const isHeavy = options.heavyFactories.has(((stmt as any).vars[0] as any).name);
    const opaque = uniqueName(state, "o");
    const junk = uniqueName(state, "j");
    factory.body.unshift(
      localStmt(junk, num(0, factory.loc), factory.loc),
      localStmt(opaque, bin(">=", call("clock", [], factory.loc), num(0, factory.loc), factory.loc), factory.loc),
    );
    transformBlock(callback.body, state, isHeavy, opaque, junk);
    if (isHeavy) heavy++;
    else light++;
  }

  return { statements, flattened: state.flattened, heavy, light };
}
