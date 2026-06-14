# Substrate Hardening Wave — BUILD CONTRACT (2026-06-14)

Owner greenlit: "continue the build with full agentic coverage including the llm-compat lanes… going big
and perfectly orchestrated… proceed with the upgrade at max reasoning." This is the build of the
hardening wave the red-team ([02-redteam-findings.md](02-redteam-findings.md)) surfaced.

## Inviolable constraints (every lane + spawn obeys)

1. **Live path stays byte-identical.** Every gate-core change (computeU evaluators, gateProposal) must leave
   CLEAN-input output unchanged — same `U`, same `accept`. Changes affect ONLY malformed/poison/garbage
   inputs (fail-closed instead of silent-skip). Prove it: a before/after diff of `computeU`/`gateProposal`
   on a clean state must be identical.
2. **enforce stays DISARMED.** No arming barriers, no `YURI_ENERGY_ENFORCE`, no settings.json enforce wiring.
3. **Register-first.** Any new/edited `_SYSTEM/Scripts/math/*.mjs` is registered in
   `02_RESOURCES/RESEARCH/MATH-SCIENCE-MANUAL.md` BEFORE the write (math-register-guard PreToolUse).
   New reusable mechanisms get `@capability` tags → regen `_SYSTEM/capabilities.json` via `capability-scan.mjs`.
4. **Advisory-until-verified.** Lane/agent output is a PROPOSAL. Claude integrates, writes RED-GREEN tests
   (incl. a planted mutant that reverts the fix → must be caught), runs them, and only then commits. No
   lane/agent commits code. (This session: C, B, DeepSeek, nemotron each needed correction — the discipline is load-bearing.)
5. **Commit boundary.** Explicit pathspec, never `git add .`. Incremental per-item commits. Owner's
   uncommitted v3+μ energy diff stays UNTOUCHED. Protected paths off-limits.
6. **RED-GREEN per fix.** Watch the new test FAIL on the unpatched code (reproduces the red-team finding),
   then pass on the patched code. A fix without a regression test that would have caught the original flaw is incomplete.

## The wave (minimax-leverage order; dependencies noted)

### Stage A — independent hardening (parallelizable; Claude builds the mechanical ones directly)
- **A1 · G seal NaN/Infinity/undefined canonicalization.** `_SYSTEM/Scripts/math/yuri-energy-corpus-seal.mjs`.
  Replace non-finite/undefined leaves with distinct sentinels before hashing so `hash(NaN) ≠ hash(null) ≠
  hash(Infinity) ≠ hash(0)`. Test: the 3 inequalities + order-independence still holds + tamper still caught.
- **A2 · I retire the dead contracts instrument.** `yuri-energy-contracts.mjs` has zero prod importers
  (Claude-verified). Remove file + test + MATH-SCIENCE-MANUAL entry + capabilities entry + any reference.
  (minimax: C1–C6 duplicate the property-prover; gateProposal already throws on malformed → retire, don't wire.)
- **A3 · E widen observer guard.** `.claude/hooks/prose-claim-extract.mjs:85` — fire `observeClaimTransition`
  on any inversion>0 / content-hash swap, not only `byVerdict.RETRACT>0`. Observe-only (never blocks).
  Add VERIFY-FIRST content-swap + evidence-regression tests. Fix the stale "NOT auto-wired" header comment.
- **A4 · gateProposal negative-field fail-closed.** `_SYSTEM/Scripts/math/yuri-energy.mjs` — extend the
  `afterMalformed` guard so a present-but-NEGATIVE `protectedPathViolations`/`promotionLadderInversions`/
  `maxLadderInversion` fails closed like present-but-non-numeric. LOW/defense-in-depth. Live counters are
  non-negative → live accept decisions unchanged.
- **A5 · GAP-2 poison-aware evaluators.** `_SYSTEM/Scripts/math/yuri-energy.mjs` — give evalEntropy,
  evalLogLoss, evalBrier, evalInfoGain, evalStaleness, evalRepeatedFailure the fail-CLOSED treatment the
  drift family has (distributionPoisoned / a forecast-poison predicate). Poison → a DEFINED penalty +
  `validationWarning`, NOT silent skip→0. Clean inputs unchanged. (glm mapped the 6 seams F1–F6.)

### Stage B — new instruments (depend on Stage A)
- **B1 · poison-aware generators.** `genPoisonState(rng)` (NaN, non-numeric strings, length-mismatch,
  mixed-type arrays, negative counts) wired into the A/B/C/D campaigns so the fail-closed branches are exercised.
- **B2 · A/B/C/D control hardening.** Replace tautological controls (MR-scale formula-tautology,
  brokenEraCheck v3 algebraic arm, reconstruction drop-both-sides) with BEHAVIORAL controls; drop D's 14
  phantom bins from the denominator; fix `binOf` negative→'tiny'; fix `genState` bias (exercise
  evidence/staleness/malformedForecast); add the missing weight-isolation + sign-convention coverage.
- **B3 · gateProposal property-verifier.** New `_SYSTEM/Scripts/math/yuri-energy-gate-invariants.mjs` —
  ∀-input over `accept` monotonicity (ΔU, threshold, cap, override) + the 3 veto arms' fail-closed branches,
  using the poison generators. RED-GREEN with planted gate mutants (delete a veto arm → caught).
- **B4 · H ground-truth resolved-outcome log (KEYSTONE).** Capture every `gateProposal` verdict
  `(stateBefore,stateAfter,weights,threshold,cap,weightHash) → {decision, resolvedDecision?, resolvedBy?,
  resolvedAtIso?}` to a trace; a replay harness re-runs logged transitions as the regression oracle.
  Capture side buildable now; resolution side = operator stub initially. Include the **signed weightHash
  captured inside the gate call** (minimax residual: defends against weight-drift between fire and resolution).

## Lane-quality wave (owner directive 2026-06-14: "full capacity + impeccable work")

The llm-compat peer lanes must run at FULL CAPACITY and produce ACCURATE work. Triggered by glm's A5 design
being ~50% wrong (hallucinated `repeatedFailurePenalty`, `e.confidence` vs `e.base`, F2/F3 redundant with λ).
- **L1 · Full capacity — DONE (commit ae3cccf0).** Self-adapting per-model output cap in `postChatOllamaCloud`:
  parse the 400's real cap and retry at it → every model runs at its true max, no manual per-model flag.
  Composes with the parallel session's `models.json` tier bump (medium=65536, high=131072) which flagged this
  exact follow-up. VERIFIED: nemotron --reasoning max → auto-adapts to 65536 → succeeds.
- **L2 · Accuracy — DONE (persona contract).** Added a failure-anchored **code-change contract** to
  `_SYSTEM/nano-swarm-persona.md`: read-before-propose, quote-don't-recall fields (cite path:line),
  confirm-it-exists (grep), check-existing-handling-first, verbatim old_string, run-it. Directly targets glm's
  3 failure modes. (Prompt-layer nudge; the hard guarantee remains Claude's integrate-verify step.)
- **L3 · Parked follow-ups (owner-gated):** per-model output-cap map in models.json (so the request is right
  up-front, not 400+retry); a tool-use precondition that a write/edit proposal must have read the file first
  (structural accuracy guarantee vs the prompt nudge); design-task loadout that pre-loads the target files.

## Orchestration

- Cross-family design lanes (llm-compat, max reasoning, leveraging what each learned this session):
  minimax-m3 → B4 H-log architecture; nemotron-3-ultra → B3 gate-verifier; glm-5.1 → A5 poison-evaluators;
  deepseek → B2 control-hardening. Proposals are advisory; Claude integrates + verifies + commits.
- Claude builds the mechanical Stage-A items (A1/A2/A3/A4) directly + adversarially self-verifies each fix
  (attack→verify, the same discipline that found the 41 findings — applied to the fixes).
- Incremental commits per item. Status log appended to this file.

## Status log
- 2026-06-14 — contract written. Design lanes firing. Claude starting A1 (seal-NaN).
- 2026-06-14 — A1 seal-NaN SHIPPED (7e920b65, 10/10). A5 poison-aware evaluators SHIPPED (ce19dbac, 467/467;
  glm design verified+corrected: real surface 3 seams not 6). 4 design proposals received (minimax B4 /
  nemotron B3 / glm A5 / deepseek B2) — advisory, to be integrated+verified for the remaining items.
- 2026-06-14 — Lane-quality wave: L1 full-capacity SHIPPED (ae3cccf0, self-adapting output cap, composes with
  the parallel models.json bump); L2 accuracy code-change contract SHIPPED to nano-swarm-persona.md.
- 2026-06-14 — A4 gateProposal neg-field fail-closed SHIPPED (e9471aa2; note: that commit bundled a parallel
  session's staged work via the shared index — contained, see feedback-shared-index-commit-pathspec; new rule:
  explicit pathspec on every commit). Lane-quality L1/L2 SHIPPED (ae3cccf0 / d6650825).
- 2026-06-14 — **B3 gateProposal property-verifier SHIPPED (b12e4ecc, pushed).** New yuri-energy-gate-invariants.mjs:
  7 invariants over a 774-row corner-enumerated corpus (VETO-DOMINANCE non-offsettability / THRESHOLD / OVERRIDE /
  CAP-DISABLED / FLAG-CONSISTENCY / LYAPUNOV / DETERMINISM) + crossCheckSpec (spec≡gate) + 9 planted mutants each
  caught by target (RED-GREEN). Transitively re-verifies A4. test 12/12, full energy suite 480/480, clean-path
  byte-identical (gate untouched), enforce DISARMED. Built against REAL code (nemotron design was lost — 1 line).
  B3 now confirms gateProposal coverage → A2 (retire dead contracts instrument) is unblocked.
- 2026-06-14 — **A3 widen identity-veto observer guard SHIPPED (43ca793b, pushed).** New exported
  shouldObserve(metrics) in claim-transition-observer.mjs fires the O(ledger) observer on retracts>0 OR
  inversions>0 OR churnedAnchors>0 (was byVerdict.RETRACT>0 only — MISSED content-hash swaps, which fire
  identityVeto with no RETRACT verdict, + bare inversions). Strict superset, observe-only, hook stays
  fail-open/exit-0. Stale "NOT auto-wired" header fixed (hook IS live-wired, settings.json:309). observer
  test 12/12 (+7), integration smoke (synthetic payload → exit 0, guard fired observer, trace isolated).
  capabilities.json regen DEFERRED (shared file — @exports tag updated at source).
- NEXT (remaining substrate wave): **B4 H ground-truth resolved-outcome log (KEYSTONE)** — minimax design in
  /tmp/dl-minimax.out (advisory; verify against real gateProposal). Capture seam INSIDE gateProposal w/o
  changing the clean-path return; signed weightHash captured inside the call (defends weight-drift between
  fire and resolution); replay harness as the regression oracle; trace path must NOT be a protected
  .claude/state dir (use _SYSTEM/state like the other traces). THEN B2 A/B/C/D control hardening (deepseek
  design /tmp/dl-deepseek.out); A2 retire dead contracts (B3 confirmed gateProposal coverage). enforce stays
  DISARMED; explicit-pathspec commits; **B4 is the riskiest item — clean-path byte-identical proof required
  (use the B3 invariant prover as the ∀-input oracle to prove the seam didn't shift any accept decision).**
