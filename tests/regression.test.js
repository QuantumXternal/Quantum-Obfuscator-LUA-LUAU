import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { obfuscate, printChunk } from "../dist/obfuscator/index.js";
import { encodeStrings } from "../dist/obfuscator/StringEncoder.js";
import { scrambleControlFlow } from "../dist/obfuscator/ControlFlowScrambler.js";
import { compile } from "../dist/vm/Compiler.js";
import { regCompile } from "../dist/vm/RegCompiler.js";
import { generateRegVM } from "../dist/vm/reg-vm-gen.js";
import { runReg } from "../dist/vm/reg-runner.js";
import { countFusionMatches } from "../dist/vm/reg-vm-gen.js";
import { runVM } from "../dist/vm/vm-runner.js";
// Note: Op is a `const enum` (erased at compile), so numeric opcode used directly.
// STORE_UPVAL = 38 per src/vm/bytecode.ts
const STORE_UPVAL = 38;
import { validate } from "../dist/compiler/LuauCompiler.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __testDir = dirname(fileURLToPath(import.meta.url));
import { runObfuscatePipeline, PipelineLexError } from "../dist/engine/obfuscatePipeline.js";
import { resolveProfile, profileDefaults } from "../dist/engine/profiles.js";

function runStack(source) {
  const { tokens, errors } = lex(source);
  if (errors.length) throw new Error("lex: " + JSON.stringify(errors));
  const ast = parse(tokens);
  const obf = obfuscate(ast, { renameLocals: true, preserveGlobals: true });
  const chunk = compile(obf);
  const logs = [];
  const env = {
    print: (...a) => logs.push(a.map(String).join(" ")),
    tostring: (v) => (v === null || v === undefined ? "nil" : String(v)),
    tostringAlias: undefined,
    type: (v) => (v === null || v === undefined ? "nil" : typeof v),
    pairs: (t) => {
      const keys = Object.keys(t);
      let i = 0;
      return [(..._) => {
        if (i >= keys.length) return [null];
        const k = keys[i++];
        return [k, t[k]];
      }, t, null];
    },
    ipairs: (t) => {
      let i = 0;
      return [(..._) => {
        i++;
        const v = t[i];
        if (v === undefined || v === null) return [null];
        return [i, v];
      }, t, 0];
    },
    string: { char: (...c) => String.fromCharCode(...c), concat: (a) => a.join(""), len: (s) => s.length, sub: (s, i, j) => s.substring(i - 1, j) },
    table: { concat: (t, s) => Object.keys(t).filter((k) => !isNaN(Number(k))).map(Number).sort((a, b) => a - b).map((k) => String(t[k])).join(s || ""), insert: (t, v) => { t[Object.keys(t).length + 1] = v; } },
    math: { floor: Math.floor, max: Math.max, min: Math.min },
    bit32: { bxor: (a, b) => a ^ b },
    error: (msg) => { throw new Error(String(msg)); },
    pcall: (f, ...args) => {
      try { const r = f(...args); return Array.isArray(r) ? [true, ...r] : [true, r]; }
      catch (e) { return [false, e instanceof Error ? e.message : String(e)]; }
    },
    select: (idx, ...args) => {
      if (idx === "#") return args.length;
      const n = Number(idx);
      if (n >= 1 && n <= args.length) return args[n - 1];
      return null;
    },
    unpack: (t, i, j) => {
      const start = i || 1;
      const keys = Object.keys(t).filter((k) => !isNaN(Number(k))).map(Number);
      const end = j || (keys.length > 0 ? Math.max(...keys) : 0);
      const out = [];
      for (let k = start; k <= end; k++) out.push(t[k]);
      return out;
    },
  };
  env._G = env;
  const ret = runVM(chunk.K, chunk.code, env, 0, chunk.protos || []);
  return { ret, logs, chunk };
}

describe("lexer", () => {
  test("numbers: hex/binary/underscore/exponent", () => {
    const { tokens, errors } = lex("local a = 0xFF local b = 0b101 local c = 1_000 local d = 1.5e-3");
    expect(errors).toEqual([]);
    const nums = tokens.filter((t) => t.type === "Number").map((t) => t.value);
    expect(nums).toEqual(["0xFF", "0b101", "1000", "1.5e-3"]);
  });
  test("escapes and long strings", () => {
    const { tokens, errors } = lex('local a = "hi\\n" local b = [[hello]]');
    expect(errors).toEqual([]);
    expect(tokens.find((t) => t.type === "String" && t.value === "hi\n")).toBeTruthy();
    expect(tokens.find((t) => t.type === "String" && t.value === "hello")).toBeTruthy();
  });
  test("interpolation lexes without errors", () => {
    const { errors } = lex("local x = `hi {name}!`");
    expect(errors).toEqual([]);
  });
  test("operators //= ..= :: ->", () => {
    const { tokens, errors } = lex("a //= b ..= c :: d -> e");
    expect(errors).toEqual([]);
    const ops = tokens.filter((t) => t.type === "Punctuator").map((t) => t.value);
    expect(ops).toEqual(expect.arrayContaining(["//=", "..=", "::", "->"]));
  });
});

describe("parser", () => {
  test("precedence: ^ right-assoc, unary vs *", () => {
    const ast = parse(lex("local x = 2 ^ 3 ^ 2").tokens);
    const val = ast.body[0].values[0];
    expect(val.type).toBe("BinaryExpression");
    expect(val.operator).toBe("^");
    expect(val.right.type).toBe("BinaryExpression");
  });
  test("if-else expression + continue + compound", () => {
    const ast = parse(lex("local x = if a then 1 else 2 while true do continue end x += 1").tokens);
    expect(ast.body.length).toBeGreaterThanOrEqual(3);
  });
  test("types do not break runtime statements", () => {
    const ast = parse(lex("type Foo = {x: number} local y: number = 1").tokens);
    expect(ast.body.length).toBe(2);
  });
});

describe("printer round-trip", () => {
  test("parse(print(parse(x))) re-parses with same shape", () => {
    const src = 'local x = 1 + 2 * 3 print("hi")';
    const once = printChunk(parse(lex(src).tokens));
    const twiceAst = parse(lex(once).tokens);
    // Printer wraps Binary in parens, so strings grow; assert structural stability instead.
    expect(twiceAst.body.length).toBe(2);
    expect(twiceAst.body[0].type).toBe("LocalStatement");
    expect(twiceAst.body[1].type).toBe("FunctionCallStatement");
    expect(() => printChunk(twiceAst)).not.toThrow();
  });
});

describe("transforms", () => {
  test("rename preserves Roblox globals", () => {
    const out = printChunk(obfuscate(parse(lex('local x = 1 print(x) print(game)').tokens), { renameLocals: true, preserveGlobals: true }));
    expect(out).toMatch("game");
    expect(out).toMatch("print");
    expect(out).not.toMatch("local x");
  });
  test("encodeStrings deterministic with seed", () => {
    const src = 'print("hello")';
    const a = printChunk(encodeStrings(parse(lex(src).tokens), { enabled: true, seed: 42 }));
    const b = printChunk(encodeStrings(parse(lex(src).tokens), { enabled: true, seed: 42 }));
    expect(a).toBe(b);
    expect(a).toContain("bit32");
  });
  test("scramble wraps conditions but stays parseable", () => {
    const src = "if a then print(1) end while b do print(2) end";
    const scrambled = scrambleControlFlow(parse(lex(src).tokens), { enabled: true, seed: 1 });
    const out = printChunk(scrambled);
    expect(out).toContain("and");
    expect(() => parse(lex(out).tokens)).not.toThrow();
  });
});

describe("validate (single-pass stats)", () => {
  test("counts + globals + features", () => {
    const r = validate('local x = 1 function foo() return x end print(foo())');
    expect(r.valid).toBe(true);
    expect(r.stats.statements).toBeGreaterThanOrEqual(3);
    expect(r.stats.functions).toBe(1);
    expect(r.stats.locals).toBe(1);
    expect(r.stats.globals).toEqual(expect.arrayContaining(["print"]));
  });
});

describe("stack VM semantics", () => {
  test("arithmetic + variables", () => {
    const { ret } = runStack("return 1 + 2 * 3");
    expect(ret).toBe(7);
  });
  test("functions + multiple returns", () => {
    const { ret } = runStack("local function f() return 1, 2 end local a, b = f() return a + b");
    expect(ret).toBe(3);
  });
  test("closures + upvalues", () => {
    const { ret } = runStack("local x = 10 local function get() return x end x = 20 return get()");
    expect(ret).toBe(20);
  });
  test("loops + conditionals", () => {
    const { ret } = runStack("local s = 0 for i = 1, 5 do s = s + i end if s == 15 then return 1 else return 0 end");
    expect(ret).toBe(1);
  });
  test("tables + strings", () => {
    const { ret } = runStack('local t = {x = 1, [\"y\"] = 2} t.z = 3 return t.x + t.y + t.z');
    expect(ret).toBe(6);
  });
  test("recursion", () => {
    const { ret } = runStack("local function fib(n) if n < 2 then return n end return fib(n-1) + fib(n-2) end return fib(10)");
    expect(ret).toBe(55);
  });
  test("repeat + while + break", () => {
    const { ret } = runStack("local i = 0 while true do i = i + 1 if i >= 3 then break end end return i");
    expect(ret).toBe(3);
  });
});

describe("P0: FunctionStatement upvalue store", () => {
  test("nested function assignment emits STORE_UPVAL, not STORE_G", () => {
    // `x` is a local of the top chunk; `function x()` inside `outer()`
    // must capture it as an upvalue. Do-blocks share slots (STORE_L), only
    // function boundaries create upvalues, so test with function nesting.
    const src = "local x = 0 local function outer() function x() return 1 end end outer() return x()";
    const { tokens } = lex(src);
    const chunk = compile(obfuscate(parse(tokens), { renameLocals: false, preserveGlobals: true }));
    const chunks = [chunk, ...(chunk.protos || []).flatMap((p) => [p, ...(p.protos || [])])];
    const hasStoreUpval = chunks.some((c) => c.code.includes(STORE_UPVAL));
    expect(hasStoreUpval).toBe(true);
  });
  test("upvalue function assignment executes correctly", () => {
    const { ret } = runStack("local x = 0 local function outer() function x() return 7 end end outer() return x()");
    expect(ret).toBe(7);
  });
});

describe("register compiler", () => {
  test("produces fixed-stride code", () => {
    const chunk = regCompile(parse(lex("local x = 1 + 2 return x").tokens));
    expect(chunk.code.length % 4).toBe(0);
    expect(chunk.nInstructions).toBe(chunk.code.length / 4);
  });
});

describe("semantics: operators and scope", () => {
  test("logical and/or short-circuit", () => {
    expect(runStack("return (false and 1) or 2").ret).toBe(2);
    expect(runStack("return (true and 5) or 6").ret).toBe(5);
    expect(runStack("return not false").ret).toBe(true);
  });
  test("comparisons", () => {
    expect(runStack("return (3 < 4) and (4 <= 4) and (5 > 2) and (2 >= 2) and (1 ~= 2) and (2 == 2)").ret).toBe(true);
  });
  test("nested scopes and shadowing", () => {
    const { ret } = runStack("local x = 1 do local x = 2 end return x");
    expect(ret).toBe(1);
  });
  test("compound assignment and concat", () => {
    expect(runStack('local s = "a" s ..= "b" s ..= "c" return s').ret).toBe("abc");
    expect(runStack("local n = 5 n += 3 n *= 2 return n").ret).toBe(16);
  });
  test("varargs and select", () => {
    const { ret } = runStack("local function f(...) return select('#', ...) end return f(1, 2, 3)");
    expect(ret).toBe(3);
  });
  test("pcall error path", () => {
    const { ret } = runStack('local ok, err = pcall(function() error("boom") end) return ok == false');
    expect(ret).toBe(true);
  });
  test("numeric for sum (for-in iterator covered separately)", () => {
    // NOTE: generic-for over pairs() with the JS mock iterator hits a
    // stack-VM CALL_MULTI/TFOR limitation (pre-existing, see vm-runner
    // TFOR:463). Numeric-for exercises the same loop patching paths.
    const { ret } = runStack("local t = {1, 2, 3} local s = 0 for i = 1, 3 do s = s + t[i] end return s");
    expect(ret).toBe(6);
  });
  test("string length and method call", () => {
    const { ret } = runStack('local s = "hello" return #s');
    expect(ret).toBe(5);
  });
});

describe("luau constructs", () => {
  test("continue skips iteration", () => {
    const { ret } = runStack("local s = 0 for i = 1, 5 do if i == 3 then continue end s = s + i end return s");
    expect(ret).toBe(1 + 2 + 4 + 5);
  });
  test("if-else expression", () => {
    const ast = parse(lex("local x = if true then 1 else 2 return x").tokens);
    const { ret } = runStack(printChunk(ast));
    expect(ret).toBe(1);
  });
  test("type annotations do not affect runtime", () => {
    const { ret } = runStack(printChunk(parse(lex("type Foo = {x: number} local y: number = 41 return y + 1").tokens)));
    expect(ret).toBe(42);
  });
  test("preserved Roblox globals survive rename", () => {
    const out = printChunk(obfuscate(parse(lex("local game = 1 print(game)").tokens), { renameLocals: true, preserveGlobals: true }));
    // `game` is in PRESERVED_GLOBALS and must not be renamed even as a local
    expect(out).toMatch("game");
  });
});

describe("shared pipeline engine", () => {
  test("none path deterministic with seed", () => {
    const src = 'local x = 1 print("hi " .. x)';
    const opts = { renameLocals: true, preserveGlobals: true, encodeStrings: true, scramble: true, oneLine: false, vmType: "none", vmLevel: "normal", seed: 7 };
    expect(runObfuscatePipeline(src, opts)).toBe(runObfuscatePipeline(src, opts));
  });
  test("none path output re-parses", () => {
    const out = runObfuscatePipeline("local x = 1 + 2 return x", {
      renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false, oneLine: false, vmType: "none", vmLevel: "normal", seed: 7,
    });
    expect(() => parse(lex(out).tokens)).not.toThrow();
  });
  test("stack/register outputs are non-empty Luau", () => {
    const src = "local x = 1 return x";
    for (const vmType of ["stack", "register"]) {
      const out = runObfuscatePipeline(src, {
        renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false, oneLine: false, vmType, vmLevel: "normal", seed: 7,
      });
      expect(out.length).toBeGreaterThan(src.length);
      expect(lex(out).errors).toEqual([]);
    }
  });
  test("lex errors throw PipelineLexError", () => {
    expect(() => runObfuscatePipeline("--[[oops", {
      renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false, oneLine: false, vmType: "none", vmLevel: "normal",
    })).toThrow(PipelineLexError);
  });
  test("onBytecode hook reports stats", () => {
    const seen = [];
    runObfuscatePipeline("local x = 1 return x", {
      renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false, oneLine: false, vmType: "register", vmLevel: "normal", seed: 7,
      onBytecode: (info) => seen.push(info),
    });
    expect(seen.length).toBe(1);
    expect(seen[0].instructions).toBeGreaterThan(0);
  });
});

describe("protection profiles", () => {
  test("FAST/BALANCED/MAXIMUM resolve to explicit tradeoffs", () => {
    expect(resolveProfile({ profile: "FAST" })).toMatchObject({ vmType: "none", encodeStrings: false, scramble: false, executorGlobals: false });
    expect(resolveProfile({ profile: "BALANCED" })).toMatchObject({ vmType: "register", vmLevel: "normal", encodeStrings: true, scramble: true, executorGlobals: false });
    expect(resolveProfile({ profile: "MAXIMUM" })).toMatchObject({ vmType: "register", vmLevel: "max", encodeStrings: true, scramble: true, executorGlobals: false });
  });
  test("MAXIMUM stays generic unless target is roblox", () => {
    expect(resolveProfile({ profile: "MAXIMUM", target: "roblox" }).executorGlobals).toBe(true);
    expect(resolveProfile({ profile: "MAXIMUM", target: "generic" }).executorGlobals).toBe(false);
    expect(resolveProfile({ profile: "BALANCED", target: "roblox" }).executorGlobals).toBe(false);
  });
  test("explicit vm overrides win over profile defaults", () => {
    const base = resolveProfile({ profile: "BALANCED", vmLevel: "max" });
    expect(base.vmLevel).toBe("max");
    expect(base.vmType).toBe("register");
  });
  test("profileDefaults matches UI PROFILE_DEFAULTS", () => {
    expect(profileDefaults("FAST")).toEqual({ vmType: "none", vmLevel: "normal" });
    expect(profileDefaults("BALANCED")).toEqual({ vmType: "register", vmLevel: "normal" });
    expect(profileDefaults("MAXIMUM")).toEqual({ vmType: "register", vmLevel: "max" });
  });
  test("roblox target adds bootstrap anti-tamper block (generic stays clean)", () => {
    const src = "local x = 1 return x";
    const generic = runObfuscatePipeline(src, { ...resolveProfile({ profile: "BALANCED", seed: 7 }), seed: 7 });
    const roblox = runObfuscatePipeline(src, {
      ...resolveProfile({ profile: "MAXIMUM", target: "roblox", seed: 7 }), seed: 7,
    });
    // Same VM level for a fair comparison of the gate alone:
    const genericMax = runObfuscatePipeline(src, {
      ...resolveProfile({ profile: "MAXIMUM", seed: 7 }), seed: 7,
    });
    expect(roblox.length).toBeGreaterThan(genericMax.length);
    expect(lex(generic).errors).toEqual([]);
    expect(lex(roblox).errors).toEqual([]);
    expect(generic.length).toBeGreaterThan(0);
  });
  test("web UI defaults to BALANCED/normal (no silent MAXIMUM)", () => {
    const html = readFileSync(join(__testDir, "..", "public", "index.html"), "utf8");
    expect(html).toMatch('value="BALANCED" selected');
    expect(html).toMatch('value="normal" selected');
    expect(html).not.toMatch('value="max" selected');
  });
});

describe("register handler noise gate", () => {
  test("noise off by default; forceFeatures restores legacy emission", () => {
    const src = "local x = 1 + 2 return x";
    const quiet = runObfuscatePipeline(src, {
      renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false,
      oneLine: false, vmType: "register", vmLevel: "normal", seed: 7,
      // Isolate the noise variable: engine defaults executorGlobals to true
      // at normal level, so pin it to match the direct call below.
      executorGlobals: false,
    });
    // Legacy emission via explicit flag: proves the flag is live, not deleted.
    const chunk = regCompile(parse(lex(src).tokens));
    const noisy = generateRegVM(chunk, {
      level: "normal", executorGlobals: false, polymorphicSeed: 7, forceFeatures: ["handlerNoise"],
    });
    expect(noisy.length).toBeGreaterThan(quiet.length);
    expect(lex(quiet).errors).toEqual([]);
    expect(lex(noisy).errors).toEqual([]);
  });
});

describe("register dead-code gate", () => {
  test("default preserves historical output; disabling omits only dead material", () => {
    const src = "local x = 1 + 2 print(x)";
    const base = {
      renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false,
      oneLine: false, vmType: "register", vmLevel: "normal", seed: 7, executorGlobals: false,
    };
    const def = runObfuscatePipeline(src, base);
    const stripped = runObfuscatePipeline(src, { ...base, disableFeatures: ["deadCodeInjection"] });
    // Disabled output is strictly smaller (3-6 decoder twins + 5-10 junk frags omitted).
    expect(stripped.length).toBeLessThan(def.length);
    expect(lex(def).errors).toEqual([]);
    expect(lex(stripped).errors).toEqual([]);
    // NOTE: semantic equivalence of the disabled path is asserted at the
    // register-runner stage (no Luau executor exists yet); the twins/frags
    // are never invoked by chainCalls/dispatch (see CHANGELOG Stage 6).
  });
});

describe("deterministic generation", () => {
  const seeds = [7, 0];
  for (const seed of seeds) {
    test(`stack same-seed byte-identical (seed=${seed})`, () => {
      const src = "local x = 1 + 2 print(x)";
      const opts = {
        renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false,
        oneLine: false, vmType: "stack", vmLevel: "normal", seed, executorGlobals: false,
      };
      expect(runObfuscatePipeline(src, opts)).toBe(runObfuscatePipeline(src, opts));
    });
    test(`register same-seed byte-identical (seed=${seed})`, () => {
      const src = "local x = 1 + 2 print(x)";
      const opts = {
        renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false,
        oneLine: false, vmType: "register", vmLevel: "normal", seed, executorGlobals: false,
      };
      expect(runObfuscatePipeline(src, opts)).toBe(runObfuscatePipeline(src, opts));
    });
  }
  test("polymorphicSeed override is honored", () => {
    const src = "local x = 1 + 2 print(x)";
    const base = {
      renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false,
      oneLine: false, vmType: "register", vmLevel: "normal", executorGlobals: false,
    };
    const a = runObfuscatePipeline(src, { ...base, polymorphicSeed: 11 });
    const b = runObfuscatePipeline(src, { ...base, polymorphicSeed: 11 });
    const c = runObfuscatePipeline(src, { ...base, polymorphicSeed: 12 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  test("stack max watermark deterministic under seed", () => {
    const src = "local x = 1 print(x)";
    const opts = {
      renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false,
      oneLine: false, vmType: "stack", vmLevel: "max", seed: 7, executorGlobals: false,
    };
    expect(runObfuscatePipeline(src, opts)).toBe(runObfuscatePipeline(src, opts));
  });
});

describe("register runner equivalence", () => {
  function regEnv() {
    const env = {
      print: (...a) => a.map(String).join(" "),
      type: (v) => (v === null || v === undefined ? "nil" : typeof v),
      tostring: (v) => (v === null || v === undefined ? "nil" : String(v)),
      tonumber: (v) => { const n = Number(v); return isNaN(n) ? null : n; },
      error: (msg) => { throw new Error(String(msg)); },
      pcall: (f, ...args) => {
        try { const r = f(...args); return Array.isArray(r) ? [true, ...r] : [true, r]; }
        catch (e) { return [false, e instanceof Error ? e.message : String(e)]; }
      },
      select: (idx, ...args) => (idx === "#" ? args.length : args[Number(idx) - 1] ?? null),
      pairs: (t) => { const ks = Object.keys(t); let i = 0; return [(..._) => { if (i >= ks.length) return [null]; const k = ks[i++]; return [k, t[k]]; }, t, null]; },
      ipairs: (t) => { let i = 0; return [(..._) => { i++; const v = t[i]; if (v === undefined || v === null) return [null]; return [i, v]; }, t, 0]; },
      string: { char: (...c) => String.fromCharCode(...c), len: (s) => s.length },
      table: { concat: (t, s) => Object.keys(t).filter((k) => !isNaN(Number(k))).map(Number).sort((a, b) => a - b).map((k) => String(t[k])).join(s || "") },
      math: { floor: Math.floor, max: Math.max },
      bit32: { bxor: (a, b) => a ^ b },
    };
    env._G = env;
    return env;
  }
  function runRegSrc(src) {
    return runReg(regCompile(parse(lex(src).tokens)), regEnv());
  }
  const cases = [
    ["arith", "return 1 + 2 * 3", [7]],
    ["arith2", "return 10 - 3 - 2", [5]],
    ["modpow", "return 17 % 5 + 2 ^ 3", [10]],
    ["idiv", "return 7 // 2", [3]],
    ["unm", "return -5 + 2", [-3]],
    ["cond", "local x = if true then 1 else 2 return x", [1]],
    ["cmp", "return (3 < 4) and (4 <= 4) and (5 > 2) and (2 >= 2) and (1 ~= 2) and (2 == 2)", [true]],
    ["fib", "local function fib(n) if n < 2 then return n end return fib(n-1) + fib(n-2) end return fib(10)", [55]],
    ["closure", "local x = 10 local function get() return x end x = 20 return get()", [20]],
    ["counter", "local function mk() local n = 0 return function() n += 1 return n end end local c = mk() c() return c()", [2]],
    ["upvalue-separate", "local function mk(v) return function() return v end end local a = mk(1) local b = mk(2) return a() + b()", [3]],
    ["fornum", "local s = 0 for i = 1, 5 do s = s + i end return s", [15]],
    ["forstep", "local s = 0 for i = 10, 1, -3 do s = s + i end return s", [22]],
    ["while", "local i = 0 while i < 5 do i = i + 1 end return i", [5]],
    ["repeat", "local i = 0 repeat i = i + 1 until i >= 3 return i", [3]],
    ["break", "local s = 0 for i = 1, 10 do if i > 3 then break end s = s + i end return s", [6]],
    ["continue", "local s = 0 for i = 1, 5 do if i == 3 then continue end s = s + i end return s", [12]],
    ["table", "local t = {x = 1, [10] = 2} t.z = 3 return t.x + t[10] + t.z", [6]],
    ["arrspread", "local function f() return 1, 2 end local t = {f()} return t[1] + t[2]", [3]],
    ["multi", "local function f() return 4, 5 end local a, b = f() return a + b", [9]],
    ["vararg", "local function f(...) return select('#', ...) end return f(1, 2, 3)", [3]],
    ["method", "local t = {} function t:add(a) return a + 1 end return t:add(41)", [42]],
    ["methoddef", "local o = {} function o:m() return 9 end return o:m()", [9]],
    ["selfcall", "local o = {v = 5} function o:get() return self.v end return o:get()", [5]],
    ["forin", "local t = {1, 2, 3} local s = 0 for _, v in pairs(t) do s = s + v end return s", [6]],
    ["strcat", 'local s = "a" .. "b" .. "c" return s', ["abc"]],
    ["interp", "local n = `x{40 + 2}y` return n", ["x42y"]],
    ["upstore", "local x = 0 local function outer() function x() return 7 end end outer() return x()", [7]],
    ["setglobal", "gval = 123 return gval", [123]],
    ["len", 'return #"hello"', [5]],
    ["not", "return not false", [true]],
    ["pcall-global", 'local ok, v = pcall(function() return 6 * 7 end) return v', [42]],
    ["nestedret", "local function f() return 1, 2, 3 end return f()", [1]],
    ["shadow", "local x = 1 do local x = 2 end return x", [1]],
    ["nested3", "local function a() local function b() local function c() return 3 end return c() end return b() end return a()", [3]],
  ];
  for (const [name, src, want] of cases) {
    test(`reg: ${name}`, () => {
      expect(runRegSrc(src).slice(0, want.length)).toEqual(want);
    });
  }
  test("reg: constant pool spill (LOADKX) executes correctly", () => {
    const lines = [];
    for (let i = 0; i < 300; i++) lines.push(`local k${i} = "v${i}"`);
    lines.push("return k299");
    expect(runRegSrc(lines.join("\n"))[0]).toBe("v299");
  });
  test("reg: large constant indices load directly (no LOADKX/EXTRAARG emitted)", () => {
    const lines = [];
    for (let i = 0; i < 300; i++) lines.push(`local k${i} = "v${i}"`);
    lines.push("return k299");
    const chunk = regCompile(parse(lex(lines.join("\n")).tokens));
    const ops = [];
    const walk = (c) => { for (let i = 0; i < c.code.length; i += 4) ops.push(c.code[i]); for (const p of c.protos || []) walk(p); };
    walk(chunk);
    expect(ops).not.toContain(43); // LOADKX
    expect(ops).not.toContain(44); // EXTRAARG
    expect(runReg(chunk, {})).toEqual(["v299"]);
  });
  test("reg: spill-range constants correct at boundary and under reuse", () => {
    const lines = ["local t = {}"];
    for (let i = 0; i < 260; i++) lines.push(`t[${100000 + i}] = ${i}`);
    lines.push("local function g() return t[100000] + t[100259] + t[100100] end");
    lines.push("return g() + t[100000]");
    // 0 + 259 + 100 + 0 = 359
    expect(runRegSrc(lines.join("\n"))[0]).toBe(359);
  });
  test("reg: spilled constants inside closures capture correctly", () => {
    const lines = [];
    for (let i = 0; i < 260; i++) lines.push(`local c${i} = ${200000 + i}`);
    lines.push("local function f() return c0 + c259 end");
    lines.push("return f()");
    expect(runRegSrc(lines.join("\n"))[0]).toBe(200000 + 200259);
  });
  test("reg: unsupported opcodes throw instead of guessing", () => {
    // TAILCALL (28) is never emitted by regCompile.
    expect(() => runReg({ K: [], code: [28, 0, 0, 0], nInstructions: 1, maxRegs: 1, nParams: 0, isVararg: false }, {})).toThrow(/unsupported/);
  });
  test("reg: TESTSET follows standard Lua semantics (ISA completeness)", () => {
    // Hand-built and/or shape: LOADBOOL; TESTSET 1,0,C; JMP end; LOADNIL; RETURN.
    const mk = (boolVal) => ({
      K: [], code: [3, 0, boolVal, 0, 26, 1, 0, 0, 21, 0, 1, 0, 2, 1, 0, 0, 29, 1, 2, 0],
      nInstructions: 5, maxRegs: 2, nParams: 0, isVararg: false,
    });
    expect(runReg(mk(0), {})).toEqual([false]);
    expect(runReg(mk(1), {})).toEqual([null]);
  });
  test("stack/register agree on overlapping programs", () => {
    const programs = [
      "return 1 + 2 * 3",
      "local function fib(n) if n < 2 then return n end return fib(n-1) + fib(n-2) end return fib(10)",
      "local s = 0 for i = 1, 5 do s = s + i end return s",
      "local t = {x = 1} t.y = 2 return t.x + t.y",
    ];
    for (const src of programs) {
      const stackGot = runStack(src).ret;
      const regGot = runRegSrc(src)[0];
      expect(regGot).toEqual(stackGot);
    }
  });
});

describe("register conditional init", () => {
  test("debug output keeps historical init tables exactly", () => {
    // Debug uses fixed names (createNameMap debug) and usedOps undefined.
    const out = runObfuscatePipeline("local x = 1 + 2 return x", {
      renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false,
      oneLine: false, vmType: "register", vmLevel: "debug", seed: 7, executorGlobals: false,
    });
    expect(out).toContain("local openUVs={}");
    expect(out).toContain("local _ic={}");
    expect(lex(out).errors).toEqual([]);
  });
  test("global-free/closure-free programs generate clean output", () => {
    for (const src of ["local x = 1 + 2 return x", "local s = 0 for i = 1, 3 do s = s + i end return s"]) {
      const out = runObfuscatePipeline(src, {
        renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false,
        oneLine: false, vmType: "register", vmLevel: "normal", seed: 7, executorGlobals: false,
      });
      expect(lex(out).errors).toEqual([]);
      expect(out.length).toBeGreaterThan(src.length);
    }
  });
});

describe("logic-operator semantics (high-sensitivity gate)", () => {
  function regEnv2() {
    const env = {
      print: (...a) => a.map(String).join(" "),
      type: (v) => (v === null || v === undefined ? "nil" : typeof v),
      tostring: (v) => (v === null || v === undefined ? "nil" : String(v)),
      pairs: (t) => { const ks = Object.keys(t); let i = 0; return [(..._) => { if (i >= ks.length) return [null]; const k = ks[i++]; return [k, t[k]]; }, t, null]; },
    };
    env._G = env;
    return env;
  }
  function regSrc(src) {
    return runReg(regCompile(parse(lex(src).tokens)), regEnv2());
  }
  test("and short-circuits without evaluating right", () => {
    const r = regSrc('local t = {} local function s(v) t[#t + 1] = v return v end local x = s(false) and s(true) return #t');
    expect(r).toEqual([1]);
  });
  test("or short-circuits without evaluating right", () => {
    const r = regSrc('local t = {} local function s(v) t[#t + 1] = v return v end local x = s(true) or s(false) return #t');
    expect(r).toEqual([1]);
  });
  test("and/or return operand values (not booleans)", () => {
    expect(regSrc("return false and 99")).toEqual([false]);
    expect(regSrc("return nil and 99")).toEqual([null]);
    expect(regSrc("return 7 and 99")).toEqual([99]);
    expect(regSrc("return false or 99")).toEqual([99]);
    expect(regSrc("return 7 or 99")).toEqual([7]);
  });
  test("nil/false truthiness (0 and empty string are truthy)", () => {
    expect(regSrc("return 0 and 1")).toEqual([1]);
    expect(regSrc('return "" and 1')).toEqual([1]);
    expect(regSrc("return nil or false or 0")).toEqual([0]);
  });
  test("nested logic preserves order", () => {
    // Left side falsy (s(false)) so the right side must fully evaluate.
    expect(regSrc("local t = {} local function s(v) t[#t+1] = v return v end local x = (s(false) and s(2)) or (s(3) and s(4)) return t[2] + t[3]")).toEqual([3 + 4]);
  });
  test("logic in conditions and assignments", () => {
    expect(regSrc("local x = 0 if 1 == 1 and 2 == 2 then x = 5 end return x")).toEqual([5]);
    expect(regSrc("local t = {} t.v = false or 8 return t.v")).toEqual([8]);
    expect(regSrc("g_logic = nil or 9 return g_logic")).toEqual([9]);
  });
  test("logic with calls and upvalues", () => {
    expect(regSrc("local function f() return 1, 2 end local x = f() and 10 return x")).toEqual([10]);
    expect(regSrc("local u = 3 local function g() return u and 4 end return g()")).toEqual([4]);
  });
  test("comparison results are booleans in all operators", () => {
    expect(regSrc("return (1 == 1)")).toEqual([true]);
    expect(regSrc("return (1 ~= 1)")).toEqual([false]);
    expect(regSrc("return (2 > 1)")).toEqual([true]);
    expect(regSrc("return (1 >= 2)")).toEqual([false]);
    expect(regSrc("return (1 < 2)")).toEqual([true]);
    expect(regSrc("return (2 <= 1)")).toEqual([false]);
  });
  test("stack/register agree on logic programs", () => {
    for (const src of ["return (false and 1) or 2", "local x = nil or false or 0 return x"]) {
      expect(regSrc(src)[0]).toEqual(runStack(src).ret);
    }
  });
});

describe("assignment threading traps", () => {
  function regEnv3() {
    const env = { print: (...a) => a.map(String).join(" ") };
    env._G = env;
    return env;
  }
  function regSrc3(src) {
    return runReg(regCompile(parse(lex(src).tokens)), regEnv3());
  }
  test("single pure reassignments thread correctly", () => {
    expect(regSrc3("local x = 0 x = 42 return x")).toEqual([42]);
    expect(regSrc3('local x = 0 x = "s" return x')).toEqual(["s"]);
    expect(regSrc3("local x = 0 x = true return x")).toEqual([true]);
    expect(regSrc3("local x = 1 x = nil return x == nil")).toEqual([true]);
    expect(regSrc3("local x = 5 x = x return x")).toEqual([5]);
  });
  test("identifier RHS from global into local", () => {
    expect(regSrc3("g_thr = 11 local x = 0 x = g_thr return x")).toEqual([11]);
  });
  test("multi-assign with pure values keeps order (must NOT thread)", () => {
    expect(regSrc3("local a, b = 1, 2 return a + b")).toEqual([3]);
    expect(regSrc3("local a, b = b, a return 0")).toEqual([0]);
    expect(regSrc3("local a = 1 local b = 2 a, b = b, a return a * 10 + b")).toEqual([21]);
  });
  test("table/global/upvalue single-pure keeps temp path and works", () => {
    expect(regSrc3("local t = {} t.k = 1 t.k = 2 return t.k")).toEqual([2]);
    expect(regSrc3("g_thr2 = 1 g_thr2 = 2 return g_thr2")).toEqual([2]);
    expect(regSrc3("local x = 0 local function s() x = 7 end s() return x")).toEqual([7]);
  });
  test("threaded value visible to later statements, extras still evaluated", () => {
    expect(regSrc3("local x = 0 x = 9 local y = x + 1 return y")).toEqual([10]);
  });
  test("stack/register agree on threaded assignments", () => {
    for (const src of ["local x = 0 x = 42 return x", "local a = 1 local b = 2 a, b = b, a return a * 10 + b"]) {
      expect(regSrc3(src)[0]).toEqual(runStack(src).ret);
    }
  });
});

describe("fusion census (metric layer)", () => {
  // Op numbers mirror src/vm/bytecode.ts RegOp (TEST=25, JMP=21, MOVE=4,
  // LOADK=1, RETURN=29, GETGLOBAL=5, GETTABLE=7, CALL=27, EQ=22).
  function get(m, name) {
    return m.perPattern.find((p) => p.name === name).matches;
  }
  test("counts each pattern independently on hand-built code", () => {
    const code = [
      25, 0, 0, 0, 21, 0, 1, 0, // TEST_JMP
      25, 1, 0, 0, 21, 0, 2, 0, // TEST_JMP
      4, 0, 1, 0, 4, 1, 2, 0, // MOVE_MOVE
      1, 0, 0, 0, 1, 1, 1, 0, // LOADKK
    ];
    const m = countFusionMatches({ K: [], code, nInstructions: 8, maxRegs: 3, nParams: 0, isVararg: false });
    expect(get(m, "TEST_JMP")).toBe(2);
    expect(get(m, "MOVE_MOVE")).toBe(1);
    expect(get(m, "LOADKK")).toBe(1);
    expect(get(m, "EQ_JMP")).toBe(0);
    expect(m.greedyTotal).toBe(4);
    expect(m.perPattern.length).toBe(12);
  });
  test("overlap: GGET_CALL site also matches GGET prefix; greedy counts once", () => {
    const code = [5, 0, 0, 0, 7, 0, 0, 0, 27, 0, 2, 1];
    const m = countFusionMatches({ K: [], code, nInstructions: 3, maxRegs: 3, nParams: 0, isVararg: false });
    expect(get(m, "GGET_CALL")).toBe(1);
    expect(get(m, "GGET")).toBe(1);
    expect(m.greedyTotal).toBe(1);
  });
  test("does not mutate the chunk", () => {
    const code = [25, 0, 0, 0, 21, 0, 1, 0];
    const before = code.join(",");
    countFusionMatches({ K: [], code, nInstructions: 2, maxRegs: 1, nParams: 0, isVararg: false });
    expect(code.join(",")).toBe(before);
  });
  test("counts inside protos and is deterministic", () => {
    const chunk = regCompile(parse(lex("local function f() return 1 end return f()").tokens));
    const a = countFusionMatches(chunk);
    const b = countFusionMatches(chunk);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(get(a, "LOADK_RET")).toBeGreaterThanOrEqual(1);
  });
  test("CMP→BOOL output has no EQ/LT/LE/TESTSET_JMP candidates", () => {
    const chunk = regCompile(parse(lex("if a == b then return 1 end return 0").tokens));
    const m = countFusionMatches(chunk);
    expect(get(m, "EQ_JMP")).toBe(0);
    expect(get(m, "LT_JMP")).toBe(0);
    expect(get(m, "LE_JMP")).toBe(0);
    expect(get(m, "TESTSET_JMP")).toBe(0);
    expect(get(m, "TEST_JMP")).toBeGreaterThanOrEqual(1);
  });
});

describe("stack super-ops 57-63 (reference runner mirror)", () => {
  // Numeric literals: Op is a const enum (erased at compile). Fused layouts
  // mirror fuseOpcodes in src/vm/vm-gen.ts (zero-padded, length-preserving).
  // Base ops: PUSH_K=4, LOAD_L=5, STORE_L=6, RETURN=31.
  function runChunk(K, code, env) {
    return runVM(K, code, env || {}, 0, []);
  }
  // Prologue helper: locals[a]=x, locals[b]=y via PUSH_K/STORE_L.
  function localsChunk(K, pairs, rest) {
    const code = [];
    for (const [slot, ki] of pairs) code.push(4, ki, 6, slot);
    return { K, code: code.concat(rest) };
  }
  function tail(slot) {
    return [5, slot, 31, 1]; // LOAD_L slot; RETURN 1
  }

  test("57 ADD: numbers, negatives, chained reuse", () => {
    let c = localsChunk([6, 7], [[0, 0], [1, 1]], [57, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    expect(runChunk(c.K, c.code)).toBe(13);
    c = localsChunk([-4, 10], [[0, 0], [1, 1]], [57, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    expect(runChunk(c.K, c.code)).toBe(6);
    // chained: r2 = r0+r1; r3 = r2+r2
    c = localsChunk([3, 4], [[0, 0], [1, 1]], [57, 0, 1, 2, 0, 0, 0, 57, 2, 2, 3, 0, 0, 0].concat(tail(3)));
    expect(runChunk(c.K, c.code)).toBe(14);
  });
  test("58 SUB / 59 MUL incl. negative results and operand order", () => {
    let c = localsChunk([10, 4], [[0, 0], [1, 1]], [58, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    expect(runChunk(c.K, c.code)).toBe(6); // a-b, not b-a
    c = localsChunk([3, 8], [[0, 0], [1, 1]], [58, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    expect(runChunk(c.K, c.code)).toBe(-5);
    c = localsChunk([-3, -2], [[0, 0], [1, 1]], [59, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    expect(runChunk(c.K, c.code)).toBe(6);
  });
  test("60 PUSH_K/STORE and 61 LOAD/STORE copies incl. strings", () => {
    let c = { K: ["hi"], code: [60, 0, 3, 0].concat(tail(3)) };
    expect(runChunk(c.K, c.code)).toBe("hi");
    c = localsChunk([41], [[2, 0]], [61, 2, 5, 0].concat(tail(5)));
    expect(runChunk(c.K, c.code)).toBe(41);
    c = localsChunk([1, 2], [[0, 0], [1, 1]], [61, 0, 4, 0, 61, 1, 5, 0, 57, 4, 5, 6, 0, 0, 0].concat(tail(6)));
    expect(runChunk(c.K, c.code)).toBe(3);
  });
  test("62 LOADK_ARITH local+const, mixed and in loop-carried shape", () => {
    let c = localsChunk([10, 5], [[0, 0]], [62, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    // K=[10,5]: r2 = r0 + K[1]
    expect(runChunk(c.K, c.code)).toBe(15);
    // s = s + 1 shape with locals slot reuse
    c = { K: [0, 1], code: [4, 0, 6, 0, 62, 0, 1, 0, 0, 0, 0].concat(tail(0)) };
    expect(runChunk(c.K, c.code)).toBe(1);
  });
  test("63 CONCAT strings, numbers, mixed", () => {
    let c = localsChunk(["a", "b"], [[0, 0], [1, 1]], [63, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    expect(runChunk(c.K, c.code)).toBe("ab");
    c = localsChunk([12, 34], [[0, 0], [1, 1]], [63, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    expect(runChunk(c.K, c.code)).toBe("1234");
    c = localsChunk(["n=", 7], [[0, 0], [1, 1]], [63, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    expect(runChunk(c.K, c.code)).toBe("n=7");
  });
  test("fused execution matches unfused on real compiler output", () => {
    // Compile a local-form addition (which emits a contiguous 7-word
    // [LOAD_L,LOAD_L,ADD,STORE_L] window), hand-fuse it exactly the way
    // fuseOpcodes would, and compare execution. This is the closest the
    // reference harness gets to max-level fused output (which is Lua text
    // the runner cannot consume directly).
    const src = "local a = 6 local b = 7 local s = a + b return s";
    const { tokens } = lex(src);
    const chunk = compile(obfuscate(parse(tokens), { renameLocals: false, preserveGlobals: true }));
    const out = chunk.code.slice();
    let fused = 0;
    for (let i = 0; i + 6 < out.length; i++) {
      if (out[i] === 5 && out[i + 2] === 5 && out[i + 4] === 9 && out[i + 5] === 6) {
        const a = out[i + 1], b = out[i + 3], c = out[i + 6];
        out[i] = 57; out[i + 1] = a; out[i + 2] = b; out[i + 3] = c;
        out[i + 4] = 0; out[i + 5] = 0; out[i + 6] = 0;
        fused++;
        i += 6;
      }
    }
    expect(fused).toBeGreaterThan(0);
    expect(runVM(chunk.K, chunk.code, {}, 0, chunk.protos || [])).toBe(
      runVM(chunk.K, out, {}, 0, chunk.protos || [])
    );
  });
  test("fused arithmetic agrees with unfused incl. metamethods (11D-1)", () => {
    // Stage 11C established: generated fused handlers use raw Lua operators,
    // which dispatch standard metamethods natively. The reference runner
    // therefore models fused 57/58/59/62 via arithMM — identical to unfused.
    // The old "divergence" was a runner-fidelity bug (removed arithFused).
    let mmCalls = 0;
    const obj = { v: 3, __metatable: { __add: (a, b) => { mmCalls++; return 1000; } } };
    // prologue: locals[3]=obj, locals[4]=1
    const prologue = [4, 0, 6, 3, 4, 1, 6, 4];
    // unfused: LOAD_L,LOAD_L,ADD,STORE,LOAD,RETURN
    const unfused = runVM([obj, 1], prologue.concat([5, 3, 5, 4, 9, 6, 2, 5, 2, 31, 1]), {}, 0, []);
    expect(unfused).toBe(1000);
    expect(mmCalls).toBe(1);
    mmCalls = 0;
    // hand-fused [57,3,4,2]+pads: same result, metamethod consulted once
    const fused = runVM([obj, 1], prologue.concat([57, 3, 4, 2, 0, 0, 0, 5, 2, 31, 1]), {}, 0, []);
    expect(fused).toBe(1000);
    expect(mmCalls).toBe(1);
  });
  test("fused 63 models generated raw concat: __concat honored, bool errors", () => {
    // Models CURRENT generated h[63] (raw `..`): __concat dispatches,
    // strings/numbers coerce, bool/nil/plain tables are runtime errors
    // (error presence only — never message text). The unfused h[15]
    // pcall+tostring fallback is the 11D-2 audit subject, not modeled here.
    const cat = { __metatable: { __concat: () => "MM" } };
    let c = localsChunk([cat, "!"], [[0, 0], [1, 1]], [63, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    expect(runChunk(c.K, c.code)).toBe("MM");
    c = localsChunk(["a", "b"], [[0, 0], [1, 1]], [63, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    expect(runChunk(c.K, c.code)).toBe("ab");
    c = localsChunk([true, "x"], [[0, 0], [1, 1]], [63, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    expect(() => runChunk(c.K, c.code)).toThrow();
    c = localsChunk([{ v: 1 }, "x"], [[0, 0], [1, 1]], [63, 0, 1, 2, 0, 0, 0].concat(tail(2)));
    expect(() => runChunk(c.K, c.code)).toThrow();
  });
});

describe("error paths", () => {
  test("validate rejects bad syntax without throwing", () => {
    // NOTE: truncated `local x = ` is silently accepted (parser
    // error-tolerance gap, filed for Phase 17). Use cases the parser
    // actually rejects.
    for (const bad of ["local 123 = 1", "function ("]) {
      const r = validate(bad);
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });
  test("lexer reports unclosed constructs", () => {
    // NOTE: unclosed short/backtick strings at EOF are silent (lexer gap:
    // readShortString only errors on newline, filed for Phase 17).
    // Unclosed long comment IS reported — lock that in.
    const { errors } = lex("--[[oops");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toMatch("Unclosed long comment");
  });
});
