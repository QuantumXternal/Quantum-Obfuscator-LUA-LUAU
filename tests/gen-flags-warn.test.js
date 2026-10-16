// Generator weakening-flag warnings (operational safety, not security logic).
// NO_SEC/NO_CIPHER are generation-time switches that silently reduce output
// protections. They must announce themselves; default (unset) stays silent.
import { lex } from "../dist/lexer/Lexer.js";
import { parse } from "../dist/parser/Parser.js";
import { regCompile } from "../dist/vm/RegCompiler.js";
import { generateRegVM } from "../dist/vm/reg-vm-gen.js";

function genWithEnv(env, seed) {
  const chunk = regCompile(parse(lex("local x = 1 return x").tokens));
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = () => {};
  const warns = [];
  console.warn = (m) => { warns.push(String(m)); };
  const savedNoSec = process.env.NO_SEC;
  const savedNoCipher = process.env.NO_CIPHER;
  try {
    if (env.NO_SEC !== undefined) process.env.NO_SEC = env.NO_SEC;
    else delete process.env.NO_SEC;
    if (env.NO_CIPHER !== undefined) process.env.NO_CIPHER = env.NO_CIPHER;
    else delete process.env.NO_CIPHER;
    generateRegVM(JSON.parse(JSON.stringify(chunk)), { level: "normal", polymorphicSeed: seed });
  } finally {
    if (savedNoSec !== undefined) process.env.NO_SEC = savedNoSec;
    else delete process.env.NO_SEC;
    if (savedNoCipher !== undefined) process.env.NO_CIPHER = savedNoCipher;
    else delete process.env.NO_CIPHER;
    console.log = origLog;
    console.warn = origWarn;
  }
  return warns;
}

test("no warning by default", () => {
  expect(genWithEnv({}, 7)).toEqual([]);
});

test("NO_SEC=1 warns", () => {
  const warns = genWithEnv({ NO_SEC: "1" }, 7);
  expect(warns.length).toBe(1);
  expect(warns[0]).toContain("NO_SEC");
});

test("NO_CIPHER=1 warns", () => {
  const warns = genWithEnv({ NO_CIPHER: "1" }, 7);
  expect(warns.length).toBe(1);
  expect(warns[0]).toContain("NO_CIPHER");
});
