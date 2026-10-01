local x = 0
local y = "init"
local flag = false
local other = 42
x = 1
y = "done"
flag = true
x = other
y = x
flag = false
x = nil
local a, b = 1, 2
a, b = b, a
x = x + 1
y ..= "_tail"
local t = {}
t.k = x
t.k = "lit"
print(x)
print(y)
