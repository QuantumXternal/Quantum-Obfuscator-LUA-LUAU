import { buildCoreShimLua } from "./coreShim.js";

/**
 * Self-contained Lua expression that returns a dynamic globals view for the
 * decrypted runtime. The proxy resolves every missing key from all available
 * real environments in order:
 *   1. getgenv()          - executor global environment
 *   2. getfenv(0)         - vanilla Roblox / standalone Lua global env
 *   3. _ENV               - Lua 5.2+ chunk environment
 *   4. _G                 - loadstring/load accessor, then the direct table
 *
 * There is no static name allowlist or fallback snapshot. Every candidate call
 * and source read is pcall-guarded, so a present-but-empty getgenv(), a
 * restricted getfenv(), or a throwing environment proxy cannot hide the other
 * sources or crash the runtime. Writes stay in the sandbox backing table and
 * never mutate the caller's environment.
 *
 * The root also installs a yield-safe task/wait shim before the proxy is
 * returned. Executors that strip task or wait cannot turn the source's
 * `task.wait` capture or `while wait() do` loops into nil-index crashes.
 * Missing task functions are coroutine-backed and missing waits degrade through
 * RunService.Heartbeat, a cooperative yield, or a safe immediate return.
 *
 * The literal `_0pc(getfenv,0)` and `_0pc(_0ls,"return _G")` shapes are pinned
 * by regression tests (`tests/restricted-executor.test.js`); the loadstring
 * accessor only resolves `_G`, it is not an allowlist source.
 */
export function buildEnvRootExpr(): string {
  return `(function()
    local _0ty=type local _0pc=pcall local _0sm=setmetatable local _0rs=rawset
    if _0ty==nil or _0pc==nil or _0sm==nil or _0rs==nil then
      local _0b={}
      local _0e=_ENV or _G
      if _0ty~=nil and _0ty(_0e)=="table" and _0ty(next)=="function" then
        local _0k,_0v=next(_0e)
        while _0k~=nil do _0b[_0k]=_0v _0k,_0v=next(_0e,_0k) end
      end
      local _0t={
        wait=function() return 0 end,
        spawn=function(_0f,...) if _0f~=nil then return _0f(...) end end,
        delay=function(_0dt,_0f,...) if _0f~=nil then return _0f(...) end end,
      }
      _0b["task"]=_0t
      _0b["wait"]=_0t["wait"]
      _0b["_safe_task"]=_0t
      _0b["_safe_wait"]=_0t["wait"]
      return _0b
    end
    local _0s={} local _0seen={}
    local _0add=function(_0x) if _0ty(_0x)=="table" and not _0seen[_0x] then _0seen[_0x]=true _0s[#_0s+1]=_0x end end
    local _0ok,_0v=_0pc(getgenv) if _0ok then _0add(_0v) end
    _0ok,_0v=_0pc(getfenv,0) if _0ok then _0add(_0v) end
    _0ok,_0v=_0pc(function() return _ENV end) if _0ok then _0add(_0v) end
    local _0ls=loadstring or load
    if _0ty(_0ls)=="function" then
      local _0ok2,_0v2=_0pc(_0ls,"return _G")
      if _0ok2 and _0ty(_0v2)=="function" then
        local _0ok3,_0v3=_0pc(_0v2)
        if _0ok3 then _0add(_0v3) end
      end
    end
    if _0ty(_G)=="table" then _0add(_G) end
    local function _0get(_0a,_0k)
      if _0k==nil then _0k=_0a end
      for _0i=1,#_0s do
        local _0ok4,_0v4=_0pc(function() return _0s[_0i][_0k] end)
        if _0ok4 and _0v4~=nil then return _0v4 end
      end
      return nil
    end
    local _0shim=${buildCoreShimLua("_0get")}
    local _0t=_0shim["task"]
    local _0w=_0shim["wait"]
    local _0b={}
    _0rs(_0b,"task",_0t)
    _0rs(_0b,"wait",_0w)
    _0rs(_0b,"_safe_task",_0t)
    _0rs(_0b,"_safe_wait",_0w)
    local _0mt={}
    _0mt["__index"]=_0get
    _0mt["__newindex"]=function(_,_0k,_0v) _0rs(_0b,_0k,_0v) end
    local _0ok5,_0r=_0pc(_0sm,_0b,_0mt)
    if _0ok5 then return _0r end
    return _0b
  end)()`.replace(/\s*\n\s*/g, " ");
}
