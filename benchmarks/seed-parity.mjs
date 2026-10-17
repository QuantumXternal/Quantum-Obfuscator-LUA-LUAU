// Seed-parity benchmark: proves the CLI and the web/API path produce
// byte-identical output for the same input + seed.
//
//   node benchmarks/seed-parity.mjs
//
// Spawns a throwaway server on :3212 (NO_BROWSER=1) and, for every
// profile x seed, compares the SHA-256 of three independently produced
// artifacts:
//   cli   node dist/cli/obfuscate.js <file> --profile=P --seed=S -o out.lua
//   api1  POST /api/obfuscate { profile, seed }                 (legacy shape)
//   api2  POST /api/obfuscate { profile, seed, polymorphicSeed } (web UI shape)
//
// Exit code 0 = full parity, 1 = any mismatch (prints a per-row table).

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3212;
const BASE = `http://127.0.0.1:${PORT}`;
const SEEDS = [7, 42, 1234];
const PROFILES = ["BALANCED", "MAXIMUM"];

const SRC = [
  'local greeting = "hello"',
  "local t = {3, 1, 4, 1, 5, 9, 2, 6}",
  "local function add(a, b) return a + b end",
  'local out = greeting .. " " .. tostring(add(t[1], t[6]))',
  "print(out, #t)",
  "",
].join("\n");

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "return 1" }),
      });
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`server did not come up on :${PORT}`);
}

async function apiObfuscate(options) {
  const res = await fetch(`${BASE}/api/obfuscate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: SRC, options }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (typeof body.output !== "string") throw new Error("no output in API response");
  return body.output;
}

const tmp = mkdtempSync(join(tmpdir(), "seed-parity-"));
const srcFile = join(tmp, "input.lua");
writeFileSync(srcFile, SRC, "utf-8");

const server = spawn(process.execPath, [join(ROOT, "dist", "server.js")], {
  cwd: ROOT,
  stdio: "ignore",
  env: { ...process.env, PORT: String(PORT), NO_BROWSER: "1" },
});

let failures = 0;
try {
  await waitForServer();
  console.log(`seed-parity: server up on :${PORT}, fixtures in ${tmp}\n`);
  console.log(["profile", "seed", "cli", "api(seed)", "api(seed+poly)", "ok"].join("\t"));
  for (const profile of PROFILES) {
    for (const seed of SEEDS) {
      const outFile = join(tmp, `${profile}-${seed}.lua`);
      const cli = spawnSync(
        process.execPath,
        [join(ROOT, "dist", "cli", "obfuscate.js"), srcFile, `--profile=${profile}`, `--seed=${seed}`, "-o", outFile],
        { cwd: ROOT, encoding: "utf-8" }
      );
      if (cli.status !== 0) throw new Error(`CLI failed for ${profile}/${seed}: ${cli.stderr}`);
      const cliHash = sha(readFileSync(outFile, "utf-8"));
      const apiSeedHash = sha(await apiObfuscate({ profile, seed }));
      const apiSeedPolyHash = sha(await apiObfuscate({ profile, seed, polymorphicSeed: seed }));
      const ok = cliHash === apiSeedHash && apiSeedHash === apiSeedPolyHash;
      if (!ok) failures++;
      console.log([profile, seed, cliHash, apiSeedHash, apiSeedPolyHash, ok ? "OK" : "MISMATCH"].join("\t"));
    }
  }
} finally {
  server.kill();
}

if (failures > 0) {
  console.error(`\nSEED-PARITY FAILED: ${failures} of ${PROFILES.length * SEEDS.length} rows mismatched`);
  process.exit(1);
}
console.log(`\nSEED-PARITY OK (${PROFILES.length * SEEDS.length}/${PROFILES.length * SEEDS.length})`);
