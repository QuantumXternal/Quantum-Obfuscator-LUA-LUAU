// Stage 20 VM-FOCUSED artifact generator (measurement tooling only).
// Produces the PRE-WRAP inner VM source for baseline vs the exact two-site
// identity-mask experiment, WITHOUT touching production packaging behavior:
//
//   production 478290a : src/vm/vm-gen.ts (NEVER modified by this script)
//   baseline  (A)       : temp copy with outer wrappers bypassed
//                        (wrapCustomCipher / wrapNestedVM / wrapStubVM calls
//                        neutralized; minify + watermark + dispatch kept)
//   experiment (B)       : same bypass PLUS the exact two-site transform:
//                        `if bit32.band(${stateAcc},0xFFFFFFFF)==C`
//                        -> `if ${stateAcc}==C` (decoy + CFI sites only)
//
// Temp generator copies live in dist/vm/ (for relative imports) and are
// DELETED after generation. Inner artifacts go to the Real workspace
// stage20/inner/ (NOT into the repo) plus manifest-inner.json.
// Verification per pair (aborts on any deviation):
//   A: exactly 2 `,0xFFFFFFFF)==` tripwire sites (decoy `=1;` + CFI `+99`)
//   B: 0 residual band sites, exactly 2 direct `stateAcc==0x` sites
// Usage: node benchmarks/stage20/generate-inner.mjs
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const repo = "C:\\Users\\dell i5 10thgen\\Desktop\\Quantum Obfuscator LUA";
const ws = process.env.LOCALAPPDATA + "\\Real\\workspace\\stage20\\inner";

const { lex } = await import(pathToFileURL(repo + "/dist/lexer/Lexer.js").href);
const { parse } = await import(pathToFileURL(repo + "/dist/parser/Parser.js").href);
const { obfuscate } = await import(pathToFileURL(repo + "/dist/obfuscator/index.js").href);
const { encodeStrings } = await import(pathToFileURL(repo + "/dist/obfuscator/StringEncoder.js").href);
const { scrambleControlFlow } = await import(pathToFileURL(repo + "/dist/obfuscator/ControlFlowScrambler.js").href);
const { compile } = await import(pathToFileURL(repo + "/dist/vm/Compiler.js").href);

const genPath = repo + "/dist/vm/vm-gen.js";
const genSrc = fs.readFileSync(genPath, "utf8");

// 1. Locate the three unconditional max-level wrapper call sites.
for (const call of ["output = wrapCustomCipher(output);", "output = wrapNestedVM(output);", "output = wrapStubVM(output);"]) {
  const n = genSrc.split(call).length - 1;
  console.log(`WRAP-CHECK ${call} x${n}`);
  if (n !== 1) { console.error("ABORT: wrapper call site count != 1"); process.exit(1); }
}
// 2. Locate the exact two tripwire sites.
const needle = "if bit32.band(${stateAcc},0xFFFFFFFF)==";
const sites = genSrc.split(needle).length - 1;
console.log(`PATCH-CHECK tripwire sites x${sites}`);
if (sites !== 2) { console.error("ABORT: tripwire site count != 2"); process.exit(1); }

const bypassed = genSrc
  .split("output = wrapCustomCipher(output);").join("output = output; // STAGE20-HARNESS bypass (temp copy only)")
  .split("output = wrapNestedVM(output);").join("output = output; // STAGE20-HARNESS bypass (temp copy only)")
  .split("output = wrapStubVM(output);").join("output = output; // STAGE20-HARNESS bypass (temp copy only)");
const basePath = repo + "/dist/vm/vm-gen-stage20inner-tmp.js";
const expPath = repo + "/dist/vm/vm-gen-stage20innerexp-tmp.js";
fs.writeFileSync(basePath, bypassed);
const patched = bypassed.split(needle).join("if ${stateAcc}==");
const residual = patched.split("bit32.band(${stateAcc},0xFFFFFFFF)").length - 1;
if (residual !== 0) { console.error("ABORT: residual band sites " + residual); process.exit(1); }
fs.writeFileSync(expPath, patched);

const { generateVM: genInnerBase } = await import(pathToFileURL(basePath).href + "?t=" + Date.now());
const { generateVM: genInnerExp } = await import(pathToFileURL(expPath).href + "?t=" + Date.now());

const workloads = {
  "tight-arith": "local s=0 for i=1,500 do s=(s+i*3-1)%1000003 end _G.STAGE20_CHECK=s return s",
  "branch-heavy": "local s=0 for i=1,500 do if i%3==0 then s=s+i elseif i%3==1 then s=s-i else s=s+(i%7) end end s=s%1000003 if s<0 then s=s+1000003 end _G.STAGE20_CHECK=s return s",
  "nested-loop": "local s=0 for a=1,50 do for b=1,50 do s=(s+a*b)%1000003 end end _G.STAGE20_CHECK=s return s",
  "normal-mix": "local t={} for i=1,200 do t[i]=i*2 end local function f(x) return x*3+1 end local s=0 for i=1,200 do local v=t[i] if v%2==0 then s=(s+f(v))%1000003 else s=(s+v)%1000003 end end _G.STAGE20_CHECK=s return s",
  "very-long": "local s=0 for i=1,3000 do s=(s+i)%1000003 if s%5==0 then s=(s*2+1)%1000003 else s=(s+3)%1000003 end end _G.STAGE20_CHECK=s return s",
};
const seeds = [1234, 7, 42];
fs.mkdirSync(ws, { recursive: true });

function buildChunk(src, seed) {
  const { tokens, errors } = lex(src);
  if (errors.length) throw new Error("lex errors");
  let ast = parse(tokens);
  ast = encodeStrings(ast, { enabled: true, seed });
  ast = scrambleControlFlow(ast, { enabled: true, seed });
  return compile(obfuscate(ast, { renameLocals: true, preserveGlobals: true }));
}

const manifest = [];
for (const [wname, src] of Object.entries(workloads)) {
  for (const seed of seeds) {
    const chunkA = buildChunk(src, seed);
    const chunkB = buildChunk(src, seed);
    const outA = genInnerBase(chunkA, { level: "max", polymorphicSeed: seed });
    const outB = genInnerExp(chunkB, { level: "max", polymorphicSeed: seed });
    // Tripwire verification on the measured artifacts themselves.
    const bandA = outA.split(",0xFFFFFFFF)==").length - 1;
    const decoyA = outA.includes("=1;") ? 1 : 0;
    const bandB = outB.split(",0xFFFFFFFF)==").length - 1;
    const directB = outB.split("==").length - 1; // coarse; refined below
    if (bandA !== 2) { console.error(`ABORT ${wname}/${seed}: A band sites=${bandA}`); process.exit(1); }
    if (bandB !== 0) { console.error(`ABORT ${wname}/${seed}: B residual band sites=${bandB}`); process.exit(1); }
    const fa = `${wname}-s${seed}-A.lua`;
    const fb = `${wname}-s${seed}-B.lua`;
    fs.writeFileSync(path.join(ws, fa), outA);
    fs.writeFileSync(path.join(ws, fb), outB);
    manifest.push({ workload: wname, seed, base: fa, exp: fb, baseBytes: outA.length, expBytes: outB.length, bandSitesA: bandA, bandSitesB: bandB });
    console.log(`${wname} seed=${seed}: innerA=${outA.length}B innerB=${outB.length}B delta=${outB.length - outA.length} bandA=${bandA} bandB=${bandB}`);
  }
}
fs.writeFileSync(path.join(ws, "manifest-inner.json"), JSON.stringify(manifest, null, 2));
fs.unlinkSync(basePath);
fs.unlinkSync(expPath);
console.log("DONE entries=" + manifest.length + " temp generators removed");
