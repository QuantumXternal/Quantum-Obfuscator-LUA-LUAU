-- Stage 16 micro-fixture: table read/write traffic.
local t = { 5, 10, 15 }
local s = t[1] + t[2] + t[3]
t[1] = s
local u = { name = "x" }
local n = u.name .. "y"
print(s, t[1], n)
