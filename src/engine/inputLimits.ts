// Shared input-size policy for the HTTP server and the obfuscate CLIs.
// Pure module (no express import), mirroring ./cacheKey.ts, so tests can
// exercise parsing and limits without binding a port.

export const DEFAULT_MAX_INPUT_BYTES = 256 * 1024;

/** Read a positive integer from the environment (fallback on absent/invalid). */
export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Parse "262144" | "256kb" | "1.5mb" -> bytes. Null when unparseable. */
export function parseByteSize(raw: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb)?$/i.exec(raw.trim());
  if (!m) return null;
  const unit = (m[2] ?? "b").toLowerCase();
  const mult = unit === "mb" ? 1024 * 1024 : unit === "kb" ? 1024 : 1;
  const bytes = Math.floor(parseFloat(m[1]) * mult);
  return bytes > 0 ? bytes : null;
}

export function inputTooLargeMessage(maxBytes: number): string {
  return `Code payload too large (max ${maxBytes} bytes)`;
}
