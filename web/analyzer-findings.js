export function fixKey(fix) {
  return `${fix.line}:${fix.insertText}`;
}

export function dedupeFixes(diagnostics) {
  const seen = new Set();
  const fixes = [];
  for (const diagnostic of diagnostics) {
    if (!diagnostic.fix) continue;
    const key = fixKey(diagnostic.fix);
    if (seen.has(key)) continue;
    seen.add(key);
    fixes.push(diagnostic.fix);
  }
  return fixes;
}

export function groupFixableFindings(diagnostics) {
  const groups = new Map();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.fix) continue;
    const key = fixKey(diagnostic.fix);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        fix: diagnostic.fix,
        functionName: diagnostic.functionName,
        count: 0,
        instanceNew: 0,
        renderStepped: 0,
        lines: [],
        diagnostics: [],
      };
      groups.set(key, group);
    }
    group.count += 1;
    if (diagnostic.code === "instance-new") group.instanceNew += 1;
    if (diagnostic.code === "render-stepped") group.renderStepped += 1;
    group.lines.push(diagnostic.line);
    group.diagnostics.push(diagnostic);
  }

  return Array.from(groups.values(), (group) => ({
    ...group,
    lines: [...new Set(group.lines)].sort((a, b) => a - b),
  }));
}

export function buildFindingView(diagnostics) {
  const groups = groupFixableFindings(diagnostics);
  const groupByKey = new Map(groups.map((group) => [group.key, group]));
  const rendered = new Set();
  const rows = [];

  for (const diagnostic of diagnostics) {
    if (!diagnostic.fix) {
      rows.push({ kind: "diagnostic", diagnostic });
      continue;
    }
    const key = fixKey(diagnostic.fix);
    if (rendered.has(key)) continue;
    const group = groupByKey.get(key);
    if (!group) {
      rows.push({ kind: "diagnostic", diagnostic });
      continue;
    }
    rendered.add(key);
    rows.push({ kind: "group", group });
  }

  const totalFixable = groups.reduce((sum, group) => sum + group.count, 0);
  return {
    rows,
    groups,
    totalFixable,
    applyAllCount: groups.length,
  };
}

export function fixesForView(view) {
  return view.groups.map((group) => group.fix);
}

export function formatApplyAllLabel(count) {
  return count ? `Apply all fixes (${count})` : "Apply all fixes";
}

export function describeGroup(group) {
  const parts = [];
  if (group.instanceNew) {
    parts.push(`${group.instanceNew} heavy Instance.new call${group.instanceNew === 1 ? "" : "s"}`);
  }
  if (group.renderStepped) {
    parts.push(`${group.renderStepped} RenderStepped loop${group.renderStepped === 1 ? "" : "s"}`);
  }
  if (!parts.length) {
    parts.push(`${group.count} fixable finding${group.count === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}
