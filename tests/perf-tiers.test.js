// Phase 3.1: performance tiers.
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
