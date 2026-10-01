-- Stage 16 micro-fixture: call/return cleanup traffic.
local function add(x, y) return x + y end
local function two() return 10, 20 end
local r = add(3, 4)
local p, q = two()
add(p, q)
print(r, p, q)
