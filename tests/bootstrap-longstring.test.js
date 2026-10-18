// bootstrap-template long-bracket embedding regression.
// Defect: longStringLevel() only checked whether the blob CONTAINED
// `]` + `=`*level + `]`, ignoring that a blob ENDING in `]` + `=`*level
// overlaps with the closer: `[[` + blob(`...fe]`) + `]]` + `)` closes the
// literal one char early on the blob's own `]`, stranding an extra `]`
// where `)` was expected ("')' expected near ']'"). Seed 31337 stack
// artifact (post-(d) reg sweep) hit it. The check must also exclude the
// tail run. Parse-only assertions: load() compiles without executing.
import { existsSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const HAS_RT = existsSync(LUA54);
const t = HAS_RT ? test : test.skip;

const { generateBootstrap } = await import("../dist/vm/bootstrap-template.js");

const TMP = mkdtempSync(join(tmpdir(), "lsembed-"));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function build(blob, seed) {
  const invSbox = Array.from({ length: 256 }, (_, i) => (i ^ 0x5a) & 0xff);
  return generateBootstrap({
    vmBlob: blob,
    vmOrigLen: blob.length,
    compLen: blob.length,
    xorKey: [17, 34, 51, 68, 85],
    invSbox,
    checksum: 12345,
    rng: mulberry32(seed),
  });
}

function loads(artifact) {
  const artPath = join(TMP, `art-${Math.floor(Math.random() * 1e9)}.lua`);
  writeFileSync(artPath, artifact);
  const probe = join(TMP, "probe.lua");
  writeFileSync(
    probe,
    "local f=assert(io.open(arg[1],'rb')) local s=f:read('a') f:close()\n" +
      "local fn,err=load(s,'@art') print(fn and 'LOAD_OK' or ('LOAD_FAIL: '..tostring(err)))"
  );
  const r = spawnSync(LUA54, [probe, artPath], { timeout: 60000, encoding: "utf8" });
  return (r.stdout || "").trim();
}

const CASES = [
  ["tail-]", "HELLO]"],
  ["tail-] with interior ]]", "A]B]]C]"],
  ["tail-] with interior ]=]", "X]=]Y]"],
  ["plain", "PLAINBLOB"],
  // Adversarial multi-piece cases: closer-like runs exactly at / across the
  // 9600-byte piece boundary, so the splitter's tail-merge and the per-piece
  // level escalation have to disagree correctly.
  ["piece-boundary tail-]===", "A".repeat(9596) + "]===" + "B".repeat(2000)],
  ["closer split across piece boundary", "A".repeat(9598) + "]===" + "B".repeat(2000)],
  ["piece exactly 9600 ending in ]", "A".repeat(9599) + "]"],
  ["piece exactly 9600 ending in ]===", "A".repeat(9596) + "]==="],
  ["many interior ]=] runs, tail ]", "C]=]".repeat(2500) + "]"],
];

for (const [name, blob] of CASES) {
  t(`bootstrap long-string embedding loads on PUC-Lua: ${name}`, () => {
    for (const seed of [1, 1234, 31337]) {
      const art = build(blob, seed);
      expect(loads(art)).toBe("LOAD_OK");
    }
  });
}

t("plain blobs keep level-0 [[ ]] embedding (no over-escalation)", () => {
  const art = build("PLAINBLOB", 1234);
  expect(art.includes("([[PLAINBLOB]])")).toBe(true);
});

t("tail-] blob escalates beyond level 0", () => {
  const art = build("HELLO]", 1234);
  expect(art.includes("([[HELLO]]])")).toBe(false);
  expect(art.includes("[=[HELLO]]=]")).toBe(true);
});
