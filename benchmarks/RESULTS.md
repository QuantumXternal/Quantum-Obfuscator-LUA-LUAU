# Quantum Obfuscator — Benchmarks (Phase 3)

## Performance tiers

| Tier | vmType | vmLevel | Use case |
|---|---|---|---|
| Turbo | none | normal | AST transforms only (string encoding, renaming). No VM. For `RenderStepped` and performance-critical loops. |
| Balanced | stack | normal | Stack VM with optimized dispatch. |
| Maximum | register | max | Register VM + polymorphic dispatch + anti-analysis (default). |

## Boot-time overhead (Luau 0.742, median of 5, tiny source)

| Tier/VM | Level | Median boot+run |
|---|---|---|
| stack | normal (Balanced) | 15 ms |
| reg | normal | 24 ms |
| reg | max (Maximum) | 25 ms |
| stack | max (Maximum, full obfuscation) | 115 ms |

VM boot itself is ~15-25 ms for normal levels; the stack/max case (125 ms) includes 3 layers of encryption + LZSS + anti-debug. Turbo (no VM) has zero boot overhead.

## Hot-loop instruction count (reg/max, 16 seeds, PUC 5.4.8)

| Stage | Numeric avg | Table avg |
|---|---|---|
| 1.2(c) baseline | 31.07 M | 28.97 M |
| 1.2(d) postD | 32.52 M | 30.20 M |
| 1.2(e) postE | 30.85 M | (n/a) |

Phase 1.2(e) fused ops reduced instruction count by ~5.14% (numeric).

## Comparison vs. Luraph documented degradation

Luraph v15 typically degrades execution by 40-60% on hot loops due to
VM dispatch overhead. Quantum's Balanced mode (stack VM, normal level)
targets < 20% degradation by keeping registers in locals and using
closure-table dispatch (no long if-elseif chains). Maximum mode accepts
higher overhead for anti-analysis strength.

## Macro system

Directive `--@quantum:no-vm` placed immediately above a function
declaration marks that function for exclusion from virtualization. The
pipeline pre-scans source for the directive and records marked function
names in `PipelineOptions.noVmFunctions`. Full per-function exclusion from
the VM chunk is a follow-up (compiler-level split).

## Adversarial (Phase 1.4)

All four tested deobfuscators (Clyde, Luraph-V15, larpcorrupt, Prometheus)
classify as REFUSE / CRASH / GARBAGE on Quantum Maximum output. See
`SECURITY.md`.
