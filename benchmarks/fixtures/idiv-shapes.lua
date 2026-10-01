-- Stage 12B IDIV candidate fixture. Luau // is FLOOR division: -7 // 2 == -4.
-- NOTE: generated h48 implements // as math.floor(x/y) (vm-gen.ts), so a
-- fused form must use the same math.floor shape, NOT raw //, to preserve
-- the established production behavior (e.g. x // 0 yields inf, not an error).
local a = 7
local b = 2
local q1 = a // b
local q2 = 7 // b
local q3 = a // 2
local q4 = 7 // 2
local neg = -7
local q5 = neg // 2
local q6 = a // -b
local q7 = neg // -b
local q8 = neg // b
local q9 = 5.5 // 2
local chain = a // b // 2
local nest = (a + b) // (b - 1)
local function id(x) return x end
local inargs = id(a // b)
local function third(x) local t = x // 3 return t end
local r = third(a)
local acc = 100
local i = 1
while i <= 3 do acc = acc // 2 i = i + 1 end
local cond = 0
if a > b then cond = a // b else cond = b // a end
local mixed = a // b + neg // 2
local ce = a
ce //= b
local cf = neg
cf //= 2
local up = 2
local function f(x, y) local t = x // y return t + up end
local clo = f(a, b)
print(q1, q2, q3, q4, q5, q6, q7, q8, q9, chain, nest, inargs, r, acc, cond, mixed, ce, cf, clo)
