import express from "express";
import { exec } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { validate } from "./compiler/LuauCompiler.js";
import { runObfuscatePipeline, PipelineLexError } from "./engine/obfuscatePipeline.js";
import type { PipelineVmType, PipelineVmLevel } from "./engine/obfuscatePipeline.js";
import { resolveProfile } from "./engine/profiles.js";
import type { ProtectionProfile, ObfuscationTarget } from "./engine/profiles.js";

const VALID_PROFILES: ProtectionProfile[] = ["FAST", "BALANCED", "MAXIMUM"];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;
const MAX_CODE_LENGTH = 1024 * 1024; // 1 MB payload guard (DoS protection)

// Tiny LRU for identical obfuscation requests. Bounded to avoid memory leaks;
// entries expire after 5 minutes. Cache key includes every option + code.
const obfuscateCache = new Map<string, { output: string; expires: number }>();
const OBFUSCATE_CACHE_MAX = 50;
const OBFUSCATE_CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(code: string, opts: Record<string, unknown>): string {
  return JSON.stringify([code.length, code, opts]);
}

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
  if (obfuscateCache.size >= OBFUSCATE_CACHE_MAX) {
    const oldest = obfuscateCache.keys().next();
    if (!oldest.done) obfuscateCache.delete(oldest.value);
  }
  obfuscateCache.set(key, { output, expires: Date.now() + OBFUSCATE_CACHE_TTL_MS });
}

app.use(express.json({ limit: "1mb" }));

app.use(express.static(join(__dirname, "..", "public")));

app.post("/api/validate", (req: express.Request, res: express.Response) => {
  try {
    const { code } = req.body;
    if (typeof code !== "string") {
      return res.status(400).json({ error: "Invalid 'code' parameter" }) as any;
    }
    if (code.length > MAX_CODE_LENGTH) {
      return res.status(413).json({ error: "Code payload too large (max 1MB)" }) as any;
    }
    console.log(`[API] /api/validate - Code length: ${code.length} characters`);
    const result = validate(code);
    res.json(result);
  } catch (err: any) {
    console.error("[API-ERROR] /api/validate failed:", err);
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

app.post("/api/obfuscate", (req: express.Request, res: express.Response) => {
  try {
    const { code, options } = req.body;
    if (typeof code !== "string") {
      return res.status(400).json({ error: "Invalid 'code' parameter" }) as any;
    }
    if (code.length > MAX_CODE_LENGTH) {
      return res.status(413).json({ error: "Code payload too large (max 1MB)" }) as any;
    }

    const opts = options || {};
    // Optional deterministic seed for reproducible builds/caching.
    // Omitted = legacy random behavior (decoder names, polymorphic seeds).
    const seed = typeof opts.seed === "number" ? opts.seed : undefined;
    // Exact polymorphic seed override (additive, optional). Omitted = derived
    // from seed, else wall-clock/random per generator.
    const polymorphicSeed = typeof opts.polymorphicSeed === "number" ? opts.polymorphicSeed : undefined;
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
        output = runObfuscatePipeline(code, base);
      } else {
        output = runObfuscatePipeline(code, {
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
      if (err instanceof PipelineLexError) {
        return res.status(400).json({ error: "Lexer error", details: err.details });
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
    return res.status(413).json({ error: "Code payload too large (max 1MB)" }) as any;
  }
  if (err?.status) {
    return res.status(err.status).json({ error: err.message || "Request error" }) as any;
  }
  return res.status(500).json({ error: `Server error: ${err?.message || err}` }) as any;
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\nClyde Obfuscator Server running at: ${url}`);
  console.log("Press CTRL+C to terminate.\n");

  exec(`start ${url}`, (err) => {
    if (err) {
      console.log(`Note: Failed to open browser automatically. Please navigate manually to ${url}`);
    } else {
      console.log(`Browser automatically opened at ${url}`);
    }
  });
});
