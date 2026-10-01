-- Stage 16 micro-fixture: generic-for traffic (candidate A: ForIn spill shape).
local t = { 10, 20, 30 }
local s = 0
for k, v in pairs(t) do s = s + v end
local u = 0
for i, v in ipairs(t) do u = u + i + v end
print(s, u)
