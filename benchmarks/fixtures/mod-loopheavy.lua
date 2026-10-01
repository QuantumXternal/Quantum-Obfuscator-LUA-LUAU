-- Stage 13 loop-heavy MOD fixture: hot loop-carried floor-modulo site with a
-- reset guard (mirrors the DIV loop methodology; values stay integral).
-- Expected: acc cycles 200 % 3 = 2, never below 1, final acc is deterministic.
local acc = 200
local b = 3
local i = 0
while i < 2000 do
  acc = acc % b
  if acc < 1 then acc = 200 end
  i = i + 1
end
print(acc, i)
