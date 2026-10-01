-- Stage 16 micro-fixture: numeric-for traffic (candidates C: step init,
-- D: constant-step dual branch).
local s = 0
for i = 1, 10 do s = s + i end
local t = 0
for i = 10, 1, -1 do t = t + i end
local u = 0
local n = 5
for i = 1, n, 2 do u = u + i end
print(s, t, u)
