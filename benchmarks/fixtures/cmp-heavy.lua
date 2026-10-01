local s = 0
for i = 1, 200 do
  if i == 100 then s = s + 1 end
  if i ~= 50 then s = s + 1 end
  if i < 10 then s = s + 1 end
  if i <= 20 then s = s + 1 end
  if i > 190 then s = s + 1 end
  if i >= 180 then s = s + 1 end
  local a = i + 1
  if a == i + 1 then s = s + 1 end
  if 100 == i then s = s + 1 end
  if i == 100 then s = s + 1 else s = s - 1 end
end
print(s)
