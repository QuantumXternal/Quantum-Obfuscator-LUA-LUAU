local t = { 1, 2, 3, x = 10, ["y"] = 20 }
t.z = 30
local u = { inner = { deep = { value = 42 } } }
local function sum(tbl)
  local s = 0
  for k, v in pairs(tbl) do
    if type(v) == "number" then s = s + v end
  end
  return s
end
local a, b = 1, 2
local c = { a, b, unpack(t) }
print(sum(t) + u.inner.deep.value)
