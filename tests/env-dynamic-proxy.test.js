// Dynamic environment proxy: an empty getgenv() must not hide globals that
// only exist in another real environment. The sentinel global is deliberately
// absent from every static fallback list, proving runtime resolution rather
// than an allowlist. Script writes must remain sandboxed.
import { existsSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const SHIM = join(ROOT, "tests", "helpers", "lua54-compat.lua");
const HAS_LUAU = existsSync(LUAU);
const HAS_PUC = existsSync(LUA54) && existsSync(SHIM);
const t = HAS_LUAU || HAS_PUC ? test : test.skip;

const { runObfuscatePipeline } = await import("../dist/engine/obfuscatePipeline.js");

const TMP = mkdtempSync(join(tmpdir(), "env-dynamic-proxy-"));
const SHIMTEXT = HAS_PUC ? readFileSync(SHIM, "utf8") : "";
const quiet = (fn) => {
  const o = console.log;
  console.log = () => {};
  try { return fn(); } finally { console.log = o; }
};

const PRELUDE = `
_G = {
  getgenv = function() return {} end,
  game = { GetService = function(_, name) return { Name = name } end },
  workspace = { Name = "Workspace" },
  Instance = function(class) return { ClassName = class } end,
  isfolder = function(name) return name == "JOKER" end,
  makefolder = function() end,
  UserSettings = function() return {} end,
  Drawing = { new = function() return {} end },
  quantum_future_api = { ping = function() return "future-ok" end },
}
getgenv = _G.getgenv
getfenv = nil
`;

const SRC = `
local folder = isfolder("JOKER")
makefolder("JOKER")
local settings = UserSettings()
local drawing = Drawing.new("Line")
local future = quantum_future_api.ping()
local gameName = game:GetService("Players").Name
print(folder, type(makefolder), type(settings), type(drawing), future, gameName,
  type(game), type(workspace), type(Instance), type(table.pack))
probe_global = "local-only"
print(getgenv().probe_global == nil, probe_global)
`;

const EXPECTED = [
  "true\tfunction\ttable\ttable\tfuture-ok\tPlayers\ttable\ttable\tfunction\tfunction",
  "true\tlocal-only",
].join("\n");

const BASE = {
  renameLocals: false,
  preserveGlobals: true,
  encodeStrings: false,
  scramble: false,
  oneLine: false,
  seed: 4242,
  polymorphicSeed: 4242,
};

function run(exe, artifact, shim) {
  const f = join(TMP, `art-${process.pid}-${Math.floor(Math.random() * 1e9)}.lua`);
  writeFileSync(f, (shim ? SHIMTEXT + "\n" : "") + PRELUDE + artifact, "utf8");
  const r = spawnSync(exe, [f], { encoding: "utf8", timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  rmSync(f, { force: true });
  return {
    status: r.status,
    stdout: (r.stdout || "").replace(/\r\n/g, "\n").trim(),
    stderr: (r.stderr || "").replace(/\r\n/g, "\n").slice(0, 1200),
  };
}

for (const [vmType, vmLevel] of [
  ["register", "normal"],
  ["register", "max"],
  ["stack", "normal"],
  ["stack", "max"],
]) {
  t(`${vmType}/${vmLevel}: dynamic proxy resolves unknown globals and sandboxes writes`, () => {
    const artifact = quiet(() => runObfuscatePipeline(SRC, { ...BASE, vmType, vmLevel }));
    if (HAS_LUAU) {
      expect({ exe: "luau", ...run(LUAU, artifact, false) }).toEqual({
        exe: "luau", status: 0, stdout: EXPECTED, stderr: "",
      });
    }
    if (HAS_PUC) {
      expect({ exe: "puc", ...run(LUA54, artifact, true) }).toEqual({
        exe: "puc", status: 0, stdout: EXPECTED, stderr: "",
      });
    }
  }, 180000);
}
