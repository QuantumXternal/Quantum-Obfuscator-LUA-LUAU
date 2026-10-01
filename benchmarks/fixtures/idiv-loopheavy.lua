-- Stage 14 loop-heavy IDIV fixture: hot loop-carried floor-division site with
-- a reset guard (mirrors the DIV/MOD loop methodology).
-- Trajectory: 200//3=66, 66//3=22, 22//3=7, 7//3=2, 2//3=0 -> guard resets
-- to 200 on 0. Final acc is deterministic for a fixed iteration count.
local acc = 200
local b = 3
local i = 0
while i < 2000 do
  acc = acc // b
  if acc < 1 then acc = 200 end
  i = i + 1
end
print(acc, i)
