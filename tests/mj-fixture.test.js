// Large real-world fixture: MJ_fixed.lua must parse, analyze, and obfuscate.
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "MJ_fixed.lua");

const { analyzeScript } = await import("../dist/engine/analyzer.js");
const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");

test("MJ fixture analyzes without parser errors and keeps its IIFEs", () => {
  const result = analyzeScript(readFileSync(FIXTURE, "utf8"));
  expect(result.summary.errors).toBe(0);
  expect(result.summary.lines).toBeGreaterThan(7000);
  expect(result.summary.iifeRefactorable).toBeGreaterThan(0);
  expect(result.summary.renderStepped).toBe(0);
  expect(result.summary.heartbeat).toBe(0);
});

test("MJ fixture obfuscates without throwing", () => {
  const source = readFileSync(FIXTURE, "utf8");
  const output = runObfuscatePipeline(source, {
    renameLocals: true,
    preserveGlobals: true,
    encodeStrings: false,
    scramble: false,
    oneLine: true,
    vmType: "none",
    vmLevel: "normal",
    seed: 4242,
    polymorphicSeed: 4242,
  });
  expect(output.length).toBeGreaterThan(10000);
}, 180000);
