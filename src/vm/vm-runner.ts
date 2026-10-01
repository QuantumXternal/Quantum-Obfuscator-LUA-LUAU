import type { BytecodeChunk, Constant } from "./bytecode.js";
import { Op } from "./bytecode.js";

export interface VMRunnerEnv {
  [key: string]: unknown;
}

export interface VMRunnerOptions {

  onTick?: () => void;

  tickInterval?: number;
}

function isTruthy(v: unknown): boolean {
  return v !== null && v !== undefined && v !== false;
}

function luaLen(v: unknown): number {
  if (typeof v === "string") return v.length;
  if (v && typeof v === "object") {
    const t = v as Record<number, unknown>;
    let len = 0;
    while (t[len + 1] !== undefined && t[len + 1] !== null) len++;
    return len;
  }
  return 0;
}

function luaToString(v: unknown): string {
  if (v === null || v === undefined) return "nil";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (typeof v === "function") return "function";
  if (typeof v === "object") return "table";
  return String(v);
}

// NOTE (Stage 11C/11D-1): generated fused handlers (vm-gen.ts h[57-59], h[62])
// use RAW Lua operators, which participate in standard metamethod dispatch
// natively. The stack reference runner therefore models fused arithmetic with
// the SAME arithMM helper as the unfused path — never a separate semantic
// model. (A previous arithFused helper wrongly threw on metamethod operands;
// it was a runner-fidelity bug, not generated behavior. It is removed.)
//
// Harness-only features: getMM honors env.__string_mt for strings. No
// generated handler reads __string_mt; it exists only so the reference
// runner can model string-metatable scenarios in tests. Never present runner
// behavior as real Luau execution.

export function runVM(
  K: Constant[],
  code: number[],
  env: VMRunnerEnv,
  key: number = 0,
  protos: BytecodeChunk[] = [],
  initLocals: Record<number, unknown> = {},
  upvalues: { [idx: number]: { 0: unknown } } = {},
  varargs: unknown[] = [],
  options: VMRunnerOptions = {}
): unknown {
  const onTick = options.onTick;
  const tickInterval = options.tickInterval ?? 1000;
  let tickCounter = 0;

  const stack: unknown[] = [];
  const locals: Record<number, unknown> = { ...initLocals };
  const localBoxes: Record<number, unknown[]> = {};
  const callBasesStack: number[] = [];
  let callBaseStackTop = 0;
  let ip = 0;
  let stackTop = 0;

  function push(v: unknown) { stack[stackTop++] = v; }
  function pop(): unknown { const v = stack[--stackTop]; stack[stackTop] = undefined; return v; }
  function top(): unknown { return stack[stackTop - 1]; }

  function getLocal(slot: number): unknown {
    const box = localBoxes[slot];
    if (box) return box[0];
    return locals[slot];
  }
  function setLocal(slot: number, val: unknown): void {
    const box = localBoxes[slot];
    if (box) { box[0] = val; } else { locals[slot] = val; }
  }
  function boxLocal(slot: number): unknown[] {
    if (!localBoxes[slot]) {
      localBoxes[slot] = [locals[slot]];
    }
    return localBoxes[slot];
  }

  function getMM(obj: unknown, name: string): unknown {

    if (typeof obj === "string" && env.__string_mt) {
      const smt = env.__string_mt as Record<string, unknown>;
      if (smt[name] !== undefined) return smt[name];
    }
    if (obj && typeof obj === "object" && (obj as any).__metatable) {
      const mt = (obj as any).__metatable;
      if (mt && typeof mt === "object" && (mt as any)[name] !== undefined) {
        return (mt as any)[name];
      }
    }
    return undefined;
  }

  // Luau-faithful floor modulo (Stage 12A): Lua % takes the divisor's sign
  // (-7 % 3 == 2) while JS % truncates toward zero (-7 % 3 == -1). Generated
  // h[13] executes native Lua %, so the runner must model floor semantics.
  // Zero divisor yields NaN on both sides (Lua: 7 % 0 == nan). ONE helper for
  // the unfused path now and any future fused-MOD mirror — never separate
  // semantic models. Runner-only; production MOD semantics are untouched.
  function luaMod(x: number, y: number): number { return ((x % y) + y) % y; }

  function arithMM(a: unknown, b: unknown, op: (x: number, y: number) => number, name: string): unknown {
    if (typeof a === "number" && typeof b === "number") return op(a, b);
    const mm = getMM(a, name) ?? getMM(b, name);
    if (typeof mm === "function") return mm(a, b);

    const na = typeof a === "string" ? Number(a) : a;
    const nb = typeof b === "string" ? Number(b) : b;
    if (typeof na === "number" && !isNaN(na) && typeof nb === "number" && !isNaN(nb)) return op(na, nb);
    return op(a as number, b as number);
  }

  function callFunc(f: unknown, args: unknown[]): unknown {
    if (typeof f !== "function") {
      const mm = getMM(f, "__call");
      if (typeof mm === "function") { f = mm; }
      else throw new Error(`attempt to call a ${luaToString(f)} value`);
    }
    return (f as Function)(...args);
  }

  while (ip < code.length) {

    if (onTick && ++tickCounter >= tickInterval) {
      tickCounter = 0;
      onTick();
    }

    const op = code[ip++];
    try {
      if (op === Op.PUSH_NIL) push(null);
      else if (op === Op.PUSH_TRUE) push(true);
      else if (op === Op.PUSH_FALSE) push(false);
      else if (op === Op.PUSH_K) push(K[code[ip++]]);
      else if (op === Op.LOAD_L) push(getLocal(code[ip++]));
      else if (op === Op.STORE_L) setLocal(code[ip++], pop());
      else if (op === Op.LOAD_G) {
        const name = K[code[ip++]] as string;
        const val = env[name];
        push(val !== undefined ? val : null);
      }
      else if (op === Op.STORE_G) { env[K[code[ip++]] as string] = pop(); }
      else if (op === Op.ADD) { const b = pop(); const a = pop(); push(arithMM(a, b, (x,y) => x+y, "__add")); }
      else if (op === Op.SUB) { const b = pop(); const a = pop(); push(arithMM(a, b, (x,y) => x-y, "__sub")); }
      else if (op === Op.MUL) { const b = pop(); const a = pop(); push(arithMM(a, b, (x,y) => x*y, "__mul")); }
      else if (op === Op.DIV) { const b = pop(); const a = pop(); push(arithMM(a, b, (x,y) => x/y, "__div")); }
      else if (op === Op.MOD) { const b = pop(); const a = pop(); push(arithMM(a, b, luaMod, "__mod")); }
      else if (op === Op.POW) { const b = pop(); const a = pop(); push(arithMM(a, b, (x,y) => Math.pow(x,y), "__pow")); }
      else if (op === Op.CONCAT) {
        const b = pop(); const a = pop();
        const mm = getMM(a, "__concat") ?? getMM(b, "__concat");
        if (typeof mm === "function") push(mm(a, b));
        else push(luaToString(a) + luaToString(b));
      }
      else if (op === Op.EQ) {
        const b = pop(); const a = pop();
        if (a === b) { push(true); }
        else {
          const mm = getMM(a, "__eq");
          if (typeof mm === "function") push(mm(a, b) === true);
          else push(a === b);
        }
      }
      else if (op === Op.NE) {
        const b = pop(); const a = pop();
        if (a === b) { push(false); }
        else {
          const mm = getMM(a, "__eq");
          if (typeof mm === "function") push(mm(a, b) !== true);
          else push(a !== b);
        }
      }
      else if (op === Op.LT) {
        const b = pop(); const a = pop();
        const mm = getMM(a, "__lt") ?? getMM(b, "__lt");
        if (typeof mm === "function") push(mm(a, b) === true);
        else if (typeof a === "string" && typeof b === "string") push(a < b);
        else push((a as number) < (b as number));
      }
      else if (op === Op.LE) {
        const b = pop(); const a = pop();
        const mm = getMM(a, "__le") ?? getMM(b, "__le");
        if (typeof mm === "function") push(mm(a, b) === true);
        else if (typeof a === "string" && typeof b === "string") push(a <= b);
        else push((a as number) <= (b as number));
      }
      else if (op === Op.GT) {
        const b = pop(); const a = pop();
        const mm = getMM(b, "__lt") ?? getMM(a, "__lt");
        if (typeof mm === "function") push(mm(b, a) === true);
        else if (typeof a === "string" && typeof b === "string") push(a > b);
        else push((a as number) > (b as number));
      }
      else if (op === Op.GE) {
        const b = pop(); const a = pop();
        const mm = getMM(b, "__le") ?? getMM(a, "__le");
        if (typeof mm === "function") push(mm(b, a) === true);
        else if (typeof a === "string" && typeof b === "string") push(a >= b);
        else push((a as number) >= (b as number));
      }
      else if (op === Op.AND) {
        const b = pop(); const a = pop();
        push(isTruthy(a) ? b : a);
      }
      else if (op === Op.OR) {
        const b = pop(); const a = pop();
        push(isTruthy(a) ? a : b);
      }
      else if (op === Op.NOT) {
        push(!isTruthy(pop()));
      }
      else if (op === Op.UNM) {
        const v = pop();
        const mm = getMM(v, "__unm");
        if (typeof mm === "function") push(mm(v));
        else push(-(v as number));
      }
      else if (op === Op.LEN) {
        const v = pop();
        const mm = getMM(v, "__len");
        if (typeof mm === "function") { push(mm(v)); }
        else push(luaLen(v));
      }
      else if (op === Op.NEW_TABLE) push({});
      else if (op === Op.GET_TABLE) {
        const keyVal = pop();
        const tbl = pop();
        if (tbl === null || tbl === undefined) {
          throw new Error(`attempt to index nil with '${luaToString(keyVal)}'`);
        }

        if (typeof tbl === "string") {
          const strLib = env.string as Record<string, unknown> | undefined;
          if (strLib && strLib[keyVal as string] !== undefined) {
            push(strLib[keyVal as string]);
          } else {
            push(undefined);
          }
        }

        else if (typeof tbl === "object") {
          const raw = (tbl as Record<string | number, unknown>)[keyVal as string | number];
          if (raw !== undefined) { push(raw); }
          else {
            const mm = getMM(tbl, "__index");
            if (typeof mm === "function") push(mm(tbl, keyVal));
            else if (mm && typeof mm === "object") push((mm as any)[keyVal as string | number] ?? null);
            else push(null);
          }
        } else {

          try { push((tbl as any)[keyVal as string | number]); }
          catch { push(null); }
        }
      }
      else if (op === Op.SET_TABLE) {
        const v = pop();
        const k = pop();
        const t = pop() as Record<string | number, unknown>;
        if (t === null || t === undefined) {
          throw new Error(`attempt to index nil with '${luaToString(k)}'`);
        }
        if (typeof t === "object") {
          const existing = (t as any)[k as string | number];
          if (existing !== undefined) { t[k as string | number] = v; }
          else {
            const mm = getMM(t, "__newindex");
            if (typeof mm === "function") mm(t, k, v);
            else if (mm && typeof mm === "object") (mm as any)[k as string | number] = v;
            else t[k as string | number] = v;
          }
        } else {
          (t as any)[k as string | number] = v;
        }
      }
      else if (op === Op.CALL) {
        const n = code[ip++];
        const args: unknown[] = [];
        for (let j = 0; j < n; j++) args.unshift(pop());
        const f = pop();
        const ret = callFunc(f, args);

        if (Array.isArray(ret)) {
          push(ret.length > 0 ? ret[0] : null);
        } else {
          push(ret !== undefined ? ret : null);
        }
      }
      else if (op === Op.RETURN) {
        const n = code[ip++];
        if (n === 0) return undefined;
        let cnt = n < 0 ? stackTop : n;
        if (cnt > stackTop) cnt = stackTop;
        if (cnt === 0) return undefined;
        if (cnt === 1) return pop();
        const results: unknown[] = [];
        for (let j = 0; j < cnt; j++) results.unshift(pop());
        return results;
      }
      else if (op === Op.JMP) {
        ip = code[ip];
      }
      else if (op === Op.JMP_F) {
        const target = code[ip++];
        const val = pop();
        if (!isTruthy(val)) ip = target;
      }
      else if (op === Op.POP) {
        const n = code[ip++];
        for (let j = 0; j < n; j++) pop();
      }
      else if (op === Op.CLOSURE) {
        const pi = code[ip++];
        const P = protos[pi - 1];
        if (P) {
          const closureEnv = env;
          const closureUpvalues: { [idx: number]: unknown[] } = {};
          if ((P as any).upvalues) {
            for (let ui = 0; ui < ((P as any).upvalues as [number, number][]).length; ui++) {
              const [isLocal, idx] = ((P as any).upvalues as [number, number][])[ui];
              if (isLocal === 1) {
                closureUpvalues[ui] = boxLocal(idx);
              } else {
                closureUpvalues[ui] = (upvalues as any)[idx] || [null];
              }
            }
          }
          const nParams = (P as any).nParams || 0;
          const closureOptions = options;
          push(function (...args: unknown[]) {
            const L: Record<number, unknown> = {};
            for (let j = 0; j < Math.min(args.length, nParams); j++) L[j] = args[j];
            const va: unknown[] = [];
            for (let j = nParams; j < args.length; j++) va.push(args[j]);
            return runVM(P.K, P.code, closureEnv, 0, P.protos || [], L, closureUpvalues as any, va, closureOptions);
          });
        } else {
          push(null);
        }
      }
      else if (op === Op.DUP) push(top());
      else if (op === Op.LOAD_UPVAL) {
        const ui = code[ip++];
        const box = upvalues[ui];
        push(box ? box[0] : null);
      }
      else if (op === Op.STORE_UPVAL) {
        const ui = code[ip++];
        const box = upvalues[ui];
        if (box) { box[0] = pop(); } else { pop(); }
      }
      else if (op === Op.CALL_MULTI) {
        let n = code[ip++];
        const nrets = code[ip++];
        if (n < 0) n = 0;
        const args: unknown[] = [];
        for (let j = 0; j < n; j++) args.unshift(pop());
        const f = pop();
        const ret = callFunc(f, args);
        const results = Array.isArray(ret) ? ret : (ret !== undefined && ret !== null ? [ret] : []);
        if (nrets < 0) {
          for (const r of results) push(r);
        } else {
          for (let j = 0; j < nrets; j++) push(j < results.length ? results[j] : null);
        }
      }
      else if (op === Op.LOAD_VARARG) {
        const n = code[ip++];
        if (n < 0) {
          for (const v of varargs) push(v);
        } else {
          for (let j = 0; j < n; j++) push(j < varargs.length ? varargs[j] : null);
        }
      }
      else if (op === Op.TAILCALL) {
        const n = code[ip++];
        const args: unknown[] = [];
        for (let j = 0; j < n; j++) args.unshift(pop());
        const f = pop();
        return callFunc(f, args);
      }
      else if (op === Op.CONCAT_MULTI) {
        const n = code[ip++];
        const parts: string[] = [];
        for (let j = 0; j < n; j++) parts.unshift(luaToString(pop()));
        push(parts.join(""));
      }
      else if (op === Op.PUSH_NILS) {
        const n = code[ip++];
        for (let j = 0; j < n; j++) push(null);
      }
      else if (op === Op.MARK) {
        callBaseStackTop++;
        callBasesStack[callBaseStackTop] = stackTop;
      }
      else if (op === Op.CALL_DYNAMIC) {
        const nrets = code[ip++];
        let base = 0;
        if (callBaseStackTop > 0) { base = callBasesStack[callBaseStackTop] ?? 0; callBaseStackTop--; }
        let totalArgs = stackTop - base - 1;
        if (totalArgs < 0) totalArgs = 0;
        const args: unknown[] = [];
        for (let j = 0; j < totalArgs; j++) args.unshift(pop());
        const f = pop();
        const ret = callFunc(f, args);
        const results = Array.isArray(ret) ? ret : (ret !== undefined && ret !== null ? [ret] : []);
        if (nrets < 0) {
          for (const r of results) push(r);
        } else {
          for (let j = 0; j < nrets; j++) push(j < results.length ? results[j] : null);
        }
      }
      else if (op === Op.IDIV) {
        const b = pop();
        const a = pop();
        push(arithMM(a, b, (x,y) => Math.floor(x/y), "__idiv"));
      }
      else if (op === Op.CLOSE_UPVAL) {
        const slot = code[ip++];
        if (localBoxes[slot]) {
          delete localBoxes[slot];
        }
      }
      else if (op === Op.SETLIST) {
        const startIdx = code[ip++];
        let base = 0;
        if (callBaseStackTop > 0) { base = callBasesStack[callBaseStackTop] ?? 0; callBaseStackTop--; }
        const tbl = stack[base - 1] as Record<number, unknown>;
        const numValues = stackTop - base;
        for (let i = 0; i < numValues; i++) {
          tbl[startIdx + i] = stack[base + i];
        }
        for (let i = base; i < stackTop; i++) stack[i] = undefined;
        stackTop = base;
      }
      else if (op === Op.SWAP) {
        const b = pop();
        const a = pop();
        push(b);
        push(a);
      }
      else if (op === Op.NAMECALL) {
        const nameIdx = code[ip++];
        const methodName = K[nameIdx] as string;
        const obj = pop();
        if (obj === null || obj === undefined) {
          throw new Error(`attempt to index nil with '${methodName}'`);
        }
        let method: unknown;
        if (typeof obj === "string") {

          const strLib = env.string as Record<string, unknown> | undefined;
          method = strLib ? strLib[methodName] : undefined;
        } else {
          method = (obj as Record<string, unknown>)[methodName];
          if (method === undefined) {
            const mm = getMM(obj, "__index");
            if (typeof mm === "function") method = mm(obj, methodName);
            else if (mm && typeof mm === "object") method = (mm as any)[methodName];
          }
        }
        push(obj);
        push(method);

        const b2 = pop(); const a2 = pop(); push(b2); push(a2);
      }
      else if (op === Op.TFOR) {
        const nVars = code[ip++];
        const target = code[ip++];
        const control = pop();
        const state = pop();
        const iter = pop() as Function;
        const results = iter(state, control);
        const resArr = Array.isArray(results) ? results : (results !== undefined && results !== null ? [results] : []);
        if (resArr.length === 0 || resArr[0] === null || resArr[0] === undefined) {
          ip = target;
        } else {
          for (let i = nVars - 1; i >= 0; i--) push(i < resArr.length ? resArr[i] : null);
          push(iter); push(state); push(resArr[0]);
        }
      }
      else if (op === Op.PCALL) {
        const nArgs = code[ip++];
        const args: unknown[] = [];
        for (let j = 0; j < nArgs; j++) args.unshift(pop());
        const f = pop();
        try {
          const ret = callFunc(f, args);
          const results = Array.isArray(ret) ? ret : (ret !== undefined && ret !== null ? [ret] : []);
          push(true);
          for (const r of results) push(r);
        } catch (e) {
          push(false);
          push(e instanceof Error ? e.message : String(e));
        }
      }
      else if (op === Op.XPCALL) {
        const nArgs = code[ip++];
        const args: unknown[] = [];
        for (let j = 0; j < nArgs; j++) args.unshift(pop());
        const handler = pop();
        const f = pop();
        try {
          const ret = callFunc(f, args);
          const results = Array.isArray(ret) ? ret : (ret !== undefined && ret !== null ? [ret] : []);
          push(true);
          for (const r of results) push(r);
        } catch (e) {
          push(false);
          try {
            const handlerResult = callFunc(handler, [e instanceof Error ? e.message : String(e)]);
            push(handlerResult);
          } catch { push(e instanceof Error ? e.message : String(e)); }
        }
      }
      else if (op === Op.FORPREP) {

        const target = code[ip++];

        ip = target;
      }
      else if (op === Op.FORLOOP) {

        const target = code[ip++];

        ip = target;
      }
      // Stack super-ops 57-63 (synthetic fusion opcodes; no Op enum entries
      // because Op is a const enum. Layouts mirror fuseOpcodes in vm-gen.ts:
      // 57-59,63 are [op,a,b,c]; 60,61 are [op,x,y]; 62 is [op,a,k,c].
      // Handler bodies mirror buildHandlerTemplates h[57-63]: raw operators,
      // locals[] access, K[] for constant operands. Generated raw operators
      // dispatch standard metamethods natively, so the runner models fused
      // arithmetic via arithMM — identical to the unfused path.
      else if (op === 57) {
        const a = code[ip++]; const b = code[ip++]; const c = code[ip++];
        setLocal(c, arithMM(getLocal(a), getLocal(b), (x, y) => x + y, "__add"));
      }
      else if (op === 58) {
        const a = code[ip++]; const b = code[ip++]; const c = code[ip++];
        setLocal(c, arithMM(getLocal(a), getLocal(b), (x, y) => x - y, "__sub"));
      }
      else if (op === 59) {
        const a = code[ip++]; const b = code[ip++]; const c = code[ip++];
        setLocal(c, arithMM(getLocal(a), getLocal(b), (x, y) => x * y, "__mul"));
      }
      else if (op === 60) {
        const k = code[ip++]; const s = code[ip++];
        setLocal(s, K[k]);
      }
      else if (op === 61) {
        const a = code[ip++]; const b = code[ip++];
        setLocal(b, getLocal(a));
      }
      else if (op === 62) {
        const a = code[ip++]; const k = code[ip++]; const c = code[ip++];
        setLocal(c, arithMM(getLocal(a), K[k], (x, y) => x + y, "__add"));
      }
      else if (op === 63) {
        // Models CURRENT generated fused h[63] (vm-gen.ts: raw `..`):
        // __concat metamethods dispatch, strings/numbers coerce, anything
        // else is a runtime error. This deliberately does NOT replicate the
        // unfused h[15] pcall+tostring fallback — that divergence is the
        // 11D-2 audit subject. Tests assert error PRESENCE, never messages.
        const a = code[ip++]; const b = code[ip++]; const c = code[ip++];
        const av = getLocal(a); const bv = getLocal(b);
        const cmm = getMM(av, "__concat") ?? getMM(bv, "__concat");
        if (typeof cmm === "function") setLocal(c, cmm(av, bv));
        else if (
          (typeof av === "string" || typeof av === "number") &&
          (typeof bv === "string" || typeof bv === "number")
        ) setLocal(c, luaToString(av) + luaToString(bv));
        else throw new Error("attempt to concatenate non-concatenable values");
      }
      else if (op === 68) {
        // Stage 12C: fused DIV mirror of generated h[68] (raw `/`). Routes
        // through the SAME arithMM helper as unfused DIV — native dispatch
        // covers __div; IEEE div-by-zero (inf/nan) falls out of x/y.
        const a = code[ip++]; const b = code[ip++]; const c = code[ip++];
        setLocal(c, arithMM(getLocal(a), getLocal(b), (x, y) => x / y, "__div"));
      }
      else if (op === 69) {
        // Stage 13: fused MOD mirror of generated h[69] (raw `%`). Uses the
        // SAME luaMod helper as unfused MOD — one floor-modulo model for both
        // paths, matching native Lua semantics (sign follows divisor).
        const a = code[ip++]; const b = code[ip++]; const c = code[ip++];
        setLocal(c, arithMM(getLocal(a), getLocal(b), luaMod, "__mod"));
      }
      else if (op === 70) {
        // Stage 14: fused IDIV mirror of generated h[70] (arithMM-delegating).
        // Uses the SAME Math.floor lambda as unfused IDIV — one authoritative
        // floor-division model for both paths, preserving the established
        // x//0 -> inf leniency and __idiv dispatch.
        const a = code[ip++]; const b = code[ip++]; const c = code[ip++];
        setLocal(c, arithMM(getLocal(a), getLocal(b), (x, y) => Math.floor(x / y), "__idiv"));
      }
      else {

      }
    } catch (err) {

      if (err instanceof Error && err.message.includes("Timeout")) throw err;
      if (err instanceof Error && !err.message.includes("[op=")) {
        throw new Error(`${err.message} [op=${op} ip=${ip - 1}]`);
      }
      throw err;
    }
  }
  return undefined;
}
