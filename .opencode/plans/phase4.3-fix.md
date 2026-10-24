# Plan: Fix 4.3 Dual-VM Nesting + Phase 5

## Diagnosis (from debugging session)

The wrapped (outer stack cipher → inner reg VM) artifact fails at runtime:
`[string "Quantum"]:237: attempt to perform arithmetic (add) on nil`

The inner reg VM runs correctly when executed directly (prints 3, reg-execution 10/10). The failure occurs only when the inner is loadstring'd by the outer bootstrap. The inner reg VM's bootstrap calls `getfenv(0) or _G` to resolve its environment; when invoked via the outer's loadstring, `getfenv(0)` may return a restricted/nil environment lacking `bit32`, causing the inner's K/constant decode (which uses `bit32.bxor`) to produce nil and the arithmetic-on-nil error.

## Proposed fix (Option a — env provisioning)

1. In `src/vm/bootstrap-template.ts`, stExec case, before `${nResult}=${nFn}(...)`, inject:
   `if setfenv then pcall(setfenv, ${nFn}, _G) end`
   This forces the inner chunk to run in the host global environment, guaranteeing `bit32`, `getfenv`, `_G`, etc. are visible.

2. Round-trip fidelity check: add a build-time assertion / debug print comparing the inner payload hash before encryption and after decryption is not feasible in generated code cheaply. Instead, verify by running the wrapped artifact on Luau and PUC (must print 3).

3. Rebuild dist, run:
   - Wrapped artifact on Luau + PUC (must print 3).
   - reg-execution (10/10).
   - Full suite (529+).
   - Adversarial: Clyde 1/1 REFUSE, Luraph V15 5/5 GARBAGE.

4. If the setfenv fix resolves execution, commit (4.3) on hardening/phase3, push.

5. If still failing, fallback: investigate the outer bootstrap's env resolution (`nEnvCheck` at line 467) and whether `_G` itself is the outer bootstrap's restricted env. May need to pass an explicit env table built from `rawget(_G, ...)`.

## Then (user-authorized git ops)
- Merge hardening/phase3 → main (non-force, no squash).
- Tag v2.2.0 (annotated: "Phase 3 & 4: Performance Tiers, MBA, CFF, Dual-VM").
- Push main + tag.
- Delete hardening/phase3 locally + remotely.
- Create + switch to hardening/phase5.

## Phase 5 (after 4.3)
- 5.1: Update SECURITY.md with Luraph V15 5/5 GARBAGE + Clyde REFUSE + MBA/CFF proofs.
- 5.3: Self-hostable API with key system (HWID lock, key gen, runtime vars).

## Files to touch
- src/vm/bootstrap-template.ts (stExec setfenv injection)
- (verify) dist rebuild
- SECURITY.md (Phase 5.1)
- (optional) new API files under src/ or a new top-level dir.

## Risk
- setfenv is deprecated in Luau but available; pcall guards it. On hosts where setfenv is nil, the inner inherits the outer env (current behavior).
- The inner reg VM's bootstrap already does `getfenv(0) or _G`, so if setfenv succeeds, getfenv(0) returns _G (full globals).

## Verification commands
- `npm run build`
- `npm test` (529+)
- wrapped artifact run on Luau + PUC
- adversarial dadv.mjs reg/stack 1234
- Luraph V15 on 5 fresh artifacts