// Telemetry-gating contract: routine generation progress logs emit ONLY
// under QUANTUM_TELEMETRY=1 (library-quiet by default). Warnings, errors,
// fallback notices, and the DUMP_RAW file-location line always stay loud.
// Covers both generators (stack generateVM + reg generateRegVM).
import { tmpdir } from "os";

const { lex } = await import("../dist/lexer/Lexer.js");
const { parse } = await import("../dist/parser/Parser.js");
const { obfuscate } = await import("../dist/obfuscator/index.js");
const { compile } = await import("../dist/vm/Compiler.js");
const { generateVM } = await import("../dist/vm/vm-gen.js");
const { regCompile } = await import("../dist/vm/RegCompiler.js");
const { generateRegVM } = await import("../dist/vm/reg-vm-gen.js");

function capture(fn) {
  const logs = [];
  const warns = [];
  const errs = [];
  const olog = console.log, owarn = console.warn, oerr = console.error;
  console.log = (...a) => { logs.push(a.join(" ")); };
  console.warn = (...a) => { warns.push(a.join(" ")); };
  console.error = (...a) => { errs.push(a.join(" ")); };
  try {
    const out = fn();
    return { out, logs, warns, errs };
  } finally {
    console.log = olog;
    console.warn = owarn;
    console.error = oerr;
  }
}
function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}
function genStackMax() {
  const src = "local x = 1 + 2 print(x)";
  const base = compile(obfuscate(parse(lex(src).tokens), { renameLocals: false, preserveGlobals: true }));
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  return generateVM(cl(base), { level: "max", polymorphicSeed: 1234, executorGlobals: false });
}
function genRegNormal() {
  const src = "local x = 1 + 2 print(x)";
  const base = regCompile(parse(lex(src).tokens));
  const cl = (c) => ({ ...c, K: [...c.K], code: [...c.code], protos: (c.protos || []).map(cl) });
  return generateRegVM(cl(base), { level: "normal", polymorphicSeed: 1234 });
}
const ROUTINE = [/\[cipher\]/, /\[nested\]/, /\[stub\]/, /\[RegVM\] (Fused|CFF|Dead|Dispatch|Blob)/, /\[§69\] String pools/, /\[telemetry:/];

test("default: routine progress silent on both generators", () => {
  const s = withEnv({ QUANTUM_TELEMETRY: undefined }, () => capture(genStackMax));
  const r = withEnv({ QUANTUM_TELEMETRY: undefined }, () => capture(genRegNormal));
  for (const re of ROUTINE) {
    expect(s.logs.some((l) => re.test(l))).toBe(false);
    expect(r.logs.some((l) => re.test(l))).toBe(false);
  }
  expect(typeof s.out).toBe("string");
  expect(typeof r.out).toBe("string");
});

test("QUANTUM_TELEMETRY=1: routine progress visible on both generators", () => {
  const s = withEnv({ QUANTUM_TELEMETRY: "1" }, () => capture(genStackMax));
  const r = withEnv({ QUANTUM_TELEMETRY: "1" }, () => capture(genRegNormal));
  expect(s.logs.some((l) => l.includes("[nested]"))).toBe(true);
  expect(s.logs.some((l) => l.includes("[stub]"))).toBe(true);
  expect(r.logs.some((l) => l.includes("[RegVM] Blob:"))).toBe(true);
});

test("warnings stay loud without the flag (NO_SEC=1)", () => {
  const r = withEnv({ QUANTUM_TELEMETRY: undefined, NO_SEC: "1" }, () => capture(genRegNormal));
  expect(r.warns.some((w) => w.includes("NO_SEC"))).toBe(true);
  expect(typeof r.out).toBe("string");
});

test("telemetry flag changes no artifact bytes (output identical)", () => {
  const quiet = withEnv({ QUANTUM_TELEMETRY: undefined }, () => capture(genStackMax));
  const loud = withEnv({ QUANTUM_TELEMETRY: "1" }, () => capture(genStackMax));
  expect(loud.out).toBe(quiet.out);
  const quietR = withEnv({ QUANTUM_TELEMETRY: undefined }, () => capture(genRegNormal));
  const loudR = withEnv({ QUANTUM_TELEMETRY: "1" }, () => capture(genRegNormal));
  expect(loudR.out).toBe(quietR.out);
});
