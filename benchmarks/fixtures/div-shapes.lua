-- Stage 12B DIV candidate fixture: covers fusable (local/local/STORE) and
-- deliberately non-fusing shapes (constants, call results, non-STORE sinks).
local a = 20
local b = 4
local q1 = a / b
local q2 = 20 / b
local q3 = a / 4
local q4 = 20 / 4
local neg = -7
local q5 = neg / 2
local q6 = a / -b
local zero = 0
local inf = a / zero
local nan = zero / zero
local chain = a / b / 2
local nest = (a + b) / (b - 2)
local function id(x) return x end
local inargs = id(a / b)
local function half(x) local h = x / 2 return h end
local r = half(a)
local acc = 100
local i = 1
while i <= 3 do acc = acc / 2 i = i + 1 end
local cond = 1
if a > b then cond = a / b else cond = b / a end
local mixed = a / b + neg / 2
print(q1, q2, q3, q4, q5, q6, inf, nan, chain, nest, inargs, r, acc, cond, mixed)
