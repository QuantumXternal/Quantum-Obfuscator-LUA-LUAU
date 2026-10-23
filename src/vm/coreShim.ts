/**
 * Canonical pure-Lua task/wait shim used by every execution path.
 *
 * Executors may remove `task`, `wait`, or individual task methods. The shim
 * preserves anything that is still present, fills the gaps with
 * coroutine-backed implementations, and degrades waiting through
 * RunService.Heartbeat before falling back to a guarded coroutine yield.
 *
 * `getterExpr` must be a Lua function expression accepting a key and returning
 * the value from that execution path's environment, or nil.
 */
export function buildCoreShimLua(getterExpr: string): string {
  return `(function(_0get)
    local _0ty=type
    local _0pc=pcall
    local _0ot=_0get("task")
    if _0ty(_0ot)~="table" then _0ot=task end
    local _0co=_0get("coroutine")
    if _0ty(_0co)~="table" then _0co=coroutine end
    local _0os=_0get("os")
    if _0ty(_0os)~="table" then _0os=os end
    local _0hb=nil
    local function _0add(_0x)
      if _0x==nil then return end
      local _0ok,_0h=_0pc(function() return _0x["Heartbeat"] end)
      if not _0ok or _0h==nil then return end
      local _0ok2,_0w=_0pc(function() return _0h["Wait"] end)
      if _0ok2 and _0ty(_0w)=="function" then _0hb=function() return _0w(_0h) end end
    end
    _0add(_0get("RunService"))
    if _0hb==nil then _0add(RunService) end
    if _0hb==nil then
      local _0g=_0get("game")
      if _0g==nil then _0g=game end
      if _0g~=nil then
        local _0ok,_0rs=_0pc(function() return _0g:GetService("RunService") end)
        if _0ok then _0add(_0rs) end
      end
    end
    local _0wait
    _0wait=function(_0dt)
      local _0target=0.01
      if _0ty(_0dt)=="number" and _0dt>0 then _0target=_0dt end
      local _0el=0
      if _0hb~=nil then
        while _0el<_0target do
          local _0ok,_0dv=_0pc(_0hb)
          if not _0ok or _0ty(_0dv)~="number" or _0dv<=0 then break end
          _0el=_0el+_0dv
        end
        if _0el>0 then return _0el end
      end
      if _0ty(_0co)=="table" then
        local _0iy,_0y=_0co["isyieldable"],_0co["yield"]
        if _0ty(_0iy)=="function" and _0ty(_0y)=="function" then
          local _0ok,_0cy=_0pc(_0iy)
          if _0ok and _0cy==true then
            local _0oky=_0pc(_0y)
            if _0oky then return 0 end
          end
        end
      end
      return _0el
    end
    local _0t={}
    if _0ty(_0ot)=="table" then
      if _0ty(_0ot["delay"])=="function" then _0t["delay"]=_0ot["delay"] end
      if _0ty(_0ot["spawn"])=="function" then _0t["spawn"]=_0ot["spawn"] end
      if _0ty(_0ot["wait"])=="function" then _0t["wait"]=_0ot["wait"] end
    end
    if _0ty(_0t["wait"])~="function" then _0t["wait"]=_0wait end
    if _0ty(_0t["spawn"])~="function" then
      _0t["spawn"]=function(_0f,...)
        if _0ty(_0f)~="function" or _0ty(_0co)~="table" then return nil end
        local _0cr,_0re=_0co["create"],_0co["resume"]
        if _0ty(_0cr)~="function" or _0ty(_0re)~="function" then return nil end
        local _0th=_0cr(_0f)
        _0pc(_0re,_0th,...)
        return _0th
      end
    end
    if _0ty(_0t["delay"])~="function" then
      _0t["delay"]=function(_0dt,_0f,...)
        if _0ty(_0f)~="function" or _0ty(_0co)~="table" then return nil end
        local _0cr,_0re=_0co["create"],_0co["resume"]
        if _0ty(_0cr)~="function" or _0ty(_0re)~="function" then return nil end
        local _0a={...}
        local _0ut=_0get("table")
        if _0ty(_0ut)~="table" then _0ut=table end
        local _0unp=_0get("unpack")
        if _0ty(_0unp)~="function" then _0unp=unpack end
        if _0ty(_0unp)~="function" and _0ty(_0ut)=="table" then _0unp=_0ut["unpack"] end
        local _0call=function()
          if _0ty(_0unp)=="function" then return _0f(_0unp(_0a)) end
          return _0f()
        end
        local _0th=_0cr(function()
          if _0ty(_0dt)=="number" and _0dt>0 then _0wait(_0dt) end
          _0call()
        end)
        _0pc(_0re,_0th)
        return _0th
      end
    end
    local _0w=_0get("wait")
    if _0ty(_0w)~="function" then _0w=wait end
    if _0ty(_0w)~="function" then _0w=_0t["wait"] end
    return {task=_0t,wait=_0w,safe_task=_0t,safe_wait=_0w}
  end)(${getterExpr})`;
}
