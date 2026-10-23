import { existsSync, mkdtempSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { hoistDoBlockParent } from "../dist/engine/iifeRefactor.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LUA54 = join(ROOT, "vendor", "runtime", "lua-5.4.8", "lua54.exe");
const LUAU = join(ROOT, "vendor", "runtime", "luau-0.742", "luau.exe");
const TMP = mkdtempSync(join(tmpdir(), "quantum-hoist-"));

const BREAK_SOURCE = `local Instance = { new = function() return {} end }
local count = 0
for i = 1, 5 do
  do
    local f = Instance.new("Frame")
    count = count + 1
    if count == 2 then break end
  end
end
print(count)
`;

function run(runtime, extension, code) {
  const path = join(TMP, `hoist-${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`);
  writeFileSync(path, code);
  const result = spawnSync(runtime, [path], { encoding: "utf8", timeout: 60000 });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

const luaTest = existsSync(LUA54) ? test : test.skip;
const luauTest = existsSync(LUAU) ? test : test.skip;

luaTest("hoisted do+break preserves loop control on PUC-Lua 5.4", () => {
  const hoisted = hoistDoBlockParent(BREAK_SOURCE, { line: 4 });
  expect(hoisted.hoisted).toBe(1);
  expect(run(LUA54, "lua", hoisted.code)).toBe("2");
});

luauTest("hoisted do+break preserves loop control on Luau", () => {
  const hoisted = hoistDoBlockParent(BREAK_SOURCE, { line: 4 });
  expect(hoisted.hoisted).toBe(1);
  expect(run(LUAU, "luau", hoisted.code)).toBe("2");
});
