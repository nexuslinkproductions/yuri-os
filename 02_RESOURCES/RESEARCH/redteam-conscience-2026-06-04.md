# YURI Conscience Red-Team — Reconciled Findings (2026-06-04)

Dual-platform capstone red-team of waves 0–1b (the energy gate, claim-cortex, memory governance, breaker, kernel, xref). **Claude capstone** (36-agent Workflow, refute-by-default verify → 20 confirmed / 6 refuted) + **5 Codex/gpt-5.5 lanes** (read-only). Raw outputs: `/private/tmp/.../tasks/wrverxqco.output` (Claude) · `/tmp/codex-redteam/out-lane{1..5}.txt` (Codex). All read-only; **every fix below is OWNER-GATED** (the enforcing core is also being edited by a concurrent lane — coordinate before touching `yuri-energy.mjs` / `claim-cortex.mjs`).

Convergence = independently found by both platforms → highest confidence.

## TOP — live-reachable, fix-priority

1. **Structural-floor veto forgeable via config** · CONVERGED (Claude HIGH×2 + Codex L1#4) · `_SYSTEM/Scripts/math/yuri-energy.mjs:625-627` + `yuri-energy-config.mjs:56`, merged at `energy-tick-core.mjs:322`. `theta=0` or a config-loaded `threshold` makes `ladderPenaltyDelta > threshold` → `0>0=false`, silently disabling the ladder-inversion barrier. Config accepts `n>=0`. **Fix:** key the floor on the raw count (`ladderAfter > ladderBefore`) like the protected-path veto; clamp veto-bearing weights + threshold to a positive floor.

2. **Live breaker pre-sanitizes veto fields, defeating fail-closed** · Codex L1#1 (CRITICAL) · `_SYSTEM/Scripts/energy-tick-core.mjs:276` + `energy-breaker.mjs:82,93`. The breaker runs raw veto fields through `Number(...)||0` BEFORE `gateProposal` sees them, so the gate's malformed-field fail-closed checks never fire; thrown gate errors are caught as clean accepts. **Fix:** pass raw fields to the gate unsanitized; never catch a gate throw as an accept.

3. **CAP-01 energy-session write-race** · CONVERGED (Claude MED + Codex L4#1/#2 CRITICAL) · `.claude/hooks/energy-tick.mjs:77` + `energy-enforce.mjs:76,94`. Non-atomic read-modify-write `writeFileSync` (no lock / tmp+rename). Concurrent tick+enforce lost-update clobbers an OPEN trip → next PreToolUse sees CLOSED → allows. Torn read → `JSON.parse` throws → fail-OPEN. Plus session-id collision / missing-id → shared `default.json` → cross-session clobber (L4#3 — we run multiple live sessions). **Fix:** atomic temp+rename, re-read-merge under O_EXCL lock, never downgrade an OPEN you didn't decay, unique session-id.

4. **Memory relocation non-atomic / collision-unsafe** · CONVERGED (Claude MED + Codex L3#4 CRITICAL) · `_SYSTEM/Scripts/memory-relocator.mjs:402,408,412`. Cold row upserted before the file move; `renameSync` can overwrite an existing `relocated/` copy; index written only after the loop → a crash mid-loop loses memories / orphans the index. **Fix:** collision-safe dest name from persisted `source_path`; write the relocation-index atomically (temp+rename) per item; reject path-separators in slug.

## MEDIUM — converged

5. **L∞ maxSeverityVeto inert** · CONVERGED (Claude + Codex L1#3 + L4) · `yuri-energy.mjs:544,556`. Defaults `cap=Infinity`; no live caller arms it; `maxLadderInversion` computed by `cortexSnapshot` but DROPPED by `toGateState/claimGateFields`; breaker reads only protectedPath/structuralFloor. So the equal-magnitude / Pythagorean ladder-swap STILL passes the live gate — the L∞ closure is not actually live. **OWNER-GATED (NRG·ENG-02, the concurrent lane's domain).** Fix: arm a finite cap on live `gateProposal` calls + populate `maxLadderInversion` in live state + make the breaker trip on `maxSeverityVeto`.

6. **Supersession tie-break forgeable + PROTECTED_TYPES fail-open** · CONVERGED (Claude + Codex L3#1/#2) · `memory-relocator.mjs:199,264,334`. `type:"user"` / `type: user # comment` evades `forceKeep` (raw-regex exact-string trust); a lexically-greater same-family slug (`...-06-04-zzz`) out-ranks and force-demotes the genuine current anchor. **Fix:** canonicalize slug (strip suffix after date; tie-break shorter not lexically-greater); strip comment/quotes + case-fold type before `PROTECTED_TYPES.has`.

7. **proof-gate provenance is existence-not-identity** · CONVERGED (Claude + Codex L4#6) · `math-proof-gate.mjs:372`. MATH-05 verifies the symbol EXISTS, not that `implementedBy` matches the executed binding (dispatch keys on `formula.id`). A card can claim `#entropy` yet execute via its id. **Fix:** register canonical kernel symbol per id; assert `implementedBy.split('#')[1] === entry.kernelSymbol`.

8. **xref scoreHit fail-open + freshness laundering** · CONVERGED (Claude HIGH + Codex L5#1) · `xref-provenance.mjs:98` (`structuralMatch !== false` lets undefined/null/0/'' grade 0.97 HIGH) + `xref-query.mjs:482` (missing `.gitnexus` marker → treated fresh → full-HIGH structural). **Fix:** `if (structuralMatch !== true) return null`; unknown freshness ⇒ stale (apply penalty).

9. **Closed verb-set membership mutable** · CONVERGED (Claude MATH-01 residual + Codex L5) · `mechanism-pattern-registry.mjs`. `Object.freeze(new Set)` does not block `.add()` — an importer can mutate the "closed" set before validation. **Fix:** export a read-only accessor / rebuild the Set defensively on import.

10. **TRUSTED_RECURRENCE zero-ref bypass** · CONVERGED (Claude + Codex L2) · `claim-cortex.mjs:271,327`. Two empty-ref `kind::reference` keys satisfy the recurrence floor. **Fix:** require ≥TRUSTED_RECURRENCE entries with NON-EMPTY references.

## Codex-only (new — not in the Claude capstone)

- **Kernel aggregate overflow** · L4#7 · `math-kernel.mjs`: `1e308` inputs → `normalizeDistribution→[0,0]`, `entropy→0`, `weightedMean→NaN`, `mergeLaneEvidence→Infinity` (no post-aggregate finite check). Currently latent (live consumers pass normalized small dists). Fix: validate aggregate finite / guard overflow.
- **LMSR canary only proves uniform prior** · L4#8 · the advertised `b·ln(N)` bound is false for arbitrary `beliefBefore` (`lmsrIncrement([MIN_VALUE,1],[1,MIN_VALUE],1)≈744` vs bound 0.693). Canary-integrity gap. Fix: add a non-uniform-prior bound test.
- **cortexSnapshot swallows a throwing-accessor claim** · L2 · catches `assessClaim` throw + `continue`s → a malicious after-claim disappears instead of vetoing (fail-open). Fix: fail-closed on throw.
- **Path-resolver no containment** · L5 · `yuri-paths.mjs` returns env/config strings raw — no absolute-norm, workspace containment, traversal/NUL rejection. Fix: normalize + workspace-contain.
- **Domain classifier `[]`→no_domain bypass** · L5 · `lifecycle-gap-scan.mjs` stringifies arbitrary values; `domain:[]`/`[null]` → '' → `no_domain`, evading `GAP_UNMAPPED_DOMAIN`. Fix: reject non-string domain (loud).
- **MDL false-demote** · L3#3 · gzip marginal-bits can false-demote distinct policy memories sharing a high-entropy scaffold. Fix: content-quality floor / semantic guard.

## Refuted / not live (Claude verify down-graded)
Asymmetric staleness buy-back + entropy reservoir (real at the gateProposal API, NOT reachable via any live caller — energy-tick has no halfLife, cortex caps support to LADDER_N=6); `operator_note` self-certifies `operator_validated` (real but observability-scoped, pre-dates the unbuilt operator-gated ledger).

## Triage
- **Enforcing-core fixes (#1,#2,#3,#5,#10 + cortex):** OWNER-GATED + the concurrent lane is in `yuri-energy.mjs`/`claim-cortex.mjs` — coordinate; do NOT touch unilaterally.
- **My-committed non-core fixes (cheap, surgical, low-blast):** #8 xref `!==true` + freshness, #9 frozen-Set accessor, Codex path-resolver containment, domain-classifier reject-non-string, kernel overflow guard, LMSR canary — all in files I own, fixable without the energy core.
- **Memory (#4,#6):** `memory-relocator.mjs` — mine, but interacts with the live subconscious; medium-blast.
