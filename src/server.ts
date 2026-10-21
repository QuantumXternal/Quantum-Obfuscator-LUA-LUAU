import express from "express";
import { exec } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { validate } from "./compiler/LuauCompiler.js";
import type { PipelineVmType, PipelineVmLevel } from "./engine/obfuscatePipeline.js";
import type { ObfuscationTarget } from "./engine/profiles.js";
import { analyzeScript } from "./engine/analyzer.js";
import { refactorIifes } from "./engine/iifeRefactor.js";
import { injectHeavyMacros } from "./engine/macroAuto.js";
import { buildStudioPlan, StudioOptionsError } from "./studioOptions.js";
import { cacheKey } from "./cacheKey.js";
import { runObfuscationInWorker, RunnerFailure } from "./obfuscationRunner.js";
import { DEFAULT_MAX_INPUT_BYTES, envInt, inputTooLargeMessage } from "./engine/inputLimits.js";

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

app.use(express.static(join(__dirname, "..", "public"), { extensions: ["html"], index: "index.html" }));

app.get("/api/health", (_req: express.Request, res: express.Response) => {
  res.json({ ok: true, service: "quantum-studio", version: "3.2.0" });
});

app.post("/api/analyze", (req: express.Request, res: express.Response) => {
  try {
    const { code, options } = req.body ?? {};
    if (typeof code !== "string") {
      return res.status(400).json({ error: "Invalid 'code' parameter" }) as any;
    }
    const bytes = Buffer.byteLength(code, "utf8");
    if (bytes > MAX_INPUT_BYTES) {
      return res.status(413).json({ error: inputTooLargeMessage(MAX_INPUT_BYTES), bytes, maxBytes: MAX_INPUT_BYTES }) as any;
    }
    const tier = options?.tier === "maximum" ? "maximum" : "turbo";
    const result = analyzeScript(code, { tier });
    console.log(`[API] /api/analyze - Code length: ${code.length}, findings: ${result.diagnostics.length}`);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[API-ERROR] /api/analyze failed:", err);
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

app.post("/api/refactor-iifes", (req: express.Request, res: express.Response) => {
  try {
    const { code, line, options } = req.body ?? {};
    if (typeof code !== "string") {
      return res.status(400).json({ error: "Invalid 'code' parameter" }) as any;
    }
    if (line !== undefined && (!Number.isInteger(line) || line < 1)) {
      return res.status(400).json({ error: "Invalid 'line' parameter" }) as any;
    }
    const bytes = Buffer.byteLength(code, "utf8");
    if (bytes > MAX_INPUT_BYTES) {
      return res.status(413).json({ error: inputTooLargeMessage(MAX_INPUT_BYTES), bytes, maxBytes: MAX_INPUT_BYTES }) as any;
    }
    const tier = options?.tier === "maximum" ? "maximum" : "turbo";
    const result = refactorIifes(code, { tier, line });
    console.log(
      `[API] /api/refactor-iifes - line: ${line ?? "all"}, refactored: ${result.refactored}, remaining: ${result.remaining}`,
    );
    res.json({
      success: true,
      code: result.code,
      refactored: result.refactored,
      remaining: result.remaining,
      warnings: result.warnings,
      tier: result.tier,
    });
  } catch (err: any) {
    console.error("[API-ERROR] /api/refactor-iifes failed:", err);
    res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

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
  const startedAt = Date.now();
  try {
    const { code, options } = req.body ?? {};
    if (typeof code !== "string") {
      return res.status(400).json({ error: "Invalid 'code' parameter" }) as any;
    }
    const bytes = Buffer.byteLength(code, "utf8");
    if (bytes > MAX_INPUT_BYTES) {
      return res.status(413).json({ error: inputTooLargeMessage(MAX_INPUT_BYTES), bytes, maxBytes: MAX_INPUT_BYTES }) as any;
    }

    const opts = options && typeof options === "object" ? options : {};
    // Optional deterministic seed for reproducible builds/caching.
    // Omitted = legacy random behavior (decoder names, polymorphic seeds).
    const seed = typeof opts.seed === "number" ? opts.seed : undefined;
    // Exact polymorphic seed override (additive, optional). Omitted = derived
    // from seed, else wall-clock/random per generator. Phase 1.2(b): accepts
    // number (legacy 32-bit path) or string (128-bit path); the cache key
    // discriminates the type (see ./cacheKey.js), so 1234 and "1234" never
    // share an entry.
    const polymorphicSeed = typeof opts.polymorphicSeed === "number" || typeof opts.polymorphicSeed === "string" ? opts.polymorphicSeed : undefined;

    let studioPlan;
    try {
      studioPlan = buildStudioPlan(opts as Record<string, unknown>, { seed, polymorphicSeed });
    } catch (err: any) {
      if (err instanceof StudioOptionsError) {
        return res.status(400).json({ error: err.message }) as any;
      }
      throw err;
    }

    // Legacy API path (no profile supplied) keeps its historical defaults.
    const target: ObfuscationTarget = studioPlan?.target ?? (opts.target === "roblox" ? "roblox" : "generic");
    const noRename = opts.noRename === true;
    const noPreserve = opts.noPreserve === true;
    const encodeStringsOpt = opts.encodeStrings === true;
    const scrambleOpt = opts.scramble === true;
    const oneLineOpt = opts.oneLine === true;
    const vmType = opts.vmType || "none";
    const vmLevel = opts.vmLevel || "normal";
    const disableFeatures = Array.isArray(opts.disableFeatures)
      ? (opts.disableFeatures as unknown[]).filter((f): f is string => typeof f === "string")
      : undefined;

    const autoDetect = studioPlan ? studioPlan.autoDetectMacros : opts.autoDetectMacros === true;
    const autoTier = studioPlan?.autoTier ?? (opts.turboLevel === "heavy" ? "maximum" : "turbo");
    let effectiveCode = code;
    let autoMacros: { injected: number; warnings: string[]; tier: string } | null = null;
    if (autoDetect) {
      const auto = injectHeavyMacros(code, autoTier);
      effectiveCode = auto.code;
      autoMacros = { injected: auto.injected, warnings: auto.warnings, tier: auto.tier };
    }

    const cacheOptions = studioPlan
      ? studioPlan.cacheOptions
      : {
          profile: undefined,
          target,
          noRename,
          noPreserve,
          encodeStringsOpt,
          scrambleOpt,
          oneLineOpt,
          vmType,
          vmLevel,
          seed,
          polymorphicSeed,
          disableFeatures,
          autoDetectMacros: autoDetect,
          autoTier,
        };
    const key = cacheKey(effectiveCode, cacheOptions);
    const cached = cacheGet(key);
    if (cached !== null) {
      return res.json({
        output: cached,
        cached: true,
        durationMs: Date.now() - startedAt,
        ...(studioPlan ? { meta: { profile: studioPlan.profile, vmType: studioPlan.pipeline.vmType, vmLevel: studioPlan.pipeline.vmLevel, target: studioPlan.target } } : {}),
        ...(autoMacros ? { autoMacros } : {}),
      }) as any;
    }

    const displayProfile = studioPlan?.profile ?? "legacy";
    const displayVm = studioPlan?.pipeline.vmType ?? vmType;
    const displayLevel = studioPlan?.pipeline.vmLevel ?? vmLevel;
    console.log(`[API] /api/obfuscate - Profile: ${displayProfile}, VM: ${displayVm}, Level: ${displayLevel}, Target: ${target}, length: ${code.length}${autoMacros ? `, autoMacros: ${autoMacros.injected}` : ""}`);

    let output: string;
    try {
      if (studioPlan) {
        output = await runObfuscationInWorker(effectiveCode, studioPlan.pipeline as unknown as Record<string, unknown>);
      } else {
        output = await runObfuscationInWorker(effectiveCode, {
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
      // Pipeline errors travel through the worker by name (see
      // obfuscationRunner.RemoteError); preserve the original 400 envelope.
      if (err?.name === "PipelineLexError") {
        return res.status(400).json({ error: "Lexer error", details: err.details }) as any;
      }
      if (err?.name === "PipelineParseError") {
        return res.status(400).json({ error: "Parse error", details: err.details }) as any;
      }
      throw err;
    }

    cacheSet(key, output);
    res.json({
      output,
      durationMs: Date.now() - startedAt,
      ...(studioPlan ? { meta: { profile: studioPlan.profile, vmType: studioPlan.pipeline.vmType, vmLevel: studioPlan.pipeline.vmLevel, target: studioPlan.target } } : {}),
      ...(autoMacros ? { autoMacros } : {}),
    });
  } catch (err: any) {
    if (err instanceof StudioOptionsError) {
      return res.status(400).json({ error: err.message }) as any;
    }
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
