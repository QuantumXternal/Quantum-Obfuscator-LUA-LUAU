// Testable worker-thread runner for runObfuscatePipeline. Extracted from
// server.ts (mirroring ./cacheKey.ts: pure module, no express import, never
// binds a port) so tests can exercise the ok / pipeline-error / timeout /
// OOM / crash paths through an injected worker factory.
//
// The real factory spawns ./server-worker.js with resourceLimits, so a
// runaway build is confined to the worker isolate and can be terminated on
// timeout without taking down the API process.
import { Worker } from "node:worker_threads";
import { envInt } from "./engine/inputLimits.js";

export interface WorkerLike {
  on(event: "message", listener: (msg: unknown) => void): unknown;
  on(event: "error", listener: (err: Error) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  terminate(): unknown;
}

export type WorkerFactory = (code: string, options: Record<string, unknown>) => WorkerLike;

export type RunnerFailureKind = "timeout" | "oom" | "crash";

export class RunnerFailure extends Error {
  readonly kind: RunnerFailureKind;
  constructor(kind: RunnerFailureKind, message: string) {
    super(message);
    this.name = "RunnerFailure";
    this.kind = kind;
  }
}

/** Error posted by the worker; `name` preserves pipeline error identities. */
export class RemoteError extends Error {
  readonly details: unknown;
  constructor(payload: { name?: string; message?: string; details?: unknown }) {
    super(payload.message || "Obfuscation failed");
    this.name = payload.name || "Error";
    this.details = payload.details;
  }
}

export const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_OLD_GEN_MB = 2048;
export const DEFAULT_MAX_YOUNG_GEN_MB = 256;

export function createDefaultWorker(code: string, options: Record<string, unknown>): Worker {
  return new Worker(new URL("./server-worker.js", import.meta.url), {
    workerData: { code, options },
    resourceLimits: {
      maxOldGenerationSizeMb: envInt("MAX_OLD_GEN_MB", DEFAULT_MAX_OLD_GEN_MB),
      maxYoungGenerationSizeMb: DEFAULT_MAX_YOUNG_GEN_MB,
    },
  });
}

export function runObfuscationInWorker(
  code: string,
  options: Record<string, unknown>,
  overrides: { createWorker?: WorkerFactory; timeoutMs?: number } = {},
): Promise<string> {
  const createWorker = overrides.createWorker ?? createDefaultWorker;
  const timeoutMs = overrides.timeoutMs ?? envInt("OBFUSCATE_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let worker: WorkerLike | null = null;
    try {
      worker = createWorker(code, options);
    } catch (err) {
      reject(new RunnerFailure("crash", `Failed to start obfuscation worker: ${(err as Error)?.message ?? err}`));
      return;
    }

    const finish = (fn: (arg: unknown) => void) => (arg: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Kill the isolate so a runaway build cannot outlive the request.
      try {
        worker?.terminate();
      } catch {
        /* already dead */
      }
      reject(new RunnerFailure("timeout", `Obfuscation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    worker.on("message", finish((msg) => {
      const m = msg as { ok?: boolean; output?: unknown; error?: { name?: string; message?: string; details?: unknown } };
      if (m && m.ok) resolve(String(m.output));
      else reject(new RemoteError(m?.error ?? {}));
    }));

    worker.on("error", finish((err) => {
      const e = err as Error & { code?: string };
      if (e?.code === "ERR_WORKER_OUT_OF_MEMORY" || /out of memory/i.test(String(e?.message))) {
        reject(new RunnerFailure("oom", "Obfuscation worker ran out of memory (script too large for the configured worker heap)"));
      } else {
        reject(new RunnerFailure("crash", `Obfuscation worker error: ${e?.message ?? e}`));
      }
    }));

    worker.on("exit", finish((code) => {
      reject(new RunnerFailure("crash", `Obfuscation worker exited before producing output (code ${code})`));
    }));
  });
}
