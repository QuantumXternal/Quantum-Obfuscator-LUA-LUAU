import { analyzeScript } from "../dist/engine/analyzer.js";
import { refactorIifes, hoistDoBlockParent } from "../dist/engine/iifeRefactor.js";

function makeLargeScript() {
  const lines = [];
  for (let i = 0; i < 2250; i++) {
    lines.push(`local v${i} = (function() return ${i} end)()`);
    lines.push("do");
    lines.push(`  (function() return ${i} end)()`);
    lines.push("end");
  }
  return lines.join("\n");
}

test("analyze does not mutate a 9,000-line script", () => {
  const code = makeLargeScript();
  const original = code;
  const result = analyzeScript(code);
  expect(code).toBe(original);
  expect(result.valid).toBe(true);
});

test("refactorIifes converts every top-level and nested IIFE in a 9,000-line script", () => {
  const code = makeLargeScript();
  const result = refactorIifes(code);
  expect(result.refactored).toBeGreaterThan(0);
  expect(result.remaining).toBe(0);
  expect(result.warnings).toEqual([]);
});

test("six do blocks with break expose parent-hoist actions", () => {
  const lines = [];
  for (let i = 0; i < 6; i++) {
    lines.push("for i = 1, 3 do");
    lines.push("  do");
    lines.push('    local f = Instance.new("Frame")');
    lines.push("    if i == 2 then break end");
    lines.push("  end");
    lines.push("end");
  }
  const code = lines.join("\n");
  const result = analyzeScript(code);
  expect(result.diagnostics.filter((d) => d.hoist).length).toBe(6);
});