// CLI exit-code regression: lex/parse errors must fail non-zero; valid input
// stays exit 0 with byte-identical stdout. Self-contained: inputs live in
// os.tmpdir, CLIs run from this repo's dist. Fails fast with diagnostics.
// Usage: node benchmarks/cli-exit-codes.mjs
import { execFileSync } from "child_process";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { createHash } from "crypto";
const __dirname = dirname(fileURLToPath(import.meta.url));

const DIST = join(__dirname, "..", "dist", "cli");
const TMP = join(tmpdir(), "cli-exit-codes");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const INPUTS = {
  valid: "local ok = 1 print(ok)",
  lexbad: "local x = $",
  parse1: "local x =",
  parse2: "function foo(",
  parse3: "local y = 1 + ",
  parse4: "if true then print(1)",
  parse5: "local z = (1 + 2",
};
const files = {};
for (const [k, v] of Object.entries(INPUTS)) {
  files[k] = join(TMP, `${k}.lua`);
  writeFileSync(files[k], v);
}
files.missing = join(TMP, "does-not-exist.lua");

function run(cli, args) {
  try {
    const stdout = execFileSync("node", [join(DIST, cli), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    return { code: e.status ?? 1, stdout: String(e.stdout ?? ""), stderr: String(e.stderr ?? "") };
  }
}
const sha = (s) => createHash("sha256").update(s).digest("hex");
let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? "ok" : "FAIL"} ${name}${detail ? " " + detail : ""}`);
  if (!cond) failures++;
}

// lex.js: lex errors fail; parse-only breakage is NOT its job (exit 0 pinned).
{
  const bad = run("lex.js", [files.lexbad]);
  check("lex/lexbad exit=1", bad.code === 1, `got=${bad.code}`);
  check("lex/lexbad stderr", /Fehler/.test(bad.stderr));
  for (const k of ["parse1", "parse2", "parse3", "parse4", "parse5"]) {
    const r = run("lex.js", [files[k]]);
    check(`lex/${k} exit=0 (lex-clean, parse unchecked)`, r.code === 0, `got=${r.code}`);
  }
  const v1 = run("lex.js", [files.valid]);
  const v2 = run("lex.js", [files.valid]);
  check("lex/valid exit=0", v1.code === 0);
  check("lex/valid stdout stable", v1.stdout === v2.stdout, `sha=${sha(v1.stdout).slice(0, 12)}`);
  const m = run("lex.js", [files.missing]);
  check("lex/missing non-zero", m.code !== 0, `got=${m.code}`);
}
// parse.js: lex AND parse errors fail; valid output stable.
{
  const bad = run("parse.js", [files.lexbad]);
  check("parse/lexbad exit=1", bad.code === 1, `got=${bad.code}`);
  for (const k of ["parse1", "parse2", "parse3", "parse4", "parse5"]) {
    const r1 = run("parse.js", [files[k]]);
    const r2 = run("parse.js", [files[k]]);
    check(`parse/${k} exit=1`, r1.code === 1, `got=${r1.code}`);
    check(`parse/${k} stderr deterministic`, r1.stderr === r2.stderr && r1.stderr.length > 0);
    check(`parse/${k} no stdout artifact`, r1.stdout.length === 0, `stdout-chars=${r1.stdout.length}`);
  }
  const v1 = run("parse.js", [files.valid]);
  const v2 = run("parse.js", [files.valid]);
  check("parse/valid exit=0", v1.code === 0);
  check("parse/valid stdout stable", v1.stdout === v2.stdout, `sha=${sha(v1.stdout).slice(0, 12)}`);
  const m = run("parse.js", [files.missing]);
  check("parse/missing non-zero", m.code !== 0, `got=${m.code}`);
}
// obfuscate.js + reg-vm-obfuscate.js: pipeline errors fail; valid stable.
for (const cli of ["obfuscate.js", "reg-vm-obfuscate.js"]) {
  const tag = cli === "obfuscate.js" ? "obf" : "reg";
  const bad = run(cli, [files.lexbad]);
  check(`${tag}/lexbad exit=1`, bad.code === 1, `got=${bad.code}`);
  check(`${tag}/lexbad stderr`, /Lexer/i.test(bad.stderr));
  for (const k of ["parse1", "parse2", "parse3", "parse4", "parse5"]) {
    const r1 = run(cli, [files[k]]);
    const r2 = run(cli, [files[k]]);
    check(`${tag}/${k} exit=1`, r1.code === 1, `got=${r1.code}`);
    check(`${tag}/${k} stderr`, /Parse/i.test(r1.stderr));
    check(`${tag}/${k} stderr deterministic`, r1.stderr === r2.stderr && r1.stderr.length > 0);
    check(`${tag}/${k} no stdout artifact`, r1.stdout.length === 0, `stdout-chars=${r1.stdout.length}`);
  }
  const v1 = run(cli, [files.valid]);
  const v2 = run(cli, [files.valid]);
  check(`${tag}/valid exit=0`, v1.code === 0);
  if (cli === "obfuscate.js") {
    check(`${tag}/valid stdout stable`, v1.stdout === v2.stdout, `sha=${sha(v1.stdout).slice(0, 12)}`);
  } else {
    check(`${tag}/valid output non-empty`, v1.stdout.length > 10000 && v2.stdout.length > 10000);
  }
  const m = run(cli, [files.missing]);
  check(`${tag}/missing non-zero`, m.code !== 0, `got=${m.code}`);
}
rmSync(TMP, { recursive: true, force: true });
// Truncation-guard false-positive gate: no valid corpus fixture may end with
// a continuation-demanding token. Any flag here is a heuristic failure.
{
  const { lex } = await import("../dist/lexer/Lexer.js");
  const { checkTruncatedInput } = await import("../dist/engine/obfuscatePipeline.js");
  const { readdirSync, readFileSync } = await import("fs");
  const dir = join(__dirname, "fixtures");
  let flagged = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".lua"))) {
    const { tokens } = lex(readFileSync(join(dir, f), "utf8"));
    if (checkTruncatedInput(tokens)) flagged.push(f);
  }
  check(`corpus false-positive gate (${readdirSync(dir).filter((x) => x.endsWith(".lua")).length} fixtures)`, flagged.length === 0, flagged.length ? `flagged: ${flagged.join(",")}` : "");
}
if (failures) {
  console.error(`CLI-EXIT FAILURES: ${failures}`);
  process.exit(1);
}
console.log("CLI-EXIT OK");
