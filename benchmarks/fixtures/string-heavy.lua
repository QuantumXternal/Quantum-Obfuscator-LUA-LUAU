local a = "hello world"
local b = "foo bar baz qux"
local c = [[long string with
multiple lines]]
local name = "clyde"
local greeting = `hi {name}!`
local t = { "alpha", "beta", "gamma", "delta" }
print(a .. b .. greeting)
print(table.concat(t, ","))
