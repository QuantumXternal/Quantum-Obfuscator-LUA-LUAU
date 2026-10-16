// Pure server cache-key construction (Phase 1.2b: extracted from server.ts
// so the key contract is unit-testable without importing express or binding
// a port). The key MUST discriminate seed types: JSON.stringify serializes
// numeric 1234 and string "1234" differently, so a numeric seed and a string
// seed never collide even when their characters match. Pinned by
// tests/server-cache.test.js.
export function cacheKey(code: string, opts: Record<string, unknown>): string {
  return JSON.stringify([code.length, code, opts]);
}
