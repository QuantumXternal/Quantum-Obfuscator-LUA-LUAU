-- Stage 16 micro-fixture: closure/upvalue traffic.
local base = 100
local function adder(x) return base + x end
local fs = {}
for i = 1, 3 do fs[i] = function() return adder(i) end end
print(fs[1](), fs[2](), fs[3]())
