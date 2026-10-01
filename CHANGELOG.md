# Clyde Upgrade Changelog

Incremental, benchmarked stages. Every entry: FILE / CHANGE / REASON /
MEASURED / RISK / TESTS. Baselines in `benchmarks/` (`baseline.json` pre-change,
`final.json` post-change; fixed seed 1234; `node benchmarks/run-baseline.mjs`).

Conventions: times are single-run wall ms (run-to-run variance ± several ms —
only consistent directional deltas across all 9 fixtures count). `none` path
is the AST-only control: byte-identical before/after in every comparison.

## Stage 0 — Protected baseline (no code changes)

- Added `benchmarks/fixtures/*.lua` (9 fixtures: tiny/small/medium/large/
  function-heavy/string-heavy/table-heavy/flow-heavy/vm-heavy) and
  `benchmarks/run-baseline.mjs` + `compare.mjs`.
- Recorded commit `e56f368`, `npm run build` clean, `npm test` 22/22.
- Key finding: register-VM fixed overhead dominates small inputs
  (25 B input → ~26 KB output); `reg-normal` 6–187 ms across fixtures.

## Stage 1 — Regression tests (36 tests)

- FILE: `tests/regression.test.js` (extended 22 → 36).
- CHANGE: semantic `INPUT→OBFUSCATE→EXECUTE→COMPARE` coverage (operators,
  scope/shadowing, compound/concat, varargs/select, pcall errors, numeric
  loops, string length, continue, if-else expr, type stripping, preserved
  globals) + error-path tests. Extended `runStack` env (pcall/select/
  unpack/error).
- Findings filed, not fixed here: generic-for over mock `pairs()` hits a
  stack-VM `CALL_MULTI`/`TFOR` limitation (`src/vm/vm-runner.ts:463`);
  truncated `local x = ` validates true (parser error-tolerance);
  unclosed short/backtick strings at EOF are lexer-silent
  (`src/lexer/Lexer.ts:311` only errors on newline). Tests pin the cases
  the code actually rejects (`--[[oops`, `local 123`, `function (`).
- MEASURED: n/a (tests only). RISK: low (additive). TESTS: 36/36.

## Stage 2 — Shared obfuscation engine (no behavior change)

- FILE: `src/engine/obfuscatePipeline.ts` (new); `src/server.ts`,
  `src/cli/obfuscate.ts`, `src/cli/reg-vm-obfuscate.ts`, `src/index.ts`.
- CHANGE: single `runObfuscatePipeline(code, opts)` engine
  (`lex→parse→[encode]→[scramble]→rename→compile/generate/print`) with
  `PipelineLexError`. All three callers keep exact flag semantics, incl.
  quirks: CLI `--one-line` still ignored (always `printChunk`),
  `--junk/--compress` still no-ops, reg CLI still skips encode/scramble,
  reg CLI `debugTrace:false` preserved via new `debugTrace` passthrough,
  reg CLI `[RegVM] Bytecode:` stderr telemetry preserved via new
  `onBytecode` hook (no double compile).
- MEASURED: `benchmarks/after-pipeline.json` == `baseline.json` byte-for-byte
  on `none` path. RISK: medium (touches all entry points) → mitigated by
  quirk-preserving mapping + 5 new engine tests. TESTS: 41/41.

## Stage 3 — Explicit profiles, BALANCED default, generic-by-default target

- FILE: `src/engine/profiles.ts` (new); `src/vm/bootstrap-template.ts`;
  `src/vm/reg-vm-gen.ts`; `src/engine/obfuscatePipeline.ts` (`target`
  passthrough); `src/server.ts` (`profile`+`target`); `public/index.html`;
  `public/app.js`; `src/index.ts` (additive exports).
- CHANGE:
  - `resolveProfile({FAST|BALANCED|MAXIMUM, target, seed, overrides})`.
    FAST = AST-only; BALANCED = rename+encode+scramble+reg/normal, generic;
    MAXIMUM = reg/max, generic unless `target === "roblox"` (then
    `executorGlobals:true`). No MAXIMUM-only features in lower tiers.
  - Bootstrap Roblox Kick/warn-flood block
    (`bootstrap-template.ts:438-458`, previously unconditional) gated behind
    `robloxAntiTamper === true`, wired from existing (previously ignored)
    `RegVMGenOptions.target`. Generic output no longer references
    game/Players/Kick. Stack `vm-gen.ts:2976` `pcall(return game)` probe left
    for the stack stage (pcall-guarded, benign).
  - Server: `profile` selects defaults, explicitly present fields override;
    unknown profile → 400; legacy (no profile) path byte-identical except
    the intentional generic gate. Cache key extended.
  - UI: profile select (BALANCED default), hardening default max→normal,
    full dirty-tracking so FAST never inherits BALANCED checkbox state.
- MEASURED (`baseline.json` → `after-stage3.json`): `none` identical;
  `reg-normal` −771…−808 B every fixture (removed block); build time neutral
  (within run variance). Server smoke: legacy/profile/FAST/cache-hit/400
  all OK. RISK: medium (intentional generic-output change) → justified by
  decision 3, locked by tests. TESTS: 47/47 (profile mapping, target mapping,
  gate size delta, UI defaults).

## Stage 4 — Register-VM handler-noise gate (measured)

- FILE: `src/vm/reg-vm-gen.ts` (`BuildCtx.handlerNoise`, `buildHandlerBodies`).
- CHANGE: the existing-but-never-consulted `handlerNoise` feature flag is now
  honored; default OFF (was: unconditional `local dv=...;` dead store in ~70%
  of handlers). Proof of deadness: fresh `randomName` never referenced
  elsewhere in the handler body (`buildHandlerBodies`); RHS (`R[i]`, bit ops,
  `type()`) side-effect-free. Deterministic per-op seeding made it a pure
  fingerprint. `forceFeatures: ["handlerNoise"]` restores legacy emission.
  RNG stream neutral (noise used save/restore of `_rngState`).
- MEASURED (`after-stage3.json` → `after-noise.json`): `reg-normal` −283…−410 B
  every fixture (~1.3%); `none` identical; build time neutral. Runtime
  (removed per-instruction dead RHS evaluation) reasoned from code, NOT
  measured — no Luau executor exists in this environment (only the stack
  `vm-runner.ts` reference interpreter); semantics preserved by construction
  + lex-clean outputs + suite green.
- RISK: low. TESTS: 48/48 (incl. flag both-ways test).

## Cumulative (baseline → final)

- `none`: byte-identical on all fixtures (AST pipeline untouched).
- `reg-normal`: −1064…−1203 B per fixture (~4%: ~800 B generic gate + ~350 B
  noise gate). Deterministic per (seed, input): repeat runs byte-identical.
- `stack-normal`: ±few bytes run-to-run with fixed seed — PRE-EXISTING
  nondeterminism in `vm-gen.ts` (unseeded randomness outside `seedRandom`),
  proven by repeat runs, untouched by this work. Filed for the stack stage.
- Build times: no consistent directional change (single-run noise dominates).

## Stage 6 — Dead code, determinism, runtime foundation (6A–6I)

### 6A/6B. Junk gate — default ON preserved (per constraint)

- FILE: `src/vm/reg-vm-gen.ts` (`BuildCtx.deadCodeInjection`, twin block
  `:2061`, `generateJunkFragments` param, call site `:3515`); `src/server.ts`
  (additive `disableFeatures` forwarding + cache key).
- PROOF (reference analysis): twins (`:2055-2069`) only enter
  `forwardDecls`+`fragments`, never `chainCalls` (`:2129`: `nPre/nAll/nProtos`
  only) and no `nAll` variant (`:2071-2118`, all close over `realFns`) or
  dispatch arm (`:1567-1746`) references them. `generateJunkFragments`
  (`:2134`) emits bare dead-store assignments (cases 0,1,3-8 write
  never-read locals with side-effect-free reads) + one uncalled function
  (case 2); single caller (`:3515`). No flag/level/dispatch path invokes them.
- DEFAULT: `featureEnabled(options, "deadCodeInjection", true)` — historical
  output preserved; all profiles unchanged (none set the flag). No CLI flag
  or config-name changes; the existing `disableFeatures` array is now
  functionally honored end-to-end (API → engine → generator).
- MEASURED: default output byte-identical on all 9 fixtures
  (`final.json` vs `after-junkgate.json`: reg/none 0 diff); disabled path
  −1060…−2075 B per fixture (−0.7…−7.6%), all lex-clean. Build time neutral.
  Semantic equivalence of the disabled path: static (above) + lex-clean;
  empirical execution proof deferred to the register runner (6F) — marked,
  not claimed.
- Default-change decision: NOT taken. Evidence recorded for separate
  profile-level decision; profiles intentionally untouched.
- RISK: low. TESTS: +1 both-ways test (49 → 49 incl. earlier additions).

### 6C/6D. Determinism fixes + reproducibility API

- `src/engine/obfuscatePipeline.ts`: stack branch now passes
  `polymorphicSeed: polySeed` (was computed then dropped — seed had zero
  effect on stack output).
- `src/vm/vm-gen.ts:3374`, `src/vm/reg-vm-gen.ts:3322`: `||` → `??`, so
  `seed:0` is a valid deterministic seed (was: silently random).
- `src/vm/vm-gen.ts:3650-3651`: watermark fingerprint derived from the seeded
  stream when seeded; wall-clock/random only when unseeded. (Correction to
  an earlier note: the pre-fix stack run-to-run variance was dominated by
  this random watermark, not by deeper unseeded rng — direct double-generation
  with seed is now byte-identical, `benchmarks/verify-stable.json`.)
- Additive `polymorphicSeed?`: `ProfileRequest`/`resolveProfile`, server
  options + cache key, engine (already declared). Omitted = prior behavior.
  reg-CLI keeps hardcoded `Date.now()` (explicit production randomness).
- TESTS: +6 (stack/reg same-seed identical incl. `seed:0`, override honored
  11-vs-12, stack-max watermark deterministic).

### 6E. Reproducibility gate

- `benchmarks/repro-check.mjs`: per (fixture × none/stack-normal/stack-max/
  reg-normal/reg-max-tiny-small × seed) double-generation + byte compare,
  with loc-stripped token/AST/obfuscated hashes to bisect divergence.
- RESULT: ALL REPRODUCIBLE — 41/41 configs byte-identical, including
  stack-max (previously impossible). Stack-max outputs 140–460 KB noted.

### 6F/6G. Register runner + profiling (reference only)

- `src/vm/reg-runner.ts` (new): TS reference interpreter for exactly the
  opcodes `regCompile` emits (LOADK/X, NIL/BOOL, MOVE, globals, tables,
  arithmetic incl. Lua-modulo, CONCAT, JMP/EQ/LT/LE/TEST, CALL/RETURN with
  B/C multi conventions, FORPREP/LOOP, TFORLOOP, SETLIST incl. B=0-to-top,
  CLOSURE/upvalue boxes mirroring `vm-runner.ts`, VARARG, SELF, ITERPREP,
  CLOSEUPVAL). `TESTSET/PCALL/XPCALL/TAILCALL/FUSED_*` throw explicitly —
  never emitted by the compiler, semantics not guessed. Compiler untouched:
  two runner bugs found during bring-up (upvalue-frame confusion, inverted
  TFORLOOP branch) were fixed against compiler evidence, verified by
  disassembly (`benchmarks/probe-dis.mjs`, since removed).
- TESTS: +38 (every emitted opcode incl. 300-constant LOADKX spill, 3-deep
  closures, method/self, pcall-as-global, stack/register cross-agreement).
  Suite 93/93. Runner is NOT a semantics source: cross-checked vs stack
  runner on overlapping programs.
- `benchmarks/reg-profile.mjs`: static mix (JMP 17.1%, MOVE 13.3%, LOADBOOL
  11.4% — comparison lowering costs EQ+JMP+2×LOADBOOL) + runReg
  microbenchmarks (arith/call/global/closure/string, median-of-5).
  Luau wall-time remains UNMEASURED (no executor in this environment);
  numbers measure the reference interpreter and transfer only as op-mix/
  relative hot-spot evidence.

### 6H. First measured optimization: the junk gate (this stage)

- The 6A/6B gate IS this stage's optimization: measured −1…−2 KB per reg
  build at zero semantic cost (never-executed definitions), default output
  untouched. Runtime effect: load-time definitions removed; per-instruction
  dispatch unchanged — Luau wall-time UNMEASURED (see 6G limits), not claimed.
- Deliberately NOT done: dispatch-loop edits (unmeasurable here),
  CFF-fake removal (CFG-visible, needs harness data), encryption redesign,
  VM merge, new junk.

### Stage 6 verification

- `npm run build` clean; 93/93 tests; repro-check ALL REPRODUCIBLE;
  server smoke (legacy/profile/FAST/cache/400/polyseed/disableFeatures) OK;
  `verify-stable.json` confirms full-pipeline determinism; no public renames
  (only additive `polymorphicSeed`, `disableFeatures` forwarding).

### Exact next recommended optimization

Conditional per-activation allocs in emitted init (`reg-vm-gen.ts:1325-1326`):
omit `local ic={}` unless `usedOps` has GETGLOBAL/SETGLOBAL (handlers
`:492/496` — fused GGET variants verified `ic`-free at `:690-749`), and
`local openUVs={}` unless CLOSEUPVAL/CLOSURE present (`:602-624`). Reference
sets exhaustively verified; `usedOps` is post-fusion (`:3435`) and available
before `buildVMRuntime`. Expected: −2 tables/activation on global-free and
closure-free programs; zero effect otherwise. Requires the runner harness
(now exists) for equivalence proof. One change, measured, then stop.

## Stage 7 — Register-VM performance (7A–7L)

Rule enforced throughout: one change at a time, each
BASELINE → EDIT → BUILD → TEST → BENCHMARK → DIFF REVIEW → ACCEPT/REVERT.
Suite grew 93 → 105 (9 high-sensitivity logic tests + TESTSET unit test).

### 7A. Conditional init (ACCEPTED)

- FILE: `src/vm/reg-vm-gen.ts` (`buildVMRuntime` init block).
- CHANGE: `local ic/openUVs/varargs(+vaCount)` emitted only when
  `usedOps` (post-fusion, main+protos; undefined in debug = unchanged)
  contains a consumer op (GETGLOBAL/SETGLOBAL, CLOSEUPVAL/CLOSURE, VARARG).
  Reference sets exhaustively verified incl. fused handlers (`FUSED_GGET[_CALL]`
  bypass `ic` by design); child runs build their own varargs.
- MEASURED (`after-stage6.json` → `after-condinit.json`): reg-normal
  −130…−136 B on 8/9 fixtures (0 where the ops are genuinely used);
  none/stack identical; gen time neutral; runner micros neutral (runner
  executes compiled chunks, unaffected); repro-check green.
- Runtime (generated): −1–3 tables/activation where ops absent — reasoned
  from emitted code, Luau wall-time UNMEASURED (no executor). TESTS: 95/95
  incl. new debug-init preservation + global-free generation tests.

### Runoff A — TESTSET lowering for and/or (REVERTED)

- Prototype: `TEST+JMP` → `TESTSET+JMP` in `compileBinaryExpr`
  (`src/vm/RegCompiler.ts`), plus spec-semantics TESTSET in the runner.
- RESULT: semantics held (all logic-gate tests green) but size deltas were
  inconsistent (+1029 B worst, −524 B best) — the shape change perturbs
  downstream fusion/CFF coin flips without removing any dispatch
  (identical instruction count; redundant self-store on falsy path).
  Verdict: neutral-to-worse → fully reverted (`RegCompiler.ts` zero diff).
  Runner keeps its 5-line TESTSET case (spec-complete) with a unit test;
  boundary test switched to TAILCALL.

### Runoff B — CMP→BOOL via LOADBOOL skip slot (ACCEPTED)

- FILE: `src/vm/RegCompiler.ts` (`compileComparison` only; 4 lines → 2).
- CHANGE: `EQ+JMP+LOADBOOL(1,1)+LOADBOOL(0,0)` → `EQ+LOADBOOL(0,1)+
  LOADBOOL(1,0)`. Verified for all 6 operators/inversions (skip logic lives
  in the unchanged EQ/LT/LE). Tradeoff documented: `FUSED_EQ/LT/LE_JMP`
  can no longer fire (no trailing JMP); fused TEST+JMP (the common branch
  shape) unaffected.
- MEASURED: JMP −410 (−33% of all JMPs, exactly the comparison sites);
  reg-normal bytes mostly down (large −26 KB, small −1.2 KB, flow −0.8 KB;
  tiny/table +0.6–0.8% from fusion/CFF cascade); gen time neutral;
  runner micros neutral incl. new comparison-heavy micro
  (pre-B 75.6 vs B 79.9 ms, bands fully overlapping);
  repro-check ALL REPRODUCIBLE; 105/105 incl. short-circuit, side-effect
  order, nil/false/0-truthiness, nesting, assignment targets, upvalues,
  all 6 operators, stack/register agreement.
- Memory: no new allocations introduced (one fewer instruction slot per
  comparison). RISK: low (lowering-only, no VM/handler changes).

## Stage 9B–9H — Fusion trace, runoff, LOADKX collapse (ACCEPTED)

### Trace/audit findings (measured, not assumed)

- Pipeline order verified: fusion (7–10/12 patterns, 60–85% rate, jump-veto,
  in-place) → CFF → usedOps → serialization; telemetry already separates
  candidates (`countFusionMatches`) vs fused (`[RegVM] Fused N`) vs final.
- Adjacency discovery: `GGET_CALL`/`SELF_CALL` fire ONLY on zero-arg calls —
  arg `LOADK`s break the 2–3 slot adjacency (`math.floor(2.5)` → GGET only;
  `o:m()` → SELF_CALL=1). 9F fixtures cover both fusing and non-fusing
  shapes for all three zero-hit patterns (now GGET_CALL=1, SELF_CALL=1,
  LOADK_RET=1 detected).
- No width constraint anywhere: flat `number[]` code, `LOADK` already
  carries full indices at literal sites; VM handler, runner, serialization
  and dispatch all pass full values through.

### Runoff

- A (EQ/LT/LE RK-inline): **REJECTED** — +60…+190 B on every measured
  fixture (inlined ternaries longer than the calls); no instruction-count
  reduction; runtime benefit real-but-unmeasurable here. Reverted to zero
  diff.
- B (LOADKX collapse): **ACCEPTED** — `constRK` spill `LOADKX+EXTRAARG` →
  single `LOADK` (`src/vm/RegCompiler.ts:169`, +4/−2 lines).

### B measurements (seed 1234, BEFORE→AFTER)

- spill-heavy: LOADKX/EXTRAARG 45/45 → 0/0; instrs 736→691 (−45, exactly one
  per spill); maxRegs 4→4; out 37350→36083 B (−1267, −3.4%).
- large.lua: spills 146/146 → 0/0; instrs 8334→8188 (−146); maxRegs
  403→403; out 193888→192039 B (−1849, −1.0%); greedy 806→952 (collapsed
  LOADKs form new LOADKK adjacencies), fused stable 662 (rate-limited).
- Temp discipline identical (same allocTemp per site, same lifetimes);
  fusion/CFF unaffected structurally (no pattern consumes LOADKX);
  runner models both paths (spill suite green either way).
- Runtime: −1 dispatch + −1 code[] fetch per spill execution (handler
  shapes); spill-loop micro 0.33 ms; Luau wall-time UNMEASURED (no
  executor), stated not claimed. Gen time neutral.
- Gates: 119/119 (incl. 3 new spill tests: no-LOADKX emission lock,
  260-constant boundary+reuse=359, closure capture), repro-check ALL green,
  server smoke OK, stack/none outputs identical.

## Stage 12C — Fused DIV super-op (opcode 68) ACCEPTED

- `src/vm/vm-gen.ts` (+11/-4): matcher maps `arith===12` to 68;
  `OPCODES_3ARG` += 68; shuffle space 68→69; new raw-`/` h[68] mirroring
  the h[57-59] family (native `__div` dispatch, IEEE div-zero); handler
  emission loop `<69`; alias loop `0,68`. 64-67 decoys/alias, 0x3F refresh,
  MOD/POW/IDIV, CONCAT paths all untouched (verified by diff).
- `src/vm/vm-runner.ts`: op-68 branch via shared `arithMM` (`/`, `__div`).
- 64+ boundary audit: all walkers arity-set-driven (68 covered);
  `mapBytecode` length-generic; fake handlers skip usedOps; CFF inline
  dispatch opcode-generic; max-level encryption makes handler/alias
  internals textually unassertable — emission proven at debug level
  (`[68]=function()`), alias bound single-sited and diff-verified.
- Measurements (div-shapes × 5 seeds): 5 raw windows, all jump-safe,
  fusedProj 2-5 (gate noise); before/after byte deltas (+2573/-4539/
  -2732/+546/-4929) are seed-polymorphism noise — fixed cost bounded
  statically at ~250-400B/output (~0.2% of max-level size). Dispatches:
  4→1 per fused site (exact); loop-carried median -17% (means
  inconclusive — runner wall-time mostly unresolvable, honestly reported).
- Drift: 4/105 fixture-seeds shift existing op-60/62 fusion by ±1 via
  rng-stream repositioning (intended polymorphism; same-seed repro green).
- 174/174 tests (15 new `div-fusion`), repro ALL REPRODUCIBLE, server
  smoke OK, CLI max/stack smoke OK (149069B div-shapes output).
- Decision: ACCEPT — nil semantic risk, deterministic, dispatch benefit
  demonstrated, fixed cost negligible and documented.

## Stage 11D-2 — CONCAT production audit (investigation only, no production changes)

- Trace: `..`/interpolation/`..=` lower to Op.CONCAT (`Compiler.ts:300,423`;
  `..=` via assignment path); fusion fires ONLY on local-local-STORE
  windows (`vm-gen.ts:121`); h15 (`:2273`) is pcall+tostring-fallback,
  h63 (`:2373`) is raw `..`; register VM CONCAT is raw native
  (`reg-vm-gen.ts:529-531`). h15's fallback is unique among all handlers.
- Intent verdict D (implementation artifact, no contractual guarantee):
  single squashed commit (no history), zero comments/tests/docs requiring
  the fallback, register path has none, no existing test exercises
  bool/nil concat. Source semantics REQUIRE error on bool/nil/plain-table
  concat — h63 conforms, h15 extends the language.
- Mismatch scope: exactly bool/nil/plain-table-without-__concat operands;
  str/num/numeric-strings and all __concat configurations MATCH.
- Frequency (`benchmarks/concat-fusion-census.mjs`, exact matcher+PRNG
  replication, 5 seeds): 5 CONCAT ops / 17 fixtures, 0 candidates —
  h63 requires the narrow local-local-store shape (`local s = a..b`,
  `s ..= localRhs`); chained/interp/args/returns never fuse. Uncommon in
  fixtures, reachable via common idioms; not dismissed.
- Options analyzed, none implemented: A (h63 gains fallback, ~size-neutral
  handler, +pcall runtime, extends language further), B (never fuse CONCAT,
  1-line matcher change, shifts rng stream), C (shared helper, redesign-adjacent), D (document limitation).
  Recommendation: D per prior review decision (artifact contract → document).
- `tests/concat-semantics.test.js`: 16 matrix tests (143 total green);
  bare `.toThrow()` throughout, Luau column marked REASONED (no executor).

## Stage 11D-1 — Reference-runner correction (runner + tests only, no production changes)

- `src/vm/vm-runner.ts`: fused 57/58/59/62 now model via `arithMM`
  (same helper as unfused; correct `__add/__sub/__mul` names); the
  `arithFused` helper is deleted. Fused 63 now models CURRENT generated
  h[63] (raw `..`): `__concat` dispatch, string/number coercion, else
  runtime error (presence only). `__string_mt` tagged harness-only.
- `tests/regression.test.js`: metamethod-divergence test rewritten to
  assert fused≡unfused (127 tests green); new 63 test covers `__concat`,
  coercion, and bool/plain-table error presence.
- `benchmarks/semantic-matrix.mjs`: all arithmetic categories MATCH;
  `bool..str` now faithfully MISMATCH (unfused h15 coerces, fused h63
  errors) — the 11D-2 audit subject. No production code touched.

## Stage 11C — Super-op semantic audit (analysis only, no production changes)

- Reframed the 11A–11B finding: generated fused handlers use plain Lua
  operators, which dispatch standard metamethods natively — so fused ≡
  unfused in generated output for standard `__add/__sub/__mul`. The observed
  mismatch lives in the TS runner mirror (`arithFused` throws instead of
  consulting metamethods), confirmed by `benchmarks/semantic-matrix.mjs`
  (12 categories × unfused-runner vs fused-runner; generated column by
  language-spec reasoning, marked UNMEASURED — no Luau executor exists).
- Matrix result: MATCH on numbers, numeric strings, all concat-string/number
  cases; MISMATCH (runner-only) on metamethod operands, bad strings, bools,
  nil, plain tables — every one of which the runner's unfused path also
  models non-strictly (JS coercion, `__eq` single-side lookup, `__string_mt`
  harness extension, pcall-first ordering in generated `arithMM` that the
  runner lacks).
- GENUINE generated-level discrepancy found (not runner-only): fused h[63]
  is raw `..` and errors on boolean/nil/table operands, while unfused h[15]
  coerces via pcall+tostring fallback. Narrow trigger (non-string/number
  concat + fusion fires + max level); no fix applied this stage.
- 60/61 moves classified A (no operation performed — cannot mismatch).
- Recommended fix (runner only): route fused 57/58/59/62 through the existing
  `arithMM` and add the `__concat` check to 63; delete `arithFused`; rewrite
  the divergence test to assert fused≡unfused. No generator change justified
  for arithmetic. Concat-fallback parity (h[63]) is a separate production
  decision for review.

## Stage 9A — Fusion-aware metric layer (instrumentation only, no behavior change)

- `countFusionMatches(chunk)` (`src/vm/reg-vm-gen.ts`, also exported from
  `src/index.ts`): reuses `buildFusionPatterns` matchers over all 12 IDs;
  reports independent per-pattern hits + greedy disjoint total in
  registration order (mirrors `fuseCode` minus veto/rate); read-only,
  chunk never mutated; deterministic.
- `benchmarks/fusion-metrics.mjs` (+ `fusion-metrics.json`): per fixture —
  instruction/opcode counts, 12-pattern census, greedy total, actual fused
  telemetry (parsed `[RegVM]` lines), CFF/dispatch variant, gen ms, heap,
  final bytes.
- Measured corpus facts: TEST_JMP dominates (large: 802); EQ/LT/LE/TESTSET_JMP
  zero everywhere (confirms CMP→BOOL dead-pattern finding);
  GGET_CALL/SELF_CALL/LOADK_RET zero on this corpus (no `g.t()`/method/
  single-const-return shapes); fused ≤ greedy on all rows (subset + rate
  explain the gap); MOVE_MOVE spikes on assignment-heavy code (medium: 60).
- TESTS: +5 (hand-built counts, GGET overlap greedy=1, non-mutation,
  proto recursion + determinism, CMP→BOOL zero-candidate lock). 116/116.
- Output unchanged: 10/11 fixtures byte-identical to `after-move.json`
  (assign-heavy delta traced to the threading experiment window, not 9A;
  verified via disassembly hand-count: TEST_JMP=2, GGET=3, MOVE_RET=1,
  greedy=6 on tiny).
- No lowering, pool, spill, RK, lifetime, dispatch, stack, crypto, nesting
  or CFG changes in this stage.

## Stage 8 — MOVE threading (go/no-go → REVERTED, finding kept)

### Prize-sizing (blocked the narrow implementation from shipping blind)

- `benchmarks/prize-size.mjs` (kept as an asset): narrow pattern
  (single-target/single-value/local-ident-LHS/pure-RHS) is **0% corpus-wide**
  — but the corpus had no plain-reassignment code at all. Added
  `benchmarks/fixtures/assign-heavy.lua` (7/11 eligible, 17% of instrs,
  ~39% of MOVEs) and `multiret-heavy.lua` (spread/multi-value contrast).
- GO decision: narrow subset only, strict exclusions (multi/spread, table,
  global/upvalue, compound, ordering hazards), reader analysis mandatory.

### Narrow implementation (reverted after measurement)

- FILE (since reverted): `src/vm/RegCompiler.ts` (`compileAssignStmt` A1
  branch + `isThreadableRhs` gate: Nil/Bool/Number/String/Identifier only).
- Verified firing (`x=42` → `LOADK x`; `x=y` → `MOVE x,y`); 111/111 incl. 6
  new trap tests (aliasing, swap order, table/global/upvalue non-threading,
  single-pure, extras evaluation, cross-runner) — tests KEPT, they validate
  both lowerings.
- MEASURED on assign-heavy (seed 1234): −7 MOVEs/−7 instrs, but output
  **+258 B (+1.0%)** via fusion/CFF cascade (fewer MOVEs starve
  MOVE_MOVE/MOVE_RET fusion); all other fixtures byte-identical;
  runner micros neutral; repro green. (An earlier +227 B figure mixed the
  threading delta with the CMP→BOOL delta via a stash containing both
  changes; the clean A/B isolation above supersedes it.)
- VERDICT per 8I: revert (no measurable benefit; byte regression).
  `RegCompiler.ts` zero diff. Second data point (after TESTSET) that local
  instruction savings are eaten downstream — directs Stage 9 at
  fusion-aware lowering, not raw instruction counts.

### Process incident (recorded honestly)

- Reverting via `git checkout -- src/vm/RegCompiler.ts` also wiped the
  accepted Stage 7 CMP→BOOL change (both uncommitted in one file).
  Detected by byte-comparison (`after-revert.json` == pre-B bytes);
  B re-applied and re-verified byte-identical to `proto-b.json` on all
  old fixtures (`after-restore.json`). Lesson: stage-accepted changes get
  verified (and preferably committed) before file-level reverts.

### Analyses delivered (plan-mode evidence, filed, not implemented)

JMP/MOVE/LOADBOOL origins (~60% lowering artifacts, ~30% required,
amplified by scrambler opaque predicates + CFF); dispatch variants costed
(binary-tree cheapest, xor/grouped pay per-instr `bBxor`); RK-inline gaps;
build-time vs generated-runtime allocation split. Next-in-queue: MOVE
threading in `compileAssignStmt` (RHS directly into `localReg`, mirroring
`compileLocalStmt`) — compiler-only, runner-validated.

## Intentionally deferred (documented next steps)

1. Junk decoder twins (`reg-vm-gen.ts:2055-2069`, 3–6 never-called functions,
   pure bytes) — verified dead (absent from all `chainVariant` orchestration
   and `chainCalls`), gate next, same pattern as noise.
2. Dispatch-loop micro-opts — REQUIRE a Luau execution harness first; no
   register runner exists (`vm-runner.ts` is stack-only). Unmeasurable here.
3. Stack generator seed discipline + nesting cost evaluation (register-first
   priority).
4. Dead generator code with zero output effect (`generateFakeHandlers:2386`
   never called) — cleanup-only, no measurement possible.
5. Parser/lexer error-tolerance gaps from Stage 1 findings (Phase 17).
6. `generateDynamicSeed` (`reg-vm-gen.ts:3216`) mixes wall-clock/pid/crypto —
   fine (only used when no seed given), but documents why unseeded runs differ.
