-- Stage 16 micro-fixture: loop-carried value traffic.
local acc = 0
local i = 1
while i <= 10 do acc = acc + i i = i + 1 end
print(acc)
