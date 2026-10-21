const ENV_ROOT_EXTRAS = ["getgenv", "getfenv", "setfenv", "bit"];

/**
 * Self-contained Lua expression that returns a globals view for the decrypted
 * runtime. The direct snapshot is built from the current chunk's real globals;
 * candidate-only keys are copied into it when an environment is available.
 *
 * Roblox's `_G` is a shared DATA table without the standard library, and an
 * executor's `getgenv()` may be present but empty. The snapshot guarantees the
 * standard library and Roblox globals captured at load time remain reachable;
 * candidate-only keys (executor globals, lifted macro functions) are copied
 * into the snapshot without overwriting captured globals. The caller's
 * environment is never mutated, and the result is a plain table (no metatable
 * side effects for rawget or identity checks).
 *
 * The literal `_0pc(getfenv,0)` and `_0pc(_0ls,"return _G")` shapes are pinned
 * by regression tests (`tests/restricted-executor.test.js`).
 */
export function buildEnvRootExpr(globals: readonly string[]): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of [...globals, ...ENV_ROOT_EXTRAS]) {
    if (name === "_G" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  const snapshot = names.map((name) => `${name}=${name}`).join(",");
  return `(function() local _0d={${snapshot}} local _0ty=type if _0ty==nil then return _0d end local _0pc=pcall if _0pc==nil then return _0d end local _0r local _0ok,_0v=_0pc(getgenv) if _0ok and _0ty(_0v)=="table" then _0r=_0v end if not _0r then _0ok,_0v=_0pc(getfenv,0) if _0ok and _0ty(_0v)=="table" then _0r=_0v end end local _0ls=loadstring or load if not _0r and _0ty(_0ls)=="function" then _0ok,_0v=_0pc(_0ls,"return _G") if _0ok and _0ty(_0v)=="table" then _0r=_0v end end if not _0r and _0ty(_G)=="table" then _0r=_G end local _0n=next if _0r and _0ty(_0n)=="function" then local _0k,_0x local _0o _0o,_0k,_0x=_0pc(_0n,_0r) while _0o and _0k~=nil do if _0d[_0k]==nil then _0d[_0k]=_0x end _0o,_0k,_0x=_0pc(_0n,_0r,_0k) end end return _0d end)()`;
}
