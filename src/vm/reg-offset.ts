import type { RegBytecodeChunk } from "./bytecode.js";

/** Operand fields are serialized as i16: operands must stay <= 32767. */
export const RK_OPERAND_MAX = 32767;

export interface RkAdaptResult {
  rkOffset: number;
  widened: boolean;
}

export function maxProtoDomain(chunk: RegBytecodeChunk): { maxK: number; maxRegs: number } {
  let maxK = chunk.K.length;
  let maxRegs = chunk.maxRegs ?? 0;
  const walk = (c: RegBytecodeChunk): void => {
    maxK = Math.max(maxK, c.K.length);
    maxRegs = Math.max(maxRegs, c.maxRegs ?? 0);
    for (const p of c.protos ?? []) walk(p);
  };
  walk(chunk);
  return { maxK, maxRegs };
}

/**
 * Phase 1.2(g) offset + large-input rescue.
 *
 * The register VM shares one operand space between registers (below
 * rkOffset) and RK-encoded constants (at or above it), and operands are
 * serialized as i16. The per-build draw domain [2049, 8191] guarantees the
 * invariant for ordinary scripts, but inputs whose compiled constant table
 * (or register count) reaches the drawn offset previously hard-failed
 * generation ("K length N >= rkOffset M"). This adapts the offset to the
 * compiled chunk: keep the seeded draw when it already satisfies the
 * invariant, otherwise widen to the next odd value above
 * max(constants, registers). The caller must recompile with the returned
 * offset so compile-time and runtime thresholds agree (operand baking).
 *
 * Inputs that cannot fit the i16 domain fail with an actionable error.
 */
export function adaptRkOffset(probe: RegBytecodeChunk, base: number): RkAdaptResult {
  const { maxK, maxRegs } = maxProtoDomain(probe);
  const need = Math.max(maxK, maxRegs);
  // Generator invariant is strict for K (maxK < rkOffset); for registers
  // the decoder only requires register indices (< maxRegs) to stay below
  // the threshold, so maxRegs <= offset is sufficient.
  if (maxK < base && maxRegs <= base) return { rkOffset: base, widened: false };

  let v = need + 1;
  if (v % 2 === 0) v += 1;
  if (v + maxK - 1 > RK_OPERAND_MAX) {
    throw new Error(
      `[RegVM] input too large for the register VM operand domain: ${maxK} constants / ${maxRegs} registers exceed the i16 limit (${RK_OPERAND_MAX}); reduce encoded string data or split the script`,
    );
  }
  return { rkOffset: v, widened: true };
}
