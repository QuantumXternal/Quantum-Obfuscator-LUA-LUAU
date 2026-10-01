local x = 10
local y = 20
local function add(a, b)
  return a + b
end
local t = { x = 1, y = 2 }
for i = 1, 5 do
  x = x + i
end
if x > 10 then
  print(add(x, y))
else
  print("small")
end
