// Output-size policy for generated artifacts.
//
// Rationale: single-line multi-megabyte output breaks downstream tooling
// (browser textareas lay out wrapped multi-MB lines catastrophically;
// GitHub's blob viewer OOMs on such lines). All emitters therefore keep
// physical output lines at or below MAX_OUTPUT_LINE_BYTES. The bound is
// enforced at two layers:
//
//  1. Literal emission: any multi-megabyte literal (VM blob, envelope
//     fragments) is subdivided into <= MAX_OUTPUT_LINE_BYTES pieces joined
//     by `..` or table.concat, each piece on its own source line.
//  2. Final one-line flatten: joins stay on one line only while the
//     accumulated bytes stay under the bound, then break at an original
//     line boundary (which is always a semantics-neutral whitespace swap).
//
// Small outputs (< bound) are byte-identical to the previous emitters.

export const MAX_OUTPUT_LINE_BYTES = 192 * 1024;

/** Split a long literal into contiguous pieces, each <= max bytes. */
export function splitLongLiteral(s: string, max: number = MAX_OUTPUT_LINE_BYTES): string[] {
  if (s.length <= max) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
  return out;
}

/**
 * Join lines into bounded-width lines: accumulation uses `sep` (a space
 * for the legacy one-line flatten) until the accumulated byte count
 * reaches `max`, then a real newline is used for the next boundary. This
 * only ever swaps whitespace at original line boundaries, so emitted code
 * semantics are unchanged.
 */
export function joinBounded(lines: string[], max: number = MAX_OUTPUT_LINE_BYTES, sep = " "): string[] {
  const out: string[] = [];
  let cur: string | null = null;
  for (const line of lines) {
    if (cur === null) {
      cur = line;
    } else if (cur.length + 1 + line.length <= max) {
      cur += sep + line;
    } else {
      out.push(cur);
      cur = line;
    }
  }
  if (cur !== null) out.push(cur);
  return out;
}
