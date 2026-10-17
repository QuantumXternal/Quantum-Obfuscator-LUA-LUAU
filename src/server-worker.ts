// Worker-thread entry point for POST /api/obfuscate (spawned by
// ./obfuscationRunner.ts). Runs the full CPU-bound pipeline inside an
// isolated heap so the API process stays responsive and resource limits /
// termination are enforceable from the parent.
import { parentPort, workerData } from "node:worker_threads";
import { runObfuscatePipeline } from "./engine/obfuscatePipeline.js";
import type { PipelineOptions } from "./engine/obfuscatePipeline.js";

interface WorkerInput {
  code: string;
  options: PipelineOptions;
}

const { code, options } = (workerData ?? {}) as WorkerInput;

function post(message: unknown): void {
  if (parentPort) parentPort.postMessage(message);
}

try {
  const output = runObfuscatePipeline(code, options);
  post({ ok: true, output });
} catch (err: any) {
  post({
    ok: false,
    error: {
      name: err?.name,
      message: String(err?.message ?? err),
      details: err?.details,
    },
  });
}
