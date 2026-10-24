-- Stage 20 VM-FOCUSED benchmark harness (executor side).
-- Exercises the generated VM dispatch loop WITHOUT repeating the expensive
-- one-time outer boot/decode (stub LZSS + cipher + nested) on every rep.
-- Artifacts: stage20/inner/<workload>-s<seed>-{A,B}.lua, produced by
-- benchmarks/stage20/generate-inner.mjs (production packager untouched;
-- wrappers bypassed only in a deleted temp generator copy; the measured
-- inner source is byte-identical to what the wrappers would encode, and the
-- A/B diff is exactly the two 19-char tripwire deletions, delta -38B).
-- Init/load (readfile + ONE loadstring per arm) is timed separately and done
-- ONCE; the timed loop then repeatedly calls the loaded chunks (each call
-- still runs inner const setup + full VM dispatch, incl. both tripwires).
-- Sequential only. Batches of BATCH_ROUNDS with task.wait() yields.
-- Checksum verified EVERY run; STOP a pair (continue the rest) on first
-- integrity failure. To split across tool calls, edit ONLY the RUN list.
local RUN = {
  { workload = "tight-arith", seed = 1234 }, { workload = "tight-arith", seed = 7 }, { workload = "tight-arith", seed = 42 },
  { workload = "branch-heavy", seed = 1234 }, { workload = "branch-heavy", seed = 7 }, { workload = "branch-heavy", seed = 42 },
  { workload = "nested-loop", seed = 1234 }, { workload = "nested-loop", seed = 7 }, { workload = "nested-loop", seed = 42 },
  { workload = "normal-mix", seed = 1234 }, { workload = "normal-mix", seed = 7 }, { workload = "normal-mix", seed = 42 },
  { workload = "very-long", seed = 1234 }, { workload = "very-long", seed = 7 }, { workload = "very-long", seed = 42 },
}
local NATIVE = {
  ["tight-arith"] = "local s=0 for i=1,500 do s=(s+i*3-1)%1000003 end _G.STAGE20_CHECK=s return s",
  ["branch-heavy"] = "local s=0 for i=1,500 do if i%3==0 then s=s+i elseif i%3==1 then s=s-i else s=s+(i%7) end end s=s%1000003 if s<0 then s=s+1000003 end _G.STAGE20_CHECK=s return s",
  ["nested-loop"] = "local s=0 for a=1,50 do for b=1,50 do s=(s+a*b)%1000003 end end _G.STAGE20_CHECK=s return s",
  ["normal-mix"] = "local t={} for i=1,200 do t[i]=i*2 end local function f(x) return x*3+1 end local s=0 for i=1,200 do local v=t[i] if v%2==0 then s=(s+f(v))%1000003 else s=(s+v)%1000003 end end _G.STAGE20_CHECK=s return s",
  ["very-long"] = "local s=0 for i=1,3000 do s=(s+i)%1000003 if s%5==0 then s=(s*2+1)%1000003 else s=(s+3)%1000003 end end _G.STAGE20_CHECK=s return s",
}
local DIR = "stage20/inner/"
local WARMUP, REPS, BATCH_ROUNDS = 5, 51, 6

local ident = "n/a"
do local ok, v = pcall(function() return identifyexecutor() end) if ok then ident = tostring(v) end end
local gameInfo = "n/a"
do local ok, v = pcall(function() return tostring(game.PlaceId) .. "/" .. tostring(game.JobId) end) if ok then gameInfo = v end end
local result = {
  mode = "VM-FOCUSED",
  identity = { executor = ident, version = tostring(_VERSION), game = gameInfo },
  warmup = WARMUP, reps = REPS, pairs = {},
}
local function runOnce(fn)
  _G.STAGE20_CHECK = nil
  local t0 = os.clock()
  local ok, err = pcall(fn)
  return ok, err, os.clock() - t0, _G.STAGE20_CHECK
end
for _, p in ipairs(RUN) do
  local pr = { workload = p.workload, seed = p.seed, status = "ok" }
  local t0 = os.clock()
  local srcA = readfile(DIR .. p.workload .. "-s" .. p.seed .. "-A.lua")
  pr.readA = os.clock() - t0
  t0 = os.clock()
  local srcB = readfile(DIR .. p.workload .. "-s" .. p.seed .. "-B.lua")
  pr.readB = os.clock() - t0
  pr.bytesA, pr.bytesB = #srcA, #srcB
  t0 = os.clock()
  local fnA, cerrA = loadstring(srcA, "VMF-A")
  pr.compileA = os.clock() - t0
  t0 = os.clock()
  local fnB, cerrB = loadstring(srcB, "VMF-B")
  pr.compileB = os.clock() - t0
  if not fnA then
    pr.status = "STOP compile-A: " .. tostring(cerrA)
  elseif not fnB then
    pr.status = "STOP compile-B: " .. tostring(cerrB)
  else
    _G.STAGE20_CHECK = nil
    local nok, nerr = pcall(loadstring(NATIVE[p.workload], "native"))
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
  result.pairs[#result.pairs + 1] = pr
  task.wait()
end
return game:GetService("HttpService"):JSONEncode(result)
