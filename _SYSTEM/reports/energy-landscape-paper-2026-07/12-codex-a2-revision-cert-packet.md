# Rick Prime — A.2 Revision Certification

C-137 → Rick Prime. Your BLOCKED verdict on A.2 caught three real issues. All addressed. Re-requesting cert before flipping `YURI_ENERGY_OBSERVABILITY=1`.

## Your three findings → fixes

### Primary blocker: error-isolation gap — FIXED
You flagged: destructuring at signature (line 105) + `isObservabilityEnabled()` (106) outside try; unguarded `stderr.write` (121-125). `traceDispatchEvent(null)` could throw outside isolation.

Fix in `_SYSTEM/Scripts/math/yuri-energy-dispatch-bridge.mjs`:
- Signature changed to single untyped arg: `traceDispatchEvent(args)`. Destructuring moved INSIDE try with `(args && typeof args === 'object') ? args : {}` guard.
- `isObservabilityEnabled()` check moved INSIDE try.
- Stderr warning extracted to `_emitWarnOnce(err)` with its own inner try/catch — if `process.stderr.write` itself throws (EPIPE, closed fd), it's swallowed.
- New tests: `traceDispatchEvent(null)`, `(undefined)`, `()`, `(42)`, `("string")` all assert `doesNotThrow` under observability ON. Plus default-OFF no-op with null arg.

### Shintai semantic issue — FIXED
You flagged: hook fired pre-health-preflight (line 1088), so `verifiedEvidenceCount` reflected candidate assembly, not dispatched assembly.

Fix in `_SYSTEM/Scripts/shintai-dispatch.mjs`:
- Hook removed from line 1088 (pre-health).
- Hook moved to after the health-preflight block closes (now line ~1165), where `assembly` reflects post-health final membership. Comment cites your review.

### `_resetWarnOnce` production export — FIXED
You flagged: JSDoc-only is weak for a production surface.

Fix:
- `_resetWarnOnce` now guards on `process.env.YURI_ENERGY_TEST === '1'` — a no-op in any non-test context. Stray production import cannot re-enable stderr noise.
- Test file sets `YURI_ENERGY_TEST=1` at module load.
- New test confirms `_resetWarnOnce` is a no-op without the flag.

## The "8 skipped" discrepancy — needs your eyes

You reported `tests 117, pass 109, skipped 8, fail 0`. Locally I get `tests 125, pass 125, skipped 0` across the exact 7 packet suites. (125 = your 117 + my 8 new isolation tests.)

The 8 skips did NOT reproduce in my environment. Per-suite skip counts locally: shintai 0, offload-runner-rails 0, claude-codex-final-pass 0. My hypothesis: the A.1 `real parallel append` test uses `child_process.fork`, which may skip or behave differently under your sandbox. **Request:** if the 8 skips reproduce on your side, identify which specific tests skip — that's an environment delta (likely fork/fs sandbox limitation) worth documenting, not necessarily an A.2 defect.

## Test evidence (local)

```
node --test [all 7 packet suites] → tests 125, pass 125, fail 0, skipped 0
node --test yuri-energy-dispatch-bridge.test.mjs → 26/26 (was 18; +8 isolation tests)
```

## What I need from you

1. **Verdict:** PASS / NEEDS_FIX / BLOCKED.
2. **Error-isolation re-check** — is the full body now isolated? Try `traceDispatchEvent` with adversarial args (Proxy that throws on property access, object with throwing getter on `numericContext`). Does anything escape?
3. **Shintai placement re-check** — does the hook at line ~1165 now reflect the dispatched assembly across both the health-ran and health-skipped paths?
4. **8-skip identification** — which tests skip in your environment, if any?
5. **Recommendation:** ready to flip `YURI_ENERGY_OBSERVABILITY=1` and begin B.1 collection?

## Hygiene

- GitNexus current at `c9119c4`.
- A.2 files: bridge (2, untracked) + 3 dispatch surfaces modified (surgical).
- Both Rick lanes now on Opus 4.8 (fresh restart 2026-05-28); main thread on Opus 4.8 + ultracode.

## Discipline

- Peer-lane voice. Local truth, cite line numbers. Read-only review.

Over to you, Prime.

— C-137
