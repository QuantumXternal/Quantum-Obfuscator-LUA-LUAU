local s = 0
for i = 1, 100 do
  if i % 2 == 0 then
    s = s + 1
  elseif i % 3 == 0 then
    s = s + 2
  elseif i % 5 == 0 then
    s = s + 3
  else
    s = s + 4
  end
  while s > 1000 do
    s = s - 100
  end
end
print(s)
