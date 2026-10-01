export interface BootstrapConfig {
  vmBlob: string;
  vmOrigLen: number;
  xorKey: number[];
  invSbox: number[];
  checksum: number;
  chunkName?: string;
  rng: () => number;
  /**
   * Roblox-specific anti-debug block (debug-info tripwire + warn flood +
   * Players:Kick). Default false — the generic engine stays generic and only
   * emits this when explicitly requested via target === "roblox".
   */
  robloxAntiTamper?: boolean;
}

function longStringLevel(s: string): number {
  let level = 0;
  while (s.includes("]" + "=".repeat(level) + "]")) {
    level++;
  }
  return level;
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

export function generateBootstrap(config: BootstrapConfig): string {
  const { vmBlob, vmOrigLen, xorKey, invSbox, checksum, chunkName = "Clyde", rng } = config;

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
  const nTconcat = N(), nBand = N();

  const nDecode = N(), nDecrypt = N(), nVerify = N();
  const nKeyInteg = N(), nSboxInteg = N(), nMutate = N();

  const nKeyRaw = N(), nKey = N(), nKeyLen = N();
  const nSboxRaw = N(), nSbox = N();
  const nRaw = N(), nDec = N();

  const nOk = N(), nFn = N(), nState = N(), nResult = N(), nZeroExp = N();

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
      [nByte, 'string.byte'], [nGsub, 'string.gsub'], [nPack, 'string.pack'],
      [nSub, 'string.sub'], [nChar, 'string.char'], [nLoad, 'loadstring'],
      [nAssert, 'assert'], [nType, 'type'], [nBxor, 'bit32.bxor'],
      [nPcall, 'pcall'], [nTconcat, 'table.concat'], [nBand, 'bit32.band'],
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

  const nDbgRef = N();
  const nLineRef = N();
  const chDebug = [100,101,98,117,103].map(c => obfuscateNum(c, rng)).join(',');
  const chInfo = [105,110,102,111].map(c => obfuscateNum(c, rng)).join(',');
  const chL = obfuscateNum(108, rng);

  const chGetfenv = [103,101,116,102,101,110,118].map(c => obfuscateNum(c, rng)).join(',');

  fragments.push({
    code: `local ${nDbgRef}=(function() local _0ok,_0r=${nPcall}(function() local _0d=rawget(_G,${nChar}(${chDebug})) if not _0d then local _0g=rawget(_G,${nChar}(${chGetfenv})) if _0g then _0d=rawget(_0g(0) or {},${nChar}(${chDebug})) end end return _0d and _0d[${nChar}(${chInfo})] end) return _0ok and _0r or nil end)()`,
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
    `local o={}`,
    `for i=1,#s,5 do`,
    `local d,e,f,g,h=${nByte}(s,i,i+4)`,
    `local v=(d-33)*52200625+(e-33)*614125+(f-33)*7225+(g-33)*85+(h-33)`,
    `o[#o+1]=${nPack}(">I4",v)`,
    `end`,
    `return ${nSub}(${nTconcat}(o),1,${vmOrigLen})`,
    `end`,
  ];
  fragments.push({ code: decoderLines.join('\n'), layer: L_FUNCS });

  const decryptLines = [
    `local function ${nDecrypt}(data)`,
    `local n=#data`,
    `local o={}`,
    `local prev=0`,
    `for i=1,n do`,
    `local enc=${nByte}(data,i)`,
    `local sub=${nBxor}(${nBxor}(enc,${nKey}[((i-1)%${nKeyLen})+1]),prev)`,
    `o[i]=${nChar}(${nSbox}[sub+1])`,
    `prev=enc`,
    `end`,
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
    `${nRaw}=${nDecode}(${open}${vmBlob}${close})`,
    `${nState}=${stDecrypt}`,
  ].join('\n') });

  cases.push({ id: stDecrypt, code: [
    `if not ${nKeyInteg}() or not ${nSboxInteg}() then ${nMutate}() end`,
    `${nDec}=${nDecrypt}(${nRaw})`,
    `${nState}=${stVerify}`,
  ].join('\n') });

  cases.push({ id: stVerify, code: [
    `if ${nVerify}(${nDec})~=${checksum} then`,
    `${nMutate}()`,
    `${nDec}=${nDecrypt}(${nRaw})`,
    `end`,
    `${nState}=${stLoad}`,
  ].join('\n') });

  cases.push({ id: stLoad, code: [
    `if 2*${nOpaA}+${nOpaB}==${opaExpected} then`,
    `${nOk},${nFn}=${nPcall}(${nLoad},${nDec},"${chunkName}")`,
    `else`,
    `${nOk},${nFn}=${nPcall}(${nLoad},${junkFnNames[0]}(${nDec}),"${chunkName}")`,
    `end`,
    `${nState}=${stExec}`,
  ].join('\n') });

  cases.push({ id: stExec, code: [
    `${nAssert}(${nOk} and ${nFn} and ${nType}(${nFn})=="function","Clyde Protection v2")`,
    `${nResult}=${nFn}(...)`,

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
  assembled.push(`if ${nEnvCheck}~="functionfunction" then return nil end`);

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

    assembled.push(`${nPcall}(function() local _w=rawget(_G,${nChar}(${chWarn})) if _w then for _0i=1,${floodCount} do _w(${nChar}(${floodChars})) end end end)`);

    assembled.push(`${nPcall}(function() local _g=rawget(_G,${nChar}(${chGame})) local _p=_g[${nChar}(${chGS})](_g,${nChar}(${chPlayers})) local _lp=_p[${nChar}(${chLP})] _lp[${nChar}(${chKick})](_lp) end)`);
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
