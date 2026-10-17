import express from "express";
import { exec } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { validate } from "./compiler/LuauCompiler.js";
import type { PipelineVmType, PipelineVmLevel } from "./engine/obfuscatePipeline.js";
import { resolveProfile } from "./engine/profiles.js";
import type { ProtectionProfile, ObfuscationTarget } from "./engine/profiles.js";
import { cacheKey } from "./cacheKey.js";
import { runObfuscationInWorker, RunnerFailure } from "./obfuscationRunner.js";
import { DEFAULT_MAX_INPUT_BYTES, envInt, inputTooLargeMessage } from "./engine/inputLimits.js";

const VALID_PROFILES: ProtectionProfile[] = ["FAST", "BALANCED", "MAXIMUM"];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = envInt("PORT", 3000);
// Input cap (bytes, UTF-8). Raisable via MAX_INPUT_BYTES for trusted local
// use; the worker also has its own heap limit + timeout (see runner).
const MAX_INPUT_BYTES = envInt("MAX_INPUT_BYTES", DEFAULT_MAX_INPUT_BYTES);
// Cache only reasonably-sized outputs; multi-MB artifacts would pin memory
// for the whole TTL with near-zero reuse value.
const CACHE_MAX_ENTRY_BYTES = 2 * 1024 * 1024;

// Tiny LRU for identical obfuscation requests. Bounded to avoid memory leaks;
// entries expire after 5 minutes. Cache key includes every option + code.
const obfuscateCache = new Map<string, { output: string; expires: number }>();
const OBFUSCATE_CACHE_MAX = 50;
const OBFUSCATE_CACHE_TTL_MS = 5 * 60 * 1000;

// (cacheKey lives in ./cacheKey.js: pure, unit-tested, no express import.)
function cacheGet(key: string): string | null {
  const entry = obfuscateCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    obfuscateCache.delete(key);
    return null;
  }
  // Refresh LRU order.
  obfuscateCache.delete(key);
  obfuscateCache.set(key, entry);
  return entry.output;
}

function cacheSet(key: string, output: string): void {
  if (output.length > CACHE_MAX_ENTRY_BYTES) return;
  if (obfuscateCache.size >= OBFUSCATE_CACHE_MAX) {
    const oldest = obfuscateCache.keys().next();
    if (!oldest.done) obfuscateCache.delete(oldest.value);
  }
  obfuscateCache.set(key, { output, expires: Date.now() + OBFUSCATE_CACHE_TTL_MS });
}

// Body parser limit scales with the input cap (JSON escaping overhead), so
// the explicit byte check below produces the actionable 413 in normal cases
// and the parser-level error handler covers absurd raw bodies.
app.use(express.json({ limit: `${Math.max(1, Math.ceil((MAX_INPUT_BYTES * 3) / (1024 * 1024)))}mb` }));

app.use(express.static(join(__dirname, "..", "public")));

app.post("/api/validate", (req: express.Request, res: express.Response) => {
  try {
    const { code } = req.body;
    if (typeof code !== "string") {
      return res.status(400).json({ error: "Invalid 'code' parameter" }) as any;
    }
    const bytes = Buffer.byteLength(code, "utf8");
    if (bytes > MAX_INPUT_BYTES) {
      return res.status(413).json({ error: inputTooLargeMessage(MAX_INPUT_BYTES), bytes, maxBytes: MAX_INPUT_BYTES }) as any;
    }
    console.log(`[API] /api/validate - Code length: ${code.length} characters`);
    const result = validate(code);
    res.json(result);
  } catch (err: any) {
    console.error("[API-ERROR] /api/validate failed:", err);
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

app.post("/api/obfuscate", async (req: express.Request, res: express.Response) => {
  try {
    const { code, options } = req.body;
    if (typeof code !== "string") {
      return res.status(400).json({ error: "Invalid 'code' parameter" }) as any;
    }
    const bytes = Buffer.byteLength(code, "utf8");
    if (bytes > MAX_INPUT_BYTES) {
      return res.status(413).json({ error: inputTooLargeMessage(MAX_INPUT_BYTES), bytes, maxBytes: MAX_INPUT_BYTES }) as any;
    }

    const opts = options || {};
    // Optional deterministic seed for reproducible builds/caching.
    // Omitted = legacy random behavior (decoder names, polymorphic seeds).
    const seed = typeof opts.seed === "number" ? opts.seed : undefined;
    // Exact polymorphic seed override (additive, optional). Omitted = derived
    // from seed, else wall-clock/random per generator. Phase 1.2(b): accepts
    // number (legacy 32-bit path) or string (128-bit path); the cache key
    // discriminates the type (see ./cacheKey.js), so 1234 and "1234" never
    // share an entry.
    const polymorphicSeed = typeof opts.polymorphicSeed === "number" || typeof opts.polymorphicSeed === "string" ? opts.polymorphicSeed : undefined;
    // Explicit protection profile (FAST/BALANCED/MAXIMUM) and environment
    // target (generic/roblox). Absent profile = legacy behavior below.
    const profile: ProtectionProfile | undefined = VALID_PROFILES.includes(opts.profile)
      ? opts.profile
      : undefined;
    if (opts.profile !== undefined && profile === undefined) {
      return res.status(400).json({ error: "Invalid 'profile' (expected FAST, BALANCED, or MAXIMUM)" }) as any;
    }
    const target: ObfuscationTarget = opts.target === "roblox" ? "roblox" : "generic";

    const noRename = opts.noRename === true;
    const noPreserve = opts.noPreserve === true;
    const encodeStringsOpt = opts.encodeStrings === true;
    const scrambleOpt = opts.scramble === true;
    const oneLineOpt = opts.oneLine === true;
    const vmType = opts.vmType || "none";
    const vmLevel = opts.vmLevel || "normal";

    // Optional pass-through for documented VM feature gates
    // (e.g. disableFeatures: ["deadCodeInjection"]). Omitted = defaults.
    const disableFeatures = Array.isArray(opts.disableFeatures)
      ? (opts.disableFeatures as unknown[]).filter((f): f is string => typeof f === "string")
      : undefined;

    const key = cacheKey(code, { profile, target, noRename, noPreserve, encodeStringsOpt, scrambleOpt, oneLineOpt, vmType, vmLevel, seed, polymorphicSeed, disableFeatures });
    const cached = cacheGet(key);
    if (cached !== null) {
      return res.json({ output: cached, cached: true }) as any;
    }

    console.log(`[API] /api/obfuscate - Profile: ${profile ?? "legacy"}, VM: ${vmType}, Level: ${vmLevel}, Target: ${target}, length: ${code.length}`);

    let output: string;
    try {
      if (profile !== undefined) {
        // Profile supplies defaults; explicitly provided fields override.
        const base = resolveProfile({ profile, target, seed, polymorphicSeed });
        if (opts.vmType !== undefined) base.vmType = opts.vmType as PipelineVmType;
        if (opts.vmLevel !== undefined) base.vmLevel = opts.vmLevel as PipelineVmLevel;
        if (opts.noRename !== undefined) base.renameLocals = opts.noRename !== true;
        if (opts.noPreserve !== undefined) base.preserveGlobals = opts.noPreserve !== true;
        if (opts.encodeStrings !== undefined) base.encodeStrings = opts.encodeStrings === true;
        if (opts.scramble !== undefined) base.scramble = opts.scramble === true;
        if (opts.oneLine !== undefined) base.oneLine = opts.oneLine === true;
        if (disableFeatures !== undefined) base.disableFeatures = disableFeatures;
        output = await runObfuscationInWorker(code, base as unknown as Record<string, unknown>);
      } else {
        output = await runObfuscationInWorker(code, {
          renameLocals: !noRename,
          preserveGlobals: !noPreserve,
          encodeStrings: encodeStringsOpt,
          scramble: scrambleOpt,
          oneLine: oneLineOpt,
          vmType: vmType as PipelineVmType,
          vmLevel: vmLevel as PipelineVmLevel,
          seed,
          ...(polymorphicSeed !== undefined ? { polymorphicSeed } : {}),
          target,
          ...(disableFeatures !== undefined ? { disableFeatures } : {}),
        });
      }
    } catch (err: any) {
      if (err instanceof RunnerFailure) {
        if (err.kind === "timeout") {
          return res.status(504).json({ error: err.message }) as any;
        }
        // OOM and worker crashes: the input exceeded worker resources or the
        // isolate died; report a clean JSON error instead of hanging.
        return res.status(500).json({ error: err.message }) as any;
      }
      // PipelineLexError travels through the worker by name (see
      // obfuscationRunner.RemoteError); preserve the original 400 envelope.
      if (err?.name === "PipelineLexError") {
        return res.status(400).json({ error: "Lexer error", details: err.details }) as any;
      }
      throw err;
    }

    cacheSet(key, output);
    res.json({ output });
  } catch (err: any) {
    console.error("Obfuscation error:", err);
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

// JSON error envelope for API requests. In-route JSON responses above are
// untouched; this normalizes only what previously escaped as HTML: body-parser
// failures (malformed JSON, oversized raw bodies), unknown /api/* routes, and
// any uncaught error carrying err.status. Static-file 404s keep default HTML.
app.use("/api", (req: express.Request, res: express.Response) => {
  res.status(404).json({ error: "Unknown API endpoint" }) as any;
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON request body" }) as any;
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: inputTooLargeMessage(MAX_INPUT_BYTES) }) as any;
  }
  if (err?.status) {
    return res.status(err.status).json({ error: err.message || "Request error" }) as any;
  }
  return res.status(500).json({ error: `Server error: ${err?.message || err}` }) as any;
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\nQuantum Obfuscator Server running at: ${url}`);
  console.log("Press CTRL+C to terminate.\n");

  if (process.env.NO_BROWSER === "1") return;
  exec(`start ${url}`, (err) => {
    if (err) {
      console.log(`Note: Failed to open browser automatically. Please navigate manually to ${url}`);
    } else {
      console.log(`Browser automatically opened at ${url}`);
    }
  });
});
