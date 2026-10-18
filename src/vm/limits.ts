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
//
// The bound was lowered from 192 KiB to 9.6 KiB after executor loader
// failures on ~196 KB single lines (Luau parser rejects the shipped
// artifact). 9,600 leaves headroom under a 10,000-char physical-line bar
// for the `[==[`/`]==],` decorations around each piece.

export const MAX_OUTPUT_LINE_BYTES = 9_600;

/**
 * Pick the smallest valid long-bracket level for embedding `s` verbatim:
 * the literal must not contain the closer `]` + `=`*level + `]`, and its
 * tail run must not merge with the closer (a blob ending with `]` + `=`*k
 * would otherwise close the literal one char early). Level 0 (`[[...]]`)
 * whenever the content allows it.
 */
export function longStringLevel(s: string): number {
  let level = 0;
  while (s.includes("]" + "=".repeat(level) + "]") || s.endsWith("]" + "=".repeat(level))) {
    level++;
  }
  return level;
}

/** Split a long literal into contiguous pieces, each <= max bytes. */
export function splitLongLiteral(s: string, max: number = MAX_OUTPUT_LINE_BYTES): string[] {
  if (s.length <= max) return [s];
  const out: string[] = [];
  for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
  return out;
}

/**
 * Escape a byte sequence into one or more Lua double-quoted literals,
 * bounded so no single literal source exceeds `max` characters. Multi-piece
 * output joins pieces with `..` across real newlines (byte-identical for
 * sequences whose escaped form already fits). Split points are byte-atomic,
 * so UTF-8 sequences may span pieces — Lua concatenation is byte-level, so
 * the joined value is unchanged.
 *
 * Escaping matches the legacy reg/vm emitters exactly: `\\`, `\"`, `\n`,
 * `\r`, `\000`, `\NNN` (3-digit) for <32/>126, printable ASCII raw.
 */
export function luaQuotedFromBytes(bytes: number[], max: number = MAX_OUTPUT_LINE_BYTES): string {
  const escUnit = (b: number): string => {
    if (b === 92) return "\\\\";
    if (b === 34) return '\\"';
    if (b === 10) return "\\n";
    if (b === 13) return "\\r";
    if (b === 0) return "\\000";
    if (b < 32 || b > 126) return `\\${b.toString().padStart(3, "0")}`;
    return String.fromCharCode(b);
  };
  const budget = Math.max(256, max - 16);
  const pieces: string[] = [];
  let cur = "";
  for (const b of bytes) {
    const u = escUnit(b);
    if (cur.length + u.length > budget) {
      pieces.push(cur);
      cur = "";
    }
    cur += u;
  }
  pieces.push(cur);
  if (pieces.length === 1) return `"${pieces[0]}"`;
  return pieces.map((p) => `"${p}"`).join("..\n");
}

/**
 * Executor parser-compat: bound long emitted code lines at `max` by
 * breaking after comma tokens. A comma is only legal inside table
 * constructors, expression lists, or call argument lists, where a newline
 * directly after it is semantics-neutral whitespace — so the transform is
 * parse- and behavior-preserving. Quoted strings (escape-aware) and long
 * bracket strings/comments are never split; `--` comments end the safe
 * range on the line. Lines already <= max are returned byte-identical
 * (fast path keeps small-artifact determinism intact).
 *
 * Quoted literals that could exceed the bound on their own are chunked at
 * emission time (luaQuotedFromBytes), so a line with no comma before the
 * limit should not occur in generated code; if one does, it is left intact.
 */
export function boundCommaSeparatedLine(code: string, max: number = MAX_OUTPUT_LINE_BYTES): string {
  const limit = Math.max(256, max - 8);
  let changed = false;
  const out: string[] = [];
  for (const line of code.split("\n")) {
    if (line.length <= max) {
      out.push(line);
      continue;
    }
    changed = true;
    const safe: number[] = [];
    let inStr = false;
    for (let i = 0; i < line.length; i++) {
      const c = line.charCodeAt(i);
      if (inStr) {
        if (c === 92) i++;
        else if (c === 34) inStr = false;
        continue;
      }
      if (c === 34) {
        inStr = true;
        continue;
      }
      if (c === 45 && line.charCodeAt(i + 1) === 45) break;
      if (c === 91) {
        const m = /^\[(=*)\[/.exec(line.slice(i));
        if (m) {
          const closer = "]" + m[1] + "]";
          const end = line.indexOf(closer, i + m[0].length);
          i = end === -1 ? line.length : end + closer.length - 1;
          continue;
        }
      }
      if (c === 44) safe.push(i + 1);
    }
    let start = 0;
    let si = 0;
    while (start < line.length) {
      if (line.length - start <= max) {
        out.push(line.slice(start));
        break;
      }
      const stop = start + limit;
      let best = -1;
      while (si < safe.length && safe[si] <= stop) {
        if (safe[si] > start) best = safe[si];
        si++;
      }
      if (best <= start) {
        out.push(line.slice(start));
        break;
      }
      out.push(line.slice(start, best));
      start = best;
    }
  }
  return changed ? out.join("\n") : code;
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
