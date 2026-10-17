-- PUC-Lua 5.4 compatibility shims for executing generated artifacts in tests.
-- Each entry is load-bearing on stock PUC-Lua 5.4 (verified absent there):
--   bit32.*        : removed in 5.3+; reimplemented EXACTLY over Lua 5.4
--                    native 64-bit bitwise ops (valid for all uint32-range
--                    operands, which is everything generated artifacts
--                    produce). Luau bit32.band/bor/bxor are N-ARY (fold
--                    left) — the shim folds identically (verified 17/17 +
--                    n-ary cases against Luau 0.742 native bit32).
--   loadstring     : removed in 5.4 (it is load); exact alias.
--   unpack         : removed in 5.4 (it is table.unpack); exact alias.
--   table.create   : Luau-only. APPROXIMATE: capacity hints unobservable;
--                    value-fill matches Luau fill behavior. Fill/no-fill
--                    invariance verified on loop workloads. Treat Luau as
--                    the authority if any divergence appears.
-- Deliberately NOT shimmed: getfenv (verified: a getfenv shim makes reg
-- artifacts exit silently — the envelope spoof-checks host accessors;
-- missing-getfenv is a SUPPORTED host configuration via or-_G fallbacks).
local M = 0xFFFFFFFF
if bit32 == nil then
bit32 = {}
local function fold(op, ...)
  local n = select("#", ...)
  local acc = (n >= 1) and select(1, ...) or 0
  for i = 2, n do acc = op(acc, select(i, ...)) end
  return acc
end
bit32.band = function(...) return fold(function(a, b) return (a & b) & M end, ...) end
bit32.bor = function(...) return fold(function(a, b) return (a | b) & M end, ...) end
bit32.bxor = function(...) return fold(function(a, b) return (a ~ b) & M end, ...) end
bit32.bnot = function(a) return (~a) & M end
bit32.lshift = function(a, n) return (a << n) & M end
bit32.rshift = function(a, n) return ((a & M) >> n) & M end
bit32.arshift = function(a, n)
  local s = a & M
  if s >= 0x80000000 then s = s - 0x100000000 end
  return (s >> n) & M
end
bit32.lrotate = function(a, n)
  n = n % 32
  return (((a << n) | ((a & M) >> (32 - n))) & M)
end
bit32.rrotate = function(a, n)
  n = n % 32
  return ((((a & M) >> n) | (a << (32 - n))) & M)
end
bit32.btest = function(...) return bit32.band(...) ~= 0 end
bit32.extract = function(n, field, width)
  width = width or 1
  return ((n >> field) & ((1 << width) - 1))
end
bit32.replace = function(n, v, field, width)
  width = width or 1
  local mask = ((1 << width) - 1) << field
  return ((n & (~mask & M)) | ((v << field) & mask)) & M
end
end -- if bit32 == nil
if loadstring == nil then loadstring = load end
if unpack == nil then unpack = table.unpack end
if table.create == nil then table.create = function(n, v)
  local t = {}
  if v ~= nil then for i = 1, (n or 0) do t[i] = v end end
  return t
end end
