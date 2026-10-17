# Quantum Obfuscator — Security (v2.2.0)

This document records the adversarial and robustness validation for the
v2.2.0 hardening line (Phases 1–5): dual-VM architecture, guaranteed
determinism, and executor-environment hardening. Superseded tool runs are
retained below under "Phase 1 baseline (historical)".

## Architecture summary

- **Register VM** (`reg-vm-gen`): default engine for `vmType: "register"`,
  `vmLevel: "max"`. Seed-derived `RK_OFFSET` constant-bank layout, mutated
  dispatch headers, per-run integrity checks.
- **Stack VM** (`vm-gen`): legacy engine, still exercised by the full matrix.
- **Quantum Protection bootstrap envelope**: layered state-machine loader
  (shuffled states, encrypted+checksummed blob, opaque predicates, key/sbox
  integrity checks). Applied around reg-max payloads unless `NO_CIPHER=1`.
- **Outer wrappers**: `wrapCustomCipher`, `wrapNestedVM`, `wrapStubVM`
  (composable; triple-stacked in the execution matrix).

## Adversarial validation (v2.2.0, MEASURED)

Artifacts: `benchmarks/fixtures/mod-loopheavy.lua`, reg-max. Tool commits
re-verified via `git rev-parse` on the cloned trees in this environment.

| Tool | Commit | Runtime | Command | Result |
|---|---|---|---|---|
| `JamiesNolandGiggleShi1er/ClydeDeobfuscator` | `871020866fb425bd8d290ac10dca0a7129f36ce7` | Node.js | `node cli.js <input.lua>` | **5/5 REFUSE** |
| `caomod2077/Deobfuscator-Luraph-V15` | `892b48ac200e9deda6cd6fd3142bf66abed393c6` | Node.js 18+ | `node deob.js <input.lua> -o <output>` | **5/5 GARBAGE** |

### ClydeDeobfuscator — 5/5 REFUSE

Seeds `1234, 7, 42, 99, 2024` (numeric, reg-max). Every cell: exit 1, explicit
refusal ("this does not look like Clyde output, so there is nothing here I
know how to undo."), no `.clean.lua` written. Standing-baseline re-run also
classifies `REFUSE`.

### Deobfuscator-Luraph-V15 — 5/5 GARBAGE

Seeds `quantum-string-seed-01 … -05` (fresh v2.2.0 reg-max artifacts,
29006/29238/28960/30179/30409 bytes). Every cell: exit 0, output is a
**270–271-byte harness stub only** — no source recovered. The tool's trace
sandbox aborts inside the Quantum bootstrap chunk:

| Artifact | Abort site |
|---|---|
| quantum-max-1 | `[string "Quantum"]:163: attempt to index nil with 'pack'` |
| quantum-max-2 | `[string "Quantum"]:45: attempt to index nil with 'bxor'` |
| quantum-max-3 | `[string "Quantum"]:73: attempt to index nil with 'floor'` |
| quantum-max-4 | `[string "Quantum"]:231: attempt to index nil with 'pack'` |
| quantum-max-5 | `[string "Quantum"]:121: attempt to index nil with 'floor'` |

Behavior note vs Phase 1: the Phase-1 baseline emitted the **identical
27-byte decoy** (`task.wait()\nprint(2, 2000)`) for every input; v2.2.0
artifacts instead drive the tool into per-artifact sandbox aborts (bit32 /
string.pack absent in its harness). Both classify GARBAGE; neither
recovers source.

## Dual-VM execution matrix (24/24, MEASURED)

12 configurations × 2 hosts = 24 runs. Hosts: Luau 0.742 (native) and
PUC-Lua 5.4.8 (with `tests/helpers/lua54-compat.lua` shim). Every cell:
exit 0, stdout `3`.

| Configuration | Seeds | Hosts |
|---|---|---|
| plain reg-max | 1234, 42, 2024, 31337 | Luau + PUC |
| custom-cipher wrapped | 1234, 42, 2024, 31337 | Luau + PUC |
| plain reg-max, `noCompression` | 1234 | Luau + PUC |
| triple-stack (`stub(nested(custom(reg)))`) | 1234 | Luau + PUC |
| nested-only wrapper | 1234 | Luau + PUC |
| stub-only wrapper | 1234 | Luau + PUC |

Result: **24 passed, 0 failed**. The dual-VM nesting path (reg payload
surviving cipher wrapper layers) is covered by `tests/dualvm-nesting.test.js`
in the test suite as well.

## Guaranteed determinism (v2.2.0, MEASURED)

Same source + options + `polymorphicSeed` ⇒ byte-identical artifact, for the
pipeline and for the outer wrappers. Wrapper API: `wrapCustomCipher`,
`wrapNestedVM`, `wrapStubVM` accept an optional `seed` (number ⇒ RNG stream,
string ⇒ 128-bit string-seed path) and reset the shared name counter; without
a seed, behavior is unchanged (ambient stream).

| Build (seed) | Byte-identical ×2 | SHA-256 | Bytes |
|---|---|---|---|
| `runObfuscatePipeline` reg-max, seed `1234` | yes | `f9fef00e4cb6914f0a2ed1482c67ea021e2cff282c077e71ee5fcaa2f7b4856c` | 33910 |
| `wrapCustomCipher(pipeline, 777)` | yes | `3327609802575a52b55b3aa94104e5ae791268afeda2e41434f259c5e6738f01` | 48293 |
| `wrapStubVM(wrapNestedVM(wrapCustomCipher(pipeline, 777), 888), 999)` | yes | `b638694ea353d24248c3743c1b04d21c6fd2d257640758d795d306e25ef2bd67` | 101602 |

Covered by `tests/wrapper-determinism.test.js`.

## Executor environment hardening (new in v2.2.0, MEASURED)

Standard script executors may block `getfenv` (present-but-throwing), omit
`loadstring` (load-only hosts), or ship a `debug` library with hook APIs
stripped. The v2.2.0 bootstrap degrades gracefully in all such environments:

- **getfenv reduction**: every environment resolver attempts `pcall(getfenv,0)`
  and falls back to `_G` (register VM core is `_G`-based; stack VM primary,
  secondary, and debug-level resolvers are pcall-guarded). No hard crash on
  blocked or absent `getfenv`.
- **loadstring reduction**: `loadstring or load` fallbacks in the reg runtime
  boot loader, both env-bootstrap emitters, and the Quantum bootstrap builtin
  capture. Hosts with neither loader degrade via the bootstrap's
  `type(nLoad)..type(nPcall)` guard (`return nil`, no crash).
- **Anti-tamper probe false-positive fix**: the Phase 2.2 corruption probe
  previously fired when `debug` existed but `debug.gethook` was stripped —
  which is the normal shape of an executor's restricted debug library. The
  probe now requires **positive hook detection**: `type(debug)=="table"` and
  `type(debug.gethook)=="function"` and `pcall(debug.gethook)` returns
  non-nil (an actually installed tracer). Stripped-debug hosts are clean;
  genuine dispatch-loop tracing still corrupts output.
- Covered by `tests/restricted-executor.test.js`: restriction profiles
  {`getfenv=nil`, `getfenv`-throws, `debug=nil`, stripped-`debug` table,
  load-only, combined worst-case} across reg-max, stack-max, stack-debug and
  a wrapped reg artifact, on Luau (+PUC for the dual-host profiles). All
  profiles: exit 0, correct stdout.

## Full suite (MEASURED)

`npm test`: **42 suites, 556/556 tests passed** — includes RNG draw-order
canaries (`stackmax-order`, `stackmax-frozen`, `stackmax-puc`,
`tamper-evidence`), unique-output sweep, dual-VM nesting, wrapper
determinism, and restricted-executor suites.

## Environment

Windows; Node.js v24.16.0; Luau 0.742 (`vendor/runtime/luau-0.742/luau.exe`);
PUC-Lua 5.4.8 (`vendor/runtime/lua-5.4.8/lua54.exe`). All classifications in
this section are MEASURED via real CLI runs on the listed tool commits.

## Phase 1 baseline (historical)

The original Phase-1 validation, retained for reference. Artifacts were
reg-max from the same fixture with string seeds `quantum-string-seed-01 … -05`.

| Tool | Commit | Runtime | Command | Result |
|---|---|---|---|---|
| `JamiesNolandGiggleShi1er/ClydeDeobfuscator` | `871020866fb425bd8d290ac10dca0a7129f36ce7` | Node.js | `node cli.js <input.lua>` | REFUSE ×5 |
| `caomod2077/Deobfuscator-Luraph-V15` | `892b48ac200e9deda6cd6fd3142bf66abed393c6` | Node.js 18+ | `node deob.js <input.lua> [-o output]` | GARBAGE ×5 (identical 27-byte decoy) |
| `larpcorrupt/luraph-v15-v14.x-deobfuscator` | `ed79a86cc41187af0480e69f45a4838723fdb099` | Python 3.x | `python deobfuscate.py <input> -o <output>` | CRASH ×5 (`LiftError: could not find the VM loader`) |
| `0x251/Prometheus-Deobfuscator` | `7d0582fc2d150713941f02f8988323629dd054e7` | Python 3.12+ | `python pol.py <input_file>` | GARBAGE ×5 (annotated original only; dispatch analysis zero) |

Standing no-refusal baseline (plain/stack-max/reg) and 10 additional
adversarial cells (seeds 5, 17, 777, 31337, 90210 × reg/stack) all classify
REFUSE with verbatim output and exit 1 (verified during Phase 1.2h).

Phase 1 result: no tool achieved SUCCESS or PARTIAL. Adversarial gate: PASS.
The larpcorrupt and Prometheus cells are historical MEASURED runs against
Phase-1 artifacts (their clones were not present in the v2.2.0 re-run
environment; Clyde and Luraph V15 were re-verified above).
