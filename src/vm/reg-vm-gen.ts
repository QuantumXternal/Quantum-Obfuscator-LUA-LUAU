import { RegOp, REG_OPCODE_COUNT, RK_OFFSET } from "./bytecode.js";
import type { RegBytecodeChunk, Constant } from "./bytecode.js";
import { randomBytes } from "crypto";
import { writeFileSync as _dumpWrite } from "fs";
import { encryptAndEncode, compressToBase85, compressBytesToBase85 } from "./lzma.js";
import { generateBootstrap } from "./bootstrap-template.js";

export type RegVMLevel = "debug" | "normal" | "max";

export type RegFeatureFlag =
  | "opcodeShuffle"
  | "stringEncoding"
  | "constantFolding"
  | "minification"
  | "fakeHandlers"
  | "handlerNoise"
  | "antiDebug"
  | "antiTamper"

  | "controlFlowFlattening"
  | "opcodeFusion"
  | "deadCodeInjection"
  | "syntaxInterpreter"
  | "customCipher"
  | "stubCompression"
  | "vmNesting";

export interface RegVMGenOptions {
  level?: RegVMLevel;
  executorGlobals?: boolean;
  polymorphicSeed?: number;
  disableFeatures?: RegFeatureFlag[];
  forceFeatures?: RegFeatureFlag[];

  debugTrace?: boolean;
  _noWatermark?: boolean;

  target?: string;
}

interface BuildCtx {
  level: RegVMLevel;
  seed: number;
  names: NameMap;
  opcodeEncode: number[];
  opcodeDecode: number[];
  doShuffle: boolean;
  encodeStrings: boolean;
  xorKey: number;
  xorStep: number;
  includeExecutor: boolean;
  protoKeys: { pK: string; pC: string; pP: string; pU: string; pN: string };
  debugTrace: boolean;

  sbox: number[];
  sboxInverse: number[];
  helixSeed: number;
  helixMul: number;
  cascadeKey: number;
  cascadeMul: number;
  checkKeyA: number;
  checkKeyB: number;
  checkStepA: number;
  checkStepB: number;
  spiralPrime: number;
  spiralOffset: number;
  layerVariants: number[];

  handlerNoise: boolean;
  /** Never-called decoder twins + junk fragments. Default true = historical output. */
  deadCodeInjection: boolean;
  dispatchVariant: number;
  dispatchMask: number;
  rotSeed: number;
  rotStep: number;
  rotStep2: number;
  usedOps?: Set<number>;
  argPerm: number[][];
}

interface Fragment {
  code: string;
  layer: number;
}

interface NameMap {
  run: string;
  env: string;
  genv: string;
  R: string;
  K: string;
  code: string;
  protos: string;
  ip: string;
  upvalues: string;
  varargs: string;
  vaCount: string;
  maxRegs: string;
  nParams: string;
  handlers: string;
  openUVs: string;
  RK: string;
  top: string;
  retFlag: string;
  retVals: string;
  tPack: string;
  tUnpack: string;
  ic: string;

  bPcall: string;
  bXpcall: string;
  bSelect: string;
  bType: string;
  bTconcat: string;
  bTcreate: string;
  bMfloor: string;
  bIpairs: string;
  bTostring: string;
  bRawget: string;
  bSetmeta: string;
  bBxor: string;
  bBand: string;
  bGetmeta: string;
  bNext: string;

  s1: string;
  s2: string;
  s3: string;
}

let _rngState = 0;

function seedRandom(s: number): void {
  _rngState = s >>> 0;
}

function rng(): number {
  _rngState = (_rngState + 0x6D2B79F5) >>> 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
}

let _nameCounter = 0;

function resetNames(): void { _nameCounter = 0; }

function randomName(len: number = 6): string {

  const pool1 = "abcdefghijklmnopqrstuvwxyzDEFGHIJKLMNOPQRSTUVWXYZ";
  const pool2 = "_abcdefghijklmnopqrstuvwxyz";

  const id = _nameCounter++;

  if (id < pool1.length) {

    return pool1[id];
  }

  const id2 = id - pool1.length;
  if (id2 < pool2.length * pool1.length) {
    const c1 = pool2[Math.floor(id2 / pool1.length)];
    const c2 = pool1[id2 % pool1.length];
    return c1 + c2;
  }

  let name = "_";
  for (let i = 0; i < Math.min(len, 2); i++) {
    name += pool1[Math.floor(rng() * pool1.length)];
  }
  return name;
}

function createNameMap(level: RegVMLevel): NameMap {
  if (level === "debug") {
    return {
      run: "_run", env: "_env", genv: "_genv",
      R: "R", K: "K", code: "code", protos: "protos",
      ip: "ip", upvalues: "upvals", varargs: "VA", vaCount: "VAC",
      maxRegs: "maxRegs", nParams: "nParams",
      handlers: "H", openUVs: "openUVs", RK: "RK", top: "_top",
      retFlag: "_rf", retVals: "_rv",
      tPack: "_tpack", tUnpack: "_tunpack",
      ic: "_ic",
      bPcall: "_pcall", bXpcall: "_xpcall", bSelect: "_select", bType: "_type",
      bTconcat: "_tconcat", bTcreate: "_tcreate", bMfloor: "_mfloor", bIpairs: "_ipairs",
      bTostring: "_tostring", bRawget: "_rawget", bSetmeta: "_setmeta",
      bBxor: "_bxor", bBand: "_band",
      bGetmeta: "_getmeta", bNext: "_next",
      s1: "_s1", s2: "_s2", s3: "_s3",
    };
  }
  return {
    run: randomName(5), env: randomName(4), genv: randomName(4),
    R: randomName(3), K: randomName(3), code: randomName(4),
    protos: randomName(4), ip: randomName(3), upvalues: randomName(5),
    varargs: randomName(4), vaCount: randomName(4),
    maxRegs: randomName(3), nParams: randomName(3),
    handlers: randomName(4), openUVs: randomName(4), RK: randomName(3), top: randomName(3),
    retFlag: randomName(3), retVals: randomName(3),
    tPack: randomName(3), tUnpack: randomName(3),
    ic: randomName(3),
    bPcall: randomName(3), bXpcall: randomName(3), bSelect: randomName(3), bType: randomName(3),
    bTconcat: randomName(3), bTcreate: randomName(3), bMfloor: randomName(3), bIpairs: randomName(3),
    bTostring: randomName(3), bRawget: randomName(3), bSetmeta: randomName(3),
    bBxor: randomName(3), bBand: randomName(3),
    bGetmeta: randomName(3), bNext: randomName(3),
    s1: randomName(2), s2: randomName(2), s3: randomName(2),
  };
}

function toUTF8Bytes(s: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(++i);
      c = ((c - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
      bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return bytes;
}

function luaStringLiteral(s: string): string {
  const bytes = toUTF8Bytes(s);
  let out = '"';
  for (const b of bytes) {
    if (b === 34) out += '\\"';
    else if (b === 92) out += "\\\\";
    else if (b === 10) out += "\\n";
    else if (b === 13) out += "\\r";
    else if (b === 0) out += "\\000";
    else if (b < 32 || b > 126) out += `\\${b.toString().padStart(3, '0')}`;
    else out += String.fromCharCode(b);
  }
  return out + '"';
}

function luaEsc(s: string): string {
  const encChar = (code: number): string => {
    const m = Math.floor(rng() * 3);
    if (m === 0) return '\\' + code;
    if (m === 1) return '\\' + code.toString().padStart(3, '0');
    return '\\' + code;
  };

  if (s.length >= 4 && rng() > 0.5) {
    const mid = 1 + Math.floor(rng() * (s.length - 2));
    const left = Array.from(s.slice(0, mid)).map(c => encChar(c.charCodeAt(0))).join('');
    const right = Array.from(s.slice(mid)).map(c => encChar(c.charCodeAt(0))).join('');
    return `("${left}".."${right}")`;
  }
  return '"' + Array.from(s).map(c => encChar(c.charCodeAt(0))).join('') + '"';
}

function luaStr(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 34) out += '\\"';
    else if (c === 92) out += '\\\\';
    else if (c === 10) out += '\\n';
    else if (c === 13) out += '\\r';
    else if (c === 0) out += '\\000';
    else if (c < 32 || c > 126) out += `\\${c.toString().padStart(3, '0')}`;
    else out += s[i];
  }
  return out + '"';
}

function featureEnabled(options: RegVMGenOptions, flag: RegFeatureFlag, levelDefault: boolean): boolean {
  if (options.disableFeatures?.includes(flag)) return false;
  if (options.forceFeatures?.includes(flag)) return true;
  return levelDefault;
}

function shuffleOpcodes(doShuffle: boolean): { encode: number[]; decode: number[] } {
  const encode: number[] = [];
  const decode: number[] = [];
  for (let i = 0; i < REG_OPCODE_COUNT; i++) { encode[i] = i; decode[i] = i; }
  if (!doShuffle) return { encode, decode };
  for (let i = REG_OPCODE_COUNT - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [encode[i], encode[j]] = [encode[j], encode[i]];
  }
  for (let i = 0; i < REG_OPCODE_COUNT; i++) decode[encode[i]] = i;
  return { encode, decode };
}

function generateArgPerms(doRemap: boolean): number[][] {
  const ALL_PERMS = [[1,2,3],[1,3,2],[2,1,3],[2,3,1],[3,1,2],[3,2,1]];
  const perms: number[][] = [];
  for (let op = 0; op < REG_OPCODE_COUNT; op++) {
    if (!doRemap || op === RegOp.NOP || op === RegOp.EXTRAARG) {
      perms[op] = [1, 2, 3];
    } else {
      perms[op] = ALL_PERMS[Math.floor(rng() * 6)];
    }
  }
  return perms;
}

function mapRegBytecode(code: number[], encode: number[], argPerm: number[][]): number[] {
  const out = [...code];
  for (let i = 0; i < out.length; i += 4) {
    const realOp = out[i];
    if (realOp >= 0 && realOp < encode.length) {
      const A = out[i + 1], B = out[i + 2], C = out[i + 3];
      out[i] = encode[realOp];
      const p = argPerm[realOp];

      out[i + p[0]] = A;
      out[i + p[1]] = B;
      out[i + p[2]] = C;
    }
  }
  return out;
}

function mapRegChunk(chunk: RegBytecodeChunk, encode: number[], argPerm: number[][]): void {
  chunk.code = mapRegBytecode(chunk.code, encode, argPerm);
  if (chunk.protos) for (const p of chunk.protos) mapRegChunk(p, encode, argPerm);
}

const SPIRAL_PRIMES = [
  3,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,
  83,89,97,101,103,107,109,113,127,131,137,139,149,151,157,163,
  167,173,179,181,191,193,197,199,211,223,227,229,233,239,241,
];

function generateSBox(): { sbox: number[]; inverse: number[] } {
  const sbox = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [sbox[i], sbox[j]] = [sbox[j], sbox[i]];
  }
  const inverse = new Array<number>(256);
  for (let i = 0; i < 256; i++) inverse[sbox[i]] = i;
  return { sbox, inverse };
}

function encodeStringBytes(raw: number[], ctx: BuildCtx, constIdx: number): number[] {
  const b = [...raw];
  const salt = constIdx & 0xFF;

  for (let i = 0; i < b.length; i++) b[i] = ctx.sbox[b[i] ^ ((salt + i) & 0xFF)];

  for (let i = 0; i < b.length; i++) b[i] = (b[i] + ((ctx.helixSeed + salt + i * ctx.helixMul) & 0xFF)) & 0xFF;

  for (let i = b.length - 1; i > 0; i--) b[i] ^= ((b[i - 1] * ctx.cascadeMul + ctx.cascadeKey + salt) & 0xFF);

  for (let i = 0; i < b.length; i++) {
    const h = i >> 1;
    const k = (i & 1) === 0
      ? ((ctx.checkKeyA + salt + h * ctx.checkStepA) & 0xFF)
      : ((ctx.checkKeyB + salt + h * ctx.checkStepB) & 0xFF);
    b[i] ^= k;
  }

  for (let i = 0; i < b.length; i++) b[i] ^= ((i * ctx.spiralPrime + ctx.spiralOffset + salt) % 251);
  return b;
}

function serializeConstant(v: Constant, ctx: BuildCtx, idx: number): string {
  if (v === null || v === undefined) return "nil";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (Object.is(v, -0)) return "-0";
    if (!Number.isFinite(v)) {
      if (v === Infinity) return "(1/0)";
      if (v === -Infinity) return "(-1/0)";
      return "(0/0)";
    }
    return String(v);
  }
  if (typeof v === "string") {
    if (ctx.encodeStrings) {
      const bytes = toUTF8Bytes(v);
      const encoded = encodeStringBytes(bytes, ctx, idx);

      if (rng() < 0.5) {

        let lit = '"';
        for (const b of encoded) {
          if (b === 92) lit += '\\\\';
          else if (b === 34) lit += '\\"';
          else if (b === 10) lit += '\\n';
          else if (b === 13) lit += '\\r';
          else if (b === 0) lit += '\\000';
          else if (b < 32 || b > 126) lit += `\\${b.toString().padStart(3, '0')}`;
          else lit += String.fromCharCode(b);
        }
        lit += '"';
        return lit;
      }
      return `{${encoded.join(",")}}`;
    }
    return luaStringLiteral(v);
  }
  return "nil";
}

function serializeConstants(K: Constant[], ctx: BuildCtx): string {
  return `{${K.map((v, i) => serializeConstant(v, ctx, i)).join(",")}}`;
}

function serializeRegCode(code: number[], ctx?: BuildCtx): string {
  if (ctx && ctx.rotSeed > 0) {
    const out = [...code];
    for (let i = 0; i < out.length; i += 4) {
      const luaIp = i + 1;

      const key = (ctx.rotSeed + luaIp * ctx.rotStep + Math.imul(luaIp, luaIp) * ctx.rotStep2) & 0xFF;
      out[i] ^= key;
    }
    return `{${out.join(",")}}`;
  }
  return `{${code.join(",")}}`;
}

function serializeRegProtos(protos: RegBytecodeChunk[] | undefined, ctx: BuildCtx): string {
  if (!protos || protos.length === 0) return "{}";
  const pk = ctx.protoKeys;
  const usePositional = ctx.level !== "debug";
  const items: string[] = [];
  for (const p of protos) {
    const mappedCode = ctx.doShuffle ? mapRegBytecode(p.code, ctx.opcodeEncode, ctx.argPerm) : p.code;
    const sK = serializeConstants(p.K, ctx);
    const sC = serializeRegCode(mappedCode, ctx);
    const sP = serializeRegProtos(p.protos, ctx);
    let sU = "nil";
    if (p.upvalues && p.upvalues.length > 0) {
      sU = `{${p.upvalues.map(uv => `{${uv[0]},${uv[1]}}`).join(",")}}`;
    }
    const nP = p.nParams ?? 0;
    const mR = p.maxRegs ?? 0;
    const isVA = p.isVararg ? "true" : "false";
    if (usePositional) {

      items.push(`{${sK},${sC},${sP},${sU},${nP},${mR},${isVA}}`);
    } else {
      items.push(`{${pk.pK}=${sK},${pk.pC}=${sC},${pk.pP}=${sP},${pk.pU}=${sU},${pk.pN}=${nP},mR=${mR},vA=${isVA}}`);
    }
  }
  return `{${items.join(",")}}`;
}

const REG_OP_NAMES: string[] = [
  "NOP","LOADK","LOADNIL","LOADBOOL","MOVE","GETGLOBAL","SETGLOBAL",
  "GETTABLE","SETTABLE","NEWTABLE","ADD","SUB","MUL","DIV","MOD",
  "POW","IDIV","UNM","NOT","LEN","CONCAT","JMP","EQ","LT","LE",
  "TEST","TESTSET","CALL","TAILCALL","RETURN","FORPREP","FORLOOP",
  "TFORLOOP","SETLIST","CLOSURE","VARARG","SELF","GETUPVAL","SETUPVAL",
  "CLOSEUPVAL","PCALL","XPCALL","ITERPREP","LOADKX","EXTRAARG",
  "F_TEST_JMP","F_EQ_JMP","F_LT_JMP","F_LE_JMP","F_TESTSET_JMP",
  "F_GGET","F_LOADKK","F_MOVE_MOVE","F_SELF_CALL","F_GGET_CALL",
  "F_LOADK_RET","F_MOVE_RET",
];

type HandlerGen = (n: NameMap, ctx: BuildCtx) => string;

const handlerRegistry: Map<RegOp, HandlerGen> = new Map();

function registerHandler(op: RegOp, gen: HandlerGen): void {
  handlerRegistry.set(op, gen);
}

registerHandler(RegOp.NOP, () => ``);

registerHandler(RegOp.LOADK, (n) =>
  `${n.R}[A+1]=${n.K}[B+1]`);

registerHandler(RegOp.LOADNIL, (n) =>
  `for _i=A,A+B do ${n.R}[_i+1]=nil end`);

registerHandler(RegOp.LOADBOOL, (n) =>
  `${n.R}[A+1]=(B~=0);if C~=0 then ${n.ip}=${n.ip}+4 end`);

registerHandler(RegOp.MOVE, (n) =>
  `${n.R}[A+1]=${n.R}[B+1]`);

registerHandler(RegOp.LOADKX, (n) =>
  `local ex=${n.code}[${n.ip}+1];${n.R}[A+1]=${n.K}[ex+1];${n.ip}=${n.ip}+4`);

registerHandler(RegOp.EXTRAARG, () => ``);

registerHandler(RegOp.GETGLOBAL, (n) => {
  const dbg = process.env.DEBUG_VM === '1';
  const nilChk = dbg ? `;if ${n.R}[A+1]==nil then warn("[GETGLOBAL] nil: "..tostring(_k)) end` : '';
  return `do local _k=${n.K}[B+1];if ${n.ic}[1]==_k then ${n.R}[A+1]=${n.ic}[2] else local _v=${n.env}[_k];${n.R}[A+1]=_v;${n.ic}[1]=_k;${n.ic}[2]=_v end${nilChk} end`;
});

registerHandler(RegOp.SETGLOBAL, (n) =>
  `do ${n.env}[${n.K}[B+1]]=${n.R}[A+1];${n.ic}[1]=nil end`);

registerHandler(RegOp.GETTABLE, (n) => {
  const dbg = process.env.DEBUG_VM === '1';
  if (dbg) return `do if ${n.R}[B+1]==nil then warn("[GETTABLE] nil base, key="..tostring(${n.RK}(C)).." K="..tostring(${n.K}[B+1])) end;${n.R}[A+1]=${n.R}[B+1][${n.RK}(C)] end`;
  return `${n.R}[A+1]=${n.R}[B+1][${n.RK}(C)]`;
});

registerHandler(RegOp.SETTABLE, (n) =>
  `${n.R}[A+1][${n.RK}(B)]=${n.RK}(C)`);

registerHandler(RegOp.NEWTABLE, (n) =>
  `${n.R}[A+1]={}`);

registerHandler(RegOp.SETLIST, (n) =>
  `do local t=${n.R}[A+1];local _b=B;if _b==0 then _b=${n.top}-(A+1) end;local base=C-1;for _i=1,_b do t[base+_i]=${n.R}[A+1+_i] end end`);

registerHandler(RegOp.SELF, (n) =>
  `${n.R}[A+2]=${n.R}[B+1];${n.R}[A+1]=${n.R}[B+1][${n.RK}(C)]`);

registerHandler(RegOp.ADD, (n) => `${n.R}[A+1]=${n.RK}(B)+${n.RK}(C)`);
registerHandler(RegOp.SUB, (n) => `${n.R}[A+1]=${n.RK}(B)-${n.RK}(C)`);
registerHandler(RegOp.MUL, (n) => `${n.R}[A+1]=${n.RK}(B)*${n.RK}(C)`);
registerHandler(RegOp.DIV, (n) => `${n.R}[A+1]=${n.RK}(B)/${n.RK}(C)`);
registerHandler(RegOp.MOD, (n) => `${n.R}[A+1]=${n.RK}(B)%${n.RK}(C)`);
registerHandler(RegOp.POW, (n) => `${n.R}[A+1]=${n.RK}(B)^${n.RK}(C)`);
registerHandler(RegOp.IDIV, (n) => `${n.R}[A+1]=${n.bMfloor}(${n.RK}(B)/${n.RK}(C))`);

registerHandler(RegOp.UNM, (n) => `${n.R}[A+1]=-${n.R}[B+1]`);
registerHandler(RegOp.NOT, (n) => `${n.R}[A+1]=not ${n.R}[B+1]`);
registerHandler(RegOp.LEN, (n) => `${n.R}[A+1]=#${n.R}[B+1]`);

registerHandler(RegOp.CONCAT, (n) =>
  `do if C-B<=1 then ${n.R}[A+1]=${n.R}[B+1]..${n.R}[C+1] ` +
  `else local _t={};for _i=B,C do _t[#_t+1]=${n.R}[_i+1] end;${n.R}[A+1]=${n.bTconcat}(_t) end end`);

registerHandler(RegOp.JMP, (n) =>
  `${n.ip}=${n.ip}+B*4`);

registerHandler(RegOp.EQ, (n) =>
  `if (${n.RK}(B)==${n.RK}(C))~=(A~=0) then ${n.ip}=${n.ip}+4 end`);

registerHandler(RegOp.LT, (n) =>
  `if (${n.RK}(B)<${n.RK}(C))~=(A~=0) then ${n.ip}=${n.ip}+4 end`);

registerHandler(RegOp.LE, (n) =>
  `if (${n.RK}(B)<=${n.RK}(C))~=(A~=0) then ${n.ip}=${n.ip}+4 end`);

registerHandler(RegOp.TEST, (n) =>
  `if (not ${n.R}[A+1])==(C~=0) then ${n.ip}=${n.ip}+4 end`);

registerHandler(RegOp.TESTSET, (n) =>
  `if (not ${n.R}[B+1])==(C~=0) then ${n.ip}=${n.ip}+4 else ${n.R}[A+1]=${n.R}[B+1] end`);

registerHandler(RegOp.CALL, (n) => {

  const storeR = () =>
    `if C==0 then for _i=1,r.n do ${n.R}[A+_i]=r[_i] end;${n.top}=A+r.n ` +
    `else for _i=1,C-1 do ${n.R}[A+_i]=r[_i] end end`;
  return `do local f=${n.R}[A+1];local r;` +
    `if B==1 then r=${n.tPack}(f()) ` +
    `elseif B==2 then r=${n.tPack}(f(${n.R}[A+2])) ` +
    `elseif B==3 then r=${n.tPack}(f(${n.R}[A+2],${n.R}[A+3])) ` +
    `elseif B==0 then r=${n.tPack}(f(${n.tUnpack}(${n.R},A+2,${n.top}))) ` +
    `else r=${n.tPack}(f(${n.tUnpack}(${n.R},A+2,A+B))) end;` +
    `${storeR()} end`;
});

registerHandler(RegOp.TAILCALL, (n) =>
  `do local f=${n.R}[A+1];` +
  `if B==1 then return f() ` +
  `elseif B==2 then return f(${n.R}[A+2]) ` +
  `elseif B==3 then return f(${n.R}[A+2],${n.R}[A+3]) ` +
  `elseif B==0 then return f(${n.tUnpack}(${n.R},A+2,${n.top})) ` +
  `else return f(${n.tUnpack}(${n.R},A+2,A+B)) end end`);

registerHandler(RegOp.RETURN, (n) =>
  `do if B==0 then return ${n.tUnpack}(${n.R},A+1,${n.top}) ` +
  `elseif B==1 then return ` +
  `else return ${n.tUnpack}(${n.R},A+1,A+B-1) end end`);

registerHandler(RegOp.FORPREP, (n) =>
  `${n.R}[A+1]=${n.R}[A+1]-${n.R}[A+3];${n.ip}=${n.ip}+B*4`);

registerHandler(RegOp.FORLOOP, (n) =>
  `do local step=${n.R}[A+3];local idx=${n.R}[A+1]+step;${n.R}[A+1]=idx;` +
  `local lim=${n.R}[A+2];if step>0 then if idx<=lim then ${n.ip}=${n.ip}+B*4;${n.R}[A+4]=idx end ` +
  `else if idx>=lim then ${n.ip}=${n.ip}+B*4;${n.R}[A+4]=idx end end end`);

registerHandler(RegOp.TFORLOOP, (n) =>
  `do local f=${n.R}[A+1];local s=${n.R}[A+2];local v=${n.R}[A+3];` +
  `local r={f(s,v)};for _i=1,C do ${n.R}[A+3+_i]=r[_i] end;` +
  `if r[1]~=nil then ${n.R}[A+3]=r[1];${n.ip}=${n.ip}+4 end end`);

registerHandler(RegOp.ITERPREP, (n) =>
  `do local it=${n.R}[A+1];if ${n.bType}(it)=="table" then ` +
  `local ok,mt=${n.bPcall}(${n.bGetmeta},it);if ok and ${n.bType}(mt)=="table" and mt.__iter then ` +
  `${n.R}[A+1]=mt.__iter(it) else ${n.R}[A+1]=${n.bNext};${n.R}[A+2]=it;${n.R}[A+3]=nil end end end`);

registerHandler(RegOp.GETUPVAL, (n) =>
  `do local _b=${n.upvalues}[B+1];if _b[2] then ${n.R}[A+1]=_b[1][_b[2]] else ${n.R}[A+1]=_b[1] end end`);

registerHandler(RegOp.SETUPVAL, (n) =>
  `do local _b=${n.upvalues}[B+1];if _b[2] then _b[1][_b[2]]=${n.R}[A+1] else _b[1]=${n.R}[A+1] end end`);

registerHandler(RegOp.CLOSEUPVAL, (n) =>
  `do local _n=0;for _i=1,#${n.openUVs} do local _b=${n.openUVs}[_i];if _b[2]>=A+1 then ` +
  `_b[1]=_b[1][_b[2]];_b[2]=nil else _n=_n+1;${n.openUVs}[_n]=_b end end;` +
  `for _i=_n+1,#${n.openUVs} do ${n.openUVs}[_i]=nil end end`);

registerHandler(RegOp.VARARG, (n) =>
  `do if B==0 then for _i=1,${n.vaCount} do ${n.R}[A+_i]=${n.varargs}[_i] end;${n.top}=A+${n.vaCount} ` +
  `else for _i=1,B-1 do ${n.R}[A+_i]=${n.varargs}[_i] end end end`);

registerHandler(RegOp.CLOSURE, (n, ctx) => {
  const pos = ctx.level !== "debug";

  const { pK, pC, pP, pU, pN } = ctx.protoKeys;
  const gK = pos ? "[1]" : `.${pK}`;
  const gC = pos ? "[2]" : `.${pC}`;
  const gP = pos ? "[3]" : `.${pP}`;
  const gU = pos ? "[4]" : `.${pU}`;
  const gN = pos ? "[5]" : `.${pN}`;
  const gMR = pos ? "[6]" : ".mR";
  const gVA = pos ? "[7]" : ".vA";
  return `do local proto=${n.protos}[B+1];if proto then ` +
    `local nU={};if proto${gU} then for _ui,_ud in ${n.bIpairs}(proto${gU}) do ` +
    `if _ud[1]==1 then local _b;for _oi=1,#${n.openUVs} do if ${n.openUVs}[_oi][2]==_ud[2]+1 then _b=${n.openUVs}[_oi];break end end;` +
    `if not _b then _b={${n.R},_ud[2]+1};${n.openUVs}[#${n.openUVs}+1]=_b end;nU[_ui]=_b ` +
    `else nU[_ui]=${n.upvalues}[_ud[2]+1] end end end;` +
    `${n.R}[A+1]=function(...) return ${n.run}(proto${gK},proto${gC},proto${gP},proto${gU} and nU or {},proto${gN},proto${gMR},proto${gVA},${n.env},...) end ` +
    `else ${n.R}[A+1]=nil end end`;
});

registerHandler(RegOp.PCALL, (n) =>
  `do local f=${n.R}[A+1];local r;` +
  `if B==1 then r=${n.tPack}(${n.bPcall}(f)) ` +
  `elseif B==2 then r=${n.tPack}(${n.bPcall}(f,${n.R}[A+2])) ` +
  `elseif B==3 then r=${n.tPack}(${n.bPcall}(f,${n.R}[A+2],${n.R}[A+3])) ` +
  `else r=${n.tPack}(${n.bPcall}(f,${n.tUnpack}(${n.R},A+2,A+B))) end;` +
  `if C==0 then for _i=1,r.n do ${n.R}[A+_i]=r[_i] end;${n.top}=A+r.n ` +
  `else for _i=1,C-1 do ${n.R}[A+_i]=r[_i] end end end`);

registerHandler(RegOp.XPCALL, (n) =>
  `do local f=${n.R}[A+1];local eh=${n.R}[A+2];local r;` +
  `if B<=2 then r=${n.tPack}(${n.bXpcall}(f,eh)) ` +
  `elseif B==3 then r=${n.tPack}(${n.bXpcall}(f,eh,${n.R}[A+3])) ` +
  `else r=${n.tPack}(${n.bXpcall}(f,eh,${n.tUnpack}(${n.R},A+3,A+B))) end;` +
  `if C==0 then for _i=1,r.n do ${n.R}[A+_i]=r[_i] end;${n.top}=A+r.n ` +
  `else for _i=1,C-1 do ${n.R}[A+_i]=r[_i] end end end`);

registerHandler(RegOp.FUSED_TEST_JMP, (n) => {
  const v = Math.floor(rng() * 3);
  if (v === 0)
    return `do local _j=${n.code}[${n.ip}+2];if (not ${n.R}[A+1])==(C~=0) then ${n.ip}=${n.ip}+4 else ${n.ip}=${n.ip}+4+_j*4 end end`;
  if (v === 1)
    return `do local _j=${n.code}[${n.ip}+2];if (not ${n.R}[A+1])~=(C~=0) then ${n.ip}=${n.ip}+4+_j*4 else ${n.ip}=${n.ip}+4 end end`;
  return `do local _o=${n.code}[${n.ip}+2]*4;${n.ip}=${n.ip}+4;if (not ${n.R}[A+1])~=(C~=0) then ${n.ip}=${n.ip}+_o end end`;
});

registerHandler(RegOp.FUSED_EQ_JMP, (n) => {
  const v = Math.floor(rng() * 3);
  if (v === 0)
    return `do local _j=${n.code}[${n.ip}+2];if (${n.RK}(B)==${n.RK}(C))~=(A~=0) then ${n.ip}=${n.ip}+4 else ${n.ip}=${n.ip}+4+_j*4 end end`;
  if (v === 1)
    return `do local _j=${n.code}[${n.ip}+2];if (${n.RK}(B)==${n.RK}(C))==(A~=0) then ${n.ip}=${n.ip}+4+_j*4 else ${n.ip}=${n.ip}+4 end end`;
  return `do local _lv,_rv=${n.RK}(B),${n.RK}(C);local _j=${n.code}[${n.ip}+2];if (_lv==_rv)~=(A~=0) then ${n.ip}=${n.ip}+4 else ${n.ip}=${n.ip}+4+_j*4 end end`;
});

registerHandler(RegOp.FUSED_LT_JMP, (n) => {
  const v = Math.floor(rng() * 3);
  if (v === 0)
    return `do local _j=${n.code}[${n.ip}+2];if (${n.RK}(B)<${n.RK}(C))~=(A~=0) then ${n.ip}=${n.ip}+4 else ${n.ip}=${n.ip}+4+_j*4 end end`;
  if (v === 1)
    return `do local _j=${n.code}[${n.ip}+2];if (${n.RK}(B)<${n.RK}(C))==(A~=0) then ${n.ip}=${n.ip}+4+_j*4 else ${n.ip}=${n.ip}+4 end end`;
  return `do local _lv,_rv=${n.RK}(B),${n.RK}(C);local _o=${n.code}[${n.ip}+2]*4;${n.ip}=${n.ip}+4;if (_lv<_rv)==(A~=0) then ${n.ip}=${n.ip}+_o end end`;
});

registerHandler(RegOp.FUSED_LE_JMP, (n) => {
  const v = Math.floor(rng() * 3);
  if (v === 0)
    return `do local _j=${n.code}[${n.ip}+2];if (${n.RK}(B)<=${n.RK}(C))~=(A~=0) then ${n.ip}=${n.ip}+4 else ${n.ip}=${n.ip}+4+_j*4 end end`;
  if (v === 1)
    return `do local _j=${n.code}[${n.ip}+2];if (${n.RK}(B)<=${n.RK}(C))==(A~=0) then ${n.ip}=${n.ip}+4+_j*4 else ${n.ip}=${n.ip}+4 end end`;
  return `do local _lv,_rv=${n.RK}(B),${n.RK}(C);local _o=${n.code}[${n.ip}+2]*4;${n.ip}=${n.ip}+4;if (_lv<=_rv)==(A~=0) then ${n.ip}=${n.ip}+_o end end`;
});

registerHandler(RegOp.FUSED_TESTSET_JMP, (n) => {
  const v = Math.floor(rng() * 2);
  if (v === 0)
    return `do local _j=${n.code}[${n.ip}+2];if (not ${n.R}[B+1])==(C~=0) then ${n.ip}=${n.ip}+4 else ${n.R}[A+1]=${n.R}[B+1];${n.ip}=${n.ip}+4+_j*4 end end`;
  return `do local _bv=${n.R}[B+1];local _j=${n.code}[${n.ip}+2];if (not _bv)==(C~=0) then ${n.ip}=${n.ip}+4 else ${n.R}[A+1]=_bv;${n.ip}=${n.ip}+4+_j*4 end end`;
});

registerHandler(RegOp.FUSED_GGET, (n) => {
  const v = Math.floor(rng() * 3);
  const dbg = process.env.DEBUG_VM === '1';
  const nilG = dbg ? `if _g==nil then warn("[FUSED_GGET] nil global: "..tostring(${n.K}[B+1])) end;` : '';
  if (v === 0)
    return `do local _A2=${n.code}[${n.ip}+1];local _C2=${n.code}[${n.ip}+3];local _g=${n.env}[${n.K}[B+1]];${nilG}${n.R}[A+1]=_g;${n.R}[_A2+1]=_g[${n.RK}(_C2)];${n.ip}=${n.ip}+4 end`;
  if (v === 1)
    return `do local _A2=${n.code}[${n.ip}+1];local _C2=${n.code}[${n.ip}+3];local _g=${n.env}[${n.K}[B+1]];${nilG}${n.R}[A+1]=_g;${n.R}[_A2+1]=_g[${n.RK}(_C2)];${n.ip}=${n.ip}+4 end`;
  return `do local _g=${n.env}[${n.K}[B+1]];${nilG}${n.R}[A+1]=_g;local _k=${n.RK}(${n.code}[${n.ip}+3]);${n.R}[${n.code}[${n.ip}+1]+1]=_g[_k];${n.ip}=${n.ip}+4 end`;
});

registerHandler(RegOp.FUSED_LOADKK, (n) => {
  const v = Math.floor(rng() * 2);
  if (v === 0)
    return `do local _A2=${n.code}[${n.ip}+1];local _B2=${n.code}[${n.ip}+2];${n.R}[A+1]=${n.K}[B+1];${n.R}[_A2+1]=${n.K}[_B2+1];${n.ip}=${n.ip}+4 end`;
  return `do ${n.R}[A+1]=${n.K}[B+1];${n.R}[${n.code}[${n.ip}+1]+1]=${n.K}[${n.code}[${n.ip}+2]+1];${n.ip}=${n.ip}+4 end`;
});

registerHandler(RegOp.FUSED_MOVE_MOVE, (n) => {
  const v = Math.floor(rng() * 2);
  if (v === 0)
    return `do local _A2=${n.code}[${n.ip}+1];local _B2=${n.code}[${n.ip}+2];${n.R}[A+1]=${n.R}[B+1];${n.R}[_A2+1]=${n.R}[_B2+1];${n.ip}=${n.ip}+4 end`;
  return `do ${n.R}[A+1]=${n.R}[B+1];${n.R}[${n.code}[${n.ip}+1]+1]=${n.R}[${n.code}[${n.ip}+2]+1];${n.ip}=${n.ip}+4 end`;
});

registerHandler(RegOp.FUSED_SELF_CALL, (n) => {
  const v = Math.floor(rng() * 2);
  const callBody =
    `local _B2=${n.code}[${n.ip}+2];local _C2=${n.code}[${n.ip}+3];${n.ip}=${n.ip}+4;` +
    `local r;` +
    `if _B2==2 then r=${n.tPack}(f(${n.R}[A+2])) ` +
    `elseif _B2==3 then r=${n.tPack}(f(${n.R}[A+2],${n.R}[A+3])) ` +
    `elseif _B2==0 then r=${n.tPack}(f(${n.tUnpack}(${n.R},A+2,${n.top}))) ` +
    `else r=${n.tPack}(f(${n.tUnpack}(${n.R},A+2,A+_B2))) end;` +
    `if _C2==0 then for _i=1,r.n do ${n.R}[A+_i]=r[_i] end;${n.top}=A+r.n ` +
    `else for _i=1,_C2-1 do ${n.R}[A+_i]=r[_i] end end`;
  if (v === 0)
    return `do ${n.R}[A+2]=${n.R}[B+1];local f=${n.R}[B+1][${n.RK}(C)];${n.R}[A+1]=f;${callBody} end`;
  return `do local _s=${n.R}[B+1];${n.R}[A+2]=_s;local f=_s[${n.RK}(C)];${n.R}[A+1]=f;${callBody} end`;
});

registerHandler(RegOp.FUSED_GGET_CALL, (n) => {

  const v = Math.floor(rng() * 2);
  const readSlot2 = `local _A2=${n.code}[${n.ip}+1];local _C2=${n.code}[${n.ip}+3]`;
  const readSlot3 = `local _A3=${n.code}[${n.ip}+5];local _B3=${n.code}[${n.ip}+6];local _C3=${n.code}[${n.ip}+7]`;
  const gget = v === 0
    ? `local _g=${n.env}[${n.K}[B+1]];${n.R}[A+1]=_g;local f=_g[${n.RK}(_C2)];${n.R}[_A2+1]=f`
    : `local _g=${n.env}[${n.K}[B+1]];${n.R}[A+1]=_g;${n.R}[_A2+1]=_g[${n.RK}(_C2)];local f=${n.R}[_A2+1]`;
  const callBody =
    `local r;` +
    `if _B3==1 then r=${n.tPack}(f()) ` +
    `elseif _B3==2 then r=${n.tPack}(f(${n.R}[_A3+2])) ` +
    `elseif _B3==3 then r=${n.tPack}(f(${n.R}[_A3+2],${n.R}[_A3+3])) ` +
    `elseif _B3==0 then r=${n.tPack}(f(${n.tUnpack}(${n.R},_A3+2,${n.top}))) ` +
    `else r=${n.tPack}(f(${n.tUnpack}(${n.R},_A3+2,_A3+_B3))) end;` +
    `if _C3==0 then for _i=1,r.n do ${n.R}[_A3+_i]=r[_i] end;${n.top}=_A3+r.n ` +
    `else for _i=1,_C3-1 do ${n.R}[_A3+_i]=r[_i] end end`;
  return `do ${readSlot2};${readSlot3};${gget};${n.ip}=${n.ip}+8;${callBody} end`;
});

registerHandler(RegOp.FUSED_LOADK_RET, (n) => {
  const v = Math.floor(rng() * 2);
  if (v === 0)
    return `do ${n.R}[A+1]=${n.K}[B+1];${n.ip}=${n.ip}+4;return ${n.R}[A+1] end`;
  return `do local _v=${n.K}[B+1];${n.ip}=${n.ip}+4;return _v end`;
});

registerHandler(RegOp.FUSED_MOVE_RET, (n) => {
  const v = Math.floor(rng() * 3);
  if (v === 0)
    return `do local _A2=${n.code}[${n.ip}+1];local _B2=${n.code}[${n.ip}+2];${n.R}[A+1]=${n.R}[B+1];${n.ip}=${n.ip}+4;if _B2==0 then return ${n.tUnpack}(${n.R},_A2+1,${n.top}) elseif _B2==1 then return else return ${n.tUnpack}(${n.R},_A2+1,_A2+_B2-1) end end`;
  if (v === 1)
    return `do ${n.R}[A+1]=${n.R}[B+1];local _A2=${n.code}[${n.ip}+1];local _B2=${n.code}[${n.ip}+2];${n.ip}=${n.ip}+4;if _B2==2 then return ${n.R}[_A2+1] elseif _B2==1 then return elseif _B2==0 then return ${n.tUnpack}(${n.R},_A2+1,${n.top}) else return ${n.tUnpack}(${n.R},_A2+1,_A2+_B2-1) end end`;
  return `do ${n.R}[A+1]=${n.R}[B+1];local _B2=${n.code}[${n.ip}+2];if _B2==0 then ${n.ip}=${n.ip}+4;return ${n.tUnpack}(${n.R},${n.code}[${n.ip}-3]+1,${n.top}) elseif _B2==1 then ${n.ip}=${n.ip}+4;return else ${n.ip}=${n.ip}+4;return ${n.tUnpack}(${n.R},${n.code}[${n.ip}-3]+1,${n.code}[${n.ip}-3]+_B2-1) end end`;
});

function computeJumpTargets(code: number[]): Set<number> {
  const targets = new Set<number>();
  for (let i = 0; i < code.length; i += 4) {
    const op = code[i];
    if (op === RegOp.JMP as number || op === RegOp.FORPREP as number || op === RegOp.FORLOOP as number) {
      const B = code[i + 2];
      const target = i + 4 + B * 4;
      if (target >= 0 && target < code.length) targets.add(target);
    }

    if (op === RegOp.LOADBOOL as number && code[i + 3] !== 0) {
      targets.add(i + 8);
    }
  }
  return targets;
}

function flattenControlFlow(chunk: RegBytecodeChunk): number {
  let totalBlocks = 0;

  function flattenCode(code: number[]): number[] {
    if (code.length <= 16) return code;

    const targets = new Set<number>();
    targets.add(0);
    for (let i = 0; i < code.length; i += 4) {
      const op = code[i];
      if (op === (RegOp.JMP as number) || op === (RegOp.FORPREP as number) || op === (RegOp.FORLOOP as number)) {
        const B = code[i + 2];
        const t = i + 4 + B * 4;
        if (t >= 0 && t <= code.length) targets.add(t);
      }
      if (op === (RegOp.LOADBOOL as number) && code[i + 3] !== 0) targets.add(i + 8);
      if (op === (RegOp.EQ as number) || op === (RegOp.LT as number) || op === (RegOp.LE as number) ||
          op === (RegOp.TEST as number) || op === (RegOp.TESTSET as number) || op === (RegOp.TFORLOOP as number)) {
        targets.add(i + 8);
      }
      if (op === (RegOp.FUSED_TEST_JMP as number) || op === (RegOp.FUSED_EQ_JMP as number) ||
          op === (RegOp.FUSED_LT_JMP as number) || op === (RegOp.FUSED_LE_JMP as number) ||
          op === (RegOp.FUSED_TESTSET_JMP as number)) {
        const _j = code[i + 6];
        const t = i + 8 + _j * 4;
        if (t >= 0 && t <= code.length) targets.add(t);
        targets.add(i + 8);
      }
    }

    for (let i = 0; i < code.length; i += 4) {
      const op = code[i];

      if (op === (RegOp.EQ as number) || op === (RegOp.LT as number) || op === (RegOp.LE as number) ||
          op === (RegOp.TEST as number) || op === (RegOp.TESTSET as number) || op === (RegOp.TFORLOOP as number)) {
        targets.delete(i + 4);
      }

      if (op === (RegOp.LOADBOOL as number) && code[i + 3] !== 0) targets.delete(i + 4);

      if (op === (RegOp.LOADKX as number)) targets.delete(i + 4);

      if (op === (RegOp.SETLIST as number) && code[i + 3] === 0) targets.delete(i + 4);

      if (op === (RegOp.FUSED_TEST_JMP as number) || op === (RegOp.FUSED_EQ_JMP as number) ||
          op === (RegOp.FUSED_LT_JMP as number) || op === (RegOp.FUSED_LE_JMP as number) ||
          op === (RegOp.FUSED_TESTSET_JMP as number) || op === (RegOp.FUSED_GGET as number) ||
          op === (RegOp.FUSED_LOADKK as number) || op === (RegOp.FUSED_MOVE_MOVE as number) ||
          op === (RegOp.FUSED_SELF_CALL as number) || op === (RegOp.FUSED_LOADK_RET as number) ||
          op === (RegOp.FUSED_MOVE_RET as number)) {
        targets.delete(i + 4);
      }

      if (op === (RegOp.FUSED_GGET_CALL as number)) {
        targets.delete(i + 4);
        targets.delete(i + 8);
      }
    }

    for (const t of targets) { if (t < 0 || t >= code.length) targets.delete(t); }

    const unsafeSplit = new Set<number>();
    for (let i = 0; i < code.length; i += 4) {
      const op = code[i];
      if (op === (RegOp.EQ as number) || op === (RegOp.LT as number) || op === (RegOp.LE as number) ||
          op === (RegOp.TEST as number) || op === (RegOp.TESTSET as number) || op === (RegOp.TFORLOOP as number)) {
        unsafeSplit.add(i + 4);
      }
      if (op === (RegOp.LOADBOOL as number) && code[i + 3] !== 0) unsafeSplit.add(i + 4);
      if (op === (RegOp.LOADKX as number)) unsafeSplit.add(i + 4);
      if (op === (RegOp.SETLIST as number) && code[i + 3] === 0) unsafeSplit.add(i + 4);
      if (op === (RegOp.FUSED_TEST_JMP as number) || op === (RegOp.FUSED_EQ_JMP as number) ||
          op === (RegOp.FUSED_LT_JMP as number) || op === (RegOp.FUSED_LE_JMP as number) ||
          op === (RegOp.FUSED_TESTSET_JMP as number) || op === (RegOp.FUSED_GGET as number) ||
          op === (RegOp.FUSED_LOADKK as number) || op === (RegOp.FUSED_MOVE_MOVE as number) ||
          op === (RegOp.FUSED_SELF_CALL as number) || op === (RegOp.FUSED_LOADK_RET as number) ||
          op === (RegOp.FUSED_MOVE_RET as number)) {
        unsafeSplit.add(i + 4);
      }
      if (op === (RegOp.FUSED_GGET_CALL as number)) {
        unsafeSplit.add(i + 4);
        unsafeSplit.add(i + 8);
      }
    }

    const splitThreshold = 3 + Math.floor(rng() * 3);
    const sortedTargets = Array.from(targets).sort((a, b) => a - b);
    for (let bi = 0; bi < sortedTargets.length; bi++) {
      const bStart = sortedTargets[bi];
      const bEnd = bi + 1 < sortedTargets.length ? sortedTargets[bi + 1] : code.length;
      const bInstrCount = (bEnd - bStart) / 4;
      if (bInstrCount > splitThreshold) {

        const candidates: number[] = [];
        for (let pos = bStart + splitThreshold * 4; pos < bEnd - 4; pos += 4) {
          if (!unsafeSplit.has(pos) && !targets.has(pos)) {
            candidates.push(pos);
          }
        }

        const nSplits = Math.min(candidates.length, 1 + Math.floor(rng() * 3));
        for (let si = candidates.length - 1; si > 0; si--) {
          const sj = Math.floor(rng() * (si + 1));
          [candidates[si], candidates[sj]] = [candidates[sj], candidates[si]];
        }
        for (let si = 0; si < nSplits; si++) {
          targets.add(candidates[si]);
        }
      }
    }

    const blockStarts = Array.from(targets).sort((a, b) => a - b);
    if (blockStarts.length < 3) return code;

    interface JRef { lo: number; ot: number; }
    interface Blk { os: number; oe: number; ins: number[]; jr: JRef[]; }
    const blocks: Blk[] = [];

    for (let bi = 0; bi < blockStarts.length; bi++) {
      const start = blockStarts[bi];
      const end = bi + 1 < blockStarts.length ? blockStarts[bi + 1] : code.length;
      const ins = code.slice(start, end);
      const jr: JRef[] = [];
      const bLen = ins.length;

      for (let j = 0; j < bLen; j += 4) {
        const op = ins[j];
        if (op === (RegOp.JMP as number) || op === (RegOp.FORPREP as number) || op === (RegOp.FORLOOP as number)) {
          jr.push({ lo: j + 2, ot: start + j + 4 + ins[j + 2] * 4 });
        }
        if (op === (RegOp.FUSED_TEST_JMP as number) || op === (RegOp.FUSED_EQ_JMP as number) ||
            op === (RegOp.FUSED_LT_JMP as number) || op === (RegOp.FUSED_LE_JMP as number) ||
            op === (RegOp.FUSED_TESTSET_JMP as number)) {
          jr.push({ lo: j + 6, ot: start + j + 8 + ins[j + 6] * 4 });
        }
      }

      const lastOp = ins[bLen - 4];
      const secOp = bLen >= 8 ? ins[bLen - 8] : -1;

      const isTerm = lastOp === (RegOp.JMP as number) || lastOp === (RegOp.RETURN as number) ||
        lastOp === (RegOp.TAILCALL as number) || lastOp === (RegOp.FORPREP as number) ||
        lastOp === (RegOp.FUSED_LOADK_RET as number) || lastOp === (RegOp.FUSED_MOVE_RET as number);

      const isCondJmp = bLen >= 8 &&
        (secOp === (RegOp.EQ as number) || secOp === (RegOp.LT as number) || secOp === (RegOp.LE as number) ||
         secOp === (RegOp.TEST as number) || secOp === (RegOp.TESTSET as number) ||
         secOp === (RegOp.TFORLOOP as number)) && lastOp === (RegOp.JMP as number);

      const isFusedCond = bLen >= 8 &&
        (secOp === (RegOp.FUSED_TEST_JMP as number) || secOp === (RegOp.FUSED_EQ_JMP as number) ||
         secOp === (RegOp.FUSED_LT_JMP as number) || secOp === (RegOp.FUSED_LE_JMP as number) ||
         secOp === (RegOp.FUSED_TESTSET_JMP as number)) && lastOp === (RegOp.NOP as number);

      if (isCondJmp || isFusedCond) {

        ins.push(RegOp.JMP as number, 0, 0, 0);
        jr.push({ lo: ins.length - 2, ot: end });
      } else if (lastOp === (RegOp.FORLOOP as number)) {

        ins.push(RegOp.JMP as number, 0, 0, 0);
        jr.push({ lo: ins.length - 2, ot: end });
      } else if (!isTerm && end < code.length) {

        ins.push(RegOp.JMP as number, 0, 0, 0);
        jr.push({ lo: ins.length - 2, ot: end });
      }

      blocks.push({ os: start, oe: end, ins, jr });
    }

    for (let i = blocks.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    }

    const origToNew = new Map<number, number>();
    let pos = 4;
    for (const b of blocks) {
      const bNew = pos;
      for (let off = 0; off < b.oe - b.os; off += 4) {
        origToNew.set(b.os + off, bNew + off);
      }
      pos += b.ins.length;
    }
    origToNew.set(code.length, pos);

    const entryTarget = origToNew.get(0)!;
    const entryB = (entryTarget - 4) / 4;

    for (const b of blocks) {
      const bNew = origToNew.get(b.os)!;
      for (const ref of b.jr) {
        let nt = origToNew.get(ref.ot);
        if (nt === undefined) {

          for (const b2 of blocks) {
            if (ref.ot >= b2.os && ref.ot < b2.oe) {
              nt = origToNew.get(b2.os)! + (ref.ot - b2.os);
              break;
            }
          }
          if (nt === undefined) { nt = pos; }
        }

        const ipAfter = bNew + ref.lo + 2;
        b.ins[ref.lo] = (nt - ipAfter) / 4;
      }
    }

    const newCode: number[] = [RegOp.JMP as number, 0, entryB, 0];
    for (const b of blocks) newCode.push(...b.ins);

    totalBlocks += blocks.length;
    return newCode;
  }

  chunk.code = flattenCode(chunk.code);
  if (chunk.protos) {
    for (const proto of chunk.protos) {
      totalBlocks += flattenControlFlow(proto);
    }
  }
  return totalBlocks;
}

interface FusionPattern {
  id: number;
  name: string;
  slots: number;
  match: (code: number[], i: number) => boolean;
}

function buildFusionPatterns(enabled: Set<number>): FusionPattern[] {
  const patterns: FusionPattern[] = [];
  const add = (id: number, name: string, slots: number, match: (code: number[], i: number) => boolean) => {
    if (enabled.has(id)) patterns.push({ id, name, slots, match });
  };

  add(RegOp.FUSED_GGET_CALL as number, "GGET_CALL", 3, (c, i) =>
    c[i] === (RegOp.GETGLOBAL as number) &&
    c[i+4] === (RegOp.GETTABLE as number) &&
    c[i+8] === (RegOp.CALL as number) &&
    c[i+4+2] === c[i+1] &&
    c[i+8+1] === c[i+4+1]
  );

  add(RegOp.FUSED_TEST_JMP as number, "TEST_JMP", 2, (c, i) =>
    c[i] === (RegOp.TEST as number) && c[i+4] === (RegOp.JMP as number));

  add(RegOp.FUSED_EQ_JMP as number, "EQ_JMP", 2, (c, i) =>
    c[i] === (RegOp.EQ as number) && c[i+4] === (RegOp.JMP as number));

  add(RegOp.FUSED_LT_JMP as number, "LT_JMP", 2, (c, i) =>
    c[i] === (RegOp.LT as number) && c[i+4] === (RegOp.JMP as number));

  add(RegOp.FUSED_LE_JMP as number, "LE_JMP", 2, (c, i) =>
    c[i] === (RegOp.LE as number) && c[i+4] === (RegOp.JMP as number));

  add(RegOp.FUSED_TESTSET_JMP as number, "TESTSET_JMP", 2, (c, i) =>
    c[i] === (RegOp.TESTSET as number) && c[i+4] === (RegOp.JMP as number));

  add(RegOp.FUSED_GGET as number, "GGET", 2, (c, i) =>
    c[i] === (RegOp.GETGLOBAL as number) &&
    c[i+4] === (RegOp.GETTABLE as number) &&
    c[i+4+2] === c[i+1]
  );

  add(RegOp.FUSED_LOADKK as number, "LOADKK", 2, (c, i) =>
    c[i] === (RegOp.LOADK as number) && c[i+4] === (RegOp.LOADK as number));

  add(RegOp.FUSED_MOVE_MOVE as number, "MOVE_MOVE", 2, (c, i) =>
    c[i] === (RegOp.MOVE as number) && c[i+4] === (RegOp.MOVE as number));

  add(RegOp.FUSED_SELF_CALL as number, "SELF_CALL", 2, (c, i) =>
    c[i] === (RegOp.SELF as number) &&
    c[i+4] === (RegOp.CALL as number) &&
    c[i+4+1] === c[i+1]
  );

  add(RegOp.FUSED_LOADK_RET as number, "LOADK_RET", 2, (c, i) =>
    c[i] === (RegOp.LOADK as number) &&
    c[i+4] === (RegOp.RETURN as number) &&
    c[i+4+1] === c[i+1] && c[i+4+2] === 2
  );

  add(RegOp.FUSED_MOVE_RET as number, "MOVE_RET", 2, (c, i) =>
    c[i] === (RegOp.MOVE as number) && c[i+4] === (RegOp.RETURN as number));

  return patterns;
}

export interface FusionMatchCounts {
  perPattern: { id: number; name: string; matches: number }[];
  /** Greedy disjoint site count in registration order (what a rate-1.0 pass would fuse). */
  greedyTotal: number;
}

const ALL_FUSION_IDS = [
  RegOp.FUSED_GGET_CALL as number,
  RegOp.FUSED_TEST_JMP as number,
  RegOp.FUSED_EQ_JMP as number,
  RegOp.FUSED_LT_JMP as number,
  RegOp.FUSED_LE_JMP as number,
  RegOp.FUSED_TESTSET_JMP as number,
  RegOp.FUSED_GGET as number,
  RegOp.FUSED_LOADKK as number,
  RegOp.FUSED_MOVE_MOVE as number,
  RegOp.FUSED_SELF_CALL as number,
  RegOp.FUSED_LOADK_RET as number,
  RegOp.FUSED_MOVE_RET as number,
];

/**
 * Read-only fusion census over compiler output (main chunk + protos).
 * Counts raw matcher hits per pattern independently (sites may match
 * multiple patterns, e.g. a GGET_CALL site also matches the GGET prefix),
 * plus a greedy disjoint total in registration order mirroring fuseCode
 * minus jump-veto and probabilistic rate. Does not mutate the chunk.
 * Pure observation for the metric layer — no behavior change anywhere.
 */
export function countFusionMatches(chunk: RegBytecodeChunk): FusionMatchCounts {
  const patterns = buildFusionPatterns(new Set(ALL_FUSION_IDS));
  const perPattern = patterns.map((p) => ({ id: p.id, name: p.name, matches: 0 }));
  let greedyTotal = 0;

  const scanIndependent = (code: number[]): void => {
    for (let i = 0; i + 4 <= code.length; i += 4) {
      patterns.forEach((p, pi) => {
        if (i + p.slots * 4 <= code.length && p.match(code, i)) perPattern[pi]!.matches++;
      });
    }
  };

  const scanGreedy = (code: number[]): void => {
    let i = 0;
    while (i + 4 <= code.length) {
      let consumed = false;
      for (const p of patterns) {
        if (i + p.slots * 4 <= code.length && p.match(code, i)) {
          greedyTotal++;
          i += p.slots * 4;
          consumed = true;
          break;
        }
      }
      if (!consumed) i += 4;
    }
  };

  const walk = (c: RegBytecodeChunk): void => {
    scanIndependent(c.code);
    scanGreedy(c.code);
    for (const proto of c.protos ?? []) walk(proto);
  };
  walk(chunk);
  return { perPattern, greedyTotal };
}

function applyFusionPass(chunk: RegBytecodeChunk, enabledPatterns: Set<number>, fusionRate: number): number {
  const patterns = buildFusionPatterns(enabledPatterns);
  let totalFused = 0;

  function fuseCode(code: number[]): number {
    const targets = computeJumpTargets(code);
    let count = 0;
    let i = 0;
    while (i < code.length - 4) {
      let matched = false;
      for (const pat of patterns) {

        if (i + pat.slots * 4 > code.length) continue;

        let targetConflict = false;
        for (let s = 1; s < pat.slots; s++) {
          if (targets.has(i + s * 4)) { targetConflict = true; break; }
        }
        if (targetConflict) continue;

        if (!pat.match(code, i)) continue;

        if (rng() > fusionRate) { i += 4; matched = true; break; }

        code[i] = pat.id;

        for (let s = 1; s < pat.slots; s++) {
          code[i + s * 4] = RegOp.NOP as number;
        }
        count++;
        i += pat.slots * 4;
        matched = true;
        break;
      }
      if (!matched) i += 4;
    }
    return count;
  }

  totalFused += fuseCode(chunk.code);
  if (chunk.protos) {
    for (const proto of chunk.protos) {
      totalFused += applyFusionPass(proto, enabledPatterns, fusionRate);
    }
  }
  return totalFused;
}

function collectUsedOpcodes(chunk: { code: number[]; protos?: { code: number[]; protos?: any[] }[] }): Set<number> {
  const used = new Set<number>();
  for (let i = 0; i < chunk.code.length; i += 4) used.add(chunk.code[i]);
  if (chunk.protos) for (const p of chunk.protos) {
    for (const op of collectUsedOpcodes(p)) used.add(op);
  }
  return used;
}

function generateHandlerNoise(n: NameMap, op: number): string {

  const savedState = _rngState;
  _rngState = ((op * 0x45D9F3B + 0xDEADBEEF) >>> 0);

  rng(); rng();

  let noise = '';

  if (rng() < 0.7) {
    const dv = randomName(2);
    const variant = Math.floor(rng() * 6);
    if (variant === 0) noise = `local ${dv}=${n.ip};`;
    else if (variant === 1) noise = `local ${dv}=${n.bBand}(${n.ip},0xFF);`;
    else if (variant === 2) noise = `local ${dv}=${n.bBxor}(${n.ip},${Math.floor(rng() * 255) + 1});`;
    else if (variant === 3) noise = `local ${dv}=${n.top};`;
    else if (variant === 4) noise = `local ${dv}=${n.R}[1];`;
    else noise = `local ${dv}=${n.bType}(${n.R}[0]);`;
  }

  _rngState = savedState;
  return noise;
}

function buildHandlerBodies(n: NameMap, ctx: BuildCtx, usedOps?: Set<number>): Map<number, string> {
  const bodies = new Map<number, string>();
  const doNoise = ctx.handlerNoise && ctx.level !== "debug";
  for (const [op, gen] of handlerRegistry) {

    if (usedOps && !usedOps.has(op as number)) continue;
    const shuffled = ctx.opcodeEncode[op as number];
    const body = gen(n, ctx);

    const p = ctx.argPerm[op as number];
    const slots = [n.s1, n.s2, n.s3];
    const remap = `local A,B,C=${slots[p[0]-1]},${slots[p[1]-1]},${slots[p[2]-1]};`;

    const noise = doNoise ? generateHandlerNoise(n, op as number) : '';
    bodies.set(shuffled, remap + noise + body);
  }
  return bodies;
}

function buildBuiltinCaptures(ctx: BuildCtx): { code: string; assignOnly: string } {
  const n = ctx.names;

  if (ctx.level === "debug") {
    const captures = [
      [n.bPcall, "pcall"], [n.bXpcall, "xpcall"], [n.bSelect, "select"], [n.bType, "type"],
      [n.tPack, "table.pack"], [n.tUnpack, "table.unpack"], [n.bTcreate, "table.create"],
      [n.bTconcat, "table.concat"], [n.bMfloor, "math.floor"], [n.bIpairs, "ipairs"],
      [n.bTostring, "tostring"], [n.bRawget, "rawget"], [n.bSetmeta, "setmetatable"],
      [n.bBxor, "bit32.bxor"], [n.bBand, "bit32.band"],
      [n.bGetmeta, "getmetatable"], [n.bNext, "next"],
    ];
    const fullLines = captures.map(([v, g]) => `local ${v}=${g}`);
    const assignLines = captures.map(([v, g]) => `${v}=${g}`);
    const check = `local _hookOk=true`;
    return { code: [...fullLines, check].join("\n"), assignOnly: [...assignLines, check].join("\n") };
  }

  const scVar = randomName(3);
  const geVar = randomName(3);

  const encName = (s: string): string => {
    const codes = Array.from(s).map(c => {
      const code = c.charCodeAt(0);
      const m = Math.floor(rng() * 4);
      if (m === 0) { const d = 1 + Math.floor(rng() * 20); return `${code - d}+${d}`; }
      if (m === 1) { const d = 1 + Math.floor(rng() * 20); return `${code + d}-${d}`; }
      if (m === 2) return `0x${code.toString(16)}`;
      return `${code}`;
    }).join(',');
    return `${scVar}(${codes})`;
  };

  const simpleCaptures: [string, string][] = [
    [n.bPcall, "pcall"], [n.bXpcall, "xpcall"], [n.bSelect, "select"], [n.bType, "type"],
    [n.bIpairs, "ipairs"], [n.bTostring, "tostring"], [n.bRawget, "rawget"],
    [n.bSetmeta, "setmetatable"], [n.bGetmeta, "getmetatable"], [n.bNext, "next"],
  ];

  const libCaptures: [string, string, string][] = [
    [n.tPack, "table", "pack"], [n.tUnpack, "table", "unpack"],
    [n.bTcreate, "table", "create"], [n.bTconcat, "table", "concat"],
    [n.bMfloor, "math", "floor"],
    [n.bBxor, "bit32", "bxor"], [n.bBand, "bit32", "band"],
  ];

  const libs = new Map<string, { libVar: string; members: [string, string][] }>();
  for (const [varName, lib, member] of libCaptures) {
    if (!libs.has(lib)) libs.set(lib, { libVar: randomName(2), members: [] });
    libs.get(lib)!.members.push([varName, member]);
  }

  const lines: string[] = [];
  lines.push(`do`);
  lines.push(`local ${scVar}=("")[${luaEsc("char")}]`);

  const lsBoot = randomName(2);
  lines.push(`local ${lsBoot}=loadstring`);
  const envBootSrc = `return (type(getfenv)=='function' and getfenv(0)) or _G`;
  const envBootCodes = Array.from(envBootSrc).map(c => {
    const code = c.charCodeAt(0);
    const m = Math.floor(rng() * 4);
    if (m === 0) { const d = 1 + Math.floor(rng() * 20); return `${code - d}+${d}`; }
    if (m === 1) { const d = 1 + Math.floor(rng() * 20); return `${code + d}-${d}`; }
    if (m === 2) return `0x${code.toString(16)}`;
    return `${code}`;
  }).join(',');
  lines.push(`local ${geVar}=${lsBoot}(${scVar}(${envBootCodes}))()`);

  const shuffledSimple = [...simpleCaptures];
  for (let i = shuffledSimple.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffledSimple[i], shuffledSimple[j]] = [shuffledSimple[j], shuffledSimple[i]];
  }
  for (const [varName, globalName] of shuffledSimple) {
    lines.push(`${varName}=${geVar}[${encName(globalName)}]`);
  }

  const libKeys = [...libs.keys()];
  for (let i = libKeys.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [libKeys[i], libKeys[j]] = [libKeys[j], libKeys[i]];
  }
  for (const libName of libKeys) {
    const { libVar, members } = libs.get(libName)!;
    lines.push(`local ${libVar}=${geVar}[${encName(libName)}]`);
    for (const [varName, memberName] of members) {
      lines.push(`${varName}=${libVar}[${encName(memberName)}]`);
    }
  }
  lines.push(`end`);

  const nHg = randomName(3);
  const checks: string[] = [
    `${n.bType}(1)=="number"`, `${n.bType}("")=="string"`,
    `${n.bSelect}("#",1,2,3)==3`,
    `${n.bPcall}(function() end)`,
    `${n.bXpcall}(function() return 1 end,function() end)`,
    `${n.bBxor}(0,0)==0`, `${n.bBand}(255,15)==15`,
    `${n.tPack}(1,2,3).n==3`,
    `${n.bSelect}("#",${n.tUnpack}({7,8}))==2`,
    `${n.bType}(${n.bTcreate}(0))=="table"`,
    `${n.bTconcat}({"a","b"})=="ab"`,
    `${n.bMfloor}(1.9)==1`,
    `${n.bTostring}(42)=="42"`,
    `${n.bRawget}({x=1},"x")==1`,
    `${n.bType}(${n.bSetmeta})=="function"`,
    `${n.bType}(${n.bIpairs})=="function"`,
    `${n.bType}(${n.bGetmeta})=="function"`,
  ];
  for (let ci = checks.length - 1; ci > 0; ci--) {
    const cj = Math.floor(rng() * (ci + 1));
    [checks[ci], checks[cj]] = [checks[cj], checks[ci]];
  }
  const check = `local ${nHg}=${checks.join(" and ")}`;
  const corrupt = process.env.NO_SEC === '1'
    ? `do end`
    : `if not ${nHg} then ${n.bTcreate}=function() return {} end;${n.tPack}=function(...) return {n=0} end;${n.bPcall}=function() return false end;${n.bSelect}=function() return 0 end;${n.bMfloor}=function(x) return x end end`;

  const captureCode = [...lines, check, corrupt].join("\n");
  return { code: captureCode, assignOnly: captureCode };
}

function buildVMRuntime(ctx: BuildCtx, assignStyle: boolean = false): string {
  const n = ctx.names;
  const { pK, pC, pP, pU, pN } = ctx.protoKeys;
  const L: string[] = [];

  L.push(assignStyle
    ? `${n.run}=function(${n.K},${n.code},${n.protos},${n.upvalues},${n.nParams},${n.maxRegs},_isVararg,${n.env},...)`
    : `local function ${n.run}(${n.K},${n.code},${n.protos},${n.upvalues},${n.nParams},${n.maxRegs},_isVararg,${n.env},...)`);
  L.push(`${n.protos}=${n.protos} or {}`);
  L.push(`${n.upvalues}=${n.upvalues} or {}`);

  L.push(`local ${n.R}=${n.bTcreate}(${n.maxRegs}+1)`);

  L.push(`local _args={...}`);
  L.push(`local _ac=${n.bSelect}("#",...)`);
  L.push(`for _i=1,((_ac<${n.nParams}) and _ac or ${n.nParams}) do ${n.R}[_i]=_args[_i] end`);

  // Conditional init: omit tables no emitted handler can reference (usedOps
  // is post-fusion and covers main+protos; debug path has usedOps undefined
  // and keeps historical output). Fused GGET/GGET_CALL bypass ic by design.
  const usedInit = ctx.usedOps;
  const needsIc = !usedInit || usedInit.has(RegOp.GETGLOBAL as number) || usedInit.has(RegOp.SETGLOBAL as number);
  const needsOpenUVs = !usedInit || usedInit.has(RegOp.CLOSEUPVAL as number) || usedInit.has(RegOp.CLOSURE as number);
  const needsVarargs = !usedInit || usedInit.has(RegOp.VARARG as number);
  if (needsVarargs) {
    L.push(`local ${n.varargs}={}`);
    L.push(`local ${n.vaCount}=0`);
    L.push(`if _isVararg then ${n.vaCount}=_ac-${n.nParams};if ${n.vaCount}<0 then ${n.vaCount}=0 end;for _i=1,${n.vaCount} do ${n.varargs}[_i]=_args[${n.nParams}+_i] end end`);
  }

  if (ctx.level !== "debug") {
    L.push(`do local _c={};for _ci=1,#${n.code} do _c[_ci]=${n.code}[_ci] end;${n.code}=_c end`);
  }

  L.push(`local ${n.ip}=1`);
  if (needsOpenUVs) L.push(`local ${n.openUVs}={}`);
  if (needsIc) L.push(`local ${n.ic}={}`);
  L.push(`local ${n.top}=0`);

  const nTwVm = ctx.level !== "debug" ? randomName(2) : "_tw";
  L.push(`local ${nTwVm};do local _t=${n.env}["task"];if _t then ${nTwVm}=_t["wait"] end end`);

  let rkThreshVar = '';
  let rkSubVar = '';
  if (ctx.level !== "debug") {
    rkThreshVar = randomName(3);
    rkSubVar = randomName(3);
    const rkVariant = Math.floor(rng() * 6);
    const a = Math.floor(rng() * 200) + 10;
    const b = RK_OFFSET - a;
    if (rkVariant === 0) {
      L.push(`local ${rkThreshVar}=${a}+${b}`);
    } else if (rkVariant === 1) {
      L.push(`local ${rkThreshVar}=${n.bBxor}(${RK_OFFSET ^ (a)},${a})`);
    } else if (rkVariant === 2) {
      const shift = Math.floor(rng() * 3) + 1;
      L.push(`local ${rkThreshVar}=${RK_OFFSET >> shift}*${1 << shift}`);
    } else if (rkVariant === 3) {
      const rndMul = 1 + Math.floor(rng() * 100);
      L.push(`local ${rkThreshVar}=${n.bBand}(${RK_OFFSET + rndMul * 0x200},${0x1FF})`);
    } else if (rkVariant === 4) {
      const m = [2, 4, 8, 16, 32, 64][Math.floor(rng() * 6)];
      L.push(`local ${rkThreshVar}=${RK_OFFSET / m}*${m}`);
    } else {
      L.push(`local ${rkThreshVar}=${n.bBand}(${RK_OFFSET | (Math.floor(rng() * 256) << 16)},0xFFFF)`);
    }
    L.push(`local ${rkSubVar}=${rkThreshVar}-1`);
    L.push(`local function ${n.RK}(x) if x>=${rkThreshVar} then return ${n.K}[x-${rkSubVar}] else return ${n.R}[x+1] end end`);
  } else {
    L.push(`local function ${n.RK}(x) if x>=${RK_OFFSET} then return ${n.K}[x-${RK_OFFSET - 1}] else return ${n.R}[x+1] end end`);
  }

  const bodies = buildHandlerBodies(n, ctx, ctx.usedOps);

  if (rkThreshVar) {
    const hotRawOps: number[] = [
      RegOp.ADD as number, RegOp.SUB as number, RegOp.MUL as number,
      RegOp.DIV as number, RegOp.MOD as number, RegOp.POW as number,
      RegOp.IDIV as number,
    ];
    const hotShuffled = new Set(hotRawOps.map(op => ctx.opcodeEncode[op]));
    const rkEsc = n.RK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rkRe = new RegExp(rkEsc + '\\(([A-Z])\\)', 'g');
    for (const [sOp, body] of bodies) {
      if (hotShuffled.has(sOp)) {
        const inlined = body.replace(rkRe, (_m, v) =>
          `(${v}>=${rkThreshVar} and ${n.K}[${v}-${rkSubVar}] or ${n.R}[${v}+1])`);
        if (inlined !== body) bodies.set(sOp, inlined);
      }
    }
  }

  if (ctx.debugTrace) {
    const entries = REG_OP_NAMES.map((name, realOp) => {
      const shuffled = ctx.opcodeEncode[realOp];
      return `[${shuffled}]="${name}"`;
    }).join(",");
    L.push(`local _opNames={${entries}}`);
  }

  const doMut = ctx.level !== "debug";
  const mtVar = doMut ? randomName(3) : "";
  const mutStep = doMut ? (1 + Math.floor(rng() * 254)) : 0;
  const mutMul = doMut ? (1 + Math.floor(rng() * 126)) * 2 + 1 : 1;
  if (doMut) {
    L.push(`local ${mtVar}={}`);
  }

  if (doMut) {

    const opqVar = randomName(3);
    const opqA = 2 + Math.floor(rng() * 100);
    const opqB = 2 + Math.floor(rng() * 100);
    const opqC = 2 + Math.floor(rng() * 100);

    const mbaV1 = randomName(2);
    const mbaV2 = randomName(2);
    const mbaV3 = randomName(2);
    const opqVariant = Math.floor(rng() * 16);

    if (opqVariant === 0) {

      L.push(`local ${mbaV1}=${n.bBand}(${opqA},${opqB})`);
      L.push(`local ${mbaV2}=${n.bBand}(${n.bBxor}(${opqA},0xFFFFFFFF),${opqB})`);
      L.push(`local ${opqVar}=${mbaV1}+${mbaV2}==${n.bBand}(${opqB},0xFFFFFFFF)`);
    } else if (opqVariant === 1) {

      L.push(`local ${mbaV1}=2*${n.bBand}(${opqA},${opqB})+${n.bBxor}(${opqA},${opqB})`);
      L.push(`local ${opqVar}=${mbaV1}==${opqA}+${opqB}`);
    } else if (opqVariant === 2) {

      L.push(`local ${mbaV1}=${n.bBxor}(${n.bBxor}(${opqA},${opqB}),${opqB})`);
      L.push(`local ${mbaV2}=${n.bBxor}(${n.bBxor}(${mbaV1},${opqC}),${opqC})`);
      L.push(`local ${opqVar}=${mbaV2}==${n.bBand}(${opqA},0xFFFFFFFF)`);
    } else if (opqVariant === 3) {

      L.push(`local ${mbaV1}=${n.bBxor}(${n.bBxor}(${opqA},0xFFFFFFFF),0xFFFFFFFF)`);
      L.push(`local ${mbaV2}=${n.bBand}(${n.bBxor}(${mbaV1},${opqB}),${n.bBxor}(${mbaV1},${opqB}))`);
      L.push(`local ${opqVar}=${mbaV2}==${n.bBxor}(${opqA},${opqB})`);
    } else if (opqVariant === 4) {

      L.push(`local ${mbaV1}=2*${n.bBand}(${opqA},${opqB})+${n.bBxor}(${opqA},${opqB})`);
      L.push(`local ${mbaV2}=${n.bBxor}(${n.bBxor}(${n.bBand}(${mbaV1},0xFFFF),${opqC}),${opqC})`);
      L.push(`local ${opqVar}=${mbaV2}==${n.bBand}(${opqA}+${opqB},0xFFFF)`);
    } else if (opqVariant === 5) {

      L.push(`local ${mbaV1}=${n.bBxor}(${n.bBand}(${n.bBxor}(${opqA},0xFFFFFFFF),${n.bBxor}(${opqB},0xFFFFFFFF)),0xFFFFFFFF)`);
      L.push(`local ${mbaV2}=${n.bBxor}(${opqA},${n.bBand}(${n.bBxor}(${opqA},0xFFFFFFFF),${opqB}))`);
      L.push(`local ${opqVar}=${mbaV1}==${mbaV2}`);
    } else if (opqVariant === 6) {

      L.push(`local ${mbaV1}=${n.bBxor}(${opqA},${opqB})`);
      L.push(`local ${mbaV2}=${n.bBand}(${mbaV1},${mbaV1})`);
      L.push(`local ${mbaV3}=2*${n.bBand}(${mbaV2},${opqC})+${n.bBxor}(${mbaV2},${opqC})`);
      L.push(`local ${opqVar}=${mbaV3}==${mbaV1}+${opqC}`);
    } else if (opqVariant === 7) {

      L.push(`local ${mbaV1}=${n.bBxor}(${opqA},${n.bBand}(${opqA},${opqB}))`);
      L.push(`local ${mbaV2}=${n.bBand}(${opqA},${n.bBxor}(${opqB},0xFFFFFFFF))`);
      L.push(`local ${opqVar}=${mbaV1}==${mbaV2}`);
    } else if (opqVariant === 8) {

      L.push(`local ${mbaV1}=${n.bBand}(${opqA},${opqB})`);
      L.push(`local ${mbaV2}=${n.bBxor}(${opqA},${n.bBand}(${n.bBxor}(${opqA},0xFFFFFFFF),${mbaV1}))`);
      L.push(`local ${opqVar}=${mbaV2}==${n.bBand}(${opqA},0xFFFFFFFF)`);
    } else if (opqVariant === 9) {

      L.push(`local ${mbaV1}=2*${n.bBand}(${opqA},${opqB})+${n.bBxor}(${opqA},${opqB})`);
      L.push(`local ${mbaV2}=2*${n.bBand}(${mbaV1},${opqC})+${n.bBxor}(${mbaV1},${opqC})`);
      L.push(`local ${opqVar}=${n.bBand}(${mbaV2},0xFFFF)==${n.bBand}(${opqA}+${opqB}+${opqC},0xFFFF)`);
    } else if (opqVariant === 10) {

      L.push(`local ${mbaV1}=${n.bBxor}(${opqA},${opqB})`);
      L.push(`local ${mbaV2}=${opqA}+${opqB}-2*${n.bBand}(${opqA},${opqB})`);
      L.push(`local ${opqVar}=${n.bBand}(${mbaV1},0xFFFF)==${n.bBand}(${mbaV2},0xFFFF)`);
    } else if (opqVariant === 11) {

      L.push(`local ${mbaV1}=${n.bBand}(${opqA},${opqB})`);
      L.push(`local ${mbaV2}=${n.bBand}(${mbaV1},${opqC})`);
      L.push(`local ${mbaV3}=${n.bBand}(${opqA},${n.bBand}(${opqB},${opqC}))`);
      L.push(`local ${opqVar}=${mbaV2}==${mbaV3}`);
    } else if (opqVariant === 12) {

      L.push(`local ${mbaV1}=${n.bBand}(${n.bBxor}(${opqA},${opqB}),${opqA})`);
      L.push(`local ${mbaV2}=${n.bBand}(${opqA},${n.bBxor}(${opqB},0xFFFFFFFF))`);
      L.push(`local ${mbaV3}=2*${n.bBand}(${mbaV1},${opqC})+${n.bBxor}(${mbaV1},${opqC})`);
      L.push(`local ${opqVar}=${mbaV3}==2*${n.bBand}(${mbaV2},${opqC})+${n.bBxor}(${mbaV2},${opqC})`);
    } else if (opqVariant === 13) {

      L.push(`local ${mbaV1}=${n.bBxor}(${n.bBxor}(${opqA},${opqB}),${opqC})`);
      L.push(`local ${mbaV2}=${n.bBxor}(${n.bBxor}(${mbaV1},${opqC}),${opqB})`);
      L.push(`local ${opqVar}=${mbaV2}==${n.bBand}(${opqA},0xFFFFFFFF)`);
    } else if (opqVariant === 14) {

      L.push(`local ${mbaV1}=${n.bBand}(${opqA},${n.bBxor}(${opqB},${opqC}))`);
      L.push(`local ${mbaV2}=${n.bBxor}(${n.bBand}(${opqA},${opqB}),${n.bBand}(${opqA},${opqC}))`);
      L.push(`local ${opqVar}=${mbaV1}==${mbaV2}`);
    } else {

      L.push(`local ${mbaV1}=${n.bBand}(${opqA},${opqB})+${n.bBand}(${n.bBxor}(${opqA},0xFFFFFFFF),${opqB})`);
      L.push(`local ${mbaV2}=${n.bBand}(${opqA},${n.bBxor}(${opqB},0xFFFFFFFF))+${n.bBand}(${n.bBxor}(${opqA},0xFFFFFFFF),${n.bBxor}(${opqB},0xFFFFFFFF))`);
      L.push(`local ${opqVar}=${mbaV1}+${mbaV2}==0xFFFFFFFF`);
    }

    L.push(`if not ${opqVar} then ${n.R}={};${n.code}={};${n.ip}=#${n.code}+1 end`);
  }
  const preWhileIdx = L.length;
  L.push(`while ${n.ip}<=#${n.code} do`);

  const useRot = ctx.rotSeed > 0;
  const opVar = randomName(2);

  if (doMut) {

    const mkVar = randomName(2);
    L.push(`local ${mkVar}=${mtVar}[${n.ip}] or 0`);
    if (useRot) {
      const rkVar = randomName(3);

      L.push(`local ${rkVar}=${n.bBand}(${ctx.rotSeed}+${n.ip}*${ctx.rotStep}+${n.ip}*${n.ip}*${ctx.rotStep2},0xFF)`);
      L.push(`local ${opVar}=${n.bBxor}(${n.code}[${n.ip}],${rkVar},${mkVar})`);
    } else {
      L.push(`local ${opVar}=${n.bBxor}(${n.code}[${n.ip}],${mkVar})`);
    }

    L.push(`local ${n.s1}=${n.code}[${n.ip}+1]`);
    L.push(`local ${n.s2}=${n.code}[${n.ip}+2]`);
    L.push(`local ${n.s3}=${n.code}[${n.ip}+3]`);

    const nkVar = randomName(2);
    const xkVar = randomName(2);
    L.push(`local ${nkVar}=${n.bBand}(${mkVar}*${mutMul}+${opVar}+${mutStep},0xFF)`);
    L.push(`local ${xkVar}=${n.bBxor}(${mkVar},${nkVar})`);
    L.push(`${n.code}[${n.ip}]=${n.bBxor}(${n.code}[${n.ip}],${xkVar})`);
    L.push(`${mtVar}[${n.ip}]=${nkVar}`);
  } else {

    if (useRot) {
      const rkVar = randomName(3);
      L.push(`local ${rkVar}=${n.bBand}(${ctx.rotSeed}+${n.ip}*${ctx.rotStep}+${n.ip}*${n.ip}*${ctx.rotStep2},0xFF)`);
      L.push(`local ${opVar}=${n.bBxor}(${n.code}[${n.ip}],${rkVar})`);
    } else {
      L.push(`local ${opVar}=${n.code}[${n.ip}]`);
    }
    L.push(`local ${n.s1}=${n.code}[${n.ip}+1]`);
    L.push(`local ${n.s2}=${n.code}[${n.ip}+2]`);
    L.push(`local ${n.s3}=${n.code}[${n.ip}+3]`);
  }

  L.push(`${n.ip}=${n.ip}+4`);

  if (doMut) {
    L.push(`if ${n.ip}%${60000 + Math.floor(rng() * 40001)}<4 and ${nTwVm} then ${nTwVm}() end`);
  }

  if (doMut && process.env.NO_SEC !== '1') {
    const secInterval = 500 + Math.floor(rng() * 1500);
    const secVar = randomName(3);
    const secCheckVariant = Math.floor(rng() * 3);

    if (secCheckVariant === 0 || secCheckVariant === 1) {

      L.push(`if ${n.ip}%${secInterval * 4}<4 then local ${secVar}=${n.bPcall}(function() return ${n.env}["game"] end);if ${secVar} and ${n.bType}(${n.env}["game"])~="userdata" then ${n.R}=${n.bTcreate}(0);${n.ip}=#${n.code}+1 end end`);
    } else {

      L.push(`if ${n.ip}%${secInterval * 4}<4 then local ${secVar},_sv=${n.bPcall}(function() return ${n.env}["game"]["Workspace"] end);if not ${secVar} then ${n.R}=${n.bTcreate}(0);${n.ip}=#${n.code}+1 end end`);
    }
  }

  if (ctx.debugTrace) {
    L.push(`print("[VM] ip="..(${n.ip}-4).." "..((_opNames and _opNames[${opVar}]) or "OP"..${opVar}).." s1="..tostring(${n.s1}).." s2="..tostring(${n.s2}).." s3="..tostring(${n.s3}))`);
  }

  const sortedOps = Array.from(bodies.keys()).sort((a, b) => a - b);
  const validOps = sortedOps.filter(sOp => {
    const body = bodies.get(sOp)!;
    return body.trim() !== '';
  });

  const dv = ctx.dispatchVariant;

  if (dv === 0) {

    let isFirst = true;
    for (const sOp of validOps) {
      const body = bodies.get(sOp)!;
      const prefix = isFirst ? 'if' : 'elseif';
      L.push(`${prefix} ${opVar}==${sOp} then ${body}`);
      isFirst = false;
    }
    if (!isFirst) L.push(`end`);

  } else if (dv === 1) {

    const mask = ctx.dispatchMask;
    const mVar = randomName(3);
    L.push(`local ${mVar}=${n.bBxor}(${opVar},${mask})`);

    const shuffled = [...validOps];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    let isFirst = true;
    for (const sOp of shuffled) {
      const body = bodies.get(sOp)!;
      const maskedOp = sOp ^ mask;
      const prefix = isFirst ? 'if' : 'elseif';
      L.push(`${prefix} ${mVar}==${maskedOp} then ${body}`);
      isFirst = false;
    }
    if (!isFirst) L.push(`end`);

  } else if (dv === 2) {

    const emitBinaryTree = (ops: number[], depth: number) => {
      if (ops.length === 0) return;
      if (ops.length <= 3 || depth >= 4) {

        let isF = true;
        for (const sOp of ops) {
          const body = bodies.get(sOp)!;
          const pre = isF ? 'if' : 'elseif';
          L.push(`${pre} ${opVar}==${sOp} then ${body}`);
          isF = false;
        }
        if (!isF) L.push(`end`);
        return;
      }

      const splitIdx = Math.max(1, Math.min(ops.length - 1,
        Math.floor(ops.length * (0.3 + rng() * 0.4))));
      const left = ops.slice(0, splitIdx);
      const right = ops.slice(splitIdx);
      const pivot = right[0];
      L.push(`if ${opVar}<${pivot} then`);
      emitBinaryTree(left, depth + 1);
      L.push(`else`);
      emitBinaryTree(right, depth + 1);
      L.push(`end`);
    };
    emitBinaryTree(validOps, 0);

  } else if (dv === 3) {

    const nGroups = 3 + Math.floor(rng() * 3);
    const mask = ctx.dispatchMask;

    const groups: Map<number, number[]> = new Map();
    for (const sOp of validOps) {
      const g = (sOp ^ mask) % nGroups;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(sOp);
    }
    const gVar = randomName(3);
    L.push(`local ${gVar}=${n.bBxor}(${opVar},${mask})%${nGroups}`);

    const gKeys = [...groups.keys()];
    for (let i = gKeys.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [gKeys[i], gKeys[j]] = [gKeys[j], gKeys[i]];
    }
    let isFirstG = true;
    for (const gIdx of gKeys) {
      const gOps = groups.get(gIdx)!;
      const prefG = isFirstG ? 'if' : 'elseif';
      L.push(`${prefG} ${gVar}==${gIdx} then`);

      const innerOps = [...gOps];
      for (let i = innerOps.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [innerOps[i], innerOps[j]] = [innerOps[j], innerOps[i]];
      }
      let isF = true;
      for (const sOp of innerOps) {
        const body = bodies.get(sOp)!;
        const pre = isF ? 'if' : 'elseif';
        L.push(`${pre} ${opVar}==${sOp} then ${body}`);
        isF = false;
      }
      if (!isF) L.push(`end`);
      isFirstG = false;
    }
    if (!isFirstG) L.push(`end`);

  } else if (dv === 4 || dv === 5) {

    const hTbl = n.handlers;
    const retOp = ctx.opcodeEncode[RegOp.RETURN as number];
    const tcOp = ctx.opcodeEncode[RegOp.TAILCALL as number];

    const mandatoryFast = [
      RegOp.JMP as number, RegOp.FORLOOP as number, RegOp.CALL as number,
      RegOp.MOVE as number, RegOp.FORPREP as number,
    ].map(op => ctx.opcodeEncode[op]);

    const optCandidates = [
      RegOp.LOADK as number, RegOp.GETGLOBAL as number,
      RegOp.GETTABLE as number, RegOp.LOADBOOL as number,
      RegOp.SETTABLE as number, RegOp.LOADNIL as number,
    ];
    const shuffledCands = [...optCandidates];
    for (let i = shuffledCands.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffledCands[i], shuffledCands[j]] = [shuffledCands[j], shuffledCands[i]];
    }
    const nFast = 2 + Math.floor(rng() * 2);
    const fastSet = new Set([
      ...mandatoryFast,
      ...shuffledCands.slice(0, nFast).map(op => ctx.opcodeEncode[op]),
    ]);

    const inlineOps = new Set([retOp, tcOp, ...fastSet]);
    const tableOps = validOps.filter(sOp => !inlineOps.has(sOp));

    for (let i = tableOps.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [tableOps[i], tableOps[j]] = [tableOps[j], tableOps[i]];
    }

    const tblMask = dv === 5 ? ctx.dispatchMask : 0;

    void tblMask;

    const fastArr = [...fastSet];
    for (let i = fastArr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [fastArr[i], fastArr[j]] = [fastArr[j], fastArr[i]];
    }

    let isFirst = true;
    for (const fOp of fastArr) {
      const body = bodies.get(fOp);
      if (!body || body.trim() === '') continue;
      const prefix = isFirst ? 'if' : 'elseif';
      L.push(`${prefix} ${opVar}==${fOp} then ${body}`);
      isFirst = false;
    }

    const hVar = randomName(2);
    void hVar;

    for (const sOp of tableOps) {
      const body = bodies.get(sOp)!;
      if (body.trim() === '') continue;
      const cmpVal = sOp ^ tblMask;
      const cmpExpr = tblMask
        ? `${n.bBxor}(${opVar},${tblMask})==${cmpVal}`
        : `${opVar}==${sOp}`;
      const prefix = isFirst ? 'if' : 'elseif';
      L.push(`${prefix} ${cmpExpr} then ${body}`);
      isFirst = false;
    }

    L.push(`elseif ${opVar}==${retOp} then ${bodies.get(retOp) || ''}`);
    L.push(`elseif ${opVar}==${tcOp} then ${bodies.get(tcOp) || ''}`);
    L.push(`end`);
  }

  L.push(`end`);

  L.push(`end`);

  return L.join("\n");
}

const CORE_GLOBALS = [

  "print","warn","error","assert","type","typeof","tostring","tonumber",
  "pcall","xpcall","select","unpack","pairs","ipairs","next",
  "rawget","rawset","rawequal","rawlen","setmetatable","getmetatable",
  "collectgarbage","dofile","gcinfo",

  "string","table","math","bit32","coroutine","os","debug","utf8","buffer",

  "game","workspace","script","Instance","Enum",

  "Vector3","Vector2","CFrame","Color3","BrickColor",
  "UDim","UDim2","Ray","Region3","Rect","TweenInfo",
  "NumberSequence","ColorSequence","NumberRange",
  "NumberSequenceKeypoint","ColorSequenceKeypoint",
  "PhysicalProperties","Axes","Faces","PathWaypoint",
  "Random","DateTime","RaycastParams","OverlapParams",
  "Font","FloatCurveKey","RotationCurveKey",

  "tick","time","wait","task","spawn","delay",

  "require","loadstring","load","getfenv","setfenv","newproxy",

  "_G","shared","settings","stats","UserSettings","version",
];

const EXECUTOR_GLOBALS = [

  "getgenv","getrenv","getsenv","getrawmetatable","setrawmetatable",

  "hookfunction","hookfunc","hookmetamethod","newcclosure",
  "clonefunction","cloneref","compareinstances",

  "iscclosure","islclosure","isexecutorclosure","checkclosure","isourclosure",
  "checkcaller",

  "getconnections","firesignal","fireclickdetector","fireproximityprompt","firetouchinterest",

  "getgc","getinstances","getnilinstances","getscripts","getrunningscripts",
  "getloadedmodules","getcallingscript","getactors",

  "getscriptbytecode","dumpstring","getscripthash","getscriptclosure","decompile",

  "readfile","writefile","appendfile","loadfile","listfiles",
  "isfile","isfolder","makefolder","delfolder","delfile",

  "setclipboard","toclipboard","getclipboard","setrbxclipboard",

  "queue_on_teleport","queueonteleport",

  "setthreadidentity","getthreadidentity",
  "setidentity","getidentity","setthreadcontext","getthreadcontext",

  "getnamecallmethod","setnamecallmethod",

  "isreadonly","setreadonly",

  "gethiddenproperty","sethiddenproperty","isscriptable","setscriptable",

  "identifyexecutor","getexecutorname",

  "request","http_request","syn","http","WebSocket",

  "cache",

  "Drawing","cleardrawcache","isrenderobj",

  "crypt","base64",

  "lz4compress","lz4decompress",

  "mouse1click","mouse1press","mouse1release",
  "mouse2click","mouse2press","mouse2release",
  "mousemoveabs","mousemoverel","mousescroll",

  "gethui","getcustomasset","getcallbackvalue","messagebox",
  "isrbxactive","isgameactive","setfpscap",

  "getregistry","getreg","getstack",

  "rconsoleclear","rconsolecreate","rconsoledestroy",
  "rconsoleinput","rconsoleprint","rconsolesettitle","rconsolename",
  "consoleclear","consolecreate","consoledestroy",
  "consoleinput","consoleprint","consolesettitle",

  "run_on_actor","runonactor",

  "getstack",
];

function buildEnvSetup(ctx: BuildCtx): string {
  const n = ctx.names;
  const L: string[] = [];

  if (ctx.level === "debug") {
    L.push(`local ${n.genv}=(type(getfenv)=="function" and getfenv(0)) or _G`);
    const entries = CORE_GLOBALS.map(g => `${g}=${g}`).join(",");
    L.push(`local ${n.env}=setmetatable({${entries}},{__index=function(_,k) local ok,v=pcall(function() return ${n.genv}[k] end);if ok then return v end;return nil end})`);
    if (ctx.includeExecutor) {
      for (const g of EXECUTOR_GLOBALS) {
        L.push(`do local ok,v=pcall(function() return ${n.genv}["${g}"] end);if ok and v~=nil then ${n.env}["${g}"]=v end end`);
      }
    }
    return L.join("\n") + "\n";
  }

  const envKey = 1 + Math.floor(rng() * 254);
  const envStep = 1 + Math.floor(rng() * 254);

  const encS = (s: string): string => {
    const bytes = Array.from(s).map((c, i) =>
      c.charCodeAt(0) ^ ((envKey + i * envStep) & 0xFF));
    return `{${bytes.join(",")}}`;
  };

  const dec = randomName(4);
  L.push(`local function ${dec}(_t) local _s="";for _i=1,#_t do _s=_s..string.char(${n.bBxor}(_t[_i],${n.bBand}(${envKey}+(_i-1)*${envStep},0xFF))) end;return _s end`);

  L.push(`local ${n.genv}=loadstring(${dec}(${encS("return (type(getfenv)=='function' and getfenv(0)) or _G")}))()`);

  L.push(`local ${n.env}=${n.bSetmeta}({},{[${dec}(${encS("__index")})]=function(_,k) local ok,v=${n.bPcall}(function() return ${n.genv}[k] end);if ok then return v end;return nil end})`);

  const allGlobals = ctx.includeExecutor ? [...CORE_GLOBALS, ...EXECUTOR_GLOBALS] : [...CORE_GLOBALS];

  for (let si = allGlobals.length - 1; si > 0; si--) {
    const sj = Math.floor(rng() * (si + 1));
    [allGlobals[si], allGlobals[sj]] = [allGlobals[sj], allGlobals[si]];
  }
  const namesTable = randomName(3);
  L.push(`local ${namesTable}={${allGlobals.map(g => encS(g)).join(",")}}`);

  const iV = randomName(2);
  const nV = randomName(2);
  L.push(`for ${iV}=1,#${namesTable} do local ${nV}=${dec}(${namesTable}[${iV}]);local ok,v=${n.bPcall}(function() return ${n.genv}[${nV}] end);if ok and v~=nil then ${n.env}[${nV}]=v end end`);

  L.push(`do local _u=${dec}(${encS("unpack")});if not ${n.env}[_u] then local _t=${n.env}[${dec}(${encS("table")})];if _t then ${n.env}[_u]=_t[_u] end end end`);
  L.push(`do local _ls=${dec}(${encS("loadstring")});if not ${n.env}[_ls] then ${n.env}[_ls]=${n.env}[${dec}(${encS("load")})] end end`);

  return L.join("\n") + "\n";
}

function buildEnvFragments(ctx: BuildCtx): { fragments: Fragment[]; forwardDecls: string[] } {
  const n = ctx.names;
  const fragments: Fragment[] = [];
  const forwardDecls: string[] = [];

  const envKey = 1 + Math.floor(rng() * 254);
  const envStep = 1 + Math.floor(rng() * 254);

  const encS = (s: string): string => {
    const bytes = Array.from(s).map((c, i) =>
      c.charCodeAt(0) ^ ((envKey + i * envStep) & 0xFF));
    return `{${bytes.join(",")}}`;
  };

  const dec = randomName(4);
  forwardDecls.push(dec, n.genv, n.env);

  fragments.push({ code: `${dec}=function(_t) local _s="";for _i=1,#_t do _s=_s..string.char(${n.bBxor}(_t[_i],${n.bBand}(${envKey}+(_i-1)*${envStep},0xFF))) end;return _s end`, layer: 0 });
  fragments.push({ code: `${n.genv}=loadstring(${dec}(${encS("return (type(getfenv)=='function' and getfenv(0)) or _G")}))()`, layer: 1 });
  fragments.push({ code: `${n.env}=${n.bSetmeta}({},{[${dec}(${encS("__index")})]=function(_,k) local ok,v=${n.bPcall}(function() return ${n.genv}[k] end);if ok then return v end;return nil end})`, layer: 2 });

  const allGlobals = ctx.includeExecutor ? [...CORE_GLOBALS, ...EXECUTOR_GLOBALS] : [...CORE_GLOBALS];
  for (let si = allGlobals.length - 1; si > 0; si--) {
    const sj = Math.floor(rng() * (si + 1));
    [allGlobals[si], allGlobals[sj]] = [allGlobals[sj], allGlobals[si]];
  }
  const batchCount = 2 + Math.floor(rng() * 3);
  const batchSize = Math.ceil(allGlobals.length / batchCount);
  for (let b = 0; b < batchCount; b++) {
    const batch = allGlobals.slice(b * batchSize, (b + 1) * batchSize);
    if (batch.length === 0) continue;
    const nt = randomName(3);
    forwardDecls.push(nt);
    fragments.push({ code: `${nt}={${batch.map(g => encS(g)).join(",")}}`, layer: 0 });
    const iV = randomName(2);
    const nV = randomName(2);
    fragments.push({ code: `for ${iV}=1,#${nt} do local ${nV}=${dec}(${nt}[${iV}]);local ok,v=${n.bPcall}(function() return ${n.genv}[${nV}] end);if ok and v~=nil then ${n.env}[${nV}]=v end end`, layer: 3 });
  }

  fragments.push({ code: `do local _u=${dec}(${encS("unpack")});if not ${n.env}[_u] then local _t=${n.env}[${dec}(${encS("table")})];if _t then ${n.env}[_u]=_t[_u] end end end`, layer: 3 });
  fragments.push({ code: `do local _ls=${dec}(${encS("loadstring")});if not ${n.env}[_ls] then ${n.env}[_ls]=${n.env}[${dec}(${encS("load")})] end end`, layer: 3 });

  if (process.env.DEBUG_VM === '1') {
    const critGlobals = ["string","table","math","pcall","type","tostring","pairs","ipairs","next","rawget","setmetatable","getmetatable","bit32","select","xpcall","loadstring","error","warn","print","game","workspace"];
    const checks = critGlobals.map(g => `if ${n.env}[${dec}(${encS(g)})]==nil then _m[#_m+1]="${g}" end`).join(";");
    fragments.push({ code: `do local _m={};${checks};if #_m>0 then warn("[ENV_MISSING] "..table.concat(_m,",")) else warn("[ENV_OK] all globals loaded") end end`, layer: 3 });
    fragments.push({ code: `warn("[DBG_GENV] genv="..tostring(${n.genv}).." type="..type(${n.genv}))`, layer: 3 });
  }

  return { fragments, forwardDecls };
}

function buildDecoderChain(
  ctx: BuildCtx,
  dK: string, dP: string,
): { fragments: Fragment[]; forwardDecls: string[]; chainCalls: string } {
  const pk = ctx.protoKeys;
  const V = ctx.layerVariants;
  const fragments: Fragment[] = [];
  const forwardDecls: string[] = [];

  const nPre = randomName(6);
  const n5 = randomName(6);
  const n4 = randomName(6);
  const n3 = randomName(6);
  const n2 = randomName(6);
  const n1 = randomName(6);
  const nF = randomName(6);
  const nAll = randomName(6);
  const nProtos = randomName(6);
  forwardDecls.push(nPre, n5, n4, n3, n2, n1, nF, nAll, nProtos);

  const wrapA = (name: string, inner: string) =>
    `${name}=function(_0K) for _0i,_0v in ipairs(_0K) do if type(_0v)=="table" then ${inner} end end end`;

  const SP = ctx.spiralPrime, SO = ctx.spiralOffset;
  if (V[4] === 2) {
    const lutName = randomName(4);
    forwardDecls.push(lutName);
    fragments.push({ code: `${lutName}={};for _0k=0,511 do ${lutName}[_0k]=(_0k*${SP}+${SO})%251 end`, layer: 0 });
    fragments.push({ code: wrapA(n5, `local _0s=bit32.band(_0i-1,0xFF);for _0j=1,#_0v do _0v[_0j]=bit32.bxor(_0v[_0j],(${lutName}[(_0j-1)%512]+_0s)%251) end`), layer: 1 });
  } else if (V[4] === 1) {
    fragments.push({ code: wrapA(n5, `local _0s=bit32.band(_0i-1,0xFF);local _0a=${SO}+_0s;for _0j=1,#_0v do _0v[_0j]=bit32.bxor(_0v[_0j],_0a%251);_0a=_0a+${SP} end`), layer: 0 });
  } else {
    fragments.push({ code: wrapA(n5, `local _0s=bit32.band(_0i-1,0xFF);for _0j=1,#_0v do _0v[_0j]=bit32.bxor(_0v[_0j],((_0j-1)*${SP}+${SO}+_0s)%251) end`), layer: 0 });
  }

  const KA = ctx.checkKeyA, KB = ctx.checkKeyB, SA = ctx.checkStepA, SB = ctx.checkStepB;
  const checkBodies = [
    `local _0s=bit32.band(_0i-1,0xFF);for _0j=1,#_0v do local _0h=math.floor((_0j-1)/2);local _0k;if (_0j-1)%2==0 then _0k=bit32.band(${KA}+_0s+_0h*${SA},0xFF) else _0k=bit32.band(${KB}+_0s+_0h*${SB},0xFF) end;_0v[_0j]=bit32.bxor(_0v[_0j],_0k) end`,
    `local _0s=bit32.band(_0i-1,0xFF);local _0n=#_0v;for _0j=1,_0n,2 do _0v[_0j]=bit32.bxor(_0v[_0j],bit32.band(${KA}+_0s+math.floor((_0j-1)/2)*${SA},0xFF)) end;for _0j=2,_0n,2 do _0v[_0j]=bit32.bxor(_0v[_0j],bit32.band(${KB}+_0s+math.floor((_0j-1)/2)*${SB},0xFF)) end`,
    `local _0s=bit32.band(_0i-1,0xFF);local _0ea,_0eb=${KA}+_0s,${KB}+_0s;for _0j=1,#_0v do if (_0j-1)%2==0 then _0v[_0j]=bit32.bxor(_0v[_0j],bit32.band(_0ea,0xFF));_0ea=_0ea+${SA} else _0v[_0j]=bit32.bxor(_0v[_0j],bit32.band(_0eb,0xFF));_0eb=_0eb+${SB} end end`,
  ];
  fragments.push({ code: wrapA(n4, checkBodies[V[3]]), layer: 0 });

  const CM = ctx.cascadeMul, CK = ctx.cascadeKey;
  const cascBodies = [
    `local _0s=bit32.band(_0i-1,0xFF);for _0j=2,#_0v do _0v[_0j]=bit32.bxor(_0v[_0j],bit32.band(_0v[_0j-1]*${CM}+${CK}+_0s,0xFF)) end`,
    `local _0s=bit32.band(_0i-1,0xFF);local _0p=_0v[1];for _0j=2,#_0v do local _0k=bit32.band(_0p*${CM}+${CK}+_0s,0xFF);_0v[_0j]=bit32.bxor(_0v[_0j],_0k);_0p=_0v[_0j] end`,
  ];
  fragments.push({ code: wrapA(n3, cascBodies[V[2] % 2]), layer: 0 });

  const HS = ctx.helixSeed, HM = ctx.helixMul;
  if (V[1] === 2) {
    const tblName = randomName(4);
    fragments.push({ code: wrapA(n2, `local _0s=bit32.band(_0i-1,0xFF);local ${tblName}={};for _0k=1,#_0v do ${tblName}[_0k]=bit32.band(${HS}+_0s+(_0k-1)*${HM},0xFF) end;for _0j=1,#_0v do _0v[_0j]=bit32.band(_0v[_0j]-${tblName}[_0j]+256,0xFF) end`), layer: 0 });
  } else if (V[1] === 1) {
    fragments.push({ code: wrapA(n2, `local _0s=bit32.band(_0i-1,0xFF);local _0a=${HS}+_0s;for _0j=1,#_0v do _0v[_0j]=bit32.band(_0v[_0j]-bit32.band(_0a,0xFF)+256,0xFF);_0a=_0a+${HM} end`), layer: 0 });
  } else {
    fragments.push({ code: wrapA(n2, `local _0s=bit32.band(_0i-1,0xFF);for _0j=1,#_0v do _0v[_0j]=bit32.band(_0v[_0j]-bit32.band(${HS}+_0s+(_0j-1)*${HM},0xFF)+256,0xFF) end`), layer: 0 });
  }

  const inv = ctx.sboxInverse;
  if (V[0] === 0) {

    fragments.push({ code: `${n1}=function(_0K) local _0inv={${inv.join(",")}} for _0i,_0v in ipairs(_0K) do if type(_0v)=="table" then local _0s=bit32.band(_0i-1,0xFF);for _0j=1,#_0v do _0v[_0j]=bit32.bxor(_0inv[_0v[_0j]+1],bit32.band(_0s+_0j-1,0xFF)) end end end end`, layer: 0 });
  } else if (V[0] === 1) {

    const nLo = randomName(3), nHi = randomName(3), nInv = randomName(3);
    forwardDecls.push(nLo, nHi, nInv);
    fragments.push({ code: `${nLo}={${inv.slice(0, 128).join(",")}}`, layer: 0 });
    fragments.push({ code: `${nHi}={${inv.slice(128).join(",")}}`, layer: 0 });
    fragments.push({ code: `${nInv}={};for _0k=1,128 do ${nInv}[_0k]=${nLo}[_0k] end;for _0k=1,128 do ${nInv}[128+_0k]=${nHi}[_0k] end`, layer: 1 });
    fragments.push({ code: `${n1}=function(_0K) for _0i,_0v in ipairs(_0K) do if type(_0v)=="table" then local _0s=bit32.band(_0i-1,0xFF);for _0j=1,#_0v do _0v[_0j]=bit32.bxor(${nInv}[_0v[_0j]+1],bit32.band(_0s+_0j-1,0xFF)) end end end end`, layer: 2 });
  } else {

    const chunks = [inv.slice(0, 64), inv.slice(64, 128), inv.slice(128, 192), inv.slice(192)];
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const cNames = [randomName(3), randomName(3), randomName(3), randomName(3)];
    const nInv = randomName(3);
    forwardDecls.push(...cNames, nInv);
    for (const idx of order) {
      fragments.push({ code: `${cNames[idx]}={${chunks[idx].join(",")}}`, layer: 0 });
    }

    const sboxLutVar = Math.floor(rng() * 3);
    if (sboxLutVar === 0) {

      fragments.push({ code: `${nInv}={};for _0k=1,128 do if _0k<=64 then ${nInv}[_0k]=${cNames[0]}[_0k] else ${nInv}[_0k]=${cNames[1]}[_0k-64] end end;for _0k=1,128 do if _0k<=64 then ${nInv}[128+_0k]=${cNames[2]}[_0k] else ${nInv}[192+_0k-64]=${cNames[3]}[_0k-64] end end`, layer: 1 });
    } else if (sboxLutVar === 1) {

      const sTbl = randomName(2);
      fragments.push({ code: `${nInv}={};local ${sTbl}={${cNames.join(',')}};for _0k=0,255 do local _0ci=(_0k>=192 and 4) or (_0k>=128 and 3) or (_0k>=64 and 2) or 1;${nInv}[_0k+1]=${sTbl}[_0ci][_0k-(_0ci-1)*64+1] end`, layer: 1 });
    } else {

      fragments.push({ code: `${nInv}={};for _0k=1,64 do ${nInv}[_0k]=${cNames[0]}[_0k] end;for _0k=1,64 do ${nInv}[64+_0k]=${cNames[1]}[_0k] end;for _0k=1,64 do ${nInv}[128+_0k]=${cNames[2]}[_0k] end;for _0k=1,64 do ${nInv}[192+_0k]=${cNames[3]}[_0k] end`, layer: 1 });
    }
    fragments.push({ code: `${n1}=function(_0K) for _0i,_0v in ipairs(_0K) do if type(_0v)=="table" then local _0s=bit32.band(_0i-1,0xFF);for _0j=1,#_0v do _0v[_0j]=bit32.bxor(${nInv}[_0v[_0j]+1],bit32.band(_0s+_0j-1,0xFF)) end end end end`, layer: 2 });
  }

  fragments.push({ code: `${nPre}=function(_0K) for _0i=1,#_0K do if type(_0K[_0i])=="string" then local _0s=_0K[_0i];local _0t={};for _0j=1,#_0s do _0t[_0j]=string.byte(_0s,_0j) end;_0K[_0i]=_0t end end end`, layer: 0 });

  if (Math.floor(rng() * 2) === 0) {
    fragments.push({ code: wrapA(nF, `local _0s="";for _0j=1,#_0v do _0s=_0s..string.char(_0v[_0j]) end;_0K[_0i]=_0s`), layer: 0 });
  } else {
    fragments.push({ code: wrapA(nF, `local _0t={};for _0j=1,#_0v do _0t[_0j]=string.char(_0v[_0j]) end;_0K[_0i]=table.concat(_0t)`), layer: 0 });
  }

  // Never-called decoder twins. Gated: no emitted caller exists (chainCalls
  // and all nAll variants close only over realFns). Skipping shifts the rng
  // stream for subsequent stages, which is fine — determinism is per
  // (seed, options), and default-ON output is unchanged.
  if (ctx.deadCodeInjection) {
    const junkCount = 3 + Math.floor(rng() * 4);
    const junkTemplates = [
      (nm: string) => wrapA(nm, `for _0j=1,#_0v do _0v[_0j]=bit32.bxor(_0v[_0j],bit32.band(_0j*${1+Math.floor(rng()*200)}+${Math.floor(rng()*200)},0xFF)) end`),
      (nm: string) => wrapA(nm, `for _0j=2,#_0v do _0v[_0j]=bit32.band(_0v[_0j]+_0v[_0j-1]*${1+Math.floor(rng()*7)}+${Math.floor(rng()*200)},0xFF) end`),
      (nm: string) => wrapA(nm, `local _0a=${Math.floor(rng()*200)};for _0j=1,#_0v do _0v[_0j]=bit32.band(_0v[_0j]-bit32.band(_0a,0xFF)+256,0xFF);_0a=_0a+${1+Math.floor(rng()*30)} end`),
      (nm: string) => wrapA(nm, `for _0j=1,#_0v do _0v[_0j]=bit32.bxor(_0v[_0j],((_0j-1)*${SPIRAL_PRIMES[Math.floor(rng()*SPIRAL_PRIMES.length)]}+${Math.floor(rng()*200)})%251) end`),
    ];
    const junkNames: string[] = [];
    for (let i = 0; i < junkCount; i++) {
      const tpl = junkTemplates[Math.floor(rng() * junkTemplates.length)];
      const jn = randomName(6);
      junkNames.push(jn);
      forwardDecls.push(jn);
      fragments.push({ code: tpl(jn), layer: Math.floor(rng() * 3) });
    }
  }

  const chainVariant = Math.floor(rng() * 3);
  if (chainVariant === 0) {

    const tblName = randomName(4);
    const ordName = randomName(4);
    forwardDecls.push(tblName, ordName);
    const realFns = [n5, n4, n3, n2, n1, nF];

    const allIndices: number[] = [];
    for (let i = 1; i <= realFns.length; i++) allIndices.push(i);
    for (let i = allIndices.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
    }

    const entries: string[] = [];
    for (let i = 0; i < realFns.length; i++) entries.push(`[${allIndices[i]}]=${realFns[i]}`);
    for (let i = entries.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }

    const execOrder = allIndices.slice();
    fragments.push({ code: `${tblName}={${entries.join(",")}}`, layer: 3 });
    fragments.push({ code: `${ordName}={${execOrder.join(",")}}`, layer: 3 });
    fragments.push({ code: `${nAll}=function(_0K) for _0oi=1,#${ordName} do ${tblName}[${ordName}[_0oi]](_0K) end end`, layer: 3 });
  } else if (chainVariant === 1) {

    const realFns = [n5, n4, n3, n2, n1, nF];
    const predicates = [
      `type("")=="string"`, `type(1)=="number"`, `select("#",1)==1`,
      `type({})=="table"`, `type(true)=="boolean"`, `1+1==2`,
    ];
    const predOrder = [...predicates];
    for (let i = predOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [predOrder[i], predOrder[j]] = [predOrder[j], predOrder[i]];
    }
    const bodyParts: string[] = [];
    for (let i = 0; i < realFns.length; i++) {
      bodyParts.push(`if ${predOrder[i]} then ${realFns[i]}(_0K) end`);
    }
    fragments.push({ code: `${nAll}=function(_0K) ${bodyParts.join(";")} end`, layer: 3 });
  } else {

    const realFns = [n5, n4, n3, n2, n1, nF];
    fragments.push({ code: `${nAll}=function(_0K) ${realFns.map(fn => `${fn}(_0K)`).join(";")} end`, layer: 3 });
  }

  fragments.push({ code: `${nProtos}=function(_0ps) for _,_0p in ipairs(_0ps) do ${nPre}(_0p[1]);${nAll}(_0p[1]);if _0p[3] then ${nProtos}(_0p[3]) end end end`, layer: 4 });

  const chainCalls = `${nPre}(${dK})\n${nAll}(${dK})\n${nProtos}(${dP})`;

  return { fragments, forwardDecls, chainCalls };
}

function generateJunkFragments(
  fragments: Fragment[],
  forwardDecls: string[],
  n?: NameMap,
  // Never-called junk (bare dead-store assignments + uninvoked function defs).
  // Default true preserves historical output exactly.
  enabled: boolean = true,
): void {
  if (!enabled) return;
  const count = 5 + Math.floor(rng() * 6);

  const liveRefs = n ? [
    n.R, n.K, n.code, n.ip, n.run, n.env,
    n.bBxor, n.bBand, n.bType, n.tPack, n.bSelect, n.bMfloor,
    n.bPcall, n.bTostring, n.bRawget,
  ] : [];
  const liveRef = () => liveRefs[Math.floor(rng() * liveRefs.length)];

  for (let i = 0; i < count; i++) {
    const jn = randomName(4);
    forwardDecls.push(jn);
    const layer = Math.floor(rng() * 4);
    const jType = Math.floor(rng() * (n ? 9 : 5));
    switch (jType) {
      case 0:
        fragments.push({ code: `${jn}=${Math.floor(rng() * 0xFFFFFF)}`, layer });
        break;
      case 1: {
        const len = 3 + Math.floor(rng() * 8);
        const vals = Array.from({length: len}, () => Math.floor(rng() * 256));
        fragments.push({ code: `${jn}={${vals.join(",")}}`, layer });
        break;
      }
      case 2: {
        const ref = n ? liveRef() : '_K';
        const a = Math.floor(rng() * 200), b = 1 + Math.floor(rng() * 200);
        fragments.push({ code: `${jn}=function(${randomName(2)}) for _i,_v in ipairs(${ref} or {}) do if type(_v)=="table" then for _j=1,#_v do _v[_j]=bit32.bxor(_v[_j],bit32.band(_j*${b}+${a},0xFF)) end end end end`, layer });
        break;
      }
      case 3: {
        const x = Math.floor(rng() * 100), y = 1 + Math.floor(rng() * 50);
        fragments.push({ code: `do ${jn}=${x};for _=${1},${y} do ${jn}=bit32.band(${jn}*${1+Math.floor(rng()*7)}+${Math.floor(rng()*200)},0xFFFF) end end`, layer });
        break;
      }
      case 4:
        fragments.push({ code: `if type(${jn})~="number" then ${jn}=${Math.floor(rng() * 1000)} end`, layer });
        break;
      case 5: {
        const ref = liveRef();
        fragments.push({ code: `${jn}=${n!.bType}(${ref})`, layer });
        break;
      }
      case 6: {
        const ref = liveRef();
        fragments.push({ code: `${jn}=type(${ref})=="table" and #${ref} or 0`, layer });
        break;
      }
      case 7: {
        const ref = liveRef();
        fragments.push({ code: `${jn}=${n!.bSelect}(1,${ref},${Math.floor(rng()*1000)})`, layer });
        break;
      }
      case 8: {
        const ref = liveRef();
        const ref2 = liveRef();
        fragments.push({ code: `${jn}=${n!.bPcall}(function() return ${n!.bTostring}(${ref}) end) and ${n!.bType}(${ref2})`, layer });
        break;
      }
    }
  }
}

function lzssCompress(input: number[]): number[] {
  const out: number[] = [];
  const WIN = 16384;
  const MIN_MATCH = 4;
  const MAX_MATCH = 67;
  const MAX_LIT = 128;
  const HASH_SIZE = 1 << 16;
  const HASH_MASK = HASH_SIZE - 1;
  const head = new Int32Array(HASH_SIZE).fill(-1);
  const prev = new Int32Array(input.length).fill(-1);
  function hash3(pos: number): number {
    return ((input[pos] << 10) ^ (input[pos+1] << 5) ^ (input[pos+2] ?? 0)) & HASH_MASK;
  }

  let i = 0;
  let litBuf: number[] = [];

  const flushLiterals = () => {
    while (litBuf.length > 0) {
      const n = Math.min(litBuf.length, MAX_LIT);
      out.push(n - 1);
      for (let j = 0; j < n; j++) out.push(litBuf[j]);
      litBuf = litBuf.slice(n);
    }
  };

  while (i < input.length) {
    let bestLen = 0, bestOff = 0;
    if (i + MIN_MATCH <= input.length) {
      const h = hash3(i);
      let j = head[h];
      const limit = Math.max(0, i - WIN);
      let chain = 0;
      while (j >= limit && chain < 128) {
        let len = 0;
        while (len < MAX_MATCH && i + len < input.length && input[j + len] === input[i + len]) len++;
        if (len > bestLen) { bestLen = len; bestOff = i - j; }
        if (len === MAX_MATCH) break;
        j = prev[j];
        if (j < 0) break;
        chain++;
      }
      prev[i] = head[h];
      head[h] = i;
    }
    if (bestLen >= MIN_MATCH) {
      flushLiterals();
      if (bestOff <= 256) {

        out.push(0x80 | (bestLen - MIN_MATCH));
        out.push(bestOff - 1);
      } else {

        out.push(0xC0 | (bestLen - MIN_MATCH));
        out.push((bestOff >> 8) & 0xFF);
        out.push(bestOff & 0xFF);
      }
      for (let s = 1; s < bestLen && i + s + 2 < input.length; s++) {
        const sh = hash3(i + s);
        prev[i + s] = head[sh];
        head[sh] = i + s;
      }
      i += bestLen;
    } else {
      litBuf.push(input[i]);
      i++;
    }
  }
  flushLiterals();
  return out;
}

function rleCompress(input: number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < input.length) {
    const b = input[i];
    let run = 1;
    while (i + run < input.length && input[i + run] === b && run < 258) run++;
    if (run >= 4) {
      out.push(0xFF, run - 3, b);
      i += run;
    } else if (b === 0xFF) {
      out.push(0xFF, 0x00);
      i++;
    } else {
      out.push(b);
      i++;
    }
  }
  return out;
}

function verifyCipherRoundtrip(
  rawBytes: number[], bytes: number[], enc: number[],
  cInv: number[], cSeed: number, cStep: number,
  b64: string, alpha: string, padByte: number,
): void {

  const lut: Record<number, number> = {};
  for (let i = 0; i < 64; i++) lut[alpha.charCodeAt(i)] = i;
  lut[padByte] = 0;
  const decoded: number[] = [];
  for (let i = 0; i < b64.length; i += 4) {
    const p1 = b64.charCodeAt(i), p2 = b64.charCodeAt(i+1), p3 = b64.charCodeAt(i+2), p4 = b64.charCodeAt(i+3);
    const a = lut[p1], b = lut[p2], c = lut[p3], d = lut[p4];
    decoded.push(((a << 2) | (b >> 4)) & 0xFF);
    if (p3 !== padByte) decoded.push((((b << 4) | (c >> 2)) & 0xFF));
    if (p4 !== padByte) decoded.push((((c << 6) | d) & 0xFF));
  }

  const decrypted: number[] = [];
  for (let i = 0; i < decoded.length; i++) {
    decrypted.push(cInv[decoded[i]] ^ ((cSeed + i * cStep) & 0xFF));
  }

  if (decrypted.length !== bytes.length) {
    throw new Error(`[cipher-verify] Length mismatch: decoded ${decrypted.length} vs original ${bytes.length}`);
  }
  for (let i = 0; i < bytes.length; i++) {
    if (decrypted[i] !== bytes[i]) {
      throw new Error(`[cipher-verify] Byte mismatch at ${i}: decoded ${decrypted[i]} vs original ${bytes[i]}`);
    }
  }

  const flag = bytes[0];
  let rleOut: number[];
  if (flag === 0) {
    rleOut = bytes.slice(1);
  } else {
    rleOut = [];
    let rp = 1;
    while (rp < bytes.length) {
      const rb = bytes[rp];
      if (rb === 0xFF) {
        rp++;
        const rn = bytes[rp];
        if (rn === 0) { rleOut.push(0xFF); }
        else { rp++; const rv = bytes[rp]; for (let ri = 0; ri < rn + 3; ri++) rleOut.push(rv); }
      } else {
        rleOut.push(rb);
      }
      rp++;
    }
  }

  let finalBytes: number[];
  if (flag === 0) {
    finalBytes = rleOut;
  } else {
    finalBytes = [];
    let lp = 0;
    while (lp < rleOut.length) {
      const ct = rleOut[lp]; lp++;
      if (ct < 128) {
        const n = ct + 1;
        for (let j = 0; j < n; j++) { finalBytes.push(rleOut[lp]); lp++; }
      } else if (ct < 192) {
        const ll = ct - 124;
        const lo = rleOut[lp] + 1; lp++;
        const ls = finalBytes.length;
        for (let j = 1; j <= ll; j++) finalBytes.push(finalBytes[ls - lo + j - 1]);
      } else {
        const ll = ct - 188;
        const lo = rleOut[lp] * 256 + rleOut[lp + 1]; lp += 2;
        const ls = finalBytes.length;
        for (let j = 1; j <= ll; j++) finalBytes.push(finalBytes[ls - lo + j - 1]);
      }
    }
  }

  if (finalBytes.length !== rawBytes.length) {
    throw new Error(`[cipher-verify] Final length mismatch: ${finalBytes.length} vs ${rawBytes.length}`);
  }
  for (let i = 0; i < rawBytes.length; i++) {
    if (finalBytes[i] !== rawBytes[i]) {
      throw new Error(`[cipher-verify] Final byte mismatch at ${i}: ${finalBytes[i]} vs ${rawBytes[i]}`);
    }
  }
}

interface CipherLayerOpts {
  layerIndex: number;
  totalLayers: number;
  ownPipelineKey: string;
  outerPipelineKey?: string;
  expectedOuterFp?: number;
  signalKey: string;
  ownFingerprint: number;
}

function wrapCustomCipher(source: string, layerOpts?: CipherLayerOpts): string {

  const rawBytes = toUTF8Bytes(source);

  const tamperPrime = [65521, 65519, 65497, 65479, 65449, 65437, 65423, 65413, 65393, 65381, 65371, 65357][Math.floor(rng() * 12)];
  let tamperChecksum = 0;
  for (let i = 0; i < rawBytes.length; i++) {
    tamperChecksum = (tamperChecksum + rawBytes[i]) % tamperPrime;
  }

  const lzBytes = lzssCompress(rawBytes);
  const compBytes = rleCompress(lzBytes);
  const useCompression = compBytes.length < rawBytes.length * 0.95;
  const bytes = useCompression ? [1, ...compBytes] : [0, ...rawBytes];
  const compRatio = ((1 - bytes.length / rawBytes.length) * 100).toFixed(1);
  const expectedDecompLen = rawBytes.length;
  console.log(`[cipher] LZSS+RLE: ${rawBytes.length} → ${bytes.length} (${compRatio}% ${useCompression ? 'compressed' : 'raw-passthrough'})`);

  const { sbox: cSbox, inverse: cInv } = generateSBox();

  const cSeed = 1 + Math.floor(rng() * 254);
  const cStep = 3 + Math.floor(rng() * 30);
  const enc = new Array<number>(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    enc[i] = cSbox[bytes[i] ^ ((cSeed + i * cStep) & 0xFF)];
  }

  const pool: string[] = [];
  for (let cc = 33; cc <= 126; cc++) {
    if (cc === 34 || cc === 92) continue;
    pool.push(String.fromCharCode(cc));
  }

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const alpha = pool.slice(0, 64).join('');
  const padChar = pool[64];
  const padByte = padChar.charCodeAt(0);

  let b64 = '';
  for (let i = 0; i < enc.length; i += 3) {
    const a = enc[i], b = enc[i + 1] ?? 0, c = enc[i + 2] ?? 0;
    b64 += alpha[a >> 2];
    b64 += alpha[((a & 3) << 4) | (b >> 4)];
    b64 += (i + 1 < enc.length) ? alpha[((b & 15) << 2) | (c >> 6)] : padChar;
    b64 += (i + 2 < enc.length) ? alpha[c & 63] : padChar;
  }

  verifyCipherRoundtrip(rawBytes, bytes, enc, cInv, cSeed, cStep, b64, alpha, padByte);

  const nFrags = 3 + Math.floor(rng() * 3);
  const fragSize = Math.ceil(b64.length / nFrags);
  const frags: string[] = [];
  for (let i = 0; i < nFrags; i++) {
    frags.push(b64.slice(i * fragSize, (i + 1) * fragSize));
  }

  const ccArgs = (s: string, allowBit32 = false): string =>
    Array.from(s).map(c => {
      const code = c.charCodeAt(0);
      const maxMethod = allowBit32 ? 5 : 4;
      const method = Math.floor(rng() * maxMethod);
      if (method === 0) { const d = 1 + Math.floor(rng() * 50); return `${code - d}+${d}`; }
      if (method === 1) { const d = 1 + Math.floor(rng() * 50); return `${code + d}-${d}`; }
      if (method === 2) { const m = [2,3,4,5][Math.floor(rng()*4)]; return `${code/m === Math.floor(code/m) ? `${code/m}*${m}` : `${code}`}`; }
      if (method === 3) { const x = Math.floor(rng() * 256); return `${nBxor}(${code ^ x},${x})`; }
      return `${code}`;
    }).join(',');

  const nCh = randomName(3);
  const nBy = randomName(3);
  const nSb = randomName(3);
  const nEv = randomName(3);
  const nTb = randomName(3);
  const nLd = randomName(3);
  const nBt = randomName(3);
  const nLUT = randomName(3);
  const nAl = randomName(3);
  const nDt = randomName(3);
  const nRaw = randomName(3);
  const nCnt = randomName(2);
  const nIv = randomName(3);
  const nOut = randomName(3);
  const nBxor = randomName(3);
  const nBand = randomName(3);
  const nBor = randomName(3);
  const nLsh = randomName(3);
  const nRsh = randomName(3);

  const bxorAliases = [nBxor, randomName(3), randomName(3)];
  const chAliases = [nCh, randomName(3), randomName(3)];
  const fragNames = frags.map(() => randomName(4));

  const L: string[] = [];

  let latePcall = '';
  const honeyVars: string[] = [];
  const rInt = (): string => {
    const val = Math.floor(rng() * 65536);
    const fmt = (val * 7 + 3) % 5;
    if (fmt === 0) return `0x${val.toString(16)}`;
    if (fmt === 1 && val > 5) { const d = (val % 97) + 1; return `(${val + d}-${d})`; }
    if (fmt === 2 && val > 20) { const f = [2,3,5,7,11,13][(val>>3)%6]; const q = Math.floor(val/f); const r = val-q*f; return r ? `(${q}*${f}+${r})` : `(${q}*${f})`; }
    if (fmt === 3 && val > 255) return `(0x${(val>>8).toString(16)}*256+${val&0xFF})`;
    return `${val}`;
  };
  const rByte = (): string => {
    const val = Math.floor(rng() * 256);
    const fmt = (val * 13 + 7) % 4;
    if (fmt === 0) return `0x${val.toString(16)}`;
    if (fmt === 1 && val > 3) { const d = (val % 29) + 1; return `(${val + d}-${d})`; }
    if (fmt === 2) return `0x${val.toString(16).padStart(2,'0')}`;
    return `${val}`;
  };
  const rArr = (n: number) => Array.from({ length: n }, () => {
    const val = Math.floor(rng() * 256);
    const fmt = (val * 11 + 5) % 4;
    if (fmt === 0) return `0x${val.toString(16)}`;
    if (fmt === 1 && val > 5) { const d = (val % 19) + 1; return `${val+d}-${d}`; }
    if (fmt === 2) return `0x${val.toString(16).padStart(2,'0')}`;
    return `${val}`;
  }).join(',');

  let _mod16Ctr = 0;
  const polyMod16 = (): string => {
    const v = _mod16Ctr++ % 6;
    if (v === 0) return '65536';
    if (v === 1) return '0x10000';
    if (v === 2) return '(256*256)';
    if (v === 3) return '(0x100*256)';
    if (v === 4) return '(128*512)';
    return '(0x80*0x200)';
  };

  const emitHoneypot = () => {
    const variant = Math.floor(rng() * 10);
    const v = randomName(3);
    honeyVars.push(v);
    switch (variant) {
      case 0:
        L.push(`local ${v}={${rArr(16 + Math.floor(rng() * 48))}}`);
        break;
      case 1: {
        const a = rInt(), b = rInt(), c = rInt();
        L.push(`local ${v}=${nBxor}(${nBand}(${a},0xFF),${nRsh}(${b},${2 + Math.floor(rng() * 6)}))+${c}`);
        break;
      }
      case 2: {
        const n = randomName(2);
        const iters = 4 + Math.floor(rng() * 12);
        const mul = 1 + Math.floor(rng() * 7);
        const add = Math.floor(rng() * 256);
        L.push(`local ${v}=${rInt()};for ${n}=1,${iters} do ${v}=${nBand}(${v}*${mul}+${add},0xFFFF) end`);
        break;
      }
      case 3: {
        const ref = honeyVars.length > 1 ? honeyVars[Math.floor(rng() * (honeyVars.length - 1))] : `${rInt()}`;
        L.push(`local ${v};if type(${ref})=="number" then ${v}=${nBxor}(${ref},${rInt()}) else ${v}=${rInt()} end`);
        break;
      }
      case 4: {
        const t1 = honeyVars.length > 1 ? honeyVars[Math.floor(rng() * (honeyVars.length - 1))] : `{${rArr(8)}}`;
        L.push(`local ${v}={};if type(${t1})=="table" then for _k=1,#${t1} do ${v}[_k]=${nBxor}(${t1}[_k],${rByte()}) end end`);
        break;
      }
      case 5: {
        const a = rInt(), b = rByte(), c = rByte();
        L.push(`local ${v}=${a};do ${v}=${nBor}(${nLsh}(${nBand}(${v},0xF),4),${b});${v}=${nBxor}(${v},${c}) end`);
        break;
      }
      case 6: {
        const ref = fragNames.length > 0 ? fragNames[Math.floor(rng() * fragNames.length)] : `""`;
        const pos = 1 + Math.floor(rng() * 100);
        L.push(`local ${v}=(type(${ref})=="string" and #${ref}>${pos}) and ${nBy}(${ref},${pos}) or ${rByte()}`);
        break;
      }
      case 7: {
        const vals = Array.from({ length: 3 + Math.floor(rng() * 3) }, () => rInt());
        let expr = `${vals[0]}`;
        for (let i = 1; i < vals.length; i++) expr = `${nBxor}(${expr},${vals[i]})`;
        L.push(`local ${v}=${expr}`);
        break;
      }
      case 8: {
        const a = rInt(), b = 3 + Math.floor(rng() * 13), c = rInt();
        L.push(`local ${v}=(${a}*${b}+${c})%${251 + Math.floor(rng() * 5)}`);
        break;
      }
      case 9: {
        const ref = honeyVars.length > 1 ? honeyVars[Math.floor(rng() * (honeyVars.length - 1))] : `${rInt()}`;
        if (latePcall) {
          L.push(`local ${v}=${latePcall}(function() return ${nBand}(${ref}+${rInt()},0xFFFF) end) and ${rInt()} or ${rInt()}`);
        } else {
          L.push(`local ${v}=${nBxor}(${rInt()},${rByte()})`);
        }
        break;
      }
    }
  };

  const honeypots = (n: number) => { for (let i = 0; i < n; i++) emitHoneypot(); };

  const emitPreBootDead = () => {
    const variant = Math.floor(rng() * 22);
    const v = randomName(3);
    honeyVars.push(v);
    switch (variant) {
      case 0: {
        const n2 = randomName(2), iters = 3 + Math.floor(rng() * 10);
        L.push(`local ${v}=${rInt()};for ${n2}=1,${iters} do ${v}=(${v}*${2+Math.floor(rng()*6)}+${rByte()})%${polyMod16()} end`);
        break; }
      case 1: {
        L.push(`local ${v}={};for ${randomName(1)}=1,${3+Math.floor(rng()*8)} do ${v}[#${v}+1]=${rByte()} end`);
        break; }
      case 2: {
        const ops = ['+','-','*']; const op = ops[Math.floor(rng()*3)];
        L.push(`local ${v}=(${rInt()}${op}${rInt()})%${251 + Math.floor(rng() * 5)}`);
        break; }
      case 3: {
        const ref = honeyVars.length > 1 ? honeyVars[Math.floor(rng() * (honeyVars.length - 1))] : `${rInt()}`;
        L.push(`local ${v};if type(${ref})=="number" then ${v}=${ref}+${rInt()} else ${v}=${rInt()} end`);
        break; }
      case 4: {
        const v2 = randomName(2), v3 = randomName(2);
        L.push(`do local ${v2}=${rInt()};local ${v3}=${rInt()};local ${v}=(${v2}+${v3})%${251+Math.floor(rng()*5)} end`);
        break; }
      case 5: {
        L.push(`local ${v}={${rArr(8 + Math.floor(rng() * 32))}}`);
        break; }
      case 6: {
        const n2 = randomName(2);
        L.push(`local ${v}=${rInt()};local ${n2}=0;while ${n2}<${3+Math.floor(rng()*6)} do ${v}=(${v}+${rByte()})%${polyMod16()};${n2}=${n2}+1 end`);
        break; }
      case 7: {
        const n2 = randomName(2);
        L.push(`local ${v}=${rInt()};local ${n2}=0;repeat ${v}=(${v}*${2+Math.floor(rng()*4)}+${rByte()})%${polyMod16()};${n2}=${n2}+1 until ${n2}>=${3+Math.floor(rng()*5)}`);
        break; }
      case 8: {
        L.push(`local ${v}=type(${rInt()})~="string" and ${rInt()} or ${rInt()}`);
        break; }
      case 9: {
        const v2 = randomName(2);
        L.push(`local ${v}=${rInt()};do local ${v2}=${rInt()};if ${v}>${v2} then ${v}=${v}-${v2} else ${v}=${v}+${v2} end end`);
        break; }
      case 10: {
        const n2 = randomName(2), seed = rInt(), mul = 3 + Math.floor(rng() * 5);
        L.push(`local ${v}=${seed};local ${n2}=1;while ${n2}<=${4+Math.floor(rng()*8)} do ${v}=(${v}*${mul}+${n2})%${polyMod16()};${n2}=${n2}+1 end`);
        break; }
      case 11: {
        const v2 = randomName(2), v3 = randomName(2);
        L.push(`local ${v}=${rInt()};local ${v2}=${rInt()};local ${v3}=0;for ${randomName(1)}=1,${3+Math.floor(rng()*5)} do ${v3}=${v3}+(${v}+${v2})%${251+Math.floor(rng()*5)};${v}=(${v}+${rByte()})%${polyMod16()} end`);
        break; }
      case 12: {
        const n2 = randomName(1), n3 = randomName(1);
        L.push(`local ${v}=0;for ${n2}=1,${2+Math.floor(rng()*3)} do for ${n3}=1,${2+Math.floor(rng()*3)} do ${v}=${v}+${n2}*${n3} end end`);
        break; }
      case 13: {
        const ref = honeyVars.length > 1 ? honeyVars[Math.floor(rng() * (honeyVars.length - 1))] : `${rInt()}`;
        L.push(`local ${v}=${rInt()};if ${v}>${rInt()} then ${v}=${v}-${rByte()} elseif type(${ref})=="number" then ${v}=${v}+${rByte()} else ${v}=0 end`);
        break; }
      case 14: {
        const v2 = randomName(2), limit = 4 + Math.floor(rng() * 8);
        L.push(`local ${v}=${rInt()};local ${v2}=${rInt()};for ${randomName(1)}=1,${limit} do if ${v}>${v2} then ${v}=(${v}-${v2})%${polyMod16()} else ${v}=(${v}+${v2})%${polyMod16()} end end`);
        break; }
      case 15: {
        const a = rInt(), b = 3 + Math.floor(rng() * 13), c = rInt();
        L.push(`local ${v}=(${a}*${b}+${c})%${251+Math.floor(rng()*5)};${v}=(${v}*${v}+${rByte()})%${polyMod16()}`);
        break; }
      case 16: {
        const t = randomName(2), len = 4 + Math.floor(rng() * 6), idx = randomName(1);
        L.push(`local ${t}={${rArr(len)}};local ${v}=0;for ${idx}=1,${len} do ${v}=${v}+${t}[${idx}] end`);
        break; }
      case 17: {
        const base = 2 + Math.floor(rng() * 8), exp = 2 + Math.floor(rng() * 4);
        L.push(`local ${v}=${rInt()};for ${randomName(1)}=1,${exp} do ${v}=(${v}*${base}+${rByte()})%${polyMod16()} end`);
        break; }
      case 18: {
        const v2 = randomName(2), v3 = randomName(2);
        L.push(`local ${v},${v2},${v3}=${rInt()},${rInt()},${rInt()};${v},${v2}=${v2},${v}`);
        break; }
      case 19: {
        const n2 = randomName(2);
        L.push(`local ${v}=${rInt()};local ${n2}=0;while true do ${v}=(${v}+${rByte()})%${polyMod16()};${n2}=${n2}+1;if ${n2}>=${2+Math.floor(rng()*6)} then break end end`);
        break; }
      case 20: {
        const t = randomName(2), len = 3 + Math.floor(rng() * 5), idx1 = randomName(1), idx2 = randomName(1);
        L.push(`local ${t}={};for ${idx1}=1,${len} do ${t}[#${t}+1]=${rByte()} end;local ${v}=0;for ${idx2}=1,#${t} do ${v}=(${v}+${t}[${idx2}])%${polyMod16()} end`);
        break; }
      case 21: {
        const v2 = randomName(2), v3 = randomName(2);
        const a = rInt(), b = rInt();
        L.push(`local ${v}=${a};local ${v2}=${b};local ${v3};if ${v}>${v2} then ${v3}=${v}-${v2} else ${v3}=${v2}-${v} end;${v}=(${v3}*${2+Math.floor(rng()*6)}+${rByte()})%${polyMod16()}`);
        break; }
    }
  };

  const preBootCount = 2 + Math.floor(rng() * 3);
  for (let pb = 0; pb < preBootCount; pb++) emitPreBootDead();

  const emitSafeHoneypot = () => {
    const variant = Math.floor(rng() * 6);
    const v = randomName(3);
    honeyVars.push(v);
    switch (variant) {
      case 0: L.push(`local ${v}={${rArr(8 + Math.floor(rng() * 24))}}`); break;
      case 1: { const a = rInt(), b = 3 + Math.floor(rng() * 13), c = rInt();
        L.push(`local ${v}=(${a}*${b}+${c})%${251 + Math.floor(rng() * 5)}`); break; }
      case 2: { const n2 = randomName(2), iters = 4 + Math.floor(rng() * 8);
        L.push(`local ${v}=${rInt()};for ${n2}=1,${iters} do ${v}=(${v}*${3+Math.floor(rng()*5)}+${rByte()})%${polyMod16()} end`); break; }
      case 3: { const ref = honeyVars.length > 1 ? honeyVars[Math.floor(rng() * (honeyVars.length - 1))] : `${rInt()}`;
        L.push(`local ${v};if type(${ref})=="number" then ${v}=${ref}+${rInt()} else ${v}=${rInt()} end`); break; }
      case 4: { const codes = Array.from({length: 3 + Math.floor(rng() * 5)}, () => 65 + Math.floor(rng() * 26));
        L.push(`local ${v}=${nCh}(${codes.join(",")})`); break; }
      case 5: { L.push(`local ${v}={};for ${randomName(1)}=1,${4+Math.floor(rng()*12)} do ${v}[#${v}+1]=${rByte()} end`); break; }
    }
  };
  const safeHoneypots = (n: number) => { for (let i = 0; i < n; i++) emitSafeHoneypot(); };

  const polyLuaEsc = (s: string): string => {
    const escaped = Array.from(s).map(c => {
      const code = c.charCodeAt(0);
      const fmt = Math.floor(rng() * 3);
      if (fmt === 0) return `\\${code}`;
      if (fmt === 1) return `\\${code.toString().padStart(3, '0')}`;
      return `\\${code}`;
    }).join('');
    return `"${escaped}"`;
  };
  const charPatterns = [
    () => `("")[${polyLuaEsc("char")}]`,
    () => `((nil or "")[${polyLuaEsc("char")}])`,
    () => `((false or "")[${polyLuaEsc("char")}])`,
    () => `(("" or "")[${polyLuaEsc("char")}])`,
    () => `(true and "" or nil)[${polyLuaEsc("char")}]`,
    () => `(function() return "" end)()[${polyLuaEsc("char")}]`,
    () => `({[1]=""})[1][${polyLuaEsc("char")}]`,
    () => `(select(1,""))[${polyLuaEsc("char")}]`,
  ];

  const lsCharCodes = (chVar: string): string => {
    return Array.from("loadstring").map(c => {
      const code = c.charCodeAt(0);
      const m = Math.floor(rng() * 4);
      if (m === 0) { const d = 1 + Math.floor(rng() * 30); return `${code - d}+${d}`; }
      if (m === 1) { const d = 1 + Math.floor(rng() * 30); return `${code + d}-${d}`; }
      if (m === 2) return `0x${code.toString(16)}`;
      return `${code}`;
    }).join(',');
  };

  const encodedLsExpr = (chVar: string): string => {
    const codes = lsCharCodes(chVar);
    const gfLocal = randomName(2);

    const fnCodes = Array.from("function").map(c => {
      const code = c.charCodeAt(0);
      const m = Math.floor(rng() * 4);
      if (m === 0) { const d = 1 + Math.floor(rng() * 30); return `${code - d}+${d}`; }
      if (m === 1) { const d = 1 + Math.floor(rng() * 30); return `${code + d}-${d}`; }
      if (m === 2) return `0x${code.toString(16)}`;
      return `${code}`;
    }).join(',');

    const envExpr = `(function() local ${gfLocal}=getfenv;return (type(${gfLocal})==${chVar}(${fnCodes}) and ${gfLocal}(0) or _G) end)()`;
    const p = Math.floor(rng() * 3);
    if (p === 0) return `${envExpr}[${chVar}(${codes})]`;
    if (p === 1) return `(function() local _e=${envExpr};return _e end)()[${chVar}(${codes})]`;
    return `({[0]=${envExpr}})[0][${chVar}(${codes})]`;
  };

  const bootVariant = Math.floor(rng() * 4);
  const nLdBoot = randomName(3);

  if (bootVariant === 0) {

    L.push(`local ${nCh}=${charPatterns[Math.floor(rng() * charPatterns.length)]()}`);
    L.push(`local ${nLdBoot}=${encodedLsExpr(nCh)}`);
    safeHoneypots(1 + Math.floor(rng() * 2));
  } else if (bootVariant === 1) {

    L.push(`local ${nCh}=${charPatterns[Math.floor(rng() * charPatterns.length)]()}`);
    if (rng() > 0.5) emitPreBootDead();
    L.push(`local ${nLdBoot}=${encodedLsExpr(nCh)}`);
    safeHoneypots(1 + Math.floor(rng() * 2));
  } else if (bootVariant === 2) {

    L.push(`local ${nCh},${nLdBoot}`);
    emitPreBootDead();
    L.push(`do ${nCh}=${charPatterns[Math.floor(rng() * charPatterns.length)]()};${nLdBoot}=${encodedLsExpr(nCh)} end`);
    safeHoneypots(1 + Math.floor(rng() * 2));
  } else {

    emitPreBootDead();
    L.push(`local ${nCh}=${charPatterns[Math.floor(rng() * charPatterns.length)]()}`);
    emitPreBootDead();
    L.push(`local ${nLdBoot}=${encodedLsExpr(nCh)}`);
    emitPreBootDead();
  }

  const vmKey = 1 + Math.floor(rng() * 254);

  const encodeVmStr = (s: string): string =>
    '{' + Array.from(s).map(c => {
      const enc = (c.charCodeAt(0) + vmKey) % 256;
      const m2 = Math.floor(rng() * 3);
      if (m2 === 0) return `${enc}`;
      if (m2 === 1) { const d = 1 + Math.floor(rng() * 20); return `${enc-d}+${d}`; }
      return `0x${enc.toString(16).padStart(2,'0')}`;
    }).join(',') + '}';

  const vmDk = randomName(3), vmProg = randomName(3), vmRes = randomName(3);
  const vmPc = randomName(2), vmIns = randomName(2), vmOp = randomName(2);
  const vmEs = randomName(2), vmDkArg = randomName(2);
  const vmDkTmp = randomName(2), vmDkI = randomName(2);

  const dkVariant = Math.floor(rng() * 3);
  if (dkVariant === 0) {
    L.push(`local ${vmDk}=function(${vmDkArg}) local ${vmDkTmp}="" for ${vmDkI}=1,#${vmDkArg} do ${vmDkTmp}=${vmDkTmp}..${nCh}((${vmDkArg}[${vmDkI}]-${vmKey})%256) end return ${vmDkTmp} end`);
  } else if (dkVariant === 1) {
    const vmDkArr = randomName(2);
    L.push(`local ${vmDk}=function(${vmDkArg}) local ${vmDkArr}={} for ${vmDkI}=1,#${vmDkArg} do ${vmDkArr}[${vmDkI}]=${nCh}((${vmDkArg}[${vmDkI}]-${vmKey})%256) end local ${vmDkTmp}="" for ${vmDkI}=1,#${vmDkArr} do ${vmDkTmp}=${vmDkTmp}..${vmDkArr}[${vmDkI}] end return ${vmDkTmp} end`);
  } else {
    L.push(`local ${vmDk}=function(${vmDkArg}) local ${vmDkTmp}="" local ${vmDkI}=0 while ${vmDkI}<#${vmDkArg} do ${vmDkI}=${vmDkI}+1;${vmDkTmp}=${vmDkTmp}..${nCh}((${vmDkArg}[${vmDkI}]-${vmKey})%256) end return ${vmDkTmp} end`);
  }

  safeHoneypots(1);

  const keyEntries: {name: string, varN: string, encoded: string}[] = [
    {name: "byte", varN: randomName(3), encoded: encodeVmStr("byte")},
    {name: "sub", varN: randomName(3), encoded: encodeVmStr("sub")},
    {name: "function", varN: randomName(3), encoded: encodeVmStr("function")},
    {name: "table", varN: randomName(3), encoded: encodeVmStr("table")},
    {name: "loadstring", varN: randomName(3), encoded: encodeVmStr("loadstring")},
    {name: "load", varN: randomName(3), encoded: encodeVmStr("load")},
    {name: "bit32", varN: randomName(3), encoded: encodeVmStr("bit32")},
    {name: "rawset", varN: randomName(3), encoded: encodeVmStr("rawset")},
    {name: "rawget", varN: randomName(3), encoded: encodeVmStr("rawget")},
    {name: "type", varN: randomName(3), encoded: encodeVmStr("type")},
    {name: "pcall", varN: randomName(3), encoded: encodeVmStr("pcall")},
    {name: "game", varN: randomName(3), encoded: encodeVmStr("game")},
    {name: "script", varN: randomName(3), encoded: encodeVmStr("script")},
    {name: "getfenv", varN: randomName(3), encoded: encodeVmStr("getfenv")},
    {name: "concat", varN: randomName(3), encoded: encodeVmStr("concat")},
    {name: "Workspace", varN: randomName(3), encoded: encodeVmStr("Workspace")},
  ];
  const kn = (nm: string) => keyEntries.find(e => e.name === nm)!.varN;

  const keyOrder = keyEntries.map((_, i) => i);
  for (let i = keyOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [keyOrder[i], keyOrder[j]] = [keyOrder[j], keyOrder[i]];
  }
  for (const idx of keyOrder) {
    L.push(`local ${keyEntries[idx].varN}=${keyEntries[idx].encoded}`);
    if (rng() > 0.5) safeHoneypots(1);
  }

  safeHoneypots(1);

  const opPool = Array.from({length: 30}, (_, i) => i + 1);
  for (let i = opPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [opPool[i], opPool[j]] = [opPool[j], opPool[i]];
  }
  const OP_STR = opPool[0];
  const OP_ENV = opPool[1];
  const OP_IDX = opPool[2];
  const OP_IOR = opPool[3];
  const OP_NOP = opPool[4];

  const strOps = [
    `{${OP_STR},1,${kn("byte")}}`,
    `{${OP_STR},2,${kn("sub")}}`,
  ];
  if (rng() > 0.5) [strOps[0], strOps[1]] = [strOps[1], strOps[0]];

  const envOp = `{${OP_ENV},3,${kn("getfenv")}}`;

  const globOps = [
    `{${OP_IDX},4,3,${kn("table")}}`,
    `{${OP_IOR},5,3,${kn("loadstring")},${kn("load")}}`,
    `{${OP_IDX},6,3,${kn("bit32")}}`,
    `{${OP_IDX},7,3,${kn("rawset")}}`,
    `{${OP_IDX},8,3,${kn("rawget")}}`,
    `{${OP_IDX},9,3,${kn("type")}}`,
    `{${OP_IDX},10,3,${kn("pcall")}}`,
    `{${OP_IDX},11,3,${kn("game")}}`,
    `{${OP_IDX},12,3,${kn("script")}}`,
  ];
  for (let i = globOps.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [globOps[i], globOps[j]] = [globOps[j], globOps[i]];
  }

  const nopInstr = () => `{${OP_NOP},${20+Math.floor(rng()*10)},${rByte()}}`;
  const progEntries: string[] = [];
  if (rng() > 0.5) progEntries.push(nopInstr());
  for (const op of strOps) { progEntries.push(op); if (rng() > 0.5) progEntries.push(nopInstr()); }
  progEntries.push(envOp);
  if (rng() > 0.5) progEntries.push(nopInstr());
  for (const op of globOps) { progEntries.push(op); if (rng() > 0.5) progEntries.push(nopInstr()); }

  L.push(`local ${vmProg}={${progEntries.join(",")}}`);

  if (rng() > 0.5) safeHoneypots(1);

  L.push(`local ${vmRes}={}`);
  L.push(`local ${vmEs}=""`);

  const cases = [
    { op: OP_STR, code: `${vmRes}[${vmIns}[2]]=${vmEs}[${vmDk}(${vmIns}[3])]` },
    { op: OP_ENV, code: (() => {

      const envSrc = `return (type(getfenv)=='function' and getfenv(0)) or _G`;
      const envCodes = Array.from(envSrc).map(c => {
        const code = c.charCodeAt(0);
        const m = Math.floor(rng() * 3);
        if (m === 0) { const d = 1 + Math.floor(rng() * 50); return `${code - d}+${d}`; }
        if (m === 1) { const d = 1 + Math.floor(rng() * 50); return `${code + d}-${d}`; }
        return `${code}`;
      }).join(',');
      return `${vmRes}[${vmIns}[2]]=${nLdBoot}(${nCh}(${envCodes}))()`;
    })() },
    { op: OP_IDX, code: `${vmRes}[${vmIns}[2]]=${vmRes}[${vmIns}[3]][${vmDk}(${vmIns}[4])]` },
    { op: OP_IOR, code: `${vmRes}[${vmIns}[2]]=${vmRes}[${vmIns}[3]][${vmDk}(${vmIns}[4])] or ${vmRes}[${vmIns}[3]][${vmDk}(${vmIns}[5])]` },
    { op: OP_NOP, code: `${vmRes}[${vmIns}[2]]=${vmIns}[3]` },
  ];
  for (let i = cases.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cases[i], cases[j]] = [cases[j], cases[i]];
  }

  let ifChain = `if ${vmOp}==${cases[0].op} then ${cases[0].code}`;
  for (let i = 1; i < cases.length; i++) {
    ifChain += ` elseif ${vmOp}==${cases[i].op} then ${cases[i].code}`;
  }
  ifChain += ` end`;

  const loopVariant = Math.floor(rng() * 3);
  if (loopVariant === 0) {
    L.push(`for ${vmPc}=1,#${vmProg} do local ${vmIns}=${vmProg}[${vmPc}];local ${vmOp}=${vmIns}[1];${ifChain} end`);
  } else if (loopVariant === 1) {
    L.push(`local ${vmPc}=1;while ${vmPc}<=#${vmProg} do local ${vmIns}=${vmProg}[${vmPc}];local ${vmOp}=${vmIns}[1];${ifChain};${vmPc}=${vmPc}+1 end`);
  } else {
    L.push(`local ${vmPc}=0;repeat ${vmPc}=${vmPc}+1;local ${vmIns}=${vmProg}[${vmPc}];local ${vmOp}=${vmIns}[1];${ifChain} until ${vmPc}>=#${vmProg}`);
  }

  safeHoneypots(1);

  L.push(`local ${nBy}=${vmRes}[1]`);
  L.push(`local ${nSb}=${vmRes}[2]`);
  L.push(`local ${nEv}=${vmRes}[3]`);
  L.push(`local ${nTb}=${vmRes}[4]`);
  L.push(`local ${nLd}=${vmRes}[5]`);
  L.push(`local ${nBt}=${vmRes}[6]`);
  const nRawSet = randomName(3);
  const nRawGet = randomName(3);
  L.push(`local ${nRawSet}=${vmRes}[7]`);
  L.push(`local ${nRawGet}=${vmRes}[8]`);
  const nCType = randomName(3);
  const nCPcall = randomName(3);
  const nCGame = randomName(3);
  const nCScript = randomName(3);
  L.push(`local ${nCType}=${vmRes}[9]`);
  L.push(`local ${nCPcall}=${vmRes}[10]`);
  latePcall = nCPcall;
  L.push(`local ${nCGame}=${vmRes}[11]`);
  L.push(`local ${nCScript}=${vmRes}[12]`);

  L.push(`local ${nBxor}=${nBt}[${vmDk}(${encodeVmStr("bxor")})]`);
  L.push(`local ${nBand}=${nBt}[${vmDk}(${encodeVmStr("band")})]`);
  L.push(`local ${nBor}=${nBt}[${vmDk}(${encodeVmStr("bor")})]`);
  L.push(`local ${nLsh}=${nBt}[${vmDk}(${encodeVmStr("lshift")})]`);
  L.push(`local ${nRsh}=${nBt}[${vmDk}(${encodeVmStr("rshift")})]`);

  L.push(`local ${bxorAliases[1]}=${nBxor};local ${bxorAliases[2]}=${nBxor}`);
  L.push(`local ${chAliases[1]}=${nCh};local ${chAliases[2]}=${nCh}`);
  const aliasInsertIdx = L.length;
  const nConcat = randomName(3);
  L.push(`local ${nConcat}=${nTb}[${vmDk}(${encodeVmStr("concat")})]`);
  const nTU = randomName(3);
  L.push(`local ${nTU}=${nTb}[${vmDk}(${encodeVmStr("unpack")})]`);

  const nTw = randomName(2);
  L.push(`local ${nTw};do local _t=${nEv}[${vmDk}(${encodeVmStr("task")})] if _t then ${nTw}=_t[${vmDk}(${encodeVmStr("wait")})] end end`);

  honeypots(1 + Math.floor(rng() * 2));

  const fragRotKey = 1 + Math.floor(rng() * 93);
  const fragOrder = frags.map((_, i) => i);
  for (let i = fragOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [fragOrder[i], fragOrder[j]] = [fragOrder[j], fragOrder[i]];
  }
  for (const idx of fragOrder) {
    if (rng() > 0.4) honeypots(1);
    L.push(`local ${fragNames[idx]}=${luaStr(frags[idx])}`);
  }
  honeypots(1);

  const chunks = [cInv.slice(0, 64), cInv.slice(64, 128), cInv.slice(128, 192), cInv.slice(192)];
  const chunkNames = [randomName(3), randomName(3), randomName(3), randomName(3)];
  const chunkKeys = [1 + Math.floor(rng() * 254), 1 + Math.floor(rng() * 254), 1 + Math.floor(rng() * 254), 1 + Math.floor(rng() * 254)];
  const chunkOrder = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [chunkOrder[i], chunkOrder[j]] = [chunkOrder[j], chunkOrder[i]];
  }
  for (const idx of chunkOrder) {
    const encoded = chunks[idx].map(v => v ^ chunkKeys[idx]);
    L.push(`local ${chunkNames[idx]}={${encoded.join(",")}}`);
    if (rng() > 0.5) honeypots(1);
  }

  honeypots(1);

  const alphaXorKey = 1 + Math.floor(rng() * 254);
  const alphaCodes = Array.from(alpha).map(c => (c.charCodeAt(0) ^ alphaXorKey)).join(',');
  const nGuard = randomName(3);
  const nTmpChk = randomName(2);
  const hookByte = 65 + Math.floor(rng() * 26);
  const nDec = randomName(3);
  const nRle = randomName(3);
  const nCf = randomName(2);
  const corruptKey = 1 + Math.floor(rng() * 254);

  L.push(`local ${nDt},${nAl},${nLUT},${nCnt},${nIv},${nDec},${nRle},${nOut},${nGuard},${nTmpChk},${nCf}`);

  const nSt = randomName(2);
  const usedSt = new Set<number>();
  const genStId = () => { let id: number; do { id = 1 + Math.floor(rng() * 65534); } while (usedSt.has(id)); usedSt.add(id); return id; };

  const ST_INIT = genStId(), ST_DECODE = genStId();
  const ST_RLE = genStId(), ST_LZSS = genStId(), ST_SEC = genStId();
  const ST_EXEC = genStId(), ST_EXIT = genStId();
  const nFakeCount = 2 + Math.floor(rng() * 3);
  const fakeStIds = Array.from({length: nFakeCount}, () => genStId());

  const cfStates: {id: number; lines: string[]; nextId: number}[] = [];

  cfStates.push({ id: ST_INIT, nextId: ST_DECODE, lines: [
    `${nDt}=${fragNames.join("..")}`,
    `${nAl}={${alphaCodes}}`,
    `${nLUT}={};for _i=1,64 do ${nLUT}[${nBxor}(${nAl}[_i],${alphaXorKey})]=_i-1 end;${nLUT}[${padByte}]=0`,
    (() => {

      const lutVar = Math.floor(rng() * 3);
      if (lutVar === 0) {

        return `${nIv}={};for _k=1,128 do if _k<=64 then ${nIv}[_k]=${nBxor}(${chunkNames[0]}[_k],${chunkKeys[0]}) else ${nIv}[_k]=${nBxor}(${chunkNames[1]}[_k-64],${chunkKeys[1]}) end end;for _k=1,128 do if _k<=64 then ${nIv}[128+_k]=${nBxor}(${chunkNames[2]}[_k],${chunkKeys[2]}) else ${nIv}[192+_k-64]=${nBxor}(${chunkNames[3]}[_k-64],${chunkKeys[3]}) end end`;
      } else if (lutVar === 1) {

        const cTbl = randomName(2);
        const kTbl = randomName(2);
        return `${nIv}={};local ${cTbl}={${chunkNames.join(',')}};local ${kTbl}={${chunkKeys.join(',')}};for _k=0,255 do local _ci=(_k>=192 and 4) or (_k>=128 and 3) or (_k>=64 and 2) or 1;${nIv}[_k+1]=${nBxor}(${cTbl}[_ci][_k-(_ci-1)*64+1],${kTbl}[_ci]) end`;
      } else {

        return `${nIv}={};for _k=1,64 do ${nIv}[_k]=${nBxor}(${chunkNames[0]}[_k],${chunkKeys[0]}) end;for _k=1,64 do ${nIv}[64+_k]=${nBxor}(${chunkNames[1]}[_k],${chunkKeys[1]}) end;for _k=1,64 do ${nIv}[128+_k]=${nBxor}(${chunkNames[2]}[_k],${chunkKeys[2]}) end;for _k=1,64 do ${nIv}[192+_k]=${nBxor}(${chunkNames[3]}[_k],${chunkKeys[3]}) end`;
      }
    })(),
  ]});

  cfStates.push({ id: ST_DECODE, nextId: ST_RLE, lines: [
    `${nDec}={};${nCnt}=0`,
    `for _i=1,#${nDt},4 do`,
    `if _i%${30000 + Math.floor(rng() * 20001)}==1 and ${nTw} then ${nTw}() end`,
    `local _p1,_p2,_p3,_p4=${nBy}(${nDt},_i,_i+3)`,
    `local a,b,c,d=${nLUT}[_p1],${nLUT}[_p2],${nLUT}[_p3],${nLUT}[_p4]`,
    `${nCnt}=${nCnt}+1;${nDec}[${nCnt}]=${nBxor}(${nIv}[${nBor}(${nLsh}(a,2),${nRsh}(b,4))+1],${nBand}(${cSeed}+(${nCnt}-1)*${cStep},0xFF))`,
    `if _p3~=${padByte} then ${nCnt}=${nCnt}+1;${nDec}[${nCnt}]=${nBxor}(${nIv}[${nBand}(${nBor}(${nLsh}(b,4),${nRsh}(c,2)),0xFF)+1],${nBand}(${cSeed}+(${nCnt}-1)*${cStep},0xFF)) end`,
    `if _p4~=${padByte} then ${nCnt}=${nCnt}+1;${nDec}[${nCnt}]=${nBxor}(${nIv}[${nBand}(${nBor}(${nLsh}(c,6),d),0xFF)+1],${nBand}(${cSeed}+(${nCnt}-1)*${cStep},0xFF)) end`,
    `end`,
    `${nCf}=${nDec}[1]`,
  ]});

  cfStates.push({ id: ST_RLE, nextId: ST_LZSS, lines: [
    `if ${nCf}==0 then ${nRle}={};for _i=2,${nCnt} do ${nRle}[_i-1]=${nDec}[_i] end;${nCnt}=${nCnt}-1 else`,
    `${nRle}={};local _rp=2;local _rc=0;local _dn=${nCnt}`,
    `while _rp<=_dn do local _rb=${nDec}[_rp];if _rb==255 then _rp=_rp+1;local _rn=${nDec}[_rp];if _rn==0 then _rc=_rc+1;${nRle}[_rc]=255 else _rp=_rp+1;local _rv=${nDec}[_rp];for _ri=1,_rn+3 do _rc=_rc+1;${nRle}[_rc]=_rv end end else _rc=_rc+1;${nRle}[_rc]=_rb end;_rp=_rp+1 end`,
    `${nCnt}=_rc`,
    `end`,
  ]});

  const BATCH = 150 + Math.floor(rng() * 101);
  cfStates.push({ id: ST_LZSS, nextId: ST_SEC, lines: [
    `if ${nCf}==0 then`,
    `${nTmpChk}=0;for _i=1,#${nRle} do ${nTmpChk}=(${nTmpChk}+${nRle}[_i])%${tamperPrime} end`,
    `${nOut}={};local _oc=0;local _ln=#${nRle};for _i=1,_ln,${BATCH} do _oc=_oc+1;local _e=_i+${BATCH-1};if _e>_ln then _e=_ln end;${nOut}[_oc]=${nCh}(${nTU}(${nRle},_i,_e)) end`,
    `else`,
    `local _lz={};local _lp=1;local _lc=0;local _rn=#${nRle}`,
    `while _lp<=_rn do if _lp%${35000 + Math.floor(rng() * 30001)}==1 and ${nTw} then ${nTw}() end;local _ct=${nRle}[_lp];_lp=_lp+1;if _ct<128 then local _n=_ct+1;for _i=1,_n do _lc=_lc+1;_lz[_lc]=${nRle}[_lp];_lp=_lp+1 end elseif _ct<192 then local _ll=_ct-124;local _lo=${nRle}[_lp]+1;_lp=_lp+1;local _ls=_lc;for _j=1,_ll do _lc=_lc+1;_lz[_lc]=_lz[_ls-_lo+_j] end else local _ll=_ct-188;local _lo=${nRle}[_lp]*256+${nRle}[_lp+1];_lp=_lp+2;local _ls=_lc;for _j=1,_ll do _lc=_lc+1;_lz[_lc]=_lz[_ls-_lo+_j] end end end`,
    `${nTmpChk}=0;for _i=1,_lc do ${nTmpChk}=(${nTmpChk}+_lz[_i])%${tamperPrime} end`,
    `${nOut}={};local _oc=0;for _i=1,_lc,${BATCH} do _oc=_oc+1;local _e=_i+${BATCH-1};if _e>_lc then _e=_lc end;${nOut}[_oc]=${nCh}(${nTU}(_lz,_i,_e)) end`,
    `end`,
  ]});

  const secL: string[] = [];

  secL.push(`${nGuard}=${nTmpChk}==${tamperChecksum}`);
  secL.push(`${nGuard}=${nGuard} and ${nCType}(${nLd})==${nCh}(${ccArgs("function", true)})`);
  secL.push(`${nGuard}=${nGuard} and ${nCType}(${nBt})==${nCh}(${ccArgs("table", true)})`);
  secL.push(`${nGuard}=${nGuard} and ${nCh}(${hookByte})==${luaEsc(String.fromCharCode(hookByte))}`);
  secL.push(`${nGuard}=${nGuard} and ${nBxor}(0,0)==0`);
  secL.push(`${nGuard}=${nGuard} and ${nCType}(${nCGame})==${nCh}(${ccArgs("userdata", true)})`);

  secL.push(`${nGuard}=${nGuard} and (function() local _ok,_r=${nCPcall}(function() return ${nCGame}[${vmDk}(${kn("Workspace")})] end);return _ok and ${nCType}(_r)==${nCh}(${ccArgs("userdata", true)}) end)()`);

  secL.push(`${nGuard}=${nGuard} and (function() local _ok,_r=${nCPcall}(function() return ${nCScript} end);return _ok and (_r==nil or ${nCType}(_r)==${nCh}(${ccArgs("userdata", true)})) end)()`);
  if (layerOpts?.outerPipelineKey) {
    secL.push(`${nGuard}=${nGuard} and ${nRawGet}(${nEv},${nCh}(${ccArgs(layerOpts.outerPipelineKey, true)}))==${layerOpts.expectedOuterFp}`);
  }
  if (layerOpts) {
    secL.push(`${nGuard}=${nGuard} and ${nRawGet}(${nEv},${nCh}(${ccArgs(layerOpts.signalKey, true)}))==nil`);
  }
  if (layerOpts) {
    const nFp = randomName(3);
    const buildFactorXor = tamperChecksum ^ (bytes.length % tamperPrime) ^ cSeed ^ cStep
      ^ cInv[0] ^ cInv[127] ^ cInv[255] ^ (alpha.charCodeAt(0) ^ alphaXorKey) ^ nFrags;
    const fpSecret = layerOpts.ownFingerprint ^ buildFactorXor;
    secL.push(`local ${nFp}=${nBxor}(${nTmpChk},${bytes.length % tamperPrime},${cSeed},${cStep},${nIv}[1],${nIv}[128],${nIv}[256],${nAl}[1],${nFrags})`);
    secL.push(`${nFp}=${nBxor}(${nFp},${fpSecret})`);
    secL.push(`if ${nGuard} then ${nRawSet}(${nEv},${nCh}(${ccArgs(layerOpts.ownPipelineKey, true)}),${nFp}) end`);
  }

  if (process.env.NO_SEC === '1') {

    secL.length = 0;
    secL.push(`${nGuard}=true`);
  }
  const cShuffle = randomName(2);
  secL.push(`if not ${nGuard} then local ${cShuffle}=#${nOut};for _i=${cShuffle},2,-1 do local _j=1+(_i*${corruptKey}+${Math.floor(rng() * 65536)})%_i;${nOut}[_i],${nOut}[_j]=${nOut}[_j],${nOut}[_i] end;for _i=${nBand}(${cShuffle},${Math.floor(rng() * 128) + 128})+1,${cShuffle} do ${nOut}[_i]=nil end end`);
  if (layerOpts) {
    secL.push(`if not ${nGuard} then ${nRawSet}(${nEv},${nCh}(${ccArgs(layerOpts.signalKey, true)}),${Math.floor(rng() * 65536)}) end`);
  }
  cfStates.push({ id: ST_SEC, nextId: ST_EXEC, lines: secL });

  const execL: string[] = [];

  const adVar = randomName(3);
  const adProbe = randomName(3);

  const probeVal = 1 + Math.floor(rng() * 998);
  execL.push(`local ${adProbe}=true`);
  execL.push(`do local _pOk,${adVar}=${nCPcall}(${nLd},${nCh}(${ccArgs(`return ${probeVal}`, true)}));if _pOk and ${nCType}(${adVar})==${nCh}(${ccArgs("function", true)}) then local _pOk2,_pR=${nCPcall}(${adVar});${adProbe}=_pOk2 and _pR==${probeVal} else ${adProbe}=false end end`);

  const adNil = randomName(2);
  const adErr = randomName(2);
  execL.push(`do local _pOk,${adNil},${adErr}=${nCPcall}(${nLd},${nCh}(${ccArgs(")(", true)}));${adProbe}=${adProbe} and _pOk and ${adNil}==nil and ${nCType}(${adErr})==${nCh}(${ccArgs("string", true)}) end`);

  const adOk = randomName(2);
  const adFn = randomName(2);
  execL.push(`do local ${adOk},${adFn}=${nCPcall}(${nLd},${nCh}(${ccArgs("return 0", true)}));${adProbe}=${adProbe} and ${adOk}==true and ${nCType}(${adFn})==${nCh}(${ccArgs("function", true)}) end`);

  if (process.env.NO_SEC !== '1') {
    execL.push(`if not ${adProbe} then for _i=1,#${nOut} do ${nOut}[_i]=${nCh}(${Math.floor(rng() * 94) + 33}) end end`);
  } else {

    rng();
  }

  const fakeErrs = [
    "attempt to call a nil value", "stack overflow", "not enough memory",
    "C stack overflow", "table index is NaN", "invalid argument #1",
    "attempt to index nil with 'new'", "yield across metamethod/C-call boundary",
  ];
  for (let fe = 0; fe < 2 + Math.floor(rng() * 3); fe++) {
    const fv = randomName(2);
    const errStr = fakeErrs[Math.floor(rng() * fakeErrs.length)];
    honeyVars.push(fv);
    execL.push(`local ${fv};if ${nCType}(${nTmpChk})~=${nCh}(${ccArgs("number", true)}) then _G[${nCh}(${ccArgs("error", true)})](${nCh}(${ccArgs(errStr, true)})) end`);
  }

  const nCompiledFn = randomName(3);
  execL.push(`${nCompiledFn}=${nLd}(${nConcat}(${nOut}))`);
  execL.push(`for _i=1,#${nOut} do ${nOut}[_i]=nil end`);
  cfStates.push({ id: ST_EXEC, nextId: ST_EXIT, lines: execL });

  for (const fid of fakeStIds) {
    const fv = randomName(3); honeyVars.push(fv);
    const fVar = Math.floor(rng() * 4);
    const fl: string[] = [];
    if (fVar === 0) fl.push(`local ${fv}=${rInt()};for _k=1,${4+Math.floor(rng()*8)} do ${fv}=${nBand}(${fv}*${3+Math.floor(rng()*5)}+${rByte()},0xFFFF) end`);
    else if (fVar === 1) fl.push(`local ${fv}={${rArr(8+Math.floor(rng()*16))}}`);
    else if (fVar === 2) fl.push(`local ${fv}=${nBxor}(${rInt()},${rInt()});${fv}=${nBand}(${fv},0xFF)`);
    else fl.push(`local ${fv}=${nCType}(${rInt()})~=${nCh}(${ccArgs("number")}) and ${rInt()} or ${rInt()}`);
    cfStates.push({ id: fid, nextId: fakeStIds[Math.floor(rng() * fakeStIds.length)], lines: fl });
  }

  for (let i = cfStates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cfStates[i], cfStates[j]] = [cfStates[j], cfStates[i]];
  }

  L.push(`local ${nCompiledFn}`);
  L.push(`local ${nSt}=${ST_INIT}`);
  L.push(`while true do`);
  for (let i = 0; i < cfStates.length; i++) {
    const st = cfStates[i];
    L.push(`${i === 0 ? 'if' : 'elseif'} ${nSt}==${st.id} then`);
    for (const line of st.lines) L.push(line);
    if (st.nextId === ST_EXIT) {
      L.push(`break`);
    } else {
      const delta = st.id ^ st.nextId;
      L.push(`${nSt}=${nBxor}(${nSt},${delta})`);
    }
  }
  L.push(`end`);
  L.push(`end`);

  const epVar = Math.floor(rng() * 4);
  if (epVar === 1) { randomName(2); }
  else if (epVar === 2) { randomName(2); }
  else if (epVar === 3) { randomName(2); randomName(2); }
  L.push(`return ${nCompiledFn}()`);

  {
    const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let bIdx = 0, cIdx = 0;
    for (let i = aliasInsertIdx; i < L.length; i++) {
      L[i] = L[i].replace(new RegExp('(?<![a-zA-Z0-9_])' + escRe(nBxor) + '\\(', 'g'), () => {
        return bxorAliases[bIdx++ % bxorAliases.length] + '(';
      });
      L[i] = L[i].replace(new RegExp('(?<![a-zA-Z0-9_])' + escRe(nCh) + '\\(', 'g'), () => {
        return chAliases[cIdx++ % chAliases.length] + '(';
      });
    }
  }

  return L.join("\n");
}

function generateDynamicSeed(chunk: RegBytecodeChunk): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => { h ^= v & 0xFF; h = Math.imul(h, 0x01000193); h ^= (v >>> 8) & 0xFF; h = Math.imul(h, 0x01000193); };

  mix(Date.now());
  mix(Date.now() >>> 16);

  mix((Math.random() * 0xFFFFFFFF) >>> 0);
  mix((Math.random() * 0xFFFFFFFF) >>> 0);

  try { const hr = process.hrtime(); mix(hr[0]); mix(hr[1]); } catch {}

  try { mix(process.pid); } catch {}

  try { const cb = randomBytes(16); for (let i = 0; i < 16; i += 4) mix(cb.readUInt32LE(i)); } catch {}

  for (let i = 0; i < chunk.code.length; i += 37) mix(chunk.code[i]);
  mix(chunk.K.length);
  mix((chunk.protos?.length ?? 0) * 7919);
  for (let i = 0; i < Math.min(chunk.K.length, 20); i++) {
    const k = chunk.K[i];
    if (typeof k === "number") mix(k);
    else if (typeof k === "string") { for (let j = 0; j < Math.min(k.length, 8); j++) mix(k.charCodeAt(j)); }
  }

  return h >>> 0;
}

function serializeBytecodeAsBinary(chunk: RegBytecodeChunk, ctx: BuildCtx): Uint8Array {
  const parts: number[] = [];

  function writeU8(v: number): void { parts.push(v & 0xFF); }
  function writeU16(v: number): void { parts.push(v & 0xFF, (v >>> 8) & 0xFF); }
  function writeU32(v: number): void {
    parts.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
  }
  function writeI16(v: number): void {
    const u = v < 0 ? v + 65536 : v;
    writeU16(u);
  }
  function writeF64(v: number): void {
    const buf = Buffer.alloc(8);
    buf.writeDoubleLE(v, 0);
    for (let i = 0; i < 8; i++) parts.push(buf[i]);
  }
  function writeString(s: string): void {
    const encoded = Buffer.from(s, 'utf-8');
    writeU16(encoded.length);
    for (let i = 0; i < encoded.length; i++) parts.push(encoded[i]);
  }

  function serializeChunk(ch: RegBytecodeChunk): void {

    writeU16(ch.nParams ?? 0);
    writeU8(ch.isVararg ? 1 : 0);
    writeU16(ch.maxRegs ?? 0);

    const code = ch.code;
    const nInstr = Math.floor(code.length / 4);
    writeU32(nInstr);

    for (let i = 0; i < code.length; i += 4) {

      writeU8(code[i]);
      writeI16(code[i + 1]);
      writeI16(code[i + 2]);
      writeI16(code[i + 3]);
    }

    const K = ch.K;
    writeU16(K.length);
    for (const k of K) {
      if (k === null || k === undefined) {
        writeU8(0);
      } else if (typeof k === 'boolean') {
        writeU8(1);
        writeU8(k ? 1 : 0);
      } else if (typeof k === 'number') {
        writeU8(2);
        writeF64(k);
      } else if (typeof k === 'string') {
        writeU8(3);
        writeString(k);
      }
    }

    const upvals = ch.upvalues ?? [];
    writeU16(upvals.length);
    for (const [isLocal, index] of upvals) {
      writeU8(isLocal);
      writeU16(index);
    }

    const protos = ch.protos ?? [];
    writeU16(protos.length);
    for (const proto of protos) {
      serializeChunk(proto);
    }
  }

  serializeChunk(chunk);
  return new Uint8Array(parts);
}

export function generateRegVM(chunk: RegBytecodeChunk, options: RegVMGenOptions = {}): string {
  const level = options.level ?? "normal";
  // `??` (not `||`) so an explicit seed of 0 is honored as deterministic.
  const seed = options.polymorphicSeed ?? generateDynamicSeed(chunk);
  seedRandom(seed);
  resetNames();

  const doShuffle = level !== "debug" && featureEnabled(options, "opcodeShuffle", true);
  const encodeStrings = level !== "debug" && featureEnabled(options, "stringEncoding", true);
  // Handler noise locals (`local dv=...`, never read) are a deterministic
  // per-op fingerprint with real per-instruction RHS cost and zero hiding
  // value. The flag existed but was never consulted; default OFF.
  // Explicit forceFeatures: ["handlerNoise"] restores legacy emission.
  const handlerNoise = level !== "debug" && featureEnabled(options, "handlerNoise", false);
  // Dead-code injection (never-called decoder twins + junk fragments).
  // Default ON preserves historical output exactly; disableFeatures:
  // ["deadCodeInjection"] omits only provably uninvoked material.
  const deadCodeInjection = featureEnabled(options, "deadCodeInjection", true);
  const includeExecutor = options.executorGlobals ?? (level !== "debug");

  const { encode, decode } = shuffleOpcodes(doShuffle);

  const protoKeys = level === "max" ? {
    pK: randomName(2), pC: randomName(2), pP: randomName(2),
    pU: randomName(2), pN: randomName(2),
  } : { pK: "K", pC: "C", pP: "P", pU: "U", pN: "nParams" };

  const names = createNameMap(level);

  const rB = () => 1 + Math.floor(rng() * 254);
  const { sbox, inverse: sboxInverse } = encodeStrings
    ? generateSBox()
    : { sbox: Array.from({length: 256}, (_, i) => i), inverse: Array.from({length: 256}, (_, i) => i) };
  const helixSeed    = encodeStrings ? rB() : 0;
  const helixMul     = encodeStrings ? rB() : 0;
  const cascadeKey   = encodeStrings ? rB() : 0;
  const cascadeMul   = encodeStrings ? (1 + Math.floor(rng() * 126)) * 2 + 1 : 1;
  const checkKeyA    = encodeStrings ? rB() : 0;
  const checkKeyB    = encodeStrings ? rB() : 0;
  const checkStepA   = encodeStrings ? rB() : 0;
  const checkStepB   = encodeStrings ? rB() : 0;
  const spiralPrime  = encodeStrings ? SPIRAL_PRIMES[Math.floor(rng() * SPIRAL_PRIMES.length)] : 1;
  const spiralOffset = encodeStrings ? Math.floor(rng() * 251) : 0;

  const layerVariants = [
    Math.floor(rng() * 3), Math.floor(rng() * 3), Math.floor(rng() * 2),
    Math.floor(rng() * 3), Math.floor(rng() * 3),
  ];

  const isObf = level !== "debug";
  const dispatchVariant = isObf ? (1 + Math.floor(rng() * 5)) : 0;
  const dispatchMask = isObf ? (1 + Math.floor(rng() * 254)) : 0;
  const rotSeed = isObf ? (1 + Math.floor(rng() * 254)) : 0;
  const rotStep = isObf ? (1 + Math.floor(rng() * 254)) : 0;
  const rotStep2 = isObf ? (1 + Math.floor(rng() * 254)) : 0;

  const ctx: BuildCtx = {
    level, seed, names, opcodeEncode: encode, opcodeDecode: decode,
    doShuffle, encodeStrings, handlerNoise, deadCodeInjection, xorKey: 0, xorStep: 0, includeExecutor, protoKeys,
    debugTrace: options.debugTrace ?? (level === "debug"),
    sbox, sboxInverse, helixSeed, helixMul, cascadeKey, cascadeMul,
    checkKeyA, checkKeyB, checkStepA, checkStepB,
    spiralPrime, spiralOffset, layerVariants,
    dispatchVariant, dispatchMask, rotSeed, rotStep, rotStep2,
    argPerm: generateArgPerms(isObf),
  };

  const doFusion = featureEnabled(options, "opcodeFusion", level !== "debug");
  if (doFusion) {
    const allFusionOps: number[] = [
      RegOp.FUSED_TEST_JMP as number, RegOp.FUSED_EQ_JMP as number,
      RegOp.FUSED_LT_JMP as number, RegOp.FUSED_LE_JMP as number,
      RegOp.FUSED_TESTSET_JMP as number, RegOp.FUSED_GGET as number,
      RegOp.FUSED_LOADKK as number, RegOp.FUSED_MOVE_MOVE as number,
      RegOp.FUSED_SELF_CALL as number, RegOp.FUSED_GGET_CALL as number,
      RegOp.FUSED_LOADK_RET as number, RegOp.FUSED_MOVE_RET as number,
    ];

    for (let si = allFusionOps.length - 1; si > 0; si--) {
      const sj = Math.floor(rng() * (si + 1));
      [allFusionOps[si], allFusionOps[sj]] = [allFusionOps[sj], allFusionOps[si]];
    }
    const nEnabled = 7 + Math.floor(rng() * 4);
    const enabledSet = new Set(allFusionOps.slice(0, nEnabled));
    const fusionRate = 0.6 + rng() * 0.25;
    const fusionCount = applyFusionPass(chunk, enabledSet, fusionRate);
    if (fusionCount > 0) {
      console.log(`[RegVM] Fused ${fusionCount} instruction sequences (${nEnabled}/12 patterns, ${Math.round(fusionRate*100)}% rate)`);
    }
  }

  const doCFF = featureEnabled(options, "controlFlowFlattening", level !== "debug");
  if (doCFF) {
    const cffBlocks = flattenControlFlow(chunk);
    if (cffBlocks > 0) {
      console.log(`[RegVM] CFF: ${cffBlocks} blocks shuffled (main + protos)`);
    }
  }

  if (level !== "debug") {
    const used = collectUsedOpcodes(chunk);

    used.add(RegOp.NOP as number);
    used.add(RegOp.EXTRAARG as number);
    ctx.usedOps = used;
    console.log(`[RegVM] Dead handler elimination: ${used.size}/${handlerRegistry.size} opcodes used`);
  }

  const dvNames = ["flat","xor-masked","binary-tree","grouped","table-dispatch","table-xor"];
  if (level !== "debug") console.log(`[RegVM] Dispatch: variant ${dispatchVariant} (${dvNames[dispatchVariant] || "unknown"})`);

  const mappedCode = doShuffle ? mapRegBytecode(chunk.code, encode, ctx.argPerm) : chunk.code;

  const dataK = serializeConstants(chunk.K, ctx);
  const dataC = serializeRegCode(mappedCode, ctx);
  const dataP = serializeRegProtos(chunk.protos, ctx);

  const dK = level === "debug" ? "_dK" : randomName(3);
  const dC = level === "debug" ? "_dC" : randomName(3);
  const dP = level === "debug" ? "_dP" : randomName(3);

  const nP = chunk.nParams ?? 0;
  const mR = chunk.maxRegs ?? 0;
  const isVA = chunk.isVararg ? "true" : "false";

  let output: string;

  if (level === "debug") {

    const builtinCaps = buildBuiltinCaptures(ctx);
    const envSetup = buildEnvSetup(ctx);
    const vmRuntime = buildVMRuntime(ctx);
    const parts: string[] = [];
    parts.push(builtinCaps.code);
    parts.push(envSetup);
    parts.push(vmRuntime);
    parts.push(`local ${dK}=${dataK}`);
    parts.push(`local ${dC}=${dataC}`);
    parts.push(`local ${dP}=${dataP}`);
    parts.push(`return ${names.run}(${dK},${dC},${dP},{},${nP},${mR},${isVA},${names.env})`);
    output = parts.join("\n");
  } else {

    const allFragments: Fragment[] = [];
    const forwardDecls: string[] = [];

    const builtinCaps = buildBuiltinCaptures(ctx);
    const builtinNames = [
      names.bPcall, names.bXpcall, names.bSelect, names.bType,
      names.tPack, names.tUnpack, names.bTcreate, names.bTconcat,
      names.bMfloor, names.bIpairs, names.bTostring, names.bRawget,
      names.bSetmeta, names.bBxor, names.bBand,
      names.bGetmeta, names.bNext,
    ];
    forwardDecls.push(...builtinNames);

    allFragments.push({ code: builtinCaps.assignOnly, layer: -1 });

    const envResult = buildEnvFragments(ctx);
    allFragments.push(...envResult.fragments);
    forwardDecls.push(...envResult.forwardDecls);

    forwardDecls.push(names.run);
    const vmCode = buildVMRuntime(ctx, true);
    allFragments.push({ code: vmCode, layer: Math.floor(rng() * 3) });

    forwardDecls.push(dK, dC, dP);
    allFragments.push({ code: `${dK}=${dataK}`, layer: Math.floor(rng() * 3) });
    allFragments.push({ code: `${dC}=${dataC}`, layer: Math.floor(rng() * 3) });
    allFragments.push({ code: `${dP}=${dataP}`, layer: Math.floor(rng() * 3) });

    let chainCalls = "";
    if (encodeStrings) {
      const decResult = buildDecoderChain(ctx, dK, dP);
      allFragments.push(...decResult.fragments);
      forwardDecls.push(...decResult.forwardDecls);
      chainCalls = decResult.chainCalls;
    }

    generateJunkFragments(allFragments, forwardDecls, names, ctx.deadCodeInjection);

    const minLayer = allFragments.reduce((mn, f) => Math.min(mn, f.layer), 0);
    const maxLayer = allFragments.reduce((mx, f) => Math.max(mx, f.layer), 0);
    const sorted: Fragment[] = [];
    for (let layer = minLayer; layer <= maxLayer; layer++) {
      const bucket = allFragments.filter(f => f.layer === layer);

      for (let i = bucket.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
      }
      sorted.push(...bucket);
    }

    for (let i = forwardDecls.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [forwardDecls[i], forwardDecls[j]] = [forwardDecls[j], forwardDecls[i]];
    }
    const declLines: string[] = [];
    let di = 0;
    while (di < forwardDecls.length) {
      const groupSize = 3 + Math.floor(rng() * 5);
      declLines.push(`local ${forwardDecls.slice(di, di + groupSize).join(",")}`);
      di += groupSize;
    }

    const parts: string[] = [];
    parts.push(...declLines);

    if (level === "max") {

      const cffSt = randomName(2);
      const cffUsed = new Set<number>();
      const cffId = () => { let id: number; do { id = 100 + Math.floor(rng() * 65000); } while (cffUsed.has(id)); cffUsed.add(id); return id; };

      const realStates: { id: number; code: string; nextId: number }[] = [];
      const realIds: number[] = [];
      for (let i = 0; i < sorted.length; i++) realIds.push(cffId());
      if (chainCalls) realIds.push(cffId());
      const exitId = cffId();

      for (let i = 0; i < sorted.length; i++) {
        const nxt = i + 1 < realIds.length ? realIds[i + 1] : exitId;
        realStates.push({ id: realIds[i], code: sorted[i].code, nextId: nxt });
      }
      if (chainCalls) {
        realStates.push({ id: realIds[sorted.length], code: chainCalls, nextId: exitId });
      }

      const nFake = 8 + Math.floor(rng() * 7);
      const fakeIds: number[] = [];
      for (let fi = 0; fi < nFake; fi++) fakeIds.push(cffId());
      const fakeStates: { id: number; code: string; nextId: number }[] = [];
      for (let fi = 0; fi < nFake; fi++) {
        const jn = randomName(3);
        const jn2 = randomName(3);
        const fv = Math.floor(rng() * 8);
        const fa = 2 + Math.floor(rng() * 200);
        const fb = 2 + Math.floor(rng() * 200);
        let fc: string;
        if (fv === 0) {

          fc = `local ${jn}=${Math.floor(rng()*65536)};for _k=1,${4+Math.floor(rng()*8)} do ${jn}=(${jn}*${3+Math.floor(rng()*5)}+${Math.floor(rng()*256)})%${['65536','0x10000','(256*256)','(0x100*256)'][Math.floor(rng()*4)]} end`;
        } else if (fv === 1) {

          fc = `local ${jn}={${Array.from({length:16+Math.floor(rng()*16)},()=>Math.floor(rng()*256)).join(",")}};local ${jn2}=0;for _k=1,#${jn} do ${jn2}=bit32.bxor(${jn2},${jn}[_k]) end`;
        } else if (fv === 2) {

          fc = `local ${jn}=bit32.band(${fa},${fb});local ${jn2}=bit32.band(bit32.bxor(${fa},0xFFFFFFFF),${fb});if ${jn}+${jn2}~=${fb} then ${jn}=bit32.bxor(${jn},${jn2}) end`;
        } else if (fv === 3) {

          fc = `local ${jn}={};for _k=0,${63+Math.floor(rng()*64)} do ${jn}[_k+1]=bit32.bxor(_k*${SPIRAL_PRIMES[Math.floor(rng()*SPIRAL_PRIMES.length)]}+${Math.floor(rng()*200)},bit32.band(_k,0xFF)) end`;
        } else if (fv === 4) {

          fc = `local ${jn}={};for _k=1,${8+Math.floor(rng()*24)} do ${jn}[_k]=bit32.band(bit32.bxor(_k*${1+Math.floor(rng()*7)},${Math.floor(rng()*256)}),0xFF) end;local ${jn2}=${jn}[1];for _k=2,#${jn} do ${jn2}=2*bit32.band(${jn2},${jn}[_k])+bit32.bxor(${jn2},${jn}[_k]) end`;
        } else if (fv === 5) {

          fc = `local ${jn}=2*bit32.band(${fa},${fb})+bit32.bxor(${fa},${fb});local ${jn2}=bit32.bxor(bit32.bxor(${jn},${Math.floor(rng()*65536)}),${Math.floor(rng()*65536)})`;
        } else if (fv === 6) {

          fc = `local ${jn}={${Array.from({length:6+Math.floor(rng()*10)},()=>Math.floor(rng()*256)).join(",")}};local ${jn2}="";for _k=1,#${jn} do ${jn2}=${jn2}..string.char(bit32.band(bit32.bxor(${jn}[_k],_k*${1+Math.floor(rng()*13)}+${Math.floor(rng()*200)}),0x7F)+32) end`;
        } else {

          fc = `local ${jn}=bit32.bxor(${fa},bit32.band(${fa},${fb}));local ${jn2}=bit32.band(${fa},bit32.bxor(${fb},0xFFFFFFFF));if ${jn}~=${jn2} then for _k=1,${2+Math.floor(rng()*4)} do ${jn}=bit32.bxor(${jn},bit32.band(${jn},${Math.floor(rng()*65536)})) end end`;
        }
        const fnxt = fakeIds[Math.floor(rng() * fakeIds.length)];
        fakeStates.push({ id: fakeIds[fi], code: fc, nextId: fnxt });
      }

      const allSt = [...realStates, ...fakeStates];
      for (let i = allSt.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [allSt[i], allSt[j]] = [allSt[j], allSt[i]];
      }

      const emitTransition = (st: { id: number; nextId: number }): string => {
        const tVar = Math.floor(rng() * 6);
        const target = st.nextId;
        if (tVar === 0) {

          return `${cffSt}=${target}`;
        } else if (tVar === 1) {

          const split = Math.floor(rng() * (target + 1));
          return `${cffSt}=${split}+${target - split}`;
        } else if (tVar === 2) {

          const mask = 1 + Math.floor(rng() * 65535);
          return `${cffSt}=bit32.bxor(bit32.bxor(${target},${mask}),${mask})`;
        } else if (tVar === 3) {

          return `${cffSt}=bit32.bxor(bit32.bxor(${target},0xFFFFFFFF),0xFFFFFFFF)`;
        } else if (tVar === 4) {

          const mul = 3 + Math.floor(rng() * 13);
          return `${cffSt}=math.floor(${target * mul}/${mul})`;
        } else {

          const xa = Math.floor(rng() * 65536);
          const xb = Math.floor(rng() * 65536);
          const encoded = target ^ xa ^ xb;
          return `${cffSt}=bit32.bxor(bit32.bxor(${encoded},${xb}),${xa})`;
        }
      };

      parts.push(`local ${cffSt}=${realIds[0]}`);
      parts.push(`while true do`);
      for (let si = 0; si < allSt.length; si++) {
        const st = allSt[si];
        const kw = si === 0 ? "if" : "elseif";
        parts.push(`${kw} ${cffSt}==${st.id} then`);
        parts.push(st.code);
        if (st.nextId === exitId) {
          parts.push(`break`);
        } else {
          parts.push(emitTransition(st));
        }
      }
      parts.push(`end`);
      parts.push(`end`);

      if (process.env.ENV_CHECK === '1') {
        const chkVars: [string,string][] = [
          ['run', names.run], ['env', names.env], ['pcall', names.bPcall],
          ['bxor', names.bBxor], ['band', names.bBand], ['type', names.bType],
          ['select', names.bSelect], ['tpack', names.tPack], ['tunpack', names.tUnpack],
          ['mfloor', names.bMfloor], ['setmeta', names.bSetmeta], ['tostring', names.bTostring],
          ['dK', dK], ['dC', dC], ['dP', dP],
        ];
        const wParts = chkVars.map(([l,v]) => `"${l}="..tostring(${v})`);
        parts.push(`warn("[ENV_CHECK] "..${wParts.join('.." "..') })`);
      }
      parts.push(`return ${names.run}(${dK},${dC},${dP},{},${nP},${mR},${isVA},${names.env})`);
    } else {

      for (const frag of sorted) {
        parts.push(frag.code);
      }
      if (chainCalls) parts.push(chainCalls);
      if (process.env.ENV_CHECK === '1') {
        const chkVars: [string,string][] = [
          ['run', names.run], ['env', names.env], ['pcall', names.bPcall],
          ['bxor', names.bBxor], ['band', names.bBand], ['type', names.bType],
          ['select', names.bSelect], ['tpack', names.tPack], ['tunpack', names.tUnpack],
          ['mfloor', names.bMfloor], ['setmeta', names.bSetmeta], ['tostring', names.bTostring],
          ['dK', dK], ['dC', dC], ['dP', dP],
        ];
        const wParts = chkVars.map(([l,v]) => `"${l}="..tostring(${v})`);
        parts.push(`warn("[ENV_CHECK] "..${wParts.join('.." "..') })`);
      }
      parts.push(`return ${names.run}(${dK},${dC},${dP},{},${nP},${mR},${isVA},${names.env})`);
    }

    output = parts.join("\n");
  }

  if (process.env.DUMP_RAW === '1' && level !== 'debug') {
    _dumpWrite('debug-vm-raw.lua', output, 'utf-8');
    console.log(`[RegVM] DUMP_RAW: saved ${output.length} chars to debug-vm-raw.lua`);
  }

  if (level !== "debug" && process.env.NO_CIPHER !== '1') {
    const vmRawLen = Buffer.byteLength(output, 'utf-8');
    console.log(`[RegVM] Blob: encrypting VM runtime (${vmRawLen} bytes)...`);
    const { blob: vmBlob, xorKey, invSbox, checksum, origLen: vmOrigLen } = encryptAndEncode(output, rng);
    console.log(`[RegVM] Blob: VM blob = ${vmBlob.length} chars (SBox+CBC+Base85), key=${xorKey.length}B, checksum=${checksum}`);

    output = generateBootstrap({
      vmBlob,
      vmOrigLen,
      xorKey,
      invSbox,
      checksum,
      chunkName: "Clyde",
      rng,
      // Environment-specific anti-tamper is strictly opt-in.
      // Generic output stays generic; only target === "roblox" emits it.
      robloxAntiTamper: options.target === "roblox",
    });
    console.log(`[RegVM] Blob: final output = ${output.length} chars`);
  }

  if (!options._noWatermark) {
    const art = [
      `_________ .__            .___       __________                __                 __  .__                ____   ____________  `,
      `\\_   ___ \\|  | ___.__. __| _/____   \\______   \\_______  _____/  |_  ____   _____/  |_|__| ____   ____   \\   \\ /   /\\_____  \\ `,
      `/    \\  \\/|  |<   |  |/ __ |/ __ \\   |     ___/\\_  __ \\/  _ \\   __\\/ __ \\_/ ___\\   __\\  |/  _ \\ /    \\   \\   Y   /  /  ____/ `,
      `\\     \\___|  |_\\___  / /_/ \\  ___/   |    |     |  | \\(  <_> )  | \\  ___/\\  \\___|  | |  (  <_> )   |  \\   \\     /  /       \\ `,
      ` \\______  /____/ ____\\____ |\\___  >  |____|     |__|   \\____/|__|  \\___  >\\___  >__| |__|\\____/|___|  /    \\___/   \\_______ \\`,
      `        \\/     \\/         \\/    \\/                                     \\/     \\/                    \\/                     \\/`,
      ``,
      `https://clydeprotectionde.cloud | ClydeProtection Just like VMProtect, but for Lua.`,
    ];
    output = `--[[\n${art.join('\n')}\n]]\n` + output;
  }

  if (level !== "debug") {

    const watermarkEnd = output.indexOf(']]\n');
    if (watermarkEnd !== -1) {
      const watermark = output.substring(0, watermarkEnd + 3);
      const code = output.substring(watermarkEnd + 3);

      const oneLine = code.split('\n').filter(l => l.trim().length > 0).join(' ');
      output = watermark + '\n' + oneLine;
    }
  }

  return output;
}
