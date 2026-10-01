-- Stage 16 micro-fixture: multi-return/vararg traffic.
local function m() return 1, 2, 3 end
local a, b = m()
local function sum(...) local t = {...} local s = 0 for i, v in ipairs(t) do s = s + v end return s end
print(a, b, sum(4, 5, 6))
