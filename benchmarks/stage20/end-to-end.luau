-- Stage 20 END-TO-END benchmark harness (executor side).
-- Runs ONE outer (full packaging) pair per execution. Set PAIR below, then
-- run the whole file in the Real executor (get-data-by-code, 120s timeout)
-- and capture the returned JSON. Sequential only. Do NOT parallelize.
-- Protocol: init (read+compile) timed separately; native checksum gate;
-- WARMUP=5/arm; REPS=51/arm interleaved with alternating lead; batches of
-- BATCH_ROUNDS with task.wait() yields between batches (executor-stability
-- fix: never hold the client VM uninterrupted for more than a few seconds);
-- checksum verified EVERY run; STOP the pair (keep partials) on first
-- integrity failure. Init failures (compile) also STOP with exact error.
local PAIR = { workload = "tight-arith", seed = 1234 }
local NATIVE = {
  ["tight-arith"] = "local s=0 for i=1,500 do s=(s+i*3-1)%1000003 end _G.STAGE20_CHECK=s return s",
  ["branch-heavy"] = "local s=0 for i=1,500 do if i%3==0 then s=s+i elseif i%3==1 then s=s-i else s=s+(i%7) end end s=s%1000003 if s<0 then s=s+1000003 end _G.STAGE20_CHECK=s return s",
  ["nested-loop"] = "local s=0 for a=1,50 do for b=1,50 do s=(s+a*b)%1000003 end end _G.STAGE20_CHECK=s return s",
  ["normal-mix"] = "local t={} for i=1,200 do t[i]=i*2 end local function f(x) return x*3+1 end local s=0 for i=1,200 do local v=t[i] if v%2==0 then s=(s+f(v))%1000003 else s=(s+v)%1000003 end end _G.STAGE20_CHECK=s return s",
  ["very-long"] = "local s=0 for i=1,3000 do s=(s+i)%1000003 if s%5==0 then s=(s*2+1)%1000003 else s=(s+3)%1000003 end end _G.STAGE20_CHECK=s return s",
}
local DIR = "stage20/"
local WARMUP, REPS, BATCH_ROUNDS = 5, 51, 6

local ident = "n/a"
do local ok, v = pcall(function() return identifyexecutor() end) if ok then ident = tostring(v) end end
local gameInfo = "n/a"
do local ok, v = pcall(function() return tostring(game.PlaceId) .. "/" .. tostring(game.JobId) end) if ok then gameInfo = v end end
local pr = {
  mode = "END-TO-END", workload = PAIR.workload, seed = PAIR.seed, status = "ok",
  identity = { executor = ident, version = tostring(_VERSION), game = gameInfo },
  warmup = WARMUP, reps = REPS,
}
local function runOnce(fn)
  _G.STAGE20_CHECK = nil
  local t0 = os.clock()
  local ok, err = pcall(fn)
  return ok, err, os.clock() - t0, _G.STAGE20_CHECK
end
local fa = DIR .. PAIR.workload .. "-s" .. PAIR.seed .. "-A.lua"
local fb = DIR .. PAIR.workload .. "-s" .. PAIR.seed .. "-B.lua"
local t0 = os.clock()
local srcA = readfile(fa)
pr.readA = os.clock() - t0
t0 = os.clock()
local srcB = readfile(fb)
pr.readB = os.clock() - t0
pr.bytesA, pr.bytesB = #srcA, #srcB
t0 = os.clock()
local fnA, cerrA = loadstring(srcA, "E2E-A")
pr.compileA = os.clock() - t0
t0 = os.clock()
local fnB, cerrB = loadstring(srcB, "E2E-B")
pr.compileB = os.clock() - t0
if not fnA then
  pr.status = "STOP compile-A: " .. tostring(cerrA)
elseif not fnB then
  pr.status = "STOP compile-B: " .. tostring(cerrB)
else
  _G.STAGE20_CHECK = nil
  local nok, nerr = pcall(loadstring(NATIVE[PAIR.workload], "native"))
  pr.nativeCheck, pr.nativeOk = _G.STAGE20_CHECK, nok
  if not nok then
    pr.status = "STOP native failed: " .. tostring(nerr)
  else
    local fail = nil
    for w = 1, WARMUP do
      local okA, _, _, cA = runOnce(fnA)
      if not okA or cA ~= pr.nativeCheck then fail = "warmup-A iter " .. w .. " chk=" .. tostring(cA); break end
      local okB, _, _, cB = runOnce(fnB)
      if not okB or cB ~= pr.nativeCheck then fail = "warmup-B iter " .. w .. " chk=" .. tostring(cB); break end
    end
    if fail then
      pr.status = "STOP " .. fail
    else
      local rawA, rawB = {}, {}
      local done = 0
      while done < REPS do
        local stop = math.min(done + BATCH_ROUNDS, REPS)
        for i = done + 1, stop do
          if i % 2 == 1 then
            local okA, eA, dA, cA = runOnce(fnA)
            if not okA or cA ~= pr.nativeCheck then fail = "timed-A round " .. i .. " chk=" .. tostring(cA) .. " err=" .. tostring(eA):sub(1, 120); break end
            local okB, eB, dB, cB = runOnce(fnB)
            if not okB or cB ~= pr.nativeCheck then fail = "timed-B round " .. i .. " chk=" .. tostring(cB) .. " err=" .. tostring(eB):sub(1, 120); break end
            rawA[i], rawB[i] = dA, dB
          else
            local okB, eB, dB, cB = runOnce(fnB)
            if not okB or cB ~= pr.nativeCheck then fail = "timed-B round " .. i .. " chk=" .. tostring(cB) .. " err=" .. tostring(eB):sub(1, 120); break end
            local okA, eA, dA, cA = runOnce(fnA)
            if not okA or cA ~= pr.nativeCheck then fail = "timed-A round " .. i .. " chk=" .. tostring(cA) .. " err=" .. tostring(eA):sub(1, 120); break end
            rawA[i], rawB[i] = dA, dB
          end
        end
        if fail then break end
        done = stop
        if done < REPS then task.wait() end
      end
      pr.rawA, pr.rawB = rawA, rawB
      pr.completedReps = done
      if fail then pr.status = "STOP " .. fail end
    end
  end
end
return game:GetService("HttpService"):JSONEncode(pr)
