// v4 executor hardening: shared bit32 fallback.
//
// Executors can strip `bit32` from the environment a loaded chunk runs in.
// The outer bootstrap installs a fallback into ITS env, but the inner runtime
// is loaded through the executor's `loadstring`/`load`, whose default env can
// be a DIFFERENT table (observed: outer chain resolves a rich env, the inner
// chunk's own env has no `bit32` -> `attempt to index a nil value (global
// 'bit32')` at the first literal `bit32.*` use). Both runtimes therefore emit
// this self-contained installer as their FIRST statement so any literal
// `bit32.*` reference resolves in the chunk's own environment; the bootstrap
// additionally keeps a local reference so the injected loader env can carry
// the same table.

export function bit32InstallerLua(refName?: string): string {
  const build: string[] = [
    `local M=4294967296`,
    `local XT,AT,OT={},{},{}`,
    `for a=0,15 do`,
    `for b=0,15 do`,
    `local xr,ar,orr,k=0,0,0,1`,
    `local u,v=a,b`,
    `for t=1,4 do`,
    `local s1,s2=u%2,v%2`,
    `if s1~=s2 then xr=xr+k end`,
    `if s1+s2>1 then ar=ar+k end`,
    `if s1+s2>0 then orr=orr+k end`,
    `u=(u-s1)/2`,
    `v=(v-s2)/2`,
    `k=k*2`,
    `end`,
    `XT[a*16+b]=xr`,
    `AT[a*16+b]=ar`,
    `OT[a*16+b]=orr`,
    `end`,
    `end`,
    `local function fx(a,b,T)`,
    `local r,m=0,1`,
    `a=a%M`,
    `b=b%M`,
    `while a>0 or b>0 do`,
    `local x,y=a%16,b%16`,
    `r=r+T[x*16+y]*m`,
    `a=(a-x)/16`,
    `b=(b-y)/16`,
    `m=m*16`,
    `end`,
    `return r`,
    `end`,
    `local function fold(T,...)`,
    `local n=select("#",...)`,
    `if n==0 then return 0 end`,
    `local a=select(1,...)`,
    `local b=select(2,...)`,
    `if b==nil then return a%M end`,
    `local r=fx(a,b,T)`,
    `for i=3,n do r=fx(r,select(i,...),T) end`,
    `return r`,
    `end`,
    `local function lsh(a,n)`,
    `a=a%M`,
    `for i=1,n%32 do a=(a*2)%M end`,
    `return a`,
    `end`,
    `local function rsh(a,n) return math.floor((a%M)/2^(n%32))%M end`,
    `local z={band=function(...) return fold(AT,...) end,bxor=function(...) return fold(XT,...) end,bor=function(...) return fold(OT,...) end,bnot=function(a) return (M-1)-(a%M) end,lshift=lsh,rshift=rsh,arshift=function(a,n) a=a%M if a>=M/2 then a=a-M end return math.floor(a/2^(n%32))%M end,lrotate=function(a,n) n=n%32 return (lsh(a,n)+rsh(a,32-n))%M end,rrotate=function(a,n) n=n%32 return (rsh(a,n)+lsh(a,32-n))%M end,btest=function(...) return fold(AT,...)~=0 end,extract=function(a,f,w) w=w or 1 return math.floor((a%M)/2^(f%32))%(2^w) end,replace=function(a,v,f,w) w=w or 1 local s=2^(f%32) local mw=2^w return (a%M-math.floor((a%M)/s)%mw*s)+(v%mw)*s end}`,
  ];

  if (refName) {
    return [
      `local ${refName}=bit32`,
      `if ${refName}==nil then`,
      ...build,
      `${refName}=z`,
      `if type(pcall)=="function" then`,
      `pcall(function() bit32=${refName} end)`,
      `else`,
      `bit32=${refName}`,
      `end`,
      `end`,
    ].join("\n");
  }

  return [
    `if bit32==nil then`,
    ...build,
    `if type(pcall)=="function" then`,
    `pcall(function() bit32=z end)`,
    `else`,
    `bit32=z`,
    `end`,
    `end`,
  ].join("\n");
}
