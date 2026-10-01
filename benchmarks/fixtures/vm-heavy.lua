local function multi()
  return 1, 2, 3
end
local a, b, c = multi()
local function varsum(...)
  local s = 0
  for i = 1, select("#", ...) do
    s = s + (select(i, ...) or 0)
  end
  return s
end
local function apply(f, ...)
  return f(...)
end
local ok, err = pcall(function() return varsum(1, 2, 3) end)
print(a + b + c + apply(varsum, 4, 5) + (ok and 0 or 1))
