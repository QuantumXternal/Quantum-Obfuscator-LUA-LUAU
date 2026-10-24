// Stage 20 result analyzer (local, deterministic, no executor).
// Input: JSON saved from a harness run: { mode, identity, warmup, reps,
//   pairs: [{ workload, seed, status, bytesA/B, readA/B, compileA/B,
//   nativeCheck, rawA[51], rawB[51], completedReps }] }  (END-TO-END wraps
//   the single pair object directly instead of { pairs: [...] }.)
// Output: per-pair median/p10/p90/min/max, median delta %, IQR + outlier
//   rate per arm, first-half vs second-half drift, and a noise-vs-effect
//   comparison. Prints NO acceptance verdict (a human applies the bar).
// Usage: node benchmarks/stage20/analyze.mjs <result.json>
import fs from "fs";
const p = process.argv[2];
if (!p) { console.error("usage: node benchmarks/stage20/analyze.mjs <result.json>"); process.exit(1); }
const r = JSON.parse(fs.readFileSync(p, "utf8"));
const pairs = r.pairs ?? [r];
const q = (s, k) => s[Math.min(s.length - 1, Math.floor(k * s.length))];
const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const med = q(s, 0.5);
  const q1 = q(s, 0.25), q3 = q(s, 0.75);
  const iqr = q3 - q1;
  return {
    n: s.length, min: s[0], p10: q(s, 0.1), med, p90: q(s, 0.9), max: s[s.length - 1],
    mean: s.reduce((x, y) => x + y, 0) / s.length, iqr,
    outliers: s.filter((x) => x > 3 * med).length, // decoy/CFI-reset candidates
  };
};
for (const pr of pairs) {
  console.log(`== ${pr.workload} seed=${pr.seed} status=${pr.status} native=${pr.nativeCheck} bytes=${pr.bytesA}/${pr.bytesB}`);
  if (!pr.rawA || !pr.rawB || pr.rawA.length < 1) { console.log("   no timed samples"); continue; }
  const A = stats(pr.rawA), B = stats(pr.rawB);
  const dMed = ((B.med - A.med) / A.med) * 100;
  const dMean = ((B.mean - A.mean) / A.mean) * 100;
  const noise = (A.iqr / A.med) * 100;
  const h1 = stats(pr.rawA.slice(0, Math.floor(pr.rawA.length / 2)));
  const h2 = stats(pr.rawA.slice(Math.floor(pr.rawA.length / 2)));
  const drift = ((h2.med - h1.med) / h1.med) * 100;
  const f = (x) => (x * 1000).toFixed(3) + "ms";
  console.log(`   A: n=${A.n} min=${f(A.min)} p10=${f(A.p10)} med=${f(A.med)} p90=${f(A.p90)} max=${f(A.max)} IQR=${f(A.iqr)} out3x=${A.outliers}`);
  console.log(`   B: n=${B.n} min=${f(B.min)} p10=${f(B.p10)} med=${f(B.med)} p90=${f(B.p90)} max=${f(B.max)} IQR=${f(B.iqr)} out3x=${B.outliers}`);
  console.log(`   deltaMedian(B-A)=${dMed.toFixed(2)}% deltaMean=${dMean.toFixed(2)}% A-noise(IQR/med)=${noise.toFixed(2)}% A-drift(2nd-vs-1st-half)=${drift.toFixed(2)}%`);
  console.log(`   init: readA=${(pr.readA * 1000).toFixed(1)}ms readB=${(pr.readB * 1000).toFixed(1)}ms compileA=${(pr.compileA * 1000).toFixed(1)}ms compileB=${(pr.compileB * 1000).toFixed(1)}ms`);
}
