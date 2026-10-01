local s = 0
for i = 1, 20 do
  if i % 2 == 0 then
    s = s + i
  elseif i % 3 == 0 then
    s = s + 2 * i
  else
    s = s + 1
  end
end
local i = 0
while i < 10 do
  i = i + 1
  if i == 5 then continue end
  if i > 8 then break end
  s = s + i
end
repeat
  s = s - 1
until s < 100
local v = if s > 50 then 1 else 0
print(s + v)
