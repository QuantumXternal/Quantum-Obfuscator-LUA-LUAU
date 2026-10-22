export const CORE_GLOBALS = [
  "print", "warn", "error", "assert", "type", "typeof", "tostring", "tonumber",
  "pcall", "xpcall", "select", "unpack", "pairs", "ipairs", "next",
  "rawget", "rawset", "rawequal", "rawlen", "setmetatable", "getmetatable",
  "collectgarbage", "dofile", "gcinfo",

  "string", "table", "math", "bit32", "coroutine", "os", "debug", "utf8", "buffer",

  "game", "workspace", "script", "Instance", "Enum",
  "Vector3", "Vector2", "CFrame", "Color3", "BrickColor",
  "UDim", "UDim2", "Ray", "Region3", "Rect", "TweenInfo",
  "NumberSequence", "ColorSequence", "NumberRange",
  "NumberSequenceKeypoint", "ColorSequenceKeypoint",
  "PhysicalProperties", "Axes", "Faces", "PathWaypoint",
  "Random", "DateTime", "RaycastParams", "OverlapParams",
  "Font", "FloatCurveKey", "RotationCurveKey",

  "tick", "time", "wait", "task", "spawn", "delay", "elapsedTime",

  "require", "loadstring", "load", "getfenv", "setfenv", "newproxy",

  "_G", "shared", "settings", "stats", "UserSettings", "version",
];

export const EXECUTOR_GLOBALS = [
  "getgenv", "getrenv", "getsenv", "getrawmetatable", "setrawmetatable",

  "hookfunction", "hookfunc", "hookmetamethod", "newcclosure",
  "clonefunction", "cloneref", "compareinstances",

  "iscclosure", "islclosure", "isexecutorclosure", "checkclosure", "isourclosure",
  "checkcaller", "is_sirhurt_closure", "secure_call",

  "getconnections", "firesignal", "fireclickdetector", "fireproximityprompt", "firetouchinterest",

  "getgc", "getinstances", "getnilinstances", "getscripts", "getrunningscripts",
  "getloadedmodules", "getcallingscript", "getactors",

  "getscriptbytecode", "dumpstring", "getscripthash", "getscriptclosure", "decompile",

  "readfile", "writefile", "appendfile", "loadfile", "listfiles",
  "isfile", "isfolder", "makefolder", "delfolder", "delfile",

  "setclipboard", "toclipboard", "getclipboard", "setrbxclipboard",

  "queue_on_teleport", "queueonteleport",

  "setthreadidentity", "getthreadidentity",
  "setidentity", "getidentity", "setthreadcontext", "getthreadcontext",

  "getnamecallmethod", "setnamecallmethod",

  "isreadonly", "setreadonly",

  "gethiddenproperty", "sethiddenproperty", "isscriptable", "setscriptable",

  "identifyexecutor", "getexecutorname",

  "request", "http_request", "syn", "http", "fluxus", "krnl", "WebSocket",

  "cache",

  "Drawing", "cleardrawcache", "isrenderobj",

  "crypt", "base64",

  "lz4compress", "lz4decompress",

  "mouse1click", "mouse1press", "mouse1release",
  "mouse2click", "mouse2press", "mouse2release",
  "mousemoveabs", "mousemoverel", "mousescroll",
  "keypress", "keyrelease",

  "gethui", "getcustomasset", "getcallbackvalue", "messagebox",
  "isrbxactive", "isgameactive", "setfpscap",

  "getregistry", "getreg", "getstack",

  "rconsoleclear", "rconsolecreate", "rconsoledestroy",
  "rconsoleinput", "rconsoleprint", "rconsolesettitle", "rconsolename",
  "consoleclear", "consolecreate", "consoledestroy",
  "consoleinput", "consoleprint", "consolesettitle",

  "run_on_actor", "runonactor",
];

/**
 * Last-resort snapshot for hosts where no environment reflection is usable.
 * The runtime resolves globals dynamically first; this list is never used as
 * an access allowlist.
 */
export const ENV_FALLBACK_GLOBALS: readonly string[] = [...CORE_GLOBALS, ...EXECUTOR_GLOBALS];
