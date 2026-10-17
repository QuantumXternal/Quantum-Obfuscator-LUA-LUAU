// Phase 3.1/3.2: performance tiers + macro directive.
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");

test("turbo tier produces AST-only output (no VM markers)", () => {
  const code = "local x = 1 + 2 print(x)\n";
  const out = runObfuscatePipeline(code, { renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false, oneLine: false, vmType: "none", vmLevel: "normal", performanceTier: "turbo" });
  expect(out).not.toMatch(/generateVM|wrapCustomCipher|_run/);
});

test("balanced tier uses stack VM", () => {
  const code = "local x = 1 + 2 print(x)\n";
  const out = runObfuscatePipeline(code, { renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false, oneLine: false, vmType: "none", vmLevel: "normal", performanceTier: "balanced" });
  expect(out.length).toBeGreaterThan(1000);
});

test("maximum tier uses register VM", () => {
  const code = "local x = 1 + 2 print(x)\n";
  const out = runObfuscatePipeline(code, { renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false, oneLine: false, vmType: "none", vmLevel: "normal", performanceTier: "maximum" });
  expect(out.length).toBeGreaterThan(1000);
});

test("macro pre-scan extracts no-vm function names", () => {
  const code = "--@quantum:no-vm\nfunction foo() return 1 end\nlocal x = 2\nprint(x)\n";
  const opts = { renameLocals: false, preserveGlobals: true, encodeStrings: false, scramble: false, oneLine: false, vmType: "none", vmLevel: "normal", noVmFunctions: [] };
  runObfuscatePipeline(code, opts);
  expect(opts.noVmFunctions).toContain("foo");
});
