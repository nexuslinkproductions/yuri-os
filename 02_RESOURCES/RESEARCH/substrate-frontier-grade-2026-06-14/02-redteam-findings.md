# Substrate Red-Team — Findings (2026-06-14)

Owner directive: "we also have to redteam everything once all waves are done." This is the adversarial
pass over the 7 frontier-grade verification instruments (A·E·D·I·C·G·B) shipped this mission + the gate
they guard. **Discipline: every instrument finding is a CLAIM until reproduced; sub-agent "confirmed"
is advisory until Claude re-runs the load-bearing ones locally.**

## Method (multi-lane, cross-family)

- **Backbone** — 14-agent local `attack→verify` workflow (wf_108ffe0f-455): one adversary per instrument,
  every reported flaw re-run via Bash. 327 tool-uses, ~1.0M subagent tokens. **41 findings, all reproduced.**
- **Cross-family peers** — Mimo (conceptual) + DeepSeek (code-grounded, read/grep). Independent families.
- **Ollama-cloud trio** (NVIDIA nemotron-3-ultra / Zhipu glm-5.1 / MiniMax minimax-m3) — fresh families on
  the areas the workflow did NOT cover (gateProposal, fail-open seams, fix-prioritization). [results below]
- **Claude self-verification** — the 3 most load-bearing findings re-run by hand (see ✔ CLAUDE-VERIFIED).

## Headline (two families converged, locally confirmed)

The 7 instruments rigorously verify **computeU as an algebraic object** (reconstruction, monotonicity,
metamorphic structure, cross-era co-ranking, coverage, contracts, contamination seal). They do **not**:
1. validate computeU's output against **ground-truth decision quality** (Mimo: verification ≠ validation);
2. test the **enforcement decision `gateProposal`** — the 4-veto accept/reject logic (DeepSeek);
3. resist a half-wrong computeU — most **negative controls are liveness checks**, not correctness checks.

This is not a refutation of the instruments — they hold for what they assert. It is the SCOPE boundary,
and it maps exactly to the parked owner-gated items H (resolved-outcome log) + N (ground-truth corpus).

## Confirmed findings by instrument (41 total, all sub-agent-reproduced)

| Inst | Crit | High | Med/Low | Headline confirmed weakness |
|------|------|------|---------|------------------------------|
| **A** invariants | 2 | 2 | 2 | reconstruction `U==Σcontribs` trivially satisfied by dropping a term from BOTH sides; `genState` biased — `evidence:[]` always → staleness + malformedForecast (weight 50.5) NEVER exercised; barrier-dominance vacuous at low η; 1/12 weight-isolation tests |
| **B** metamorphic | 0 | 2 | 5 | linear-omission (drop a term) escapes all 6 MRs; weight-wiring swaps escape (MR-scale is a formula tautology); brier evaluator has zero independent MR coverage |
| **C** equivalence | 0 | 1 | 5 | `brokenEraCheck` v3 arm is an algebraic tautology (ρ_v3 = −1.0 forced on drift-isolated states → inert; ρ_v2 carries all signal); no trials-floor guard; tail-agreement reported but never gated; CORANK_MIN=0.5 vs actual 0.815 margin untracked |
| **D** coverage | 0 | 2 | 2 | 14 weight-bounded **phantom bins** inflate the denominator 53→67 → closure permanently impossible; `binOf()` negative value on a penalty key → `'tiny'` → forgeable coverage via public `hit()` |
| **G** corpus-seal | 2 | 0 | 4 | **`JSON.stringify` maps NaN / Infinity / undefined → `'null'`** → seal BLIND to special-float contamination — the exact class a broken bakeoff candidate (NaN in U) produces ✔ CLAUDE-VERIFIED |
| **I** contracts | 2 | 3 | 3 | **ZERO production importers — dead code** (header says "observe-mode" but it never runs) ✔ CLAUDE-VERIFIED; `null` contributions vacuously passes the whole C1–C6 audit; NaN silently bypasses C2+C5 |
| **E** observer | 0 | — | 4 | hook guard is `byVerdict.RETRACT>0` → **VERIFY-FIRST content-swaps that the gate DOES veto are silently skipped** ✔ CLAUDE-VERIFIED; stale "NOT auto-wired" comment (it IS live in settings.json PostToolUse) |

Full per-finding evidence (repros, line numbers, grep output): workflow result
`tasks/wtyb06m4n.output` (confirmedCount=41).

### ✔ CLAUDE-VERIFIED (re-run by hand — not trusting sub-agent "confirmed")

1. **I dead code** — `grep -rn "energy-contracts|checkComputeUResult|checkWeights" _SYSTEM/Scripts/ --include=*.mjs --include=*.js` minus the file+test = **empty**. The DbC instrument shipped this session has no caller. It validates nothing in production.
2. **G NaN-blindness** — `hashCorpusSlice([{u:NaN}]) === hashCorpusSlice([{u:null}])` → **true**; same for `Infinity`. The seal cannot tell a NaN-poisoned corpus from a null one. (`hash(NaN)===hash(0)` is false — it's specifically the special-float→null collapse.)
3. **E VERIFY-FIRST gap** — hook guard at `prose-claim-extract.mjs:85` is `if ((metrics.byVerdict?.RETRACT || 0) > 0)`. A VERIFY-FIRST (deltaRank=1) content-swap fires `identityVeto=true` in `gateClaimTransition` but `byVerdict.RETRACT=0` → observer never invoked.

## Cross-cutting gaps

- **GAP-1 — gateProposal unguarded by the new methodology** (MED). The 4-veto enforcement decision
  ([yuri-energy.mjs:725](../../../_SYSTEM/Scripts/math/yuri-energy.mjs#L725)) is heavily example-tested +
  prior-hardened (yuri-energy.test:28, max-severity:15, hardening:7, infogain-buyback:7, veto-mismatch:5),
  so it is NOT naked — but none of this session's ∀-input / metamorphic / property methodology reaches it.
  **Cross-family (ollama nemotron-3-ultra) attacked gateProposal directly and the core veto logic HELD.**
  One real finding ✔ CLAUDE-VERIFIED: a present-but-NEGATIVE `protectedPathViolations`/`promotionLadderInversions`
  in stateAfter is silently clamped to 0 by `readNonNegativeField` → reads as a repair → no veto
  (`5 → -5` accepts). The existing `afterMalformed` guard fail-closes on present-but-non-numeric; it should
  extend to present-but-negative (same "present-but-invalid" class). **Severity LOW / defense-in-depth** —
  nemotron rated it CRITICAL (OVERSTATED: live counters are non-negative, and a negative is equivalent to
  reporting a compliant low value, not a novel bypass). Its override+NaN-ΔU flag is already documented
  unreachable-from-live ([yuri-energy.mjs:752](../../../_SYSTEM/Scripts/math/yuri-energy.mjs#L752)). Net: the
  gate withstood a fresh agentic adversary; add the negative-field fail-closed for consistency.
- **GAP-2 — silent fail-open seams in computeU evaluators** (MED→HIGH). Drift family
  (evalKL/evalWasserstein/evalOverconfidenceDrift) has `distributionPoisoned` fail-CLOSED guards;
  `evalEntropy` + the forecast evaluators do NOT — malformed/negative/NaN input silently skips → contributes
  0 with no `validationWarning`. ✔ CLAUDE-VERIFIED: `computeU({claimPromotionDistribution:[-1,2,3]}).result.U === 0`,
  warnings `[]`. No generator (A/B/C/D) exercises malformed input, so this is untested across the suite.
  **Cross-family (ollama glm-5.1, 11 repros) mapped 6 seams** — fail-OPEN: evalEntropy(α), evalLogLoss(γ),
  evalBrier(δ), evalInfoGain(ε), evalRepeatedFailure(κ), evalStaleness(ζ); fail-CLOSED: drift family +
  evalMalformedForecast(λ). Composite exploit ✔ CLAUDE-VERIFIED — a state that should score ~23 scores
  **U=0, warnings=[]** (every penalty term silently zeroed). Caveat (glm, fair): live feeders emit clean
  data → defense-in-depth / direct-call gap, not a live exploit today; λ compensates when forecast fields
  are MALFORMED but not when ABSENT.
- **GAP-3 — no validation against ground-truth** (HIGH residual, by design). Confirms parked **H** + **N**
  as the highest-leverage next builds; no additional algebraic instrument closes it.

## Lane fix shipped this session (owner asked to "check out the ollama addition")

The ollama-cloud peer lane (`ai llm ollama-cloud --model <X>:cloud`) had a **systematic multi-turn
tool-loop bug**: [llm-lane.mjs:683](../../../_SYSTEM/Scripts/llm-lane.mjs#L683) normalizes
`tool_calls[].function.arguments` to a JSON **string** (OpenAI convention, for executeTool's `JSON.parse`),
but ollama.com `/api/chat` expects an **object**. Turn 1 works; re-sending the stringified args on turn 2+
makes ollama 400 with `"Value looks like object but can't find closing symbol"` — breaking EVERY tool-using
run for ALL models. **Fixed** (re-objectify outgoing assistant tool_call arguments in `postChatOllamaCloud`,
ollama-cloud-only — deepseek/mimo untouched). ✔ VERIFIED: multi-turn `read_file` loop now completes clean.
Two environmental gotchas also pinned: (a) the lane needs `dangerouslyDisableSandbox` (node egress is
sandbox-blocked → surfaces as bare `AggregateError`); (b) **no `timeout` binary on macOS** — a `timeout`
prefix hits a profile `command_not_found_handler` that routes to the scrapped `kagami` stub (the red-herring
"kagami: reflect CLI is scrapped" message). Secondary config note: lane default reasoning = xhigh (131072) >
nemotron's 65536 output cap → use `--reasoning high` or add per-model output caps.

## Recommended hardening wave (owner greenlights — NOT yet built)

Ordered by LEVERAGE (reordered from my first draft after the minimax-m3 synthesis, which independently
re-confirmed the NaN / dead-contracts / observer findings with its own repros). The keystone reframes
the whole list: without a ground-truth oracle, every algebraic fix proves *internal consistency*, never
*correctness against a resolved outcome*.

1. **H — ground-truth resolved-outcome log (KEYSTONE).** `(stateBefore,stateAfter,weights,threshold,cap) →
   {decision, resolvedDecision, resolvedBy, resolvedAtIso}` — every `gateProposal` verdict recorded with a
   later operator-resolved ground truth. The only oracle the suite has never had; it becomes the replay
   target that makes #2–#6 non-vacuous. Owner-gated. Pairs with **N** (operator-labeled corpus).
2. **GAP-1 — gateProposal property-verifier.** ∀-input over `accept` monotonicity (ΔU, threshold, cap,
   override) + the 3 veto arms' `afterMalformed` fail-closed branches. The regression target once H exists;
   a tautology without it.
3. **GAP-2 — poison-aware generators + evaluators.** `genState`/`genPoisonState` must feed garbage
   (NaN, non-numeric strings, length-mismatched pairs, mixed-type arrays) so gateProposal's `afterMalformed`
   branches + the evalEntropy/forecast/infoGain/staleness/repeatedFailure fail-open seams are exercised;
   give them the `distributionPoisoned` fail-closed treatment the drift family has. Makes #2 non-vacuous.
   (gate-core behavior change → owner-gated.)
4. **E — widen observer guard** beyond `byVerdict.RETRACT` to any inversion>0 / content-hash swap (observe-only,
   low risk, high leverage). `claim-cortex.mjs:967-988` builds `worsened` for RETRACTs + content-swaps but the
   hook only fires on RETRACT-tier → VERIFY-FIRST content-hash promotions are logged silently. + VERIFY-FIRST /
   evidence-regression tests; fix the stale "not auto-wired" comment.
5. **G — seal NaN/Infinity/undefined canonicalization.** Cheap (~3 lines: replace non-finite leaves with a
   sentinel before stringify) and contained, BUT **low strategic leverage** (minimax) — the seal is
   calibration-only, not the live tick. Real fix, small blast radius.
6. **A/B/C/D — control hardening.** Replace tautological controls (MR-scale, brokenEraCheck v3 arm) with
   behavioral ones; drop D's 14 phantom bins from the denominator; fix `binOf` negative→'tiny'.
7. **I — RETIRE the contracts instrument, do NOT wire it** (minimax, sharp): C1–C6 duplicate the
   property-prover's invariants, `checkComputeUResult` is a one-shot wrapper PBT runs 5000×/CI, and
   gateProposal already throws on the malformed-input paths. Wiring adds a redundant third copy whose only
   novel failure mode is *disagreeing* with gateProposal. (Reversal of my first-draft "wire or retire".)

## Residual risk (what survives even after the full wave — minimax)

- **Operator weight-drift between resolution and replay.** Replay asserts the decision was correct *at the
  weights at resolution time*, but the live tick reads `energy-weights.json` at call time — a retune between
  gate-fire and resolution silently re-scores a resolved transition. Honest fix: a signed `weightHash`
  captured INSIDE the gate call, verified immutable before resolution (a causal-provenance oracle). This is
  the gate's epistemic ceiling.
- **depth-1↔depth-1 content swaps** stay invisible at the L∞ level until the v2 claim ledger supplies content
  hashes (the gate's own documented residual, [yuri-energy.mjs:88](../../../_SYSTEM/Scripts/math/yuri-energy.mjs#L88)).
- **μ (overconfidence) is magnitude-only** → a `β=μ=0` retune silently arms a regime the metamorphic +
  equivalence suites don't cover.
- The 41 findings are sub-agent-reproduced; 5 load-bearing ones Claude-verified (I dead-code, G NaN, E guard,
  GAP-2 composite U=0, gateProposal negative-field clamp). The remaining ~37 are high-confidence leads —
  verify before each fix. Two cross-family lanes (DeepSeek, nemotron) OVERSTATED severity (gateProposal
  "naked"; negative-field "CRITICAL") — corrected here against local evidence. Advisory-until-verified held.
- enforce stays DISARMED; none of these instruments gate live behavior, so no finding is a live-safety hole
  today. They are integrity-of-the-verification-layer gaps — the layer is weaker than its green checkmarks imply.

RESULT_LABEL: `06SB_SUBSTRATE_REDTEAM_41_FINDINGS_5_CLAUDE_VERIFIED_OLLAMA_LANE_FIXED_X_PASS_COMMITTED`
