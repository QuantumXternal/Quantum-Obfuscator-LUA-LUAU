import { longStringLevel, splitLongLiteral } from "./limits.js";

export interface BootstrapConfig {
  vmBlob: string;
  /** Length of the original (uncompressed) payload in bytes. */
  vmOrigLen: number;
  /** Length of the compressed payload carried inside the blob. */
  compLen: number;
  xorKey: number[];
  invSbox: number[];
  checksum: number;
  /** Phase 2.1: 4 Feistel round keys. Defaults to [0,0,0,0] (identity) if absent. */
  feistelKeys?: number[];
  chunkName?: string;
  rng: () => number;
  /**
   * Roblox-specific anti-debug block (debug-info tripwire + warn flood +
   * Players:Kick). Default false — the generic engine stays generic and only
   * emits this when explicitly requested via target === "roblox".
   */
  robloxAntiTamper?: boolean;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function uniqueRandInt(min: number, max: number, exclude: Set<number>, rng: () => number): number {
  let v: number;
  do {
    v = min + Math.floor(rng() * (max - min + 1));
  } while (exclude.has(v));
  return v;
}

function obfuscateNum(n: number, rng: () => number): string {
  n = n & 0xFF;
  const variant = Math.floor(rng() * 7);
  switch (variant) {
    case 0: {
      const a = Math.floor(rng() * (n + 1));
      return `(${a}+${n - a})`;
    }
    case 1: {
      const b = 1 + Math.floor(rng() * 300);
      return `(${n + b}-${b})`;
    }
    case 2: {
      const a = 2 + Math.floor(rng() * 11);
      const c = ((n % a) + a) % a;
      const b = (n - c) / a;
      if (b < 0) return `(${n + 127}-127)`;
      return `(${a}*${b}+${c})`;
    }
    case 3: {
      const b = 100 + Math.floor(rng() * 500);
      return `(${n + b}-${b})`;
    }
    case 4: {
      const a = 2 + Math.floor(rng() * 8);
      const b = Math.ceil(n / a) + Math.floor(rng() * 20);
      const c = a * b - n;
      return `(${a}*${b}-${c})`;
    }
    case 5: {
      const c = 50 + Math.floor(rng() * 500);
      const a = 50 + Math.floor(rng() * 500);
      const b = n - a + c;
      if (b < 0) return `(${n + 200}-200)`;
      return `(${a}+${b}-${c})`;
    }
    default: {
      const a = 3 + Math.floor(rng() * 10);
      const pad = 1 + Math.floor(rng() * 50);
      const total = n + pad;
      const b = Math.floor(total / a);
      const c = total - a * b;

      return `(${a}*${b}+${c}-${pad})`;
    }
  }
}

// v3.2.1 executor-compat: arithmetic-only 32-bit fallbacks. Deliberately no
// native bitwise operators (& | ~ << >>) anywhere, so the emitted artifact
// still parses on old Luau builds whose parser predates Lua 5.3 syntax.
// Two independent uses:
//  1. capture chains — `(type(bit32)=="table" and bit32.band) or ... or FB`
//     so a stripped bit32/bit cannot take down the bootstrap itself;
//  2. BIT32_FALLBACK_BLOCK — a self-contained `do` block that installs a
//     full bit32 global replacement before the decrypted runtime chunk is
//     compiled, because the inner VM references bit32.* directly.
function arithBit(op: "and" | "xor"): string {
  const combine = op === "and"
    ? "if s1+s2>1 then p=p+k end"
    : "if s1~=s2 then p=p+k end";
  return [
    `function(a,b)`,
    `local M=4294967296`,
    `local r,m=0,1`,
    `a=a%M`,
    `b=b%M`,
    `while a>0 or b>0 do`,
    `local x,y=a%16,b%16`,
    `local p,k=0,1`,
    `local u,v=x,y`,
    `for t=1,4 do`,
    `local s1,s2=u%2,v%2`,
    combine,
    `u=(u-s1)/2`,
    `v=(v-s2)/2`,
    `k=k*2`,
    `end`,
    `r=r+p*m`,
    `a=(a-x)/16`,
    `b=(b-y)/16`,
    `m=m*16`,
    `end`,
    `return r`,
    `end`,
  ].join('\n');
}

const FALLBACK_BAND = arithBit("and");
const FALLBACK_BXOR = arithBit("xor");
const FALLBACK_RSHIFT =
  `function(a,n) return math.floor((a%4294967296)/2^(n%32))%4294967296 end`;
const FALLBACK_PACK = [
  `function(f,v)`,
  `local M=4294967296`,
  `v=v%M`,
  `return string.char(math.floor(v/16777216)%256,math.floor(v/65536)%256,math.floor(v/256)%256,v%256)`,
  `end`,
].join('\n');

const CAP_BAND = `((type(bit32)=="table" and bit32.band) or (type(bit)=="table" and bit.band) or ${FALLBACK_BAND})`;
const CAP_BXOR = `((type(bit32)=="table" and bit32.bxor) or (type(bit)=="table" and bit.bxor) or ${FALLBACK_BXOR})`;
const CAP_RSHIFT = `((type(bit32)=="table" and bit32.rshift) or (type(bit)=="table" and bit.rshift) or ${FALLBACK_RSHIFT})`;
const CAP_PACK = `((type(string)=="table" and string.pack) or ${FALLBACK_PACK})`;

/**
 * Robust globals-root resolver emitted into the artifact. Roblox's `_G` is a
 * script-shared DATA table and does NOT contain the standard library
 * (official docs), so anything rooted at `_G` alone resolves every stdlib
 * member to nil there (v3.2.1 executor incident: `attempt to index nil with
 * 'pack'` inside the decrypted runtime). Resolution order:
 *   1. getgenv()            - executor global environment (has stdlib)
 *   2. getfenv(0)           - vanilla Roblox / standalone Lua global env
 *   3. loadstring("return _G") - separate chunk, immune to local shadowing
 *                              (the generator names can collide with `_G`);
 *                              trusted only if it carries the stdlib
 *   4. _G                   - only if it actually carries the stdlib
 *   5. direct-globals snapshot - final guarantee, nil-safe by construction
 * Self-contained: references only globals, so it can sit anywhere in a
 * shuffled fragment layer.
 */
const ENV_ROOT_EXPR = `(function()
local _0pc=pcall
local _0ty=type
if _0pc and _0ty then
local _0ok,_0r=_0pc(getgenv)
if _0ok and _0ty(_0r)=="table" then return _0r end
_0ok,_0r=_0pc(getfenv,0)
if _0ok and _0ty(_0r)=="table" then return _0r end
local _0ls=loadstring or load
if _0ty(_0ls)=="function" then
_0ok,_0r=_0pc(_0ls,"return _G")
if _0ok and _0ty(_0r)=="table" and _0ty(_0r["table"])=="table" then return _0r end
end
end
local _0g=_G
if _0ty and _0ty(_0g)=="table" and _0ty(_0g["table"])=="table" then return _0g end
return {table=table,string=string,math=math,bit32=bit32,bit=bit,pcall=pcall,xpcall=xpcall,select=select,type=type,ipairs=ipairs,pairs=pairs,next=next,tostring=tostring,tonumber=tonumber,rawget=rawget,rawset=rawset,setmetatable=setmetatable,getmetatable=getmetatable,unpack=unpack,loadstring=loadstring,load=load,error=error,assert=assert,coroutine=coroutine,os=os,utf8=utf8,buffer=buffer,task=task,game=game,workspace=workspace,script=script,Instance=Instance,Enum=Enum,typeof=typeof,tick=tick,time=time,wait=wait,spawn=spawn,delay=delay,newproxy=newproxy,collectgarbage=collectgarbage,debug=debug,print=print,warn=warn,shared=shared,require=require}
end)()`;

const BIT32_FALLBACK_BLOCK = [
  `do`,
  `if bit32==nil then`,
  `local M=4294967296`,
  `local XT,AT,OT={},{},{}`,
  `for a=0,15 do`,
  `for b=0,15 do`,
  `local xr,ar,orr,k=0,0,0,1`,
  `local u,v=a,b`,
  `for t=1,4 do`,
  `local s1,s2=u%2,v%2`,
  `if s1~=s2 then xr=xr+k end`,
  `if s1+s2>1 then ar=ar+k end`,
  `if s1+s2>0 then orr=orr+k end`,
  `u=(u-s1)/2`,
  `v=(v-s2)/2`,
  `k=k*2`,
  `end`,
  `XT[a*16+b]=xr`,
  `AT[a*16+b]=ar`,
  `OT[a*16+b]=orr`,
  `end`,
  `end`,
  `local function fx(a,b,T)`,
  `local r,m=0,1`,
  `a=a%M`,
  `b=b%M`,
  `while a>0 or b>0 do`,
  `local x,y=a%16,b%16`,
  `r=r+T[x*16+y]*m`,
  `a=(a-x)/16`,
  `b=(b-y)/16`,
  `m=m*16`,
  `end`,
  `return r`,
  `end`,
  `local function fold(T,...)`,
  `local n=select("#",...)`,
  `if n==0 then return 0 end`,
  `local a=select(1,...)`,
  `local b=select(2,...)`,
  `if b==nil then return a%M end`,
  `local r=fx(a,b,T)`,
  `for i=3,n do r=fx(r,select(i,...),T) end`,
  `return r`,
  `end`,
  `local function lsh(a,n)`,
  `a=a%M`,
  `for i=1,n%32 do a=(a*2)%M end`,
  `return a`,
  `end`,
  `local function rsh(a,n) return math.floor((a%M)/2^(n%32))%M end`,
  `local z={band=function(...) return fold(AT,...) end,bxor=function(...) return fold(XT,...) end,bor=function(...) return fold(OT,...) end,bnot=function(a) return (M-1)-(a%M) end,lshift=lsh,rshift=rsh,arshift=function(a,n) a=a%M if a>=M/2 then a=a-M end return math.floor(a/2^(n%32))%M end,lrotate=function(a,n) n=n%32 return (lsh(a,n)+rsh(a,32-n))%M end,rrotate=function(a,n) n=n%32 return (rsh(a,n)+lsh(a,32-n))%M end,btest=function(...) return fold(AT,...)~=0 end,extract=function(a,f,w) w=w or 1 return math.floor((a%M)/2^(f%32))%(2^w) end,replace=function(a,v,f,w) w=w or 1 local s=2^(f%32) local mw=2^w return (a%M-math.floor((a%M)/s)%mw*s)+(v%mw)*s end}`,
  `if type(pcall)=="function" then`,
  `pcall(function() bit32=z end)`,
  `else`,
  `bit32=z`,
  `end`,
  `end`,
  `end`,
].join('\n');

export function generateBootstrap(config: BootstrapConfig): string {
  const { vmBlob, vmOrigLen, compLen, xorKey, invSbox, checksum, chunkName = "Quantum", rng } = config;

  const prefixes = ["_0", "_1", "_2", "_3", "_4", "_5"];
  const suffixes = "abcdefghjkmnpqrstuvwx".split('');
  const allNames: string[] = [];
  for (const p of prefixes) {
    for (const s of suffixes) {
      allNames.push(p + s);
    }
  }
  shuffle(allNames, rng);

  let ni = 0;
  const N = () => allNames[ni++];

  const nByte = N(), nGsub = N(), nPack = N(), nSub = N(), nChar = N();
  const nLoad = N(), nAssert = N(), nType = N(), nBxor = N(), nPcall = N();
  const nTconcat = N(), nBand = N(), nRshift = N();

  const nDecode = N(), nDecrypt = N(), nVerify = N(), nUnlz4 = N();
  const nKeyInteg = N(), nSboxInteg = N(), nMutate = N();

  const nKeyRaw = N(), nKey = N(), nKeyLen = N();
  const nSboxRaw = N(), nSbox = N();
  const nRaw = N(), nDec = N();

  const nOk = N(), nFn = N(), nState = N(), nResult = N(), nZeroExp = N();
  const nEnvRoot = N();

  const junkFnNames = [N(), N(), N(), N(), N()];
  const junkVarNames = [N(), N(), N(), N(), N(), N(), N(), N()];

  const keyMask = 1 + Math.floor(rng() * 254);
  const sboxMask = 1 + Math.floor(rng() * 254);
  const maskedKey = xorKey.map(b => b ^ keyMask);
  const maskedSbox = invSbox.map(b => b ^ sboxMask);

  const keyXorSum = xorKey.reduce((a, b) => a ^ b, 0);

  const sboxSum = invSbox.reduce((a, b) => a + b, 0) % 65536;

  const lvl = longStringLevel(vmBlob);
  const open = "[" + "=".repeat(lvl) + "[";
  const close = "]" + "=".repeat(lvl) + "]";

  // Line-width policy: the blob is split into <= MAX_OUTPUT_LINE_BYTES
  // pieces so no emitted line can blow up downstream viewers. A single
  // piece keeps the exact legacy shape (byte-identical for all existing
  // small artifacts); multiple pieces are concatenated at runtime with
  // the already-bound table.concat alias, each piece on its own line.
  const blobPieces = splitLongLiteral(vmBlob);
  const blobExpr = blobPieces.length === 1
    ? `${open}${vmBlob}${close}`
    : `${nTconcat}({\n${blobPieces.map((p) => {
        const pl = longStringLevel(p);
        return `[${"=".repeat(pl)}[${p}]${"=".repeat(pl)}]`;
      }).join(",\n")}\n})`;

  const usedStates = new Set<number>();
  const stDecode   = uniqueRandInt(100, 9999, usedStates, rng); usedStates.add(stDecode);
  const stDecrypt  = uniqueRandInt(100, 9999, usedStates, rng); usedStates.add(stDecrypt);
  const stVerify   = uniqueRandInt(100, 9999, usedStates, rng); usedStates.add(stVerify);
  const stLoad     = uniqueRandInt(100, 9999, usedStates, rng); usedStates.add(stLoad);
  const stExec     = uniqueRandInt(100, 9999, usedStates, rng); usedStates.add(stExec);
  const stMutate   = uniqueRandInt(100, 9999, usedStates, rng); usedStates.add(stMutate);

  const junkStates: number[] = [];
  for (let i = 0; i < 3; i++) {
    const js = uniqueRandInt(100, 9999, usedStates, rng);
    usedStates.add(js);
    junkStates.push(js);
  }

  const opaA = 1 + Math.floor(rng() * 254);
  const opaB = 1 + Math.floor(rng() * 254);

  const opaExpected = opaA + opaB;

  const SPREAD = 6;
  const L_MERGE = SPREAD + 1;
  const L_RECON = SPREAD + 2;
  const L_FUNCS = SPREAD + 3;
  const L_OPAQUE = SPREAD + 4;

  interface Fragment { code: string; layer: number; }
  const fragments: Fragment[] = [];

  const spreadLayer = () => 1 + Math.floor(rng() * SPREAD);

  {
    const builtins: [string, string][] = [
      [nByte, 'string.byte'], [nGsub, 'string.gsub'], [nPack, CAP_PACK],
      [nSub, 'string.sub'], [nChar, 'string.char'], [nLoad, '(loadstring or load)'],
      [nAssert, 'assert'], [nType, 'type'], [nBxor, CAP_BXOR],
      [nPcall, 'pcall'], [nTconcat, 'table.concat'], [nBand, CAP_BAND],
      [nRshift, CAP_RSHIFT],
    ];
    shuffle(builtins, rng);
    let bi = 0;
    while (bi < builtins.length) {
      const groupSize = 1 + Math.floor(rng() * Math.min(3, builtins.length - bi));
      const names = builtins.slice(bi, bi + groupSize).map(b => b[0]).join(',');
      const values = builtins.slice(bi, bi + groupSize).map(b => b[1]).join(',');
      fragments.push({ code: `local ${names}=${values}`, layer: 0 });
      bi += groupSize;
    }
  }

  // Self-contained bit32 installer (see BIT32_FALLBACK_BLOCK): no dependency
  // on any other fragment, so its shuffled position among the layer-0 groups
  // is irrelevant. Runs before the state machine, i.e. before the decrypted
  // runtime chunk is compiled.
  fragments.push({ code: BIT32_FALLBACK_BLOCK, layer: 0 });

  // Globals-root for every outer `_G` consumer below. Self-contained layer-0
  // fragment (see ENV_ROOT_EXPR) so its shuffled position among the layer-0
  // groups is irrelevant.
  fragments.push({ code: `local ${nEnvRoot}=${ENV_ROOT_EXPR}`, layer: 0 });

  const nDbgRef = N();
  const nLineRef = N();
  const chDebug = [100,101,98,117,103].map(c => obfuscateNum(c, rng)).join(',');
  const chInfo = [105,110,102,111].map(c => obfuscateNum(c, rng)).join(',');
  const chL = obfuscateNum(108, rng);

  const chGetfenv = [103,101,116,102,101,110,118].map(c => obfuscateNum(c, rng)).join(',');

  fragments.push({
    code: `local ${nDbgRef}=(function() local _0ok,_0r=(${nPcall} and ${nPcall}(function() local _0d=rawget(${nEnvRoot},${nChar}(${chDebug})) if not _0d then local _0g=rawget(${nEnvRoot},${nChar}(${chGetfenv})) if _0g then _0d=rawget(_0g(0) or {},${nChar}(${chDebug})) end end return _0d and _0d[${nChar}(${chInfo})] end)) return _0ok and _0r or nil end)()`,
    layer: spreadLayer(),
  });
  fragments.push({
    code: `local ${nLineRef}=${nDbgRef} and ${nDbgRef}(${obfuscateNum(1, rng)},${nChar}(${chL})) or 0`,
    layer: L_MERGE,
  });

  {
    const splitArray = (data: number[], baseName: string) => {
      const numFrags = 3 + Math.floor(rng() * 3);
      const fragNames: string[] = [];
      const fragSizes: number[] = [];

      let remaining = data.length;
      for (let i = 0; i < numFrags - 1; i++) {
        const minChunk = Math.max(1, Math.floor(remaining / (numFrags - i) * 0.5));
        const maxChunk = Math.floor(remaining / (numFrags - i) * 1.5);
        const size = minChunk + Math.floor(rng() * (maxChunk - minChunk + 1));
        fragSizes.push(Math.min(size, remaining - (numFrags - 1 - i)));
        remaining -= fragSizes[i];
      }
      fragSizes.push(remaining);

      let offset = 0;
      for (let i = 0; i < numFrags; i++) {
        const fragName = N();
        fragNames.push(fragName);
        const chunk = data.slice(offset, offset + fragSizes[i]);
        const obfChunk = chunk.map(b => obfuscateNum(b, rng)).join(',');
        fragments.push({ code: `local ${fragName}={${obfChunk}}`, layer: spreadLayer() });
        offset += fragSizes[i];
      }

      const mergeLines: string[] = [];
      const nCounter = N();
      mergeLines.push(`local ${baseName}={}`);
      mergeLines.push(`local ${nCounter}=0`);
      for (const fn of fragNames) {
        mergeLines.push(`for _0i=1,#${fn} do ${nCounter}=${nCounter}+1 ${baseName}[${nCounter}]=${fn}[_0i] end`);
      }
      fragments.push({ code: mergeLines.join('\n'), layer: L_MERGE });
    };

    splitArray(maskedSbox, nSboxRaw);
    splitArray(maskedKey, nKeyRaw);
  }

  for (let i = 0; i < junkFnNames.length; i++) {
    const jfType = Math.floor(rng() * 4);
    let jfCode: string;
    const jn = junkFnNames[i];
    const magic1 = 1 + Math.floor(rng() * 200);
    const magic2 = Math.floor(rng() * 200);
    switch (jfType) {
      case 0:
        jfCode = `local function ${jn}(data)\nlocal _0t={}\nfor _0i=1,#data do _0t[_0i]=${nBxor}(${nByte}(data,_0i),${nBand}(_0i*${magic1}+${magic2},0xFF)) end\nreturn ${nTconcat}(_0t)\nend`;
        break;
      case 1:
        jfCode = `local function ${jn}(data)\nlocal _0t={}\nfor _0i=1,#data do _0t[_0i]=${nChar}(${nBxor}(${nByte}(data,_0i),${nBand}(_0i+${magic1},0xFF))) end\nreturn ${nTconcat}(_0t)\nend`;
        break;
      case 2:
        jfCode = `local function ${jn}(data)\nlocal _0r={}\nfor _0i=#data,1,-1 do _0r[#data-_0i+1]=${nChar}(${nBxor}(${nByte}(data,_0i),${magic2})) end\nreturn ${nTconcat}(_0r)\nend`;
        break;
      default:
        jfCode = `local function ${jn}(data)\nlocal _0t={}\nlocal _0a=${magic1}\nfor _0i=1,#data do _0t[_0i]=${nChar}(${nBxor}(${nByte}(data,_0i),${nBand}(_0a,0xFF)));_0a=_0a+${magic2} end\nreturn ${nTconcat}(_0t)\nend`;
        break;
    }
    fragments.push({ code: jfCode, layer: spreadLayer() });
  }

  const obfSboxMask = obfuscateNum(sboxMask, rng);
  const obfKeyMask = obfuscateNum(keyMask, rng);
  fragments.push({ code: `local ${nSbox}={}\nfor _0i=1,256 do ${nSbox}[_0i]=${nBxor}(${nSboxRaw}[_0i],${obfSboxMask}) end`, layer: L_RECON });
  fragments.push({ code: `local ${nKeyLen}=#${nKeyRaw}\nlocal ${nKey}={}\nfor _0i=1,${nKeyLen} do ${nKey}[_0i]=${nBxor}(${nKeyRaw}[_0i],${obfKeyMask}) end`, layer: L_RECON });

  for (let i = 0; i < junkVarNames.length; i++) {
    const jvType = Math.floor(rng() * 4);
    let jvCode: string;
    switch (jvType) {
      case 0: jvCode = `local ${junkVarNames[i]}=${nBxor}(${1+Math.floor(rng()*254)},${nSboxRaw}[${1+Math.floor(rng()*255)}])`; break;
      case 1: jvCode = `local ${junkVarNames[i]}=${nBand}(${nKeyRaw}[${1+Math.floor(rng()*(xorKey.length-1))}]+${Math.floor(rng()*200)},0xFF)`; break;
      case 2: jvCode = `local ${junkVarNames[i]}=#${nKeyRaw}+${Math.floor(rng()*100)}`; break;
      default: jvCode = `local ${junkVarNames[i]}=${nBxor}(${Math.floor(rng()*256)},${Math.floor(rng()*256)})`; break;
    }
    fragments.push({ code: jvCode, layer: L_RECON });
  }

  const decoderLines = [
    `local function ${nDecode}(s)`,
    `s=${nGsub}(s,"[%s]","")`,
    `local ${nZeroExp}=${nChar}(33):rep(5)`,
    `s=${nGsub}(s,"z",${nZeroExp})`,
    `if #s%5~=0 then return "" end`,
    `local o={}`,
    `for i=1,#s,5 do`,
    `local d,e,f,g,h=${nByte}(s,i,i+4)`,
    `local v=(d-33)*52200625+(e-33)*614125+(f-33)*7225+(g-33)*85+(h-33)`,
    `o[#o+1]=${nPack}(">I4",v)`,
    `end`,
    `return ${nSub}(${nTconcat}(o),1,${compLen})`,
    `end`,
  ];
  fragments.push({ code: decoderLines.join('\n'), layer: L_FUNCS });

  // v3.2: raw LZ4 block inflate (post-decrypt, pre-checksum). Bounded by
  // `cap` so corrupted streams cannot balloon memory; returns nil within a
  // pcall-free path instead of raising, so the defensive mutate state stays
  // the single failure route.
  const unlz4Lines = [
    `local function ${nUnlz4}(src,cap)`,
    `local pos,n=1,#src`,
    `local parts,nparts={},0`,
    `local buf,nbuf={},0`,
    `local prev,prevLen="",0`,
    `local total,chunkBase=0,1`,
    `local ch={}`,
    `for _0i=0,255 do ch[_0i]=${nChar}(_0i) end`,
    `local function _0flush()`,
    `if nbuf>0 then`,
    `prev=${nTconcat}(buf,"",1,nbuf)`,
    `prevLen=#prev`,
    `nparts=nparts+1`,
    `parts[nparts]=prev`,
    `nbuf=0`,
    `chunkBase=total+1`,
    `end`,
    `end`,
    `while pos<=n do`,
    `local token=${nByte}(src,pos)`,
    `pos=pos+1`,
    `local lit=${nRshift}(token,4)`,
    `if lit==15 then`,
    `local b=255`,
    `while b==255 do b=${nByte}(src,pos) or 0 pos=pos+1 lit=lit+b end`,
    `end`,
    `if total+lit>cap then return nil end`,
    `if lit>0 then`,
    `if pos+lit-1>n then return nil end`,
    `local s0=${nSub}(src,pos,pos+lit-1)`,
    `pos=pos+lit`,
    `for _0i=1,lit do`,
    `nbuf=nbuf+1`,
    `buf[nbuf]=ch[${nByte}(s0,_0i)]`,
    `total=total+1`,
    `if nbuf>=65536 then _0flush() end`,
    `end`,
    `end`,
    `if pos>n then break end`,
    `local off=(${nByte}(src,pos) or 0)+(${nByte}(src,pos+1) or 0)*256`,
    `pos=pos+2`,
    `if off<1 or off>total then return nil end`,
    `local mlen=${nBand}(token,15)`,
    `if mlen==15 then`,
    `local b=255`,
    `while b==255 do b=${nByte}(src,pos) or 0 pos=pos+1 mlen=mlen+b end`,
    `end`,
    `mlen=mlen+4`,
    `if total+mlen>cap then return nil end`,
    `local rp=total-off+1`,
    `for _0i=1,mlen do`,
    `local c`,
    `if rp>=chunkBase then`,
    `c=buf[rp-chunkBase+1]`,
    `else`,
    `local rel=rp-chunkBase+prevLen+1`,
    `c=${nSub}(prev,rel,rel)`,
    `end`,
    `nbuf=nbuf+1`,
    `buf[nbuf]=c`,
    `total=total+1`,
    `if nbuf>=65536 then _0flush() end`,
    `rp=rp+1`,
    `end`,
    `end`,
    `_0flush()`,
    `return ${nTconcat}(parts,"",1,nparts)`,
    `end`,
  ];
  fragments.push({ code: unlz4Lines.join('\n'), layer: L_FUNCS });

  const fk = config.feistelKeys || [0, 0, 0, 0];
  const fkLua = `{${fk.join(",")}}`;
  const decryptLines = [
    `local function ${nDecrypt}(data)`,
    `local n=#data`,
    `local o={}`,
    `local prev=0`,
    `for i=1,n do`,
    `local enc=${nByte}(data,i)`,
    `local sub=${nBxor}(${nBxor}(enc,${nKey}[((i-1)%${nKeyLen})+1]),prev)`,
    `o[i]=sub`,
    `prev=enc`,
    `end`,
    // Phase 2.1: Feistel inverse (4 rounds, reverse order).
    `local _fk=${fkLua}`,
    `for i=1,n,2 do`,
    `if i+1<=n then`,
    `local L=o[i]`,
    `local R=o[i+1]`,
    `for r=4,1,-1 do`,
    `local newL=${nBxor}(R,${nBand}((L+_fk[r])%256,0xFF))`,
    `local newR=L`,
    `L=newL`,
    `R=newR`,
    `end`,
    `o[i]=L`,
    `o[i+1]=R`,
    `end`,
    `end`,
    // S-box inverse.
    `for i=1,n do o[i]=${nChar}(${nSbox}[o[i]+1]) end`,
    `return ${nTconcat}(o)`,
    `end`,
  ];
  fragments.push({ code: decryptLines.join('\n'), layer: L_FUNCS });

  const verifyLines = [
    `local function ${nVerify}(data)`,
    `local a,b=1,0`,
    `for i=1,#data do`,
    `a=(a+${nByte}(data,i))%65521`,
    `b=(b+a)%65521`,
    `end`,
    `return b*65536+a`,
    `end`,
  ];
  fragments.push({ code: verifyLines.join('\n'), layer: L_FUNCS });

  {
    const nKIC = N(), nKII = N();
    fragments.push({
      code: [
        `local function ${nKeyInteg}()`,
        `local ${nKIC}=0`,
        `for ${nKII}=1,${nKeyLen} do ${nKIC}=${nBxor}(${nKIC},${nKey}[${nKII}]) end`,
        `return ${nKIC}==${keyXorSum}`,
        `end`,
      ].join('\n'),
      layer: L_FUNCS,
    });
  }

  {
    const nSIC = N(), nSII = N();
    fragments.push({
      code: [
        `local function ${nSboxInteg}()`,
        `local ${nSIC}=0`,
        `for ${nSII}=1,256 do ${nSIC}=${nSIC}+${nSbox}[${nSII}] end`,
        `return ${nSIC}%65536==${sboxSum}`,
        `end`,
      ].join('\n'),
      layer: L_FUNCS,
    });
  }

  fragments.push({
    code: [
      `local function ${nMutate}()`,
      `for _0i=1,256 do ${nSbox}[_0i]=${nBxor}(${nSbox}[_0i],0xAA) end`,
      `for _0i=1,${nKeyLen} do ${nKey}[_0i]=${nBand}(${nKey}[_0i]+_0i,0xFF) end`,
      `end`,
    ].join('\n'),
    layer: L_FUNCS,
  });

  const nOpaA = N(), nOpaB = N();
  fragments.push({
    code: `local ${nOpaA}=${nBand}(${opaA},${opaB})\nlocal ${nOpaB}=${nBxor}(${opaA},${opaB})`,
    layer: L_OPAQUE,
  });

  const maxLayer = Math.max(...fragments.map(f => f.layer));
  const assembled: string[] = [];

  assembled.push(`return(function(...)`);

  for (let layer = 0; layer <= maxLayer; layer++) {
    const layerFrags = fragments.filter(f => f.layer === layer);
    shuffle(layerFrags, rng);
    for (const f of layerFrags) {
      assembled.push(f.code);
    }
  }

  interface StateCase { id: number; code: string; }
  const cases: StateCase[] = [];

  cases.push({ id: stDecode, code: [
    `${nRaw}=${nDecode}(${blobExpr})`,
    `if #${nRaw}<${compLen} then (warn or print)("Quantum Error: HttpGet truncated the payload.") end`,
    `${nState}=${stDecrypt}`,
  ].join('\n') });

  cases.push({ id: stDecrypt, code: [
    `if not ${nKeyInteg}() or not ${nSboxInteg}() then`,
    `(warn or print)("Quantum Error: payload integrity check failed.")`,
    `${nMutate}()`,
    `end`,
    `${nDec}=${nDecrypt}(${nRaw})`,
    `${nState}=${stVerify}`,
  ].join('\n') });

  cases.push({ id: stVerify, code: [
    `local _0i=${nUnlz4}(${nDec},${vmOrigLen})`,
    `if _0i and #_0i==${vmOrigLen} and ${nVerify}(_0i)==${checksum} then`,
    `${nDec}=_0i`,
    `else`,
    `${nMutate}()`,
    `local _0o=${nUnlz4}(${nDecrypt}(${nRaw}),${vmOrigLen})`,
    `if _0o and #_0o==${vmOrigLen} and ${nVerify}(_0o)==${checksum} then ${nDec}=_0o else (warn or print)("Quantum Error: LZ4 decompression failed (corrupted stream).") end`,
    `end`,
    `${nState}=${stLoad}`,
  ].join('\n') });

  cases.push({ id: stLoad, code: [
    `if 2*${nOpaA}+${nOpaB}==${opaExpected} then`,
    `${nOk},${nFn}=${nPcall}(${nLoad},${nDec},"${chunkName}")`,
    `else`,
    `${nOk},${nFn}=${nPcall}(${nLoad},${junkFnNames[0]}(${nDec}),"${chunkName}")`,
    `end`,
    `if not ${nOk} then (warn or print)("Quantum Error: loadstring rejected the payload: "..tostring(${nFn})) end`,
    `${nState}=${stExec}`,
  ].join('\n') });

  cases.push({ id: stExec, code: [
    `${nAssert}(${nOk} and ${nFn} and ${nType}(${nFn})=="function" and #${nDec}==${vmOrigLen},"Quantum Protection V2")`,
    `local _0ec,_0ev=${nPcall}(${nFn},...)`,
    `if not _0ec then (warn or print)("Quantum Error: inner runtime failed: "..tostring(_0ev)) end`,
    `${nAssert}(_0ec,"Quantum Protection V2")`,
    `${nResult}=_0ev`,

    `for _0i=1,256 do ${nSbox}[_0i]=0 end`,
    `for _0i=1,${nKeyLen} do ${nKey}[_0i]=0 end`,
    `for _0i=1,#${nSboxRaw} do ${nSboxRaw}[_0i]=0 end`,
    `for _0i=1,#${nKeyRaw} do ${nKeyRaw}[_0i]=0 end`,
    `break`,
  ].join('\n') });

  cases.push({ id: stMutate, code: [
    `${nMutate}()`,
    `${nRaw}=${junkFnNames[1] || junkFnNames[0]}(${nRaw} or "")`,
    `${nState}=${stDecode}`,
  ].join('\n') });

  for (let i = 0; i < junkStates.length; i++) {
    const jfn = junkFnNames[i % junkFnNames.length];
    const nextJunk = junkStates[(i + 1) % junkStates.length];
    cases.push({ id: junkStates[i], code: [
      `${nRaw}=${jfn}(${nRaw} or "")`,
      `${nState}=${nextJunk}`,
    ].join('\n') });
  }

  shuffle(cases, rng);

  const nEnvCheck = N();
  assembled.push(`local ${nEnvCheck}=${nType}(${nLoad})..${nType}(${nPcall})`);
  assembled.push(`if ${nEnvCheck}~="functionfunction" then`);
  assembled.push(`if ${nType}(${nLoad})~="function" then`);
  assembled.push(`(warn or print)("Quantum Error: loadstring/load is blocked in this executor.")`);
  assembled.push(`else`);
  assembled.push(`(warn or print)("Quantum Error: pcall is unavailable in this executor.")`);
  assembled.push(`end`);
  assembled.push(`return nil`);
  assembled.push(`end`);

  // Roblox-only anti-debug block. Gated: generic output must not reference
  // game/Players/Kick or punish debuggers outside Roblox.
  if (config.robloxAntiTamper === true) {
    const chL2 = obfuscateNum(108, rng);
    const chWarn = [119,97,114,110].map(c => obfuscateNum(c, rng)).join(',');
    const chGame = [103,97,109,101].map(c => obfuscateNum(c, rng)).join(',');
    const chGS = [71,101,116,83,101,114,118,105,99,101].map(c => obfuscateNum(c, rng)).join(',');
    const chPlayers = [80,108,97,121,101,114,115].map(c => obfuscateNum(c, rng)).join(',');
    const chLP = [76,111,99,97,108,80,108,97,121,101,114].map(c => obfuscateNum(c, rng)).join(',');
    const chKick = [75,105,99,107].map(c => obfuscateNum(c, rng)).join(',');

    const floodChars = Array.from({length: 8}, () => obfuscateNum(65 + Math.floor(rng() * 26), rng)).join(',');
    const floodCount = obfuscateNum(100 + Math.floor(rng() * 400), rng);

    assembled.push(`if ${nLineRef}>0 and ${nDbgRef}(${obfuscateNum(1, rng)},${nChar}(${chL2}))~=${nLineRef} then`);

    assembled.push(`${nLoad}=function() return nil end`);

    assembled.push(`${nPcall}(function() local _w=rawget(${nEnvRoot},${nChar}(${chWarn})) if _w then for _0i=1,${floodCount} do _w(${nChar}(${floodChars})) end end end)`);

    assembled.push(`${nPcall}(function() local _g=rawget(${nEnvRoot},${nChar}(${chGame})) local _p=_g[${nChar}(${chGS})](_g,${nChar}(${chPlayers})) local _lp=_p[${nChar}(${chLP})] _lp[${nChar}(${chKick})](_lp) end)`);
    assembled.push(`end`);
  }

  assembled.push(`local ${nRaw},${nDec},${nOk},${nFn},${nResult}`);
  assembled.push(`local ${nState}=${stDecode}`);
  assembled.push(`while true do`);
  for (let i = 0; i < cases.length; i++) {
    const prefix = i === 0 ? 'if' : 'elseif';
    assembled.push(`${prefix} ${nState}==${cases[i].id} then`);
    assembled.push(cases[i].code);
  }
  assembled.push(`end`);
  assembled.push(`end`);
  assembled.push(`return ${nResult}`);

  assembled.push(`end)(...)`);

  return assembled.join("\n");
}
