local o = {}
function o:m(x)
  return x * 2
end
function o:n()
  return 7
end
local y = o:m(21)
local z = o:n()
print(y + z)
