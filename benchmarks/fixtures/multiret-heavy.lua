local function pair()
  return 1, 2
end
local function triple()
  return 1, 2, 3
end
local a, b = pair()
local x, y, z = triple()
local m, n = 1, pair()
local p = pair()
print(a + b + x + y + z + m + n + p)
