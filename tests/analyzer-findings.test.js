import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { analyzeScript } from "../dist/engine/analyzer.js";
import {
  buildFindingView,
  dedupeFixes,
  describeGroup,
  fixesForView,
  formatApplyAllLabel,
} from "../web/analyzer-findings.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "fixtures", "analyzer-two-groups.lua");
const LARGE_FIXTURE = join(__dirname, "fixtures", "large-ui-turbo.lua");

test("groups six and four findings into two target rows", () => {
  const result = analyzeScript(readFileSync(FIXTURE, "utf8"));
  const view = buildFindingView(result.diagnostics);

  expect(result.summary.autoFixable).toBe(2);
  expect(view.totalFixable).toBe(10);
  expect(view.groups).toHaveLength(2);
  expect(view.groups.map((group) => ({ name: group.functionName, count: group.count }))).toEqual([
    { name: "__q_iife_wrap_2", count: 6 },
    { name: "__q_iife_wrap_3", count: 4 },
  ]);
  expect(view.groups.reduce((sum, group) => sum + group.count, 0)).toBe(view.totalFixable);
  expect(view.rows.filter((row) => row.kind === "group")).toHaveLength(2);
  expect(view.rows).toHaveLength(2);
  expect(view.applyAllCount).toBe(2);
  expect(formatApplyAllLabel(view.applyAllCount)).toBe("Apply all fixes (2)");
  expect(describeGroup(view.groups[0])).toBe("6 heavy Instance.new calls");
  expect(describeGroup(view.groups[1])).toBe("4 heavy Instance.new calls");

  const fixes = fixesForView(view);
  expect(fixes).toHaveLength(2);
  expect(fixes.map((fix) => fix.line)).toEqual([1, 10]);
  expect(dedupeFixes(result.diagnostics)).toHaveLength(2);
});

test("large fixture collapses the repeated fix target to one group", () => {
  const result = analyzeScript(readFileSync(LARGE_FIXTURE, "utf8"));
  const view = buildFindingView(result.diagnostics);

  expect(result.summary.autoFixable).toBe(1);
  expect(view.totalFixable).toBe(2);
  expect(view.groups).toHaveLength(1);
  expect(view.applyAllCount).toBe(1);
  expect(formatApplyAllLabel(view.applyAllCount)).toBe("Apply all fixes (1)");
  expect(view.rows.filter((row) => row.kind === "group")).toHaveLength(1);
  expect(view.groups[0].count).toBe(2);
});

test("already-tagged diagnostics stay individual and create no groups", () => {
  const result = analyzeScript(`--@quantum:turbo
local function makeUi()
  local frame = Instance.new("Frame")
  local label = Instance.new("TextLabel")
  return frame, label
end
print(makeUi())
`);
  const view = buildFindingView(result.diagnostics);

  expect(view.groups).toHaveLength(0);
  expect(view.totalFixable).toBe(0);
  expect(view.applyAllCount).toBe(0);
  expect(formatApplyAllLabel(view.applyAllCount)).toBe("Apply all fixes");
  expect(view.rows).toHaveLength(2);
  expect(view.rows.every((row) => row.kind === "diagnostic")).toBe(true);
});
