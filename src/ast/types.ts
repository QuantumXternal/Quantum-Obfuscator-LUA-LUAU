import type { SourceLocation } from "../tokens.js";

export interface BaseNode {
  type: string;
  loc: SourceLocation;
}

export interface Chunk extends BaseNode {
  type: "Chunk";
  body: (Statement | LastStatement)[];
}

export type Statement =
  | AssignmentStatement
  | CompoundAssignmentStatement
  | FunctionCallStatement
  | DoStatement
  | WhileStatement
  | RepeatStatement
  | IfStatement
  | ForNumericStatement
  | ForInStatement
  | FunctionStatement
  | LocalFunctionStatement
  | LocalStatement
  | TypeStatement
  | ExportTypeStatement
  | TypeFunctionStatement
  | ExportTypeFunctionStatement;

export type LastStatement =
  | ReturnStatement
  | BreakStatement
  | ContinueStatement;

export interface AssignmentStatement extends BaseNode {
  type: "AssignmentStatement";
  vars: Var[];
  values: Expression[];
}

export interface CompoundAssignmentStatement extends BaseNode {
  type: "CompoundAssignmentStatement";
  var: Var;
  operator: string;
  value: Expression;
}

export interface FunctionCallStatement extends BaseNode {
  type: "FunctionCallStatement";
  call: CallExpression;
}

export interface DoStatement extends BaseNode {
  type: "DoStatement";
  body: (Statement | LastStatement)[];
}

export interface WhileStatement extends BaseNode {
  type: "WhileStatement";
  condition: Expression;
  body: (Statement | LastStatement)[];
}

export interface RepeatStatement extends BaseNode {
  type: "RepeatStatement";
  body: (Statement | LastStatement)[];
  condition: Expression;
}

export interface IfStatement extends BaseNode {
  type: "IfStatement";
  condition: Expression;
  thenBody: (Statement | LastStatement)[];
  elseifClauses: { condition: Expression; body: (Statement | LastStatement)[] }[];
  elseBody?: (Statement | LastStatement)[];
}

export interface ForNumericStatement extends BaseNode {
  type: "ForNumericStatement";
  var: Identifier;
  start: Expression;
  end: Expression;
  step?: Expression;
  body: (Statement | LastStatement)[];
}

export interface ForInStatement extends BaseNode {
  type: "ForInStatement";
  vars: Identifier[];
  iter: Expression[];
  body: (Statement | LastStatement)[];
}

export interface FunctionStatement extends BaseNode {
  type: "FunctionStatement";
  name: FuncName;
  attributes?: Attribute[];
  generics?: string[];
  params: Param[];
  returnType?: ReturnType;
  body: (Statement | LastStatement)[];
}

export interface LocalFunctionStatement extends BaseNode {
  type: "LocalFunctionStatement";
  name: string;
  attributes?: Attribute[];
  generics?: string[];
  params: Param[];
  returnType?: ReturnType;
  body: (Statement | LastStatement)[];
}

export interface LocalStatement extends BaseNode {
  type: "LocalStatement";
  vars: { name: string; type?: Type }[];
  values?: Expression[];
}

export interface TypeStatement extends BaseNode {
  type: "TypeStatement";
  name: string;
  generics?: GenericTypeListWithDefaults;
  value: Type;
}

export interface ExportTypeStatement extends BaseNode {
  type: "ExportTypeStatement";
  name: string;
  generics?: GenericTypeListWithDefaults;
  value: Type;
}

export interface TypeFunctionStatement extends BaseNode {
  type: "TypeFunctionStatement";
  name: string;
  generics?: string[];
  params: Param[];
  returnType?: ReturnType;
  body: (Statement | LastStatement)[];
}

export interface ExportTypeFunctionStatement extends BaseNode {
  type: "ExportTypeFunctionStatement";
  name: string;
  generics?: string[];
  params: Param[];
  returnType?: ReturnType;
  body: (Statement | LastStatement)[];
}

export interface ReturnStatement extends BaseNode {
  type: "ReturnStatement";
  values?: Expression[];
}

export interface BreakStatement extends BaseNode {
  type: "BreakStatement";
}

export interface ContinueStatement extends BaseNode {
  type: "ContinueStatement";
}

export type Expression =
  | Identifier
  | NilLiteral
  | BooleanLiteral
  | NumberLiteral
  | StringLiteral
  | StringInterpolation
  | VarargExpression
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | MethodCallExpression
  | IndexExpression
  | MemberExpression
  | TableConstructor
  | FunctionExpression
  | ParenExpression
  | TypeAssertion
  | IfElseExpression;

export interface Identifier extends BaseNode {
  type: "Identifier";
  name: string;
}

export interface NilLiteral extends BaseNode {
  type: "NilLiteral";
}

export interface BooleanLiteral extends BaseNode {
  type: "BooleanLiteral";
  value: boolean;
}

export interface NumberLiteral extends BaseNode {
  type: "NumberLiteral";
  /** Numeric value. Parsed literals also carry the exact source spelling in raw. */
  value: number;
  raw?: string;
}

export interface StringLiteral extends BaseNode {
  type: "StringLiteral";
  value: string;
}

export interface VarargExpression extends BaseNode {
  type: "VarargExpression";
}

export interface BinaryExpression extends BaseNode {
  type: "BinaryExpression";
  operator: string;
  left: Expression;
  right: Expression;
}

export interface UnaryExpression extends BaseNode {
  type: "UnaryExpression";
  operator: string;
  argument: Expression;
}

export interface CallExpression extends BaseNode {
  type: "CallExpression";
  callee: Expression;
  args: Expression[];
}

export interface MethodCallExpression extends BaseNode {
  type: "MethodCallExpression";
  object: Expression;
  method: string;
  args: Expression[];
}

export interface IndexExpression extends BaseNode {
  type: "IndexExpression";
  object: Expression;
  index: Expression;
}

export interface MemberExpression extends BaseNode {
  type: "MemberExpression";
  object: Expression;
  property: string;
}

export interface TableConstructor extends BaseNode {
  type: "TableConstructor";
  fields: TableField[];
}

export type TableField =
  | { kind: "index"; index: Expression; value: Expression }
  | { kind: "named"; name: string; value: Expression }
  | { kind: "value"; value: Expression };

export interface FunctionExpression extends BaseNode {
  type: "FunctionExpression";
  attributes?: Attribute[];
  generics?: string[];
  params: Param[];
  returnType?: ReturnType;
  body: (Statement | LastStatement)[];
}

export interface ParenExpression extends BaseNode {
  type: "ParenExpression";
  expression: Expression;
}

export interface TypeAssertion extends BaseNode {
  type: "TypeAssertion";
  expression: Expression;
  assertedType: Type;
}

export interface IfElseExpression extends BaseNode {
  type: "IfElseExpression";
  condition: Expression;
  thenExp: Expression;
  elseifClauses: { condition: Expression; value: Expression }[];
  elseExp: Expression;
}

export interface StringInterpolation extends BaseNode {
  type: "StringInterpolation";
  parts: (string | Expression)[];
}

export interface Attribute {
  name: string;
  args?: (string | number | boolean)[];
}

export type Var =
  | Identifier
  | IndexExpression
  | MemberExpression;

export interface FuncName extends BaseNode {
  type: "FuncName";
  base: Identifier | MemberExpression;
  method?: string;
}

export interface Param extends BaseNode {
  type: "Param";
  name: string;
  typeAnnotation?: Type;
  variadic?: boolean;
}

export type Type =
  | NilType
  | SingletonType
  | IdentifierType
  | TypeofType
  | TableType
  | FunctionType
  | ParenType
  | UnionType
  | IntersectionType;

export interface NilType extends BaseNode {
  type: "NilType";
}

export interface SingletonType extends BaseNode {
  type: "SingletonType";
  value: string | boolean;
}

export interface IdentifierType extends BaseNode {
  type: "IdentifierType";
  name: string;
  module?: string;
  typeParams?: (Type | TypePack | VariadicTypePack | GenericTypePack)[];
}

export interface TypeofType extends BaseNode {
  type: "TypeofType";
  expression: Expression;
}

export interface TableType extends BaseNode {
  type: "TableType";
  arrayType?: Type;
  props?: (TablePropType | TableIndexerType)[];
}

export interface TablePropType extends BaseNode {
  type: "TablePropType";
  name: string;
  propType: Type;
  readOnly?: boolean;
  writeOnly?: boolean;
}

export interface TableIndexerType extends BaseNode {
  type: "TableIndexerType";
  indexType: Type;
  valueType: Type;
  readOnly?: boolean;
  writeOnly?: boolean;
}

export interface FunctionType extends BaseNode {
  type: "FunctionType";
  generics?: string[];
  params: BoundType[];
  returnType: ReturnType;
}

export interface ParenType extends BaseNode {
  type: "ParenType";
  inner: Type;
}

export interface UnionType extends BaseNode {
  type: "UnionType";
  types: (SimpleTypeWithOptional)[];
}

export interface IntersectionType extends BaseNode {
  type: "IntersectionType";
  types: Type[];
}

export type SimpleTypeWithOptional = { type: Type; optional?: boolean };

export interface TypePack extends BaseNode {
  type: "TypePack";
  types: Type[];
}

export interface VariadicTypePack extends BaseNode {
  type: "VariadicTypePack";
  inner: Type;
}

export interface GenericTypePack extends BaseNode {
  type: "GenericTypePack";
  name: string;
}

export type BoundType =
  | { name?: string; type: Type }
  | GenericTypePack
  | VariadicTypePack;

export type ReturnType = Type | TypePack | GenericTypePack | VariadicTypePack;

export interface GenericTypeListWithDefaults extends BaseNode {
  type: "GenericTypeListWithDefaults";
  params: { name: string; default?: Type | TypePack | VariadicTypePack | GenericTypePack }[];
}
