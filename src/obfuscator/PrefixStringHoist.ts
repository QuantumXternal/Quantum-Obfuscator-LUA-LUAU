// Hoists encoded-string decodes out of lifted hot-path factories.
//
// StringEncoder emits a decode call with a fresh byte-table argument for every
// literal. Its cache is keyed by that table, so each call site always misses
// and therefore allocates/decodes again. Lifted RenderStepped callbacks call
// those sites every frame. Moving the decode calls into a table initializer in
// the outer factory body decodes each unique literal once at connect/load time
// and leaves only indexed reads on the hot path.

import type {
  CallExpression,
  Expression,
  FunctionExpression,
  Identifier,
  LastStatement,
  Statement,
  TableConstructor,
} from "../ast/types.js";

export interface FactoryStringHoistOptions {
  decoderName: string;
  factoryNames: Set<string>;
  mangle: (index: number) => string;
}

export interface FactoryStringHoistResult {
  statements: Statement[];
  hoisted: number;
}

interface DecodeLiteral {
  key: number;
  bytes: number[];
}

function decodeLiteral(node: CallExpression, decoderName: string): DecodeLiteral | null {
  const callee = node.callee;
  if (callee?.type !== "Identifier" || callee.name !== decoderName) return null;
  if (node.args.length !== 2) return null;
  const table = node.args[0];
  const keyArg = node.args[1];
  if (table?.type !== "TableConstructor" || keyArg?.type !== "NumberLiteral") return null;
  const bytes: number[] = [];
  for (const field of table.fields ?? []) {
    if (field.kind !== "value" || field.value.type !== "NumberLiteral") return null;
    bytes.push(field.value.value);
  }
  return { key: keyArg.value, bytes };
}

function literalId(lit: DecodeLiteral): string {
  return `${lit.key}:${lit.bytes.join(",")}`;
}

function indexExpression(tableName: string, index: number, loc: any): Expression {
  return {
    type: "IndexExpression",
    object: { type: "Identifier", name: tableName, loc } as Identifier,
    index: { type: "NumberLiteral", value: index, loc },
    loc,
  };
}

function hoistInNode(
  node: any,
  decoderName: string,
  tableName: string,
  seen: Map<string, number>,
  literals: Expression[],
): any {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = hoistInNode(node[i], decoderName, tableName, seen, literals);
    }
    return node;
  }
  if (node.type === "CallExpression") {
    const lit = decodeLiteral(node, decoderName);
    if (lit) {
      const id = literalId(lit);
      let index = seen.get(id);
      if (index === undefined) {
        index = literals.length + 1;
        seen.set(id, index);
        literals.push(node);
      }
      return indexExpression(tableName, index, node.loc);
    }
  }
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "type") continue;
    const value = node[key];
    if (value && typeof value === "object") {
      node[key] = hoistInNode(value, decoderName, tableName, seen, literals);
    }
  }
  return node;
}

function factoryFunction(stmt: Statement, factoryNames: Set<string>): FunctionExpression | null {
  if (stmt.type !== "AssignmentStatement") return null;
  const target = stmt.vars?.[0];
  if (target?.type !== "Identifier" || !factoryNames.has(target.name)) return null;
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

function hoistTableStatements(
  tableName: string,
  literals: Expression[],
  loc: any,
): Statement[] {
  // One decode per assignment keeps each printed line well below executor
  // line-length limits; a single table constructor can otherwise grow to
  // many kilobytes for a large UI factory.
  const empty: TableConstructor = { type: "TableConstructor", fields: [], loc };
  const out: Statement[] = [
    {
      type: "LocalStatement",
      vars: [{ name: tableName, type: undefined }],
      values: [empty],
      loc,
    },
  ];
  for (let i = 0; i < literals.length; i++) {
    out.push({
      type: "AssignmentStatement",
      vars: [indexExpression(tableName, i + 1, loc) as any],
      values: [literals[i]!],
      loc,
    });
  }
  return out;
}

export function hoistFactoryStrings(
  statements: Statement[],
  options: FactoryStringHoistOptions,
): FactoryStringHoistResult {
  let hoisted = 0;
  let tableCounter = 0;

  for (const stmt of statements) {
    const factory = factoryFunction(stmt, options.factoryNames);
    if (!factory) continue;
    const callback = returnedFunction(factory);
    if (!callback) continue;

    const tableName = options.mangle(tableCounter++);
    const seen = new Map<string, number>();
    const literals: Expression[] = [];
    // Only rewrite the returned callback (and its nested functions); the
    // outer factory body is where the hoisted initializer is inserted.
    callback.body = callback.body.map((s) =>
      hoistInNode(s, options.decoderName, tableName, seen, literals),
    );
    if (literals.length === 0) continue;

    const insertAt = (factory.body as (Statement | LastStatement)[]).findIndex(
      (s) => s.type === "ReturnStatement",
    );
    const init = hoistTableStatements(tableName, literals, callback.loc);
    if (insertAt < 0) factory.body.push(...init);
    else (factory.body as (Statement | LastStatement)[]).splice(insertAt, 0, ...init);
    hoisted += literals.length;
  }

  return { statements, hoisted };
}
