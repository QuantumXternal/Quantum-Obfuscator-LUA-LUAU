// Server smoke: legacy path unchanged + profile path works + invalid profile 400.
const base = "http://localhost:3000";
async function post(path, body) {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  return { status: r.status, json: j };
}
const code = "local x = 1 + 2 print(x)";
const legacy = await post("/api/obfuscate", { code, options: { vmType: "none", seed: 7 } });
console.log("legacy:", legacy.status, "len:", legacy.json.output?.length);
const bal = await post("/api/obfuscate", { code, options: { profile: "BALANCED", seed: 7 } });
console.log("balanced:", bal.status, "len:", bal.json.output?.length);
const fast = await post("/api/obfuscate", { code, options: { profile: "FAST", seed: 7 } });
console.log("fast:", fast.status, "len:", fast.json.output?.length);
const bad = await post("/api/obfuscate", { code, options: { profile: "ULTRA" } });
console.log("bad-profile:", bad.status, JSON.stringify(bad.json));
const cached = await post("/api/obfuscate", { code, options: { profile: "BALANCED", seed: 7 } });
console.log("cached-hit:", cached.status, "cached:", cached.json.cached === true);
if (legacy.status !== 200 || bal.status !== 200 || fast.status !== 200 || bad.status !== 400 || cached.json.cached !== true) {
  console.error("SMOKE FAIL");
  process.exit(1);
}
if (!(fast.json.output.length < bal.json.output.length)) {
  console.error("SMOKE FAIL: FAST should be smaller than BALANCED");
  process.exit(1);
}
const poly1 = await post("/api/obfuscate", { code, options: { profile: "BALANCED", polymorphicSeed: 11 } });
const poly2 = await post("/api/obfuscate", { code, options: { profile: "BALANCED", polymorphicSeed: 12 } });
console.log("polyseed-11:", poly1.status, "len:", poly1.json.output?.length);
console.log("polyseed-12:", poly2.status, "len:", poly2.json.output?.length);
if (poly1.status !== 200 || poly2.status !== 200 || poly1.json.output === poly2.json.output) {
  console.error("SMOKE FAIL: polymorphicSeed should flow into generation");
  process.exit(1);
}
const stripped = await post("/api/obfuscate", { code, options: { profile: "BALANCED", seed: 7, disableFeatures: ["deadCodeInjection"] } });
const plain = await post("/api/obfuscate", { code, options: { profile: "BALANCED", seed: 7 } });
console.log("plain:", plain.json.output?.length, "stripped:", stripped.json.output?.length);
if (stripped.json.output.length >= plain.json.output.length) {
  console.error("SMOKE FAIL: disableFeatures deadCodeInjection should shrink output");
  process.exit(1);
}
// JSON error envelope: malformed body -> 400 JSON (was HTML via default handler).
const malRaw = await fetch(base + "/api/obfuscate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not-json" });
const malJson = await malRaw.json();
console.log("malformed:", malRaw.status, JSON.stringify(malJson));
if (malRaw.status !== 400 || malJson.error !== "Malformed JSON request body") {
  console.error("SMOKE FAIL: malformed JSON should be 400 JSON envelope");
  process.exit(1);
}
// Oversized raw body (>1mb express.json limit) -> 413 JSON (was HTML).
const bigRaw = await fetch(base + "/api/obfuscate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "x".repeat(2 * 1024 * 1024), options: {} }) });
const bigJson = await bigRaw.json();
console.log("oversized:", bigRaw.status, JSON.stringify(bigJson).slice(0, 80));
if (bigRaw.status !== 413 || bigJson.error !== "Code payload too large (max 1MB)") {
  console.error("SMOKE FAIL: oversized body should be 413 JSON envelope");
  process.exit(1);
}
// Unknown /api/* route -> 404 JSON (was HTML "Cannot POST ...").
const unkRaw = await fetch(base + "/api/nonexistent", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
const unkJson = await unkRaw.json();
console.log("unknown-api:", unkRaw.status, JSON.stringify(unkJson));
if (unkRaw.status !== 404 || unkJson.error !== "Unknown API endpoint") {
  console.error("SMOKE FAIL: unknown API route should be 404 JSON envelope");
  process.exit(1);
}
// Static-file 404 stays HTML (out of API envelope scope).
const stRaw = await fetch(base + "/no-such-asset.xyz");
const stType = stRaw.headers.get("content-type") || "";
console.log("static-404:", stRaw.status, stType);
if (stRaw.status !== 404 || !stType.includes("html")) {
  console.error("SMOKE FAIL: static 404 should remain HTML");
  process.exit(1);
}
// Existing bad-profile 400 remains byte-identical in status/body semantics.
if (bad.status !== 400 || bad.json.error !== "Invalid 'profile' (expected FAST, BALANCED, or MAXIMUM)") {
  console.error("SMOKE FAIL: bad-profile 400 envelope changed");
  process.exit(1);
}
// Existing lexer error path unchanged.
const lexErr = await post("/api/obfuscate", { code: "local x = $", options: {} });
console.log("lexer-error:", lexErr.status, JSON.stringify(lexErr.json).slice(0, 120));
if (lexErr.status !== 400 || lexErr.json.error !== "Lexer error" || !("details" in lexErr.json)) {
  console.error("SMOKE FAIL: lexer error envelope changed");
  process.exit(1);
}
// Parse-invalid input must not be a silent 200 success: the pipeline raises
// PipelineParseError, which the server envelope reports deterministically.
// Pinned behavior (no new 400 mapping invented here): non-200 JSON error,
// identical across repeated runs.
const parseBad1 = await post("/api/obfuscate", { code: "local x = ", options: { profile: "BALANCED", seed: 7 } });
const parseBad2 = await post("/api/obfuscate", { code: "local x = ", options: { profile: "BALANCED", seed: 7 } });
console.log("parse-invalid:", parseBad1.status, JSON.stringify(parseBad1.json).slice(0, 100));
if (parseBad1.status === 200 || typeof parseBad1.json.error !== "string") {
  console.error("SMOKE FAIL: parse-invalid input must not succeed");
  process.exit(1);
}
if (parseBad1.status !== parseBad2.status || JSON.stringify(parseBad1.json) !== JSON.stringify(parseBad2.json)) {
  console.error("SMOKE FAIL: parse-invalid error must be deterministic");
  process.exit(1);
}
console.log("SMOKE OK");
