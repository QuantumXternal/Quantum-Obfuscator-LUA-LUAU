# Stage 20 tripwire identity-mask — benchmark procedure (remediation)

Candidate: `bit32.band(stateAcc,0xFFFFFFFF)==C` → `stateAcc==C`, two sites in
`src/vm/vm-gen.ts` max dispatch (decoy line + CFI line). Status: STRUCTURAL
PASS, RUNTIME UNMEASURED/INCONCLUSIVE. Do not merge. Do not push.

## Acceptance bar (unchanged)
1. MATERIAL + REPRODUCIBLE BENEFIT → CANDIDATE FOR PRODUCTION REVIEW
2. NO MATERIAL BENEFIT / NOISE → DEFER
3. REGRESSION / SEMANTIC OR INTEGRITY FAILURE → REJECT
A verdict needs full 51-rep series with per-run checksums on runnable pairs;
spot samples are preliminary observations only, never evidence.

## Artifacts (already generated, Real workspace — NOT in repo)
- `stage20/<workload>-s<seed>-{A,B}.lua` — full outer pairs (baseline A =
  production 478290a; experiment B = exact 2-site patch). 11/15 STOPPED:
  outer bootstrap nil-call (`:3/:4/:6/:7/:10: attempt to call a nil value`,
  empty chunk name = inner-layer bootstrap, pre-dispatch, arm-symmetric,
  pre-existing). Runnable: tight-arith s1234/s7, branch-heavy s7,
  normal-mix s1234.
- `stage20/inner/<workload>-s<seed>-{A,B}.lua` + `manifest-inner.json` —
  VM-focused pairs for all 15 configs (wrappers bypassed in a deleted temp
  generator copy; production untouched). Verified: band sites 2→0, size
  delta exactly −38B on all 15 pairs (two 19-char deletions, nothing else).

## Harness files (this folder)
- `end-to-end.luau` — one outer pair per run (edit PAIR). Warmup 5, 51
  interleaved reps in batches of 6 rounds + `task.wait()` yields.
- `vm-focused.luau` — all 15 inner pairs (edit RUN to split if needed).
  Same protocol and yields.
- `generate-inner.mjs` — regenerates inner artifacts (aborts unless
  wrapper call sites x1 each, tripwire sites x2, B residual 0).
- `analyze.mjs` — local stats from returned JSON (median/p10/p90/min/max,
  delta %, IQR noise, 3x-median outlier rate, half-split drift, init times).

## Exact execution (healthy client only; sequential; never parallel)
1. `list-clients` probe:true — proceed only if responsive.
2. Re-verify runnable pairs first (one pair per call, checksum + dt).
3. END-TO-END: for each runnable pair, set PAIR, run `end-to-end.luau`
   via get-data-by-code (120s timeout), save returned JSON to
   `benchmarks/stage20/results-e2e-<workload>-s<seed>.json`. STOP the pair
   (record exact error) on any checksum/compile failure; continue others.
4. VM-FOCUSED: run `vm-focused.luau` once (or per-workload RUN slices),
   save JSON to `benchmarks/stage20/results-vmf.json`.
5. `node benchmarks/stage20/analyze.mjs <each result json>`; attach raw
   samples + stats to the report.
6. Verdict per the bar above. No global claim unless all five workloads
   measured. Known variance source: ~1/65536-per-dispatch decoy/CFI resets
   (arm-symmetric; affects p90/max — compare outlier rates, judge on
   medians vs IQR noise).

## Stability rules (from failure analysis)
- Yielded batches only (`task.wait()` every ≤6 rounds and between pairs);
  no full-GC inside timed path; never hold the VM uninterrupted >~2s.
- If the client goes unresponsive: stop, report, do not hammer or loop
  recovery. `start-job` does not schedule in this game — use
  get-data-by-code per the splits above.
