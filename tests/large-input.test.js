// Large-input hardening: output line bound, register domain adaptation,
// input-limit parsing, StringEncoder budget, and the worker runner
// (ok / remote error / timeout / OOM / crash) with an injected factory plus
// one real-worker roundtrip.
import { MAX_OUTPUT_LINE_BYTES, splitLongLiteral, joinBounded } from "../dist/vm/limits.js";
import { adaptRkOffset, maxProtoDomain, RK_OPERAND_MAX } from "../dist/vm/reg-offset.js";
import { DEFAULT_MAX_INPUT_BYTES, parseByteSize, envInt } from "../dist/engine/inputLimits.js";
import {
  runObfuscationInWorker,
  RunnerFailure,
  RemoteError,
} from "../dist/obfuscationRunner.js";
import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { encodeStrings } from "../dist/obfuscator/StringEncoder.js";
import { applyMBA, MBA_TABLE_FIELD_BUDGET } from "../dist/obfuscator/MBAEncoder.js";

describe("limits: output line bound", () => {
  test("short literals are returned unsplit (byte-identical fast path)", () => {
    expect(splitLongLiteral("abc")).toEqual(["abc"]);
    const exactly = "y".repeat(MAX_OUTPUT_LINE_BYTES);
    expect(splitLongLiteral(exactly)).toEqual([exactly]);
  });

  test("long literals split into <= bound pieces and rejoin losslessly", () => {
    const big = "x".repeat(MAX_OUTPUT_LINE_BYTES * 2 + 5);
    const pieces = splitLongLiteral(big);
    expect(pieces.length).toBe(3);
    expect(pieces.map((p) => p.length)).toEqual([MAX_OUTPUT_LINE_BYTES, MAX_OUTPUT_LINE_BYTES, 5]);
    expect(pieces.join("")).toBe(big);
  });

  test("split/rejoin is content-agnostic (long-bracket and quote hazards)", () => {
    const hazard = ("]=]" + "]".repeat(7) + '"' + "\\" + "\n").repeat(20000);
    expect(splitLongLiteral(hazard).join("")).toBe(hazard);
  });

  test("joinBounded keeps joined lines under the bound and loses nothing", () => {
    // joinBounded only MERGES short lines; inputs are expected to be bounded
    // already (emitters chunk literals and wrap comma lists). Single
    // over-bound inputs pass through untouched — asserted below.
    const lines = Array.from({ length: 40 }, (_, i) => "l" + i + "-" + "z".repeat(4000));
    const out = joinBounded(lines);
    for (const line of out) expect(line.length).toBeLessThanOrEqual(MAX_OUTPUT_LINE_BYTES);
    expect(out.join("\n").length).toBe(lines.join(" ").length);
    const oversize = ["l0-" + "z".repeat(MAX_OUTPUT_LINE_BYTES + 50)];
    expect(joinBounded(oversize)).toEqual(oversize);
  });

  test("joinBounded equals the legacy flatten while under the bound", () => {
    const lines = ["local a = 1", "local b = 2", "print(a + b)"];
    expect(joinBounded(lines).join("\n")).toBe(lines.join(" "));
  });
});

describe("reg-offset: adaptive i16 domain", () => {
  const chunk = (K, maxRegs, protos = []) => ({ K: Array(K).fill(0), code: [0], maxRegs, protos });

  test("maxProtoDomain walks nested protos", () => {
    const c = chunk(10, 5, [chunk(50, 7, [chunk(300, 2)])]);
    expect(maxProtoDomain(c)).toEqual({ maxK: 300, maxRegs: 7 });
  });

  test("seeded offset kept when it already covers the domain", () => {
    expect(adaptRkOffset(chunk(100, 50), 2049)).toEqual({ rkOffset: 2049, widened: false });
    // maxRegs == base is allowed (registers only need indices < offset).
    expect(adaptRkOffset(chunk(10, 2049), 2049)).toEqual({ rkOffset: 2049, widened: false });
  });

  test("offset widens to the next odd value above the domain", () => {
    expect(adaptRkOffset(chunk(3000, 10), 2049)).toEqual({ rkOffset: 3001, widened: true });
    expect(adaptRkOffset(chunk(3000, 3000), 2049)).toEqual({ rkOffset: 3001, widened: true });
  });

  test("domain beyond the i16 operand limit fails with an actionable error", () => {
    expect(() => adaptRkOffset(chunk(RK_OPERAND_MAX, 10), 2049)).toThrow(/i16 limit/);
  });
});

describe("input limits", () => {
  test("parseByteSize accepts bytes/kb/mb forms", () => {
    expect(parseByteSize("262144")).toBe(262144);
    expect(parseByteSize("256kb")).toBe(256 * 1024);
    expect(parseByteSize("1.5mb")).toBe(Math.floor(1.5 * 1024 * 1024));
    expect(parseByteSize(" 2 MB ")).toBe(2 * 1024 * 1024);
    expect(parseByteSize("abc")).toBeNull();
    expect(parseByteSize("0")).toBeNull();
  });

  test("envInt falls back on absent/invalid values", () => {
    expect(envInt("QUANTUM_DEFINITELY_UNSET_ENV_VAR", 7)).toBe(7);
  });

  test("default input cap is 20 MB", () => {
    expect(DEFAULT_MAX_INPUT_BYTES).toBe(20 * 1024 * 1024);
  });
});

function countDecoderCalls(node, n = { c: 0 }) {
  if (!node || typeof node !== "object") return n.c;
  if (node.type === "CallExpression" && node.callee?.type === "Identifier" && String(node.callee.name).startsWith("_quantumDec")) {
    n.c++;
  }
  for (const k of Object.keys(node)) {
    if (k === "loc") continue;
    const v = node[k];
    if (Array.isArray(v)) for (const item of v) countDecoderCalls(item, n);
    else if (v && typeof v === "object") countDecoderCalls(v, n);
  }
  return n.c;
}

function findDecoderCall(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "CallExpression" && node.callee?.type === "Identifier" && String(node.callee.name).startsWith("_quantumDec")) {
    return node;
  }
  for (const k of Object.keys(node)) {
    if (k === "loc") continue;
    const v = node[k];
    if (Array.isArray(v)) {
      for (const item of v) {
        const hit = findDecoderCall(item);
        if (hit) return hit;
      }
    } else if (v && typeof v === "object") {
      const hit = findDecoderCall(v);
      if (hit) return hit;
    }
  }
  return null;
}

function findNodeByType(node, type) {
  if (!node || typeof node !== "object") return null;
  if (node.type === type) return node;
  for (const k of Object.keys(node)) {
    if (k === "loc") continue;
    const v = node[k];
    if (Array.isArray(v)) {
      for (const item of v) {
        const hit = findNodeByType(item, type);
        if (hit) return hit;
      }
    } else if (v && typeof v === "object") {
      const hit = findNodeByType(v, type);
      if (hit) return hit;
    }
  }
  return null;
}

describe("StringEncoder: large-input budget", () => {
  test("strings longer than maxStringLength stay plain; short strings encode", () => {
    const long = "x".repeat(100);
    const src = `local short = "abc"\nlocal long = "${long}"\n`;
    const ast = encodeStrings(parse(lex(src).tokens), { seed: 42 });
    expect(countDecoderCalls(ast)).toBe(1);
    expect(JSON.stringify(ast).includes(long)).toBe(true);
  });

  test("maxTotalBytes stops encoding once exhausted", () => {
    const src = `local a = "aaa"\nlocal b = "bbb"\n`;
    const budgeted = encodeStrings(parse(lex(src).tokens), { seed: 42, maxTotalBytes: 4 });
    expect(countDecoderCalls(budgeted)).toBe(1);
    const unbudgeted = encodeStrings(parse(lex(src).tokens), { seed: 42 });
    expect(countDecoderCalls(unbudgeted)).toBe(2);
  });

  test("encoded short strings roundtrip through the emitted byte table", () => {
    const src = `local s = "abc"\n`;
    const ast = encodeStrings(parse(lex(src).tokens), { seed: 42 });
    const call = findDecoderCall(ast);
    expect(call).not.toBeNull();
    const bytes = call.args[0].fields.map((f) => Number(f.value.value));
    const key = Number(call.args[1].value);
    const text = String.fromCharCode(...bytes.map((b) => b ^ key));
    expect(text).toBe("abc");
  });
});

describe("MBA: large-table field budget", () => {
  const numbers = (n) => Array.from({ length: n }, (_, i) => String(i + 1)).join(", ");

  test(`tables with more than ${MBA_TABLE_FIELD_BUDGET} fields keep plain numbers`, () => {
    const count = MBA_TABLE_FIELD_BUDGET + 10;
    const ast = parse(lex(`local t = {${numbers(count)}}`).tokens);
    const out = applyMBA(ast, { enabled: true, seed: 7 });
    const table = findNodeByType(out, "TableConstructor");
    expect(table).toBeTruthy();
    expect(table.fields.length).toBe(count);
    for (const f of table.fields) expect(f.value.type).toBe("NumberLiteral");
  });

  test("functions nested in large tables are still fully transformed", () => {
    const ast = parse(lex(`local t = {f = function() local x = 5 return x end, ${numbers(MBA_TABLE_FIELD_BUDGET + 10)}}`).tokens);
    const out = applyMBA(ast, { enabled: true, seed: 7 });
    const table = findNodeByType(out, "TableConstructor");
    expect(table.fields[0].value.type).toBe("FunctionExpression");
    const inner = findNodeByType(table.fields[0].value, "LocalStatement");
    expect(inner).toBeTruthy();
    expect(inner.values[0].type).toBe("BinaryExpression");
    expect(table.fields[1].value.type).toBe("NumberLiteral");
  });

  test("small tables still expand numbers as before", () => {
    const ast = parse(lex("local t = {1, 2, 3}").tokens);
    const out = applyMBA(ast, { enabled: true, seed: 7 });
    const table = findNodeByType(out, "TableConstructor");
    for (const f of table.fields) expect(f.value.type).toBe("BinaryExpression");
  });

  test("return values are transformed via values (not args)", () => {
    const ast = parse(lex("local function f() return 5 end\n").tokens);
    const out = applyMBA(ast, { enabled: true, seed: 7 });
    const fn = findNodeByType(out, "LocalFunctionStatement");
    expect(fn).toBeTruthy();
    const ret = findNodeByType(fn, "ReturnStatement");
    expect(ret).toBeTruthy();
    expect(ret.values[0].type).toBe("BinaryExpression");
  });
});

class FakeWorker {
  constructor() {
    this.handlers = {};
    this.terminated = false;
  }
  on(event, fn) {
    this.handlers[event] = fn;
    return this;
  }
  terminate() {
    this.terminated = true;
    return Promise.resolve(0);
  }
  emit(event, arg) {
    const fn = this.handlers[event];
    if (fn) fn(arg);
  }
}

function factoryEmitting(schedule) {
  const created = [];
  const createWorker = () => {
    const w = new FakeWorker();
    created.push(w);
    setImmediate(() => schedule(w));
    return w;
  };
  return { createWorker, created };
}

describe("obfuscation runner: worker lifecycle", () => {
  test("resolves with worker output on ok message", async () => {
    const { createWorker } = factoryEmitting((w) => w.emit("message", { ok: true, output: "OBFUSCATED" }));
    await expect(runObfuscationInWorker("code", {}, { createWorker, timeoutMs: 5000 })).resolves.toBe("OBFUSCATED");
  });

  test("pipeline errors keep name and details (RemoteError)", async () => {
    const { createWorker } = factoryEmitting((w) =>
      w.emit("message", { ok: false, error: { name: "PipelineLexError", message: "Lexer error", details: [{ message: "bad char" }] } }),
    );
    const err = await runObfuscationInWorker("code", {}, { createWorker, timeoutMs: 5000 }).catch((e) => e);
    expect(err).toBeInstanceOf(RemoteError);
    expect(err.name).toBe("PipelineLexError");
    expect(err.message).toBe("Lexer error");
    expect(err.details).toEqual([{ message: "bad char" }]);
  });

  test("timeout terminates the worker and rejects with kind=timeout", async () => {
    const created = [];
    const createWorker = () => {
      const w = new FakeWorker();
      created.push(w);
      return w;
    };
    const err = await runObfuscationInWorker("code", {}, { createWorker, timeoutMs: 30 }).catch((e) => e);
    expect(err).toBeInstanceOf(RunnerFailure);
    expect(err.kind).toBe("timeout");
    expect(created[0].terminated).toBe(true);
  });

  test("ERR_WORKER_OUT_OF_MEMORY maps to kind=oom", async () => {
    const { createWorker } = factoryEmitting((w) => {
      const e = new Error("Worker terminated due to reaching memory limit: JS heap out of memory");
      e.code = "ERR_WORKER_OUT_OF_MEMORY";
      w.emit("error", e);
    });
    const err = await runObfuscationInWorker("code", {}, { createWorker, timeoutMs: 5000 }).catch((e) => e);
    expect(err).toBeInstanceOf(RunnerFailure);
    expect(err.kind).toBe("oom");
  });

  test("early exit maps to kind=crash", async () => {
    const { createWorker } = factoryEmitting((w) => w.emit("exit", 1));
    const err = await runObfuscationInWorker("code", {}, { createWorker, timeoutMs: 5000 }).catch((e) => e);
    expect(err).toBeInstanceOf(RunnerFailure);
    expect(err.kind).toBe("crash");
  });

  test("late exit after successful message is ignored", async () => {
    const { createWorker } = factoryEmitting((w) => {
      w.emit("message", { ok: true, output: "DONE" });
      w.emit("exit", 0);
    });
    await expect(runObfuscationInWorker("code", {}, { createWorker, timeoutMs: 5000 })).resolves.toBe("DONE");
  });
});

describe("obfuscation runner: real worker", () => {
  test("roundtrip through server-worker.js (real thread, resource limits)", async () => {
    const out = await runObfuscationInWorker(
      "local x = 1 + 2\nprint(x)\n",
      { renameLocals: true, preserveGlobals: true, encodeStrings: false, scramble: false, oneLine: false, vmType: "none", vmLevel: "normal", target: "generic" },
      { timeoutMs: 60000 },
    );
    expect(typeof out).toBe("string");
    expect(out).toContain("print");
    expect(out.length).toBeGreaterThan(10);
  }, 120000);

  test("lexer errors travel intact from real worker", async () => {
    const err = await runObfuscationInWorker("local x = $", {}, { timeoutMs: 60000 }).catch((e) => e);
    expect(err.name).toBe("PipelineLexError");
    expect(err.details).toBeDefined();
  }, 120000);
});
