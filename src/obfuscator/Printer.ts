import type {
  Chunk,
  Statement,
  LastStatement,
  Expression,
  Var,
  FuncName,
  Param,
  TableField,
  Type,
  ReturnType,
  GenericTypeListWithDefaults,
  Attribute,
} from "../ast/types.js";
import { joinBounded } from "../vm/limits.js";

export function printChunk(chunk: Chunk): string {
  return chunk.body.map((s) => printStatement(s)).join("\n");
}

export function printChunkOneLine(chunk: Chunk): string {
  const output = chunk.body.map((s) => printStatement(s)).join("\n");

  // Line-width policy (see vm/limits.ts): legacy behavior flattens the whole
  // chunk into one line. Keep that shape while it stays under the bound;
  // larger chunks break at original line boundaries first so every physical
  // line stays bounded (whitespace-only change at line boundaries).
  const lines = output
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("--"));
  const segments = joinBounded(lines).map((seg) =>
    seg
      .replace(/\s+/g, " ")
      .replace(/end\s+end/g, "end end")
      .replace(/end\s+else/g, "end else")
      .replace(/end\s+elseif/g, "end elseif")
      .replace(/then\s+end/g, "then end")
      .replace(/do\s+end/g, "do end")
      .trim()
  );

  return segments.join("\n").trim();
}

function printStatement(stmt: Statement | LastStatement): string {
  switch (stmt.type) {
    case "AssignmentStatement":
      return printAssignment(stmt);
    case "CompoundAssignmentStatement":
      return printCompoundAssignment(stmt);
    case "FunctionCallStatement":
      return printExpression(stmt.call);
    case "DoStatement":
      return `do\n${indent(printBlock(stmt.body))}\nend`;
    case "WhileStatement":
      return `while ${printExpression(stmt.condition)} do\n${indent(printBlock(stmt.body))}\nend`;
    case "RepeatStatement":
      return `repeat\n${indent(printBlock(stmt.body))}\nuntil ${printExpression(stmt.condition)}`;
    case "IfStatement":
      return printIfStatement(stmt);
    case "ForNumericStatement":
      return printForNumeric(stmt);
    case "ForInStatement":
      return printForIn(stmt);
    case "FunctionStatement":
      return printFunctionStatement(stmt);
    case "LocalFunctionStatement":
      return printLocalFunctionStatement(stmt);
    case "LocalStatement":
      return printLocalStatement(stmt);
    case "TypeStatement":
      return printTypeStatement(stmt);
    case "ExportTypeStatement":
      return printExportTypeStatement(stmt);
    case "TypeFunctionStatement":
      return printTypeFunctionStatement(stmt);
    case "ExportTypeFunctionStatement":
      return printExportTypeFunctionStatement(stmt);
    case "ReturnStatement":
      return stmt.values?.length
        ? `return ${stmt.values.map(printExpression).join(", ")}`
        : "return";
    case "BreakStatement":
      return "break";
    case "ContinueStatement":
      return "continue";
    default:
      return "";
  }
}

function printBlock(body: (Statement | LastStatement)[]): string {
  return body.map(printStatement).join("\n");
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((line) => (line ? "  " + line : ""))
    .join("\n");
}

function printAssignment(stmt: { vars: Var[]; values: Expression[] }): string {
  const vars = stmt.vars.map(printVar).join(", ");
  const vals = stmt.values.map(printExpression).join(", ");
  return `${vars} = ${vals}`;
}

function printCompoundAssignment(stmt: {
  var: Var;
  operator: string;
  value: Expression;
}): string {
  return `${printVar(stmt.var)} ${stmt.operator} ${printExpression(stmt.value)}`;
}

function printVar(v: Var): string {
  switch (v.type) {
    case "Identifier":
      return v.name;
    case "IndexExpression":
      return `${printExpression(v.object)}[${printExpression(v.index)}]`;
    case "MemberExpression":
      return `${printExpression(v.object)}.${v.property}`;
    default:
      return "";
  }
}

function printIfStatement(stmt: {
  condition: Expression;
  thenBody: (Statement | LastStatement)[];
  elseifClauses: { condition: Expression; body: (Statement | LastStatement)[] }[];
  elseBody?: (Statement | LastStatement)[];
}): string {
  let s = `if ${printExpression(stmt.condition)} then\n${indent(printBlock(stmt.thenBody))}`;
  for (const c of stmt.elseifClauses) {
    s += `\nelseif ${printExpression(c.condition)} then\n${indent(printBlock(c.body))}`;
  }
  if (stmt.elseBody?.length) {
    s += `\nelse\n${indent(printBlock(stmt.elseBody))}`;
  }
  return s + "\nend";
}

function printForNumeric(stmt: {
  var: { name: string };
  start: Expression;
  end: Expression;
  step?: Expression;
  body: (Statement | LastStatement)[];
}): string {
  const step = stmt.step ? `, ${printExpression(stmt.step)}` : "";
  return `for ${stmt.var.name} = ${printExpression(stmt.start)}, ${printExpression(stmt.end)}${step} do\n${indent(printBlock(stmt.body))}\nend`;
}

function printForIn(stmt: {
  vars: { name: string }[];
  iter: Expression[];
  body: (Statement | LastStatement)[];
}): string {
  const vars = stmt.vars.map((v) => v.name).join(", ");
  const iter = stmt.iter.map(printExpression).join(", ");
  return `for ${vars} in ${iter} do\n${indent(printBlock(stmt.body))}\nend`;
}

function printAttributes(attrs?: Attribute[]): string {
  if (!attrs?.length) return "";
  if (attrs.length === 1 && !attrs[0]!.args?.length) {
    return `@${attrs[0]!.name} `;
  }
  const parts = attrs.map((attr) => {
    if (attr.args?.length) {
      const args = attr.args.map((a) =>
        typeof a === "string" ? JSON.stringify(a) : String(a)
      ).join(", ");
      return `${attr.name}(${args})`;
    }
    return attr.name;
  });
  return `@[${parts.join(", ")}] `;
}

function printFunctionStatement(stmt: {
  name: FuncName;
  attributes?: Attribute[];
  generics?: string[];
  params: Param[];
  returnType?: ReturnType;
  body: (Statement | LastStatement)[];
}): string {
  const attrs = printAttributes(stmt.attributes);
  const name = printFuncName(stmt.name);
  const sig = printFunctionSignature(stmt);
  const block = printBlock(stmt.body);
  return `${attrs}function ${name}${sig}\n${indent(block)}\nend`;
}

function printLocalFunctionStatement(stmt: {
  name: string;
  attributes?: Attribute[];
  generics?: string[];
  params: Param[];
  returnType?: ReturnType;
  body: (Statement | LastStatement)[];
}): string {
  const attrs = printAttributes(stmt.attributes);
  const sig = printFunctionSignature(stmt);
  const block = printBlock(stmt.body);
  return `${attrs}local function ${stmt.name}${sig}\n${indent(block)}\nend`;
}

function printFuncName(fn: FuncName): string {
  let s = fn.base.type === "Identifier" ? fn.base.name : printExpression(fn.base);
  if (fn.method) s += `:${fn.method}`;
  return s;
}

function printFunctionSignature(fn: {
  generics?: string[];
  params: Param[];
  returnType?: ReturnType;
}): string {
  const gen = fn.generics?.length ? `<${fn.generics.join(", ")}>` : "";
  const params = fn.params.map(printParam).join(", ");
  const ret = fn.returnType ? `: ${printReturnType(fn.returnType)}` : "";
  return `${gen}(${params})${ret}`;
}

function printFunctionBody(fn: {
  generics?: string[];
  params: Param[];
  returnType?: ReturnType;
  body: (Statement | LastStatement)[];
}): string {
  return `${printFunctionSignature(fn)}\n${printBlock(fn.body)}`;
}

function printParam(p: Param): string {
  if (p.variadic) {
    const t = p.typeAnnotation ? `: ${printType(p.typeAnnotation)}` : "";
    return `...${t}`;
  }
  const t = p.typeAnnotation ? `: ${printType(p.typeAnnotation)}` : "";
  return `${p.name}${t}`;
}

function printLocalStatement(stmt: {
  vars: { name: string; type?: Type }[];
  values?: Expression[];
}): string {
  const vars = stmt.vars
    .map((v) => (v.type ? `${v.name}: ${printType(v.type)}` : v.name))
    .join(", ");
  if (stmt.values?.length) {
    return `local ${vars} = ${stmt.values.map(printExpression).join(", ")}`;
  }
  return `local ${vars}`;
}

function printTypeStatement(stmt: {
  name: string;
  generics?: GenericTypeListWithDefaults;
  value: Type;
}): string {
  const gen = stmt.generics ? printGenericTypeListWithDefaults(stmt.generics) : "";
  return `type ${stmt.name}${gen} = ${printType(stmt.value)}`;
}

function printExportTypeStatement(stmt: {
  name: string;
  generics?: GenericTypeListWithDefaults;
  value: Type;
}): string {
  const gen = stmt.generics ? printGenericTypeListWithDefaults(stmt.generics) : "";
  return `export type ${stmt.name}${gen} = ${printType(stmt.value)}`;
}

function printTypeFunctionStatement(stmt: {
  name: string;
  generics?: string[];
  params: Param[];
  returnType?: ReturnType;
  body: (Statement | LastStatement)[];
}): string {
  const sig = printFunctionSignature(stmt);
  const block = printBlock(stmt.body);
  return `type function ${stmt.name}${sig}\n${indent(block)}\nend`;
}

function printExportTypeFunctionStatement(stmt: {
  name: string;
  generics?: string[];
  params: Param[];
  returnType?: ReturnType;
  body: (Statement | LastStatement)[];
}): string {
  const sig = printFunctionSignature(stmt);
  const block = printBlock(stmt.body);
  return `export type function ${stmt.name}${sig}\n${indent(block)}\nend`;
}

function printGenericTypeListWithDefaults(g: GenericTypeListWithDefaults): string {
  const params = g.params
    .map((p) => (p.default ? `${p.name} = ${printTypeOrPack(p.default)}` : p.name))
    .join(", ");
  return `<${params}>`;
}

function printTypeOrPack(t: any): string {
  if (t.type === "TypePack") {
    const parts = (t.types as any[]).map((x) =>
      "optional" in x && x.type ? printType(x.type) + (x.optional ? "?" : "") : printType(x as Type)
    );
    return `(${parts.join(", ")})`;
  }
  if (t.type === "VariadicTypePack") return `...${printType(t.inner)}`;
  if (t.type === "GenericTypePack") return `${t.name}...`;
  return printType(t as Type);
}

function printReturnType(rt: ReturnType): string {
  if (rt.type === "TypePack") return `(${rt.types.map(printType).join(", ")})`;
  if (rt.type === "GenericTypePack") return `${rt.name}...`;
  if (rt.type === "VariadicTypePack") return `...${printType(rt.inner)}`;
  return printType(rt);
}

function printType(t: Type): string {
  const typeNode = t as any;
  switch (typeNode.type) {
    case "NilType":
      return "nil";
    case "SingletonType":
      return typeof typeNode.value === "string" ? JSON.stringify(typeNode.value) : String(typeNode.value);
    case "IdentifierType": {
      let s = typeNode.name;
      if (typeNode.module) s = `${typeNode.module}.${s}`;
      if (typeNode.typeParams?.length) s += `<${typeNode.typeParams.map(printTypeOrPack).join(", ")}>`;
      return s;
    }
    case "TypeofType":
      return `typeof(${printExpression(typeNode.expression)})`;
    case "TableType":
      return printTableType(typeNode);
    case "FunctionType":
      return printFunctionType(typeNode);
    case "ParenType":
      return `(${printType(typeNode.inner)})`;
    case "UnionType": {
      const parts = typeNode.types.map((x: { type: Type; optional?: boolean }) => printType(x.type) + (x.optional ? "?" : ""));
      return parts.join(" | ");
    }
    case "IntersectionType":
      return typeNode.types.map(printType).join(" & ");
    case "TypePack":
      return `(${typeNode.types.map(printType).join(", ")})`;
    case "VariadicTypePack":
      return `...${printType(typeNode.inner)}`;
    case "GenericTypePack":
      return `${typeNode.name}...`;
    default:
      return "any";
  }
}

function printTableType(t: { arrayType?: Type; props?: any[] }): string {
  if (t.arrayType && !t.props?.length) return `{${printType(t.arrayType)}}`;
  if (!t.props?.length) return "{}";
  const parts = t.props.map((p: any) => {
    if (p.type === "TableIndexerType") {
      const ro = p.readOnly ? "read " : p.writeOnly ? "write " : "";
      return `${ro}[${printType(p.indexType)}]: ${printType(p.valueType)}`;
    }
    const ro = p.readOnly ? "read " : p.writeOnly ? "write " : "";
    return `${ro}${p.name}: ${printType(p.propType)}`;
  });
  return `{${parts.join("; ")}}`;
}

function printFunctionType(t: {
  generics?: string[];
  params: any[];
  returnType: ReturnType;
}): string {
  const gen = t.generics?.length ? `<${t.generics.join(", ")}>` : "";
  const params = t.params.map((p: any) => {
    if (p.type === "GenericTypePack") return `${p.name}...`;
    if (p.type === "VariadicTypePack") return `...${printType(p.inner)}`;
    if (p.name && p.type) return `${p.name}: ${printType(p.type)}`;
    if (p.type?.type) return printType(p.type);
    return "any";
  }).join(", ");
  return `${gen}(${params}) -> ${printReturnType(t.returnType)}`;
}

export function printExpression(exp: Expression): string {
  switch (exp.type) {
    case "Identifier":
      return exp.name;
    case "NilLiteral":
      return "nil";
    case "BooleanLiteral":
      return exp.value ? "true" : "false";
    case "NumberLiteral":
      return String(exp.raw ?? exp.value);
    case "StringLiteral":
      return luauEscapeString(exp.value);
    case "VarargExpression":
      return "...";
    case "BinaryExpression":
      return `(${printExpression(exp.left)} ${exp.operator} ${printExpression(exp.right)})`;
    case "UnaryExpression":
      return exp.operator === "not"
        ? `not ${printExpression(exp.argument)}`
        : `${exp.operator}${printExpression(exp.argument)}`;
    case "CallExpression":
      return `${printExpression(exp.callee)}(${exp.args.map(printExpression).join(", ")})`;
    case "MethodCallExpression":
      return `${printExpression(exp.object)}:${exp.method}(${exp.args.map(printExpression).join(", ")})`;
    case "IndexExpression":
      return `${printExpression(exp.object)}[${printExpression(exp.index)}]`;
    case "MemberExpression":
      return `${printExpression(exp.object)}.${exp.property}`;
    case "TableConstructor":
      return printTableConstructor(exp);
    case "FunctionExpression":
      return printFunctionExpression(exp);
    case "ParenExpression":
      return `(${printExpression(exp.expression)})`;
    case "TypeAssertion":
      return `(${printExpression(exp.expression)} :: ${printType(exp.assertedType)})`;
    case "IfElseExpression":
      return printIfElseExpression(exp);
    case "StringInterpolation":
      return printStringInterpolation(exp);
    default:
      return "";
  }
}

function printTableConstructor(t: { fields: TableField[] }): string {
  const parts = t.fields.map((f) => {
    if (f.kind === "index") return `[${printExpression(f.index)}] = ${printExpression(f.value)}`;
    if (f.kind === "named") return `${f.name} = ${printExpression(f.value)}`;
    return printExpression(f.value);
  });
  return `{${parts.join(", ")}}`;
}

function printFunctionExpression(exp: {
  attributes?: Attribute[];
  generics?: string[];
  params: Param[];
  returnType?: ReturnType;
  body: (Statement | LastStatement)[];
}): string {
  const attrs = printAttributes(exp.attributes);
  const sig = printFunctionSignature(exp);
  const block = indent(printBlock(exp.body));
  return `${attrs}function${sig}\n${block}\nend`;
}

function printIfElseExpression(exp: {
  condition: Expression;
  thenExp: Expression;
  elseifClauses: { condition: Expression; value: Expression }[];
  elseExp: Expression;
}): string {
  let s = `if ${printExpression(exp.condition)} then ${printExpression(exp.thenExp)}`;
  for (const c of exp.elseifClauses) {
    s += ` elseif ${printExpression(c.condition)} then ${printExpression(c.value)}`;
  }
  return s + ` else ${printExpression(exp.elseExp)}`;
}

function luauEscapeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const code = s.charCodeAt(i);
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch === '\0') out += '\\0';
    else if (ch === '\x07') out += '\\a';
    else if (ch === '\b') out += '\\b';
    else if (ch === '\f') out += '\\f';
    else if (ch === '\v') out += '\\v';
    else if (code < 32 || code === 127) out += '\\' + code.toString();
    else out += ch;
  }
  return out + '"';
}

function printStringInterpolation(exp: { parts: (string | Expression)[] }): string {
  const parts = exp.parts.map((p) =>
    typeof p === "string" ? p.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/{/g, "\\{") : `{${printExpression(p)}}`
  );
  return "`" + parts.join("") + "`";
}
