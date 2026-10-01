local function outer(n)
  local acc = n
  local function inner(m)
    acc = acc + m
    return acc
  end
  local function twice(f, v)
    return f(f(v))
  end
  return twice(inner, 1) + twice(inner, 2)
end
local function fib(n)
  if n < 2 then return n end
  return fib(n - 1) + fib(n - 2)
end
local function apply(...)
  local args = { ... }
  return args[1] + outer(args[2] or 0)
end
print(fib(10) + apply(5, 3))
