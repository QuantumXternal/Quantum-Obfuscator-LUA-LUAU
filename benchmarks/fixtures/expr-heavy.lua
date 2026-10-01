-- Stage 16 micro-fixture: nested expression traffic.
local a = 3
local b = 4
local c = (a + b) * (a - b) + (a * b) / (b + 1)
local d = -a + (b ^ 2) % 5
print(c, d)
