-- Stage 12B MOD candidate fixture. Lua % is FLOOR modulo (sign follows
-- the divisor): -7 % 3 == 2, 7 % -3 == -2. Any fusion must preserve this.
local a = 7
local b = 3
local m1 = a % b
local m2 = 7 % b
local m3 = a % 3
local m4 = 7 % 3
local neg = -7
local m5 = neg % 3
local m6 = a % -b
local m7 = neg % -b
local m8 = neg % b
local m9 = a % 1
local m10 = 5.5 % 2
local chain = a % b % 2
local nest = (a + b) % (b + 1)
local function id(x) return x end
local inargs = id(a % b)
local function wrap(x) local w = x % b return w end
local r = wrap(a)
local acc = 100
local i = 1
while i <= 3 do acc = acc % 7 i = i + 1 end
local cond = 0
if a > b then cond = a % b else cond = b % a end
local mixed = a % b + neg % 3
local ce = a
ce %= b
local cf = neg
cf %= 3
print(m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, chain, nest, inargs, r, acc, cond, mixed, ce, cf)
