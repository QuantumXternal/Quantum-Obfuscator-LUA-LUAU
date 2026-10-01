-- Stage 12B POW candidate fixture. ^ is right-associative: 2 ^ 3 ^ 2 == 512.
local a = 2
local b = 10
local p1 = a ^ b
local p2 = 2 ^ b
local p3 = a ^ 10
local p4 = 2 ^ 10
local neg = -2
local p5 = neg ^ 3
local p6 = a ^ -1
local p7 = 9 ^ 0.5
local p8 = 0 ^ 0
local p9 = 5 ^ 0
local chain = a ^ 3 ^ 2
local nest = (a + 1) ^ (b - 8)
local function id(x) return x end
local inargs = id(a ^ b)
local function sq(x) local s = x ^ 2 return s end
local r = sq(a)
local acc = 2
local i = 1
while i <= 3 do acc = acc ^ 2 i = i + 1 end
local cond = 1
if a < b then cond = a ^ 3 else cond = b ^ 2 end
local mixed = a ^ b + neg ^ 3
print(p1, p2, p3, p4, p5, p6, p7, p8, p9, chain, nest, inargs, r, acc, cond, mixed)
