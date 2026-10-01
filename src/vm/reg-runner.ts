import type { RegBytecodeChunk } from "./bytecode.js";
import { RegOp, RK_OFFSET } from "./bytecode.js";

export interface RegRunnerEnv {
  [key: string]: unknown;
}

export interface RegRunnerOptions {
  onTick?: () => void;
  tickInterval?: number;
  maxInstructions?: number;
}

type UpvalueBox = { 0: unknown };

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

function luaMod(a: number, b: number): number {
  return a - Math.floor(a / b) * b;
}

function toArray(v: unknown): unknown[] {
  return Array.isArray(v) ? (v as unknown[]) : [v];
}

/**
 * Reference interpreter for register bytecode as emitted by `regCompile`.
 *
 * Testing/reference implementation only: it executes compiler output so
 * generated programs can be validated for semantic equivalence. It is NOT
 * an independent VM design and must track `RegCompiler` lowering exactly.
 *
 * Calling convention (mirrors the emitted register VM):
 * - Fixed 4-word instructions `[op, A, B, C]`, `pc` counts instructions.
 * - `CALL A,B,C`: `B==0` = spread args `R[A+1..top]`, else `B-1` args;
 *   `C==0` = keep all results (`top` updated), `C==1` = 0 results,
 *   otherwise exactly `C-1` results (nil-padded).
 * - `VARARG A,B`: same `B` convention against the vararg list.
 * - `RETURN A,B`: `B==1` = void, `B==0` = `R[A..top]`, else `R[A..A+B-2]`.
 * - JS host functions receive an args array and return either a single
 *   value or an array of values.
 *
 * Opcodes never emitted by `regCompile` (`TESTSET`, `PCALL`, `XPCALL`,
 * `TAILCALL`, `FUSED_*`) throw explicitly instead of guessing semantics.
 */
export function runReg(
  chunk: RegBytecodeChunk,
  env: RegRunnerEnv,
  args: unknown[] = [],
  upvalues: { [idx: number]: UpvalueBox } = {},
  options: RegRunnerOptions = {},
): unknown[] {
  const code = chunk.code;
  const K = chunk.K;
  const R: unknown[] = new Array(Math.max(chunk.maxRegs, chunk.nParams) + 8).fill(null);
  for (let i = 0; i < chunk.nParams && i < args.length; i++) R[i] = args[i];
  const varargs = chunk.isVararg ? args.slice(chunk.nParams) : [];
  let top = chunk.nParams - 1;

  const onTick = options.onTick;
  const tickInterval = options.tickInterval ?? 100000;
  const maxInstructions = options.maxInstructions ?? 10000000;
  let tickCounter = 0;
  let executed = 0;

  const rk = (v: number): unknown => (v >= RK_OFFSET ? K[v - RK_OFFSET] : R[v]);

  const callFn = (f: unknown, callArgs: unknown[]): unknown[] => {
    if (typeof f !== "function") throw new Error(`attempt to call a ${luaToString(f)} value`);
    return toArray((f as (...a: unknown[]) => unknown)(...callArgs));
  };

  const closeBox = (boxes: Map<number, UpvalueBox>, reg: number): void => {
    for (const r of [...boxes.keys()]) {
      if (r >= reg) boxes.delete(r);
    }
  };

  const boxes = new Map<number, UpvalueBox>();
  const getReg = (r: number): unknown => boxes.get(r)?.[0] ?? R[r];
  const setReg = (r: number, v: unknown): void => {
    const b = boxes.get(r);
    if (b) b[0] = v;
    else R[r] = v;
  };

  let pc = 0;
  const fetch = (field: number): number => code[pc * 4 + field]!;

  while (pc * 4 < code.length) {
    if (++executed > maxInstructions) throw new Error("instruction limit exceeded (possible infinite loop)");
    if (onTick && ++tickCounter >= tickInterval) {
      tickCounter = 0;
      onTick();
    }
    const op = fetch(0) as RegOp;
    const A = fetch(1);
    const B = fetch(2);
    const C = fetch(3);

    switch (op) {
      case RegOp.NOP:
        pc++;
        break;
      case RegOp.LOADK:
        setReg(A, K[B]);
        pc++;
        break;
      case RegOp.LOADKX: {
        const ki = code[(pc + 1) * 4 + 1]!;
        setReg(A, K[ki]);
        pc += 2;
        break;
      }
      case RegOp.EXTRAARG:
        throw new Error("EXTRAARG must be skipped by LOADKX");
      case RegOp.LOADNIL:
        for (let i = A; i <= A + B; i++) setReg(i, null);
        pc++;
        break;
      case RegOp.LOADBOOL:
        setReg(A, B !== 0);
        pc += C !== 0 ? 2 : 1;
        break;
      case RegOp.MOVE:
        setReg(A, getReg(B));
        pc++;
        break;
      case RegOp.GETGLOBAL:
        setReg(A, (env as Record<string, unknown>)[K[B] as string]);
        pc++;
        break;
      case RegOp.SETGLOBAL:
        (env as Record<string, unknown>)[K[B] as string] = getReg(A);
        pc++;
        break;
      case RegOp.GETTABLE: {
        const obj = getReg(B) as Record<PropertyKey, unknown>;
        setReg(A, obj == null ? undefined : obj[rk(C) as PropertyKey]);
        pc++;
        break;
      }
      case RegOp.SETTABLE: {
        const obj = getReg(A) as Record<PropertyKey, unknown>;
        obj[rk(B) as PropertyKey] = rk(C);
        pc++;
        break;
      }
      case RegOp.NEWTABLE:
        setReg(A, {});
        pc++;
        break;
      case RegOp.ADD:
        setReg(A, (rk(B) as number) + (rk(C) as number));
        pc++;
        break;
      case RegOp.SUB:
        setReg(A, (rk(B) as number) - (rk(C) as number));
        pc++;
        break;
      case RegOp.MUL:
        setReg(A, (rk(B) as number) * (rk(C) as number));
        pc++;
        break;
      case RegOp.DIV:
        setReg(A, (rk(B) as number) / (rk(C) as number));
        pc++;
        break;
      case RegOp.MOD:
        setReg(A, luaMod(rk(B) as number, rk(C) as number));
        pc++;
        break;
      case RegOp.POW:
        setReg(A, Math.pow(rk(B) as number, rk(C) as number));
        pc++;
        break;
      case RegOp.IDIV:
        setReg(A, Math.floor((rk(B) as number) / (rk(C) as number)));
        pc++;
        break;
      case RegOp.UNM:
        setReg(A, -(getReg(B) as number));
        pc++;
        break;
      case RegOp.NOT:
        setReg(A, !isTruthy(getReg(B)));
        pc++;
        break;
      case RegOp.LEN:
        setReg(A, luaLen(getReg(B)));
        pc++;
        break;
      case RegOp.CONCAT: {
        let s = "";
        for (let i = B; i <= C; i++) s += luaToString(getReg(i));
        setReg(A, s);
        pc++;
        break;
      }
      case RegOp.JMP:
        pc = pc + 1 + B;
        break;
      case RegOp.EQ:
        if (((rk(B) === rk(C)) as boolean) !== (A !== 0)) pc++;
        pc++;
        break;
      case RegOp.LT:
        if ((((rk(B) as number) < (rk(C) as number)) as boolean) !== (A !== 0)) pc++;
        pc++;
        break;
      case RegOp.LE:
        if ((((rk(B) as number) <= (rk(C) as number)) as boolean) !== (A !== 0)) pc++;
        pc++;
        break;
      case RegOp.TEST:
        if (isTruthy(getReg(A)) !== (C !== 0)) pc++;
        pc++;
        break;
      case RegOp.TESTSET:
        // Standard Lua semantics (kept for ISA completeness; regCompile
        // never emits it — the TESTSET-lowering prototype showed no
        // consistent win and was reverted; see CHANGELOG Stage 7).
        if (isTruthy(getReg(B)) !== (C !== 0)) pc++;
        else setReg(A, getReg(B));
        pc++;
        break;
      case RegOp.CALL: {
        const f = getReg(A);
        const callArgs = B === 0 ? R.slice(A + 1, top + 1).map((_, i) => getReg(A + 1 + i)) : (() => {
          const out: unknown[] = [];
          for (let i = 0; i < B - 1; i++) out.push(getReg(A + 1 + i));
          return out;
        })();
        const res = callFn(f, callArgs);
        if (C === 0) {
          for (let i = 0; i < res.length; i++) setReg(A + i, res[i]);
          top = A + res.length - 1;
        } else if (C === 1) {
          // statement position: no results
        } else {
          for (let i = 0; i < C - 1; i++) setReg(A + i, i < res.length ? res[i] : null);
          if (top < A + C - 2) top = A + C - 2;
        }
        pc++;
        break;
      }
      case RegOp.RETURN: {
        if (B === 1) return [];
        if (B === 0) {
          const out: unknown[] = [];
          for (let i = A; i <= top; i++) out.push(getReg(i));
          return out;
        }
        const out: unknown[] = [];
        for (let i = A; i < A + B - 1; i++) out.push(getReg(i));
        return out;
      }
      case RegOp.FORPREP: {
        setReg(A, (getReg(A) as number) - (getReg(A + 2) as number));
        pc = pc + 1 + B;
        break;
      }
      case RegOp.FORLOOP: {
        const step = getReg(A + 2) as number;
        const idx = (getReg(A) as number) + step;
        setReg(A, idx);
        const lim = getReg(A + 1) as number;
        if (step > 0 ? idx <= lim : idx >= lim) {
          setReg(A + 3, idx);
          pc = pc + 1 + B;
        } else {
          pc++;
        }
        break;
      }
      case RegOp.TFORLOOP: {
        // Layout from compileForIn: TFORLOOP; JMP->end; body... — a nil
        // first result must fall through into the exit jump, a non-nil
        // result must skip it.
        const f = getReg(A);
        const res = callFn(f, [getReg(A + 1), getReg(A + 2)]);
        for (let i = 0; i < C; i++) setReg(A + 3 + i, i < res.length ? res[i] : null);
        if (getReg(A + 3) === null || getReg(A + 3) === undefined) pc++;
        else pc += 2;
        break;
      }
      case RegOp.ITERPREP:
        pc++;
        break;
      case RegOp.SETLIST: {
        const t = getReg(A) as Record<number, unknown>;
        if (B === 0) {
          for (let i = A + 1; i <= top; i++) t[C + (i - (A + 1))] = getReg(i);
        } else {
          for (let i = 0; i < B; i++) t[C + i] = getReg(A + 1 + i);
        }
        pc++;
        break;
      }
      case RegOp.CLOSURE: {
        const proto = chunk.protos?.[B];
        if (!proto) throw new Error(`bad proto ${B}`);
        const captured: { [idx: number]: UpvalueBox } = {};
        for (let i = 0; i < (proto.upvalues?.length ?? 0); i++) {
          const uv = proto.upvalues![i]!;
          if (uv[0] === 1) {
            let box = boxes.get(uv[1]);
            if (!box) {
              box = [R[uv[1]]] as UpvalueBox;
              boxes.set(uv[1], box);
            }
            captured[i] = box;
          } else {
            const parent = upvalues[uv[1]];
            captured[i] = parent ?? ([null] as UpvalueBox);
          }
        }
        const fn = (...callArgs: unknown[]): unknown =>
          runReg(proto, env, callArgs, captured, options);
        setReg(A, fn);
        pc++;
        break;
      }
      case RegOp.VARARG: {
        if (B === 0) {
          for (let i = 0; i < varargs.length; i++) setReg(A + i, varargs[i]);
          top = A + varargs.length - 1;
        } else {
          for (let i = 0; i < B - 1; i++) setReg(A + i, i < varargs.length ? varargs[i] : null);
          if (top < A + B - 2) top = A + B - 2;
        }
        pc++;
        break;
      }
      case RegOp.SELF: {
        const obj = getReg(B);
        setReg(A + 1, obj);
        const key = rk(C) as PropertyKey;
        setReg(A, (obj as Record<PropertyKey, unknown>)[key]);
        pc++;
        break;
      }
      // Upvalue access ALWAYS goes through the boxes captured at CLOSURE
      // time (`upvalues` param). `chunk.upvalues` only describes how those
      // boxes were captured from the parent frame; consulting the current
      // frame here would read the wrong registers (verified against
      // RegCompiler.resolveUpvalue + CLOSURE lowering).
      case RegOp.GETUPVAL: {
        const box = upvalues[B];
        if (!box) throw new Error(`bad upvalue ${B} (no captured box)`);
        setReg(A, box[0]);
        pc++;
        break;
      }
      case RegOp.SETUPVAL: {
        const box = upvalues[B];
        if (!box) throw new Error(`bad upvalue ${B} (no captured box)`);
        box[0] = getReg(A);
        pc++;
        break;
      }
      case RegOp.CLOSEUPVAL:
        closeBox(boxes, A);
        pc++;
        break;
      default:
        // TESTSET is implemented above for ISA completeness but never emitted
        // by regCompile. PCALL/XPCALL/TAILCALL/FUSED_* are unimplemented;
        // refusing to guess their semantics.
        throw new Error(`unsupported opcode in reference runner: ${op as number}`);
    }
  }
  return [];
}
