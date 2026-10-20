// Tiered native prefix control-flow hardening. Heavy factories (UI/boot) get
// block-level state machines; light factories (frame callbacks) only get
// opaque conditions and dead junk branches.
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const HAS_LUAU = existsSync(LUAU);
const t = HAS_LUAU ? test : test.skip;

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { printChunk } = await import("../dist/obfuscator/Printer.js");
const { scrambleNativePrefix } = await import("../dist/obfuscator/PrefixControlFlow.js");

const TMP = mkdtempSync(join(tmpdir(), "native-cff-"));
let counter = 0;

function runLuau(code) {
  const f = join(TMP, `cff-${process.pid}-${counter++}.luau`);
  writeFileSync(f, code, "utf8");
  const r = spawnSync(LUAU, [f], { encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  rmSync(f, { force: true });
  return {
    stdout: (r.stdout || "").replace(/\r\n/g, "\n"),
    stderr: (r.stderr || "").replace(/\r\n/g, "\n"),
  };
}

function cff(src, heavy = ["f"], names = ["f"], seed = 7) {
  const ast = parse(lex(src).tokens);
  const result = scrambleNativePrefix(ast.body, {
    seed,
    factoryNames: new Set(names),
    heavyFactories: new Set(heavy),
  });
  return { result, code: printChunk({ ...ast, body: result.statements }) };
}

t("flattens heavy if/elseif/else into a state dispatcher with identical behavior", () => {
  const { result, code } = cff(`
f = function()
  return function(mode)
    local out = ""
    if mode == 1 then
      out = "a"
    elseif mode == 2 then
      out = "b"
    else
      out = "c"
    end
    print(out)
  end
end
local cb = f()
cb(1)
cb(2)
cb(3)
`);
  expect(result.flattened).toBe(1);
  expect(result.heavy).toBe(1);
  expect(code).toMatch(/__qnc_o\d+ = \(os\.clock\(\) >= 0\)/);
  expect(code).toMatch(/local __qnc_s\d+ = 0/);
  expect(code).toContain("while true do");
  expect(code).toMatch(/__qnc_s\d+ == 1\) and __qnc_o\d+/);
  const r = runLuau(code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("a\nb\nc\n");
});

t("does not print a statement after a branch-ending return", () => {
  const { result, code } = cff(`
f = function()
  return function(mode)
    if mode then
      return "early"
    end
    return "late"
  end
end
local cb = f()
print(cb(true))
print(cb(false))
`);
  expect(result.flattened).toBe(1);
  const r = runLuau(code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("early\nlate\n");
});

t("leaves light frame factories flat but wraps conditions and adds dead junk", () => {
  const { result, code } = cff(
    `
g = function()
  return function(n)
    if n > 0 then
      print("pos")
    else
      print("non")
    end
  end
end
local cb = g()
cb(1)
cb(-1)
`,
    [],
    ["g"],
  );
  expect(result.flattened).toBe(0);
  expect(result.light).toBe(1);
  expect(code).not.toContain("while true do");
  expect(code).toMatch(/__qnc_o\d+ and \(n > 0\)/);
  expect(code).toMatch(/elseif not __qnc_o\d+ then/);
  const r = runLuau(code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("pos\nnon\n");
});

t("flattens while loops but preserves break binding", () => {
  const flat = cff(`
f = function()
  return function()
    local i = 0
    local out = ""
    while i < 3 do
      i = i + 1
      out = out .. i
    end
    print(out)
  end
end
f()()
`);
  expect(flat.result.flattened).toBe(1);
  expect(flat.code).not.toMatch(/while i < 3 do/);
  const r1 = runLuau(flat.code);
  expect(r1.stderr).toBe("");
  expect(r1.stdout).toBe("123\n");

  const guarded = cff(`
f = function()
  return function()
    local i = 0
    while true do
      i = i + 1
      if i == 2 then break end
    end
    print(i)
  end
end
f()()
`);
  expect(guarded.result.flattened).toBe(0);
  expect((guarded.code.match(/while /g) || []).length).toBe(1);
  expect(guarded.code).not.toMatch(/local __qnc_s\d+/);
  expect(guarded.code).toMatch(/while \(__qnc_o\d+ and true\) do/);
  const r2 = runLuau(guarded.code);
  expect(r2.stderr).toBe("");
  expect(r2.stdout).toBe("2\n");
});

t("flattens nested heavy conditionals", () => {
  const { result, code } = cff(`
f = function()
  return function(a, b)
    if a then
      local tag = "ab"
      if b then
        print(tag)
      else
        print("a")
      end
    else
      print("none")
    end
  end
end
local cb = f()
cb(true, true)
cb(true, false)
cb(false, false)
`);
  expect(result.flattened).toBe(2);
  const r = runLuau(code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("ab\na\nnone\n");
});

t("keeps continue and break bound to their own loops", () => {
  const { result, code } = cff(`
f = function()
  return function()
    local sum = 0
    for i = 1, 5 do
      if i == 3 then continue end
      sum = sum + i
    end
    for k, v in ipairs({1, 2, 3}) do
      if k == 2 then break end
      sum = sum + v
    end
    print(sum)
  end
end
f()()
`);
  expect(result.flattened).toBe(0);
  const r = runLuau(code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("13\n");
});

t("wraps repeat conditions and is deterministic", () => {
  const src = `
f = function()
  return function()
    local n = 0
    repeat
      n = n + 1
    until n >= 2
    print(n)
  end
end
f()()
`;
  const a = cff(src);
  const b = cff(src);
  expect(a.result.flattened).toBe(0);
  expect(a.code).toMatch(/until \(__qnc_o\d+ and \(n >= 2\)\)/);
  expect(a.code).toBe(b.code);
  const r = runLuau(a.code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("2\n");
});

t("tiers multiple factories independently", () => {
  const { result, code } = cff(
    `
f = function()
  return function(n)
    if n then print("ui") end
  end
end
g = function()
  return function(n)
    if n then print("frame") end
  end
end
f()(true)
g()(true)
`,
    ["f"],
    ["f", "g"],
  );
  expect(result.heavy).toBe(1);
  expect(result.light).toBe(1);
  expect(code).toContain("while true do");
  const ui = code.slice(0, code.indexOf("g = function"));
  const frame = code.slice(code.indexOf("g = function"));
  expect(ui).toContain("while true do");
  expect(frame).not.toContain("while true do");
  const r = runLuau(code);
  expect(r.stderr).toBe("");
  expect(r.stdout).toBe("ui\nframe\n");
});
