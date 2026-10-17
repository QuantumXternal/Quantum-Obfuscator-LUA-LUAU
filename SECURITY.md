# Quantum Obfuscator — Security (Phase 1)

This document records the adversarial validation performed during Phase 1
of the Quantum Obfuscator hardening effort. All artifacts tested are
**reg-max** (register VM, maximum protection level) generated from
`benchmarks/fixtures/mod-loopheavy.lua` with string seeds
`quantum-string-seed-01` … `quantum-string-seed-05`.

## Tool versions

| Tool | Commit | Runtime | Command |
|---|---|---|---|
| `JamiesNolandGiggleShi1er/ClydeDeobfuscator` | `871020866fb425bd8d290ac10dca0a7129f36ce7` | Node.js | `node cli.js <input.lua>` |
| `caomod2077/Deobfuscator-Luraph-V15` | `892b48ac200e9deda6cd6fd3142bf66abed393c6` | Node.js 18+ | `node deob.js <input.lua> [-o output]` |
| `larpcorrupt/luraph-v15-v14.x-deobfuscator` | `ed79a86cc41187af0480e69f45a4838723fdb099` | Python 3.x | `python deobfuscate.py <input> -o <output>` |
| `0x251/Prometheus-Deobfuscator` | `7d0582fc2d150713941f02f8988323629dd054e7` | Python 3.12+ (networkx, colorama) | `python pol.py <input_file>` |

## Classification table (Quantum reg-max artifacts)

| Tool | Cell 1 | Cell 2 | Cell 3 | Cell 4 | Cell 5 | Notes |
|---|---|---|---|---|---|---|
| ClydeDeobfuscator | REFUSE | REFUSE | REFUSE | REFUSE | REFUSE | Explicit rejection: "this does not look like Clyde output, so there is nothing here I know how to undo." Exit 1, no `.clean.lua`. |
| Deobfuscator-Luraph-V15 | GARBAGE | GARBAGE | GARBAGE | GARBAGE | GARBAGE | Reports success but emits identical 27-byte bogus output (`task.wait()\nprint(2, 2000)`) for every input — not the original source. |
| luraph-v15-v14.x-deobfuscator | CRASH | CRASH | CRASH | CRASH | CRASH | `LiftError: could not find the VM loader (not a LuaObfuscator VM script?)` |
| Prometheus-Deobfuscator | GARBAGE | GARBAGE | GARBAGE | GARBAGE | GARBAGE | Runs but produces only annotated original (`PHASE_BOUNDARY` markers); no recovered source; dispatch analysis all zero. |

## Result

No tool achieved `SUCCESS` or `PARTIAL`. All cells classified as
`REFUSE`, `CRASH`, or `GARBAGE`. Phase 1 adversarial gate: **PASS**.

## Standing baseline (pre-1.2) verification

Standing no-refusal baseline (plain/stack-max/reg) and the 10 new adversarial
cells (seeds 5, 17, 777, 31337, 90210 × reg/stack) all classify as
`REFUSE` with verbatim output and exit 1 (verified during 1.2h).

## Evidence labels

All classifications above are MEASURED on the listed tool commits against
freshly generated Quantum reg-max artifacts (string seeds, standing set).
No projection or simulation was used for the Clyde cells (real CLI runs).
The Luraph/Prometheus cells reflect real CLI runs on the cloned tool trees.
