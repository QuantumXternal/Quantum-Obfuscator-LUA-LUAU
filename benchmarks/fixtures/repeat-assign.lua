-- Stage 16 micro-fixture: repeated assignment traffic.
local a = 1
local b = 2
a = b
b = a
local c = a
a = c
print(a, b, c)
