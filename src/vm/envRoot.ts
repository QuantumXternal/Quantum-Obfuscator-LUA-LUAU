const ENV_ROOT_EXTRAS = ["getgenv", "getfenv", "setfenv", "bit"];

/**
 * Self-contained Lua expression that returns a dynamic globals view for the
 * decrypted runtime. The proxy resolves every missing key from all available
 * real environments in order:
 *   1. getgenv()          - executor global environment
 *   2. getfenv(0)         - vanilla Roblox / standalone Lua global env
 *   3. _ENV               - Lua 5.2+ chunk environment
 *   4. loadstring("return _G") - separate chunk, immune to local `_G` shadowing
 *   5. _G                 - final candidate
 *
 * Every candidate call and source read is pcall-guarded, so a present-but-empty
 * getgenv(), a restricted getfenv(), or a throwing environment proxy cannot
 * hide the other sources or crash the runtime. The supplied globals are only a
 * last-resort fallback snapshot for hosts where no usable environment
 * reflection exists; they are not an allowlist. Writes stay in the sandbox
 * backing table and never mutate the caller's environment.
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
  return `(function() local _0d={${snapshot}} local _0ty=type local _0pc=pcall local _0sm=setmetatable local _0rs=rawset if _0ty==nil or _0pc==nil or _0sm==nil or _0rs==nil then return _0d end local _0s={} local _0seen={} local _0add=function(_0x) if _0ty(_0x)=="table" and not _0seen[_0x] then _0seen[_0x]=true _0s[#_0s+1]=_0x end end local _0ok,_0v=_0pc(getgenv) if _0ok then _0add(_0v) end _0ok,_0v=_0pc(getfenv,0) if _0ok then _0add(_0v) end _0ok,_0v=_0pc(function() return _ENV end) if _0ok then _0add(_0v) end local _0ls=loadstring or load if _0ty(_0ls)=="function" then local _0ok2,_0v2=_0pc(_0ls,"return _G") if _0ok2 and _0ty(_0v2)=="function" then local _0ok3,_0v3=_0pc(_0v2) if _0ok3 then _0add(_0v3) end end end if _0ty(_G)=="table" then _0add(_G) end local _0b={} local _0mt={} _0mt["__index"]=function(_,_0k) for _0i=1,#_0s do local _0ok4,_0v4=_0pc(function() return _0s[_0i][_0k] end) if _0ok4 and _0v4~=nil then return _0v4 end end return _0d[_0k] end _0mt["__newindex"]=function(_,_0k,_0v) _0rs(_0b,_0k,_0v) end local _0ok5,_0r=_0pc(_0sm,_0b,_0mt) if _0ok5 then return _0r end return _0d end)()`;
}
