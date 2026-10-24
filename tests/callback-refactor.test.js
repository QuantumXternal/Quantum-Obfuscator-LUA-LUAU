// Per-frame callbacks are read-only diagnostics; extraction is manual-only.
import { analyzeScript } from "../dist/engine/analyzer.js";

test("analyzer reports per-frame callbacks without an extraction action", () => {
  const result = analyzeScript(
    `RunService.Heartbeat:Connect(function() end)\nRunService.RenderStepped:Connect(function() end)\n`,
  );
  expect(result.summary.heartbeat).toBe(1);
  expect(result.summary.renderStepped).toBe(1);
  const heartbeat = result.diagnostics.find((d) => d.code === "heartbeat");
  const renderStepped = result.diagnostics.find((d) => d.code === "render-stepped");
  for (const diagnostic of [heartbeat, renderStepped]) {
    expect(diagnostic).toBeTruthy();
    expect(diagnostic.callback).toBeUndefined();
    expect(diagnostic.fix).toBeNull();
    expect(diagnostic.hoist).toBeNull();
    expect(diagnostic.fixable).toBe(false);
  }
});

test("iifeRefactor no longer exposes callback extraction", async () => {
  const module = await import("../dist/engine/iifeRefactor.js");
  expect(module.extractCallbacks).toBeUndefined();
});
