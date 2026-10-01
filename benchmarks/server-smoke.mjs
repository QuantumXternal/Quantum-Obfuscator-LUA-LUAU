// Server smoke: legacy path unchanged + profile path works + invalid profile 400.
const base = "http://localhost:3000";
async function post(path, body) {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  return { status: r.status, json: j };
}
const code = "local x = 1 + 2 print(x)";
const legacy = await post("/api/obfuscate", { code, options: { vmType: "none", seed: 7 } });
console.log("legacy:", legacy.status, "len:", legacy.json.output?.length);
const bal = await post("/api/obfuscate", { code, options: { profile: "BALANCED", seed: 7 } });
console.log("balanced:", bal.status, "len:", bal.json.output?.length);
const fast = await post("/api/obfuscate", { code, options: { profile: "FAST", seed: 7 } });
console.log("fast:", fast.status, "len:", fast.json.output?.length);
const bad = await post("/api/obfuscate", { code, options: { profile: "ULTRA" } });
console.log("bad-profile:", bad.status, JSON.stringify(bad.json));
const cached = await post("/api/obfuscate", { code, options: { profile: "BALANCED", seed: 7 } });
console.log("cached-hit:", cached.status, "cached:", cached.json.cached === true);
if (legacy.status !== 200 || bal.status !== 200 || fast.status !== 200 || bad.status !== 400 || cached.json.cached !== true) {
  console.error("SMOKE FAIL");
  process.exit(1);
}
if (!(fast.json.output.length < bal.json.output.length)) {
  console.error("SMOKE FAIL: FAST should be smaller than BALANCED");
  process.exit(1);
}
const poly1 = await post("/api/obfuscate", { code, options: { profile: "BALANCED", polymorphicSeed: 11 } });
const poly2 = await post("/api/obfuscate", { code, options: { profile: "BALANCED", polymorphicSeed: 12 } });
console.log("polyseed-11:", poly1.status, "len:", poly1.json.output?.length);
console.log("polyseed-12:", poly2.status, "len:", poly2.json.output?.length);
if (poly1.status !== 200 || poly2.status !== 200 || poly1.json.output === poly2.json.output) {
  console.error("SMOKE FAIL: polymorphicSeed should flow into generation");
  process.exit(1);
}
const stripped = await post("/api/obfuscate", { code, options: { profile: "BALANCED", seed: 7, disableFeatures: ["deadCodeInjection"] } });
const plain = await post("/api/obfuscate", { code, options: { profile: "BALANCED", seed: 7 } });
console.log("plain:", plain.json.output?.length, "stripped:", stripped.json.output?.length);
if (stripped.json.output.length >= plain.json.output.length) {
  console.error("SMOKE FAIL: disableFeatures deadCodeInjection should shrink output");
  process.exit(1);
}
console.log("SMOKE OK");
