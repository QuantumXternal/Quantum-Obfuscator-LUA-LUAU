-- Stage 16 micro-fixture: compound table assignment spills (candidate B).
local t = { x = 10, s = "a" }
local k = "x"
t[k] = t[k] + 5
t.x = t.x * 2
t.s = t.s .. "b"
t[k] = t[k] - 1
print(t[k], t.x, t.s)
