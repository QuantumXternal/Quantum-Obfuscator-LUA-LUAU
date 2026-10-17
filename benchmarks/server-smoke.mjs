// Server smoke: self-contained. Spawns dist/server.js twice -- once with a
// small MAX_INPUT_BYTES to pin the 413 envelope, once with
// OBFUSCATE_TIMEOUT_MS=1 to pin the worker-thread 504 path -- so no
// externally started server is needed. Requires a prior `npm run build`.
import { spawn } from "node:child_process";

const ROOT = new URL("..", import.meta.url);
const PORT = 3210;
const MAX_BYTES = 128 * 1024;
const base = `http://localhost:${PORT}`;

let current = null;

function startServer(extraEnv = {}) {
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NO_BROWSER: "1", MAX_INPUT_BYTES: String(MAX_BYTES), ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
  current = child;
  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  const done = new Promise((r) => child.once("exit", r));
  child.kill();
  await Promise.race([done, new Promise((r) => setTimeout(r, 3000))]);
  current = null;
}

async function waitReady(ms = 20000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (current && current.exitCode !== null) throw new Error(`server exited early with code ${current.exitCode}`);
    try {
      const r = await fetch(base + "/");
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("server did not become ready");
}

async function post(path, body) {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  return { status: r.status, json: j };
}

function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

const code = "local x = 1 + 2 print(x)";

async function main() {
  startServer();
  await waitReady();

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
  check(legacy.status === 200 && bal.status === 200 && fast.status === 200 && bad.status === 400 && cached.json.cached === true, "core profile paths changed");
  check(fast.json.output.length < bal.json.output.length, "FAST should be smaller than BALANCED");

  const poly1 = await post("/api/obfuscate", { code, options: { profile: "BALANCED", polymorphicSeed: 11 } });
  const poly2 = await post("/api/obfuscate", { code, options: { profile: "BALANCED", polymorphicSeed: 12 } });
  console.log("polyseed-11:", poly1.status, "len:", poly1.json.output?.length);
  console.log("polyseed-12:", poly2.status, "len:", poly2.json.output?.length);
  check(poly1.status === 200 && poly2.status === 200 && poly1.json.output !== poly2.json.output, "polymorphicSeed should flow into generation");

  const stripped = await post("/api/obfuscate", { code, options: { profile: "BALANCED", seed: 7, disableFeatures: ["deadCodeInjection"] } });
  const plain = await post("/api/obfuscate", { code, options: { profile: "BALANCED", seed: 7 } });
  console.log("plain:", plain.json.output?.length, "stripped:", stripped.json.output?.length);
  check(stripped.json.output.length < plain.json.output.length, "disableFeatures deadCodeInjection should shrink output");

  // JSON error envelope: malformed body -> 400 JSON (was HTML via default handler).
  const malRaw = await fetch(base + "/api/obfuscate", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not-json" });
  const malJson = await malRaw.json();
  console.log("malformed:", malRaw.status, JSON.stringify(malJson));
  check(malRaw.status === 400 && malJson.error === "Malformed JSON request body", "malformed JSON should be 400 JSON envelope");

  // Oversized raw body (> scaled express.json limit) -> 413 JSON naming the configured cap.
  const bigRaw = await fetch(base + "/api/obfuscate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "x".repeat(2 * 1024 * 1024), options: {} }) });
  const bigJson = await bigRaw.json();
  console.log("oversized-raw:", bigRaw.status, JSON.stringify(bigJson).slice(0, 80));
  check(bigRaw.status === 413 && bigJson.error === `Code payload too large (max ${MAX_BYTES} bytes)`, "oversized raw body should be 413 JSON envelope with configured cap");

  // Route-level byte cap: JSON body under the parser limit but over MAX_INPUT_BYTES
  // -> 413 with machine-readable bytes/maxBytes.
  const overCap = await post("/api/obfuscate", { code: "x".repeat(MAX_BYTES + 1024), options: {} });
  console.log("over-cap:", overCap.status, JSON.stringify(overCap.json).slice(0, 100));
  check(overCap.status === 413 && overCap.json.bytes > MAX_BYTES && overCap.json.maxBytes === MAX_BYTES, "route-level cap should 413 with bytes/maxBytes");
  const overCapValidate = await post("/api/validate", { code: "x".repeat(MAX_BYTES + 1024) });
  check(overCapValidate.status === 413 && overCapValidate.json.maxBytes === MAX_BYTES, "validate route should share the byte cap");

  // Unknown /api/* route -> 404 JSON (was HTML "Cannot POST ...").
  const unkRaw = await fetch(base + "/api/nonexistent", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const unkJson = await unkRaw.json();
  console.log("unknown-api:", unkRaw.status, JSON.stringify(unkJson));
  check(unkRaw.status === 404 && unkJson.error === "Unknown API endpoint", "unknown API route should be 404 JSON envelope");

  // Static-file 404 stays HTML (out of API envelope scope).
  const stRaw = await fetch(base + "/no-such-asset.xyz");
  const stType = stRaw.headers.get("content-type") || "";
  console.log("static-404:", stRaw.status, stType);
  check(stRaw.status === 404 && stType.includes("html"), "static 404 should remain HTML");

  // Existing bad-profile 400 remains byte-identical in status/body semantics.
  check(bad.status === 400 && bad.json.error === "Invalid 'profile' (expected FAST, BALANCED, or MAXIMUM)", "bad-profile 400 envelope changed");

  // Existing lexer error path unchanged.
  const lexErr = await post("/api/obfuscate", { code: "local x = $", options: {} });
  console.log("lexer-error:", lexErr.status, JSON.stringify(lexErr.json).slice(0, 120));
  check(lexErr.status === 400 && lexErr.json.error === "Lexer error" && "details" in lexErr.json, "lexer error envelope changed");

  // Parse-invalid input must not be a silent 200 success: the pipeline raises
  // PipelineParseError, which the server envelope reports deterministically.
  const parseBad1 = await post("/api/obfuscate", { code: "local x = ", options: { profile: "BALANCED", seed: 7 } });
  const parseBad2 = await post("/api/obfuscate", { code: "local x = ", options: { profile: "BALANCED", seed: 7 } });
  console.log("parse-invalid:", parseBad1.status, JSON.stringify(parseBad1.json).slice(0, 100));
  check(parseBad1.status !== 200 && typeof parseBad1.json.error === "string", "parse-invalid input must not succeed");
  check(parseBad1.status === parseBad2.status && JSON.stringify(parseBad1.json) === JSON.stringify(parseBad2.json), "parse-invalid error must be deterministic");

  await stopServer(current);

  // Worker-thread timeout path: a 1ms budget guarantees the worker cannot
  // finish, so the runner must terminate it and map to a 504 JSON envelope.
  startServer({ OBFUSCATE_TIMEOUT_MS: "1" });
  await waitReady();
  const timed = await post("/api/obfuscate", { code, options: { profile: "BALANCED", seed: 7 } });
  console.log("timeout:", timed.status, JSON.stringify(timed.json));
  check(timed.status === 504 && /timed out/.test(timed.json.error), "worker timeout should map to 504 JSON envelope");

  // The server survives the timeout (worker terminated, not the API process).
  const after = await post("/api/validate", { code: "local y = 1" });
  check(after.status === 200, "server should stay alive after a worker timeout");
  await stopServer(current);

  console.log("SMOKE OK");
}

main().catch(async (err) => {
  console.error("SMOKE FAIL:", err.message);
  await stopServer(current);
  process.exit(1);
});
