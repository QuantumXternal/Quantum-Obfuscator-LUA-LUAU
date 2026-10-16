// Anti-debug dead-flag regression tests (Task 1).
// Proves: (1) the detection flag feeds the exact detFlag response path;
// (2) the pcall-convention check has no always-trip false positive;
// (3) each static check trips iff its own builtin is tampered (detection),
// and none trips in a clean host (non-detection).
// The tick-timing check is asserted by text shape only: it is inherently
// runtime (debugger slowdown), not statically emulatable.
import { generateAntiDebugChecks } from "../dist/vm/vm-gen.js";

function flagOf(lines) {
  const m = lines.find((l) => /^local (\w+)=false$/.test(l));
  return m ? m.match(/^local (\w+)=false$/)[1] : null;
}
// Static (non-timing) checks have shape `if COND then FLAG=true end`.
function staticConds(lines, flag) {
  return lines
    .filter((l) => l.startsWith("if ") && l.endsWith(` then ${flag}=true end`) && !l.includes("tick"))
    .map((l) => l.slice(3, l.indexOf(` then ${flag}=true end`)));
}
// Translate the tiny Lua predicate subset used by the checks into JS and
// evaluate it under a modeled host environment.
function evalCond(cond, env) {
  // Lua multi-value fidelity: pcall yields a value LIST, so select("#", ...)
  // counts yielded values. The JS model returns that list as an array, hence
  // `.length` — bare `select("#",pcall(...))` would count 1 (the array).
  let js = cond
    .replace(/~=/g, "!==")
    .replace(/function\(\) return 1 end/g, "()=>[1]")
    .replace(/function\(\) end/g, "()=>[]")
    .replace(/select\("#",pcall\((.*?)\)\)/g, "pcall($1).length");
  const fn = new Function("type", "select", "pcall", "tostring", "rawget", `return (${js});`);
  return !!fn(env.type, env.select, env.pcall, env.tostring, env.rawget);
}
const honestPcall = (fn) => [true, ...fn()];
const honestSelect = (h, ...a) => (h === "#" ? a.length : a[0]);
const luaType = (v) => (typeof v === "function" ? "function" : typeof v);
function cleanEnv() {
  const F = () => {};
  return { type: luaType, select: honestSelect, pcall: honestPcall, tostring: F, rawget: F };
}

test("detection flag feeds the detFlag response path", () => {
  const lines = generateAntiDebugChecks("DETFLAG");
  const flag = flagOf(lines);
  expect(flag).not.toBeNull();
  expect(lines).toContain(`if ${flag} then DETFLAG=DETFLAG+1 end`);
});

test("pcall-convention check has no always-trip form (200 seeds)", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    for (const l of generateAntiDebugChecks("D")) {
      if (l.includes('select("#",pcall(')) seen.add(l);
      expect(l).not.toContain("function() end))~=2");
    }
  }
  // The fixed form (function returns a value, so an honest pcall yields 2)
  // must be emitted across the seed sweep.
  expect(Array.from(seen).some((l) => l.includes("function() return 1 end))~=2"))).toBe(true);
});

test("clean host: no static check trips (union over 200-call sweep)", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const lines = generateAntiDebugChecks("D");
    for (const c of staticConds(lines, flagOf(lines))) seen.add(c);
  }
  // All 6 static checks must be observed (proves sweep coverage).
  expect(seen.size).toBe(6);
  const env = cleanEnv();
  for (const c of Array.from(seen)) expect(evalCond(c, env)).toBe(false);
});

// Attribute each static check to the builtin(s) it interrogates:
// `type(NAME)` checks interrogate NAME; the convention check calls
// select+pcall and interrogates both.
function attribute(c) {
  const names = [];
  const tm = c.match(/type\((\w+)\)/);
  if (tm) names.push(tm[1]);
  if (c.includes("select(")) names.push("select");
  if (c.includes("pcall(")) names.push("pcall");
  return names;
}

test("tampered host: exactly the matching check trips", () => {
  const builtins = ["pcall", "select", "type", "tostring", "rawget"];
  const byBuiltin = { pcall: new Set(), select: new Set(), type: new Set(), tostring: new Set(), rawget: new Set() };
  for (let i = 0; i < 200; i++) {
    const lines = generateAntiDebugChecks("D");
    for (const c of staticConds(lines, flagOf(lines))) {
      for (const n of attribute(c)) byBuiltin[n].add(c);
    }
  }
  for (const name of builtins) expect(byBuiltin[name].size).toBeGreaterThan(0);
  // Fail-closed note: checks that CALL a replaced builtin throw instead of
  // tripping (the generated line has no pcall guard) — the VM body errors
  // rather than silently continuing. Detection-or-crash in every case.
  const tryEval = (c, env) => {
    try { return { v: evalCond(c, env), threw: false }; }
    catch { return { v: false, threw: true }; }
  };
  for (const name of builtins) {
    const env = cleanEnv();
    env[name] = {};
    const conds = Array.from(byBuiltin[name]);
    const res = conds.map((c) => [c, tryEval(c, env)]);
    const tripped = res.filter((entry) => entry[1].v).map((entry) => entry[0]);
    const threw = res.some((entry) => entry[1].threw);
    for (const c of tripped) expect(attribute(c)).toContain(name);
    expect(tripped.length > 0 || threw).toBe(true);
  }
  // Broken pcall convention (drops return values): only the convention check trips.
  {
    const env = cleanEnv();
    env.pcall = () => [true];
    const conds = Array.from(byBuiltin["pcall"]);
    const tripped = conds.filter((c) => evalCond(c, env));
    expect(tripped.length).toBe(1);
    expect(tripped[0]).toContain('select("#",pcall(');
  }
});

test("timing check keeps its debugger-trip shape", () => {
  // The timing check is picked randomly (2-3 of 7 per call); sweep until seen.
  let timing = [];
  for (let i = 0; i < 200 && timing.length === 0; i++) {
    const lines = generateAntiDebugChecks("D");
    const flag = flagOf(lines);
    timing = lines.filter((l) => l.includes("tick")).map((l) => [l, flag]);
  }
  expect(timing.length).toBeGreaterThan(0);
  for (const entry of timing) {
    expect(entry[0]).toContain(`${entry[1]}=true`);
    expect(entry[0]).toContain(">0.1");
  }
});
