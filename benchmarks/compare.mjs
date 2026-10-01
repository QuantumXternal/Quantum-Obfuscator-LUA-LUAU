// Usage: node benchmarks/compare.mjs <before.json> <after.json>
import { readFileSync } from "fs";
const [before, after] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, "utf8")));
const bmap = new Map();
for (const fx of before.fixtures) for (const c of fx.configs) bmap.set(fx.file + "|" + c.config, c);
for (const fx of after.fixtures) {
  for (const c of fx.configs) {
    const b = bmap.get(fx.file + "|" + c.config);
    if (!b || !b.ok || !c.ok) { console.log(`${fx.file} ${c.config}: ${b?.ok ? "ok" : "FAIL"} -> ${c.ok ? "ok" : "FAIL:" + c.error}`); continue; }
    const dt = (c.ms.total - b.ms.total).toFixed(2);
    const db = c.outBytes - b.outBytes;
    const same = c.outSha === b.outSha ? "identical" : "DIFFERS";
    console.log(`${fx.file} ${c.config}: time ${b.ms.total}->${c.ms.total}ms (${dt > 0 ? "+" : ""}${dt}), bytes ${b.outBytes}->${c.outBytes} (${db > 0 ? "+" : ""}${db}), ${same}`);
  }
}
