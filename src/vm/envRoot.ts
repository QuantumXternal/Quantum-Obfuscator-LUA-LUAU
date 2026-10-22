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
    local _0co=_0get("coroutine")
    local _0hb=nil
    local function _0hbAdd(_0x)
      if _0x==nil then return end
      local _0okh,_0hs=_0pc(function() return _0x["Heartbeat"] end)
      if not _0okh or _0hs==nil then return end
      local _0okw,_0w=_0pc(function() return _0hs["Wait"] end)
      if _0okw and _0ty(_0w)=="function" then _0hb=function() return _0w(_0hs) end end
    end
    _0hbAdd(_0get("RunService"))
    if _0hb==nil then
      local _0g=_0get("game")
      if _0g~=nil then
        local _0okg,_0rsv=_0pc(function() return _0g:GetService("RunService") end)
        if _0okg then _0hbAdd(_0rsv) end
      end
    end
    local _0wait
    _0wait=function(_0dt)
      local _0target=0.01
      if _0ty(_0dt)=="number" and _0dt>0 then _0target=_0dt end
      local _0el=0
      if _0hb~=nil then
        while _0el<_0target do
          local _0okb,_0dv=_0pc(_0hb)
          if not _0okb or _0ty(_0dv)~="number" or _0dv<=0 then break end
          _0el=_0el+_0dv
        end
        if _0el>0 then return _0el end
      end
      if _0ty(_0co)=="table" and _0ty(_0co["yield"])=="function" and _0ty(_0co["isyieldable"])=="function" then
        local _0oky,_0cy=_0pc(_0co["isyieldable"])
        if _0oky and _0cy==true then
          _0co["yield"]()
          return 0
        end
      end
      return _0el
    end
    local _0ot=_0get("task")
    local _0t={}
    if _0ty(_0ot)=="table" then
      if _0ty(_0ot["delay"])=="function" then _0t["delay"]=_0ot["delay"] end
      if _0ty(_0ot["spawn"])=="function" then _0t["spawn"]=_0ot["spawn"] end
      if _0ty(_0ot["wait"])=="function" then _0t["wait"]=_0ot["wait"] end
    end
    if _0ty(_0t["wait"])~="function" then _0t["wait"]=_0wait end
    if _0ty(_0t["spawn"])~="function" then
      _0t["spawn"]=function(_0f,...)
        if _0ty(_0co)~="table" or _0ty(_0co["create"])~="function" or _0ty(_0co["resume"])~="function" then return nil end
        local _0th=_0co["create"](_0f)
        _0pc(_0co["resume"],_0th,...)
        return _0th
      end
    end
    if _0ty(_0t["delay"])~="function" then
      _0t["delay"]=function(_0dt,_0f,...)
        if _0ty(_0co)~="table" or _0ty(_0co["create"])~="function" or _0ty(_0co["resume"])~="function" then return nil end
        local _0a={...}
        local _0ut=_0get("table") local _0unp=_0get("unpack")
        if _0ty(_0ut)=="table" and _0ty(_0ut["unpack"])=="function" then _0unp=_0ut["unpack"] end
        local _0call=function() if _0ty(_0unp)=="function" then return _0f(_0unp(_0a)) end return _0f() end
        local _0th=_0co["create"](function() if _0ty(_0dt)=="number" and _0dt<=0 then _0call() else _0wait(_0dt) _0call() end end)
        _0pc(_0co["resume"],_0th)
        return _0th
      end
    end
    local _0w=_0get("wait")
    if _0ty(_0w)~="function" then _0w=_0t["wait"] end
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
