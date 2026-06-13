---
name: proj-prose-claim-extractor-3b-2026-06-13
description: 3b prose-claim extractor (Wave-3 keystone) BUILT + red-teamed TWO rounds (r1 6 clusters, r2 5 clusters/R2-A..E) closed; 24 extractor + 7 sim tests green; ADVISORY/owner-gated; grounds P_emit; live-wire is later Wave-3 step
metadata:
  node_type: memory
  type: project
  tier: working
  scope: claim-cortex
  trig:
    - prose claim extractor
    - 3b
    - claim wiring
    - P_emit
    - veto storm
    - wave 3 keystone
    - claim-cortex wiring
  refs:
    - ref-claim-partition-attack-aggregate-gate
    - proj-claim-wiring-audit-2026-06-13
  originSessionId: d0121710-5fe7-4681-801a-e863c3393975
---

GOAL: build the "v2 prose-claim source" (3b) the claim cortex was blocked on — reads written PROSE → structured anchor-bound claims for `cortexSnapshot`/`gateClaimTransition`, in ADVISORY mode to MEASURE P_emit / veto-storm / partition rates the Wave-3 sim could only estimate.

WHO: Marcel directed #2→#1→#3 (fire Wave 0, build 3b advisory, then sim refine). Built by the Claude lane 2026-06-13.

WHERE:
- `_SYSTEM/Scripts/prose-claim-extractor.mjs` (core + CLI: `reset|extract|measure|gate-shadow`)
- `_SYSTEM/Scripts/prose-claim-extractor.test.mjs` (14 tests, all green)
- `.claude/hooks/prose-claim-extract.mjs` (PostToolUse hook, advisory/fail-open, **owner-gated — NOT auto-wired** into settings.json; same pattern as math-register-guard)
- shadow store `_SYSTEM/state/claim-extractor/`; report §13 in `_SYSTEM/reports/claim-wiring-ops-plan-2026-06-13.md`

STATE: BUILT + hardened + verified. Identity = anchor-bound `target:claimType` (node-id when target maps to a circuitry node). Aggressive red-team (self-pass + 7-lane sonnet fan-out, empirically verified): 50/55 confirmed → 6 clusters, ALL closed (15/15 exact-string re-attacks pass):
- A modality guard (drops question/future/conditional/obligation/reported — the biggest veto-storm source)
- B target HARD_STOP + drop-on-junk (no more `if:`/`says:`/`call:` anchors)
- C evidence forgery closed: file refs RESOLVED against real FS, unverifiable prose capped at advisory (forgery now needs a real passing test file)
- D/E separator canonicalization (`foo-bar`=`foo_bar`=`foo bar`) + `retractsByTarget` metric
- F unicode hygiene (strip invisibles+NFKC → no fake churn)
- G require finite nowMs (fail-closed clock)
GROUNDING measured: veto-storm/churn ≈3.5% (vs ~100% for contentHash — proves the LOCKED anchor-bound choice); untrackedRetract=0. P_emit over historical MEMORY ≈0.70 is an UPPER-BOUND ARTIFACT (summaries, evidence in commits not inline) — real P_emit needs the live hook on FRESH writes.
Residuals (undercount, not bypass): synonym/homoglyph evasion · highest-rung masks lower honest claim · cross-sentence evidence uncredited · don't measure over vocab-defining docs.

ROUND 2 (sonnet fan-out `wgf4zmt52`, 43 confirmed) closed 2026-06-13 — 5 clusters, all verified, suite 14→24 tests:
- R2-A forgery RE-OPEN closed: `fileExists` rejects `..`+asserts repo containment; `detectEvidence` takes the TARGET and only credits a resolved file if basename shares a ≥3-char token (`fileRelatesToTarget`); operator_note from prose ALWAYS advisory; runtime_trace upgrades ONLY via a RELATED `.test.mjs` (killed the `hasResolvedFile` cross-kind bridge → `hasRelatedTest`).
- R2-B modality SCOPED: split MODALITY_GLOBAL (questions) vs MODALITY_PREVERB (checked pre-verb only); `isModal(stmt,verbIndex)` moved inside verb loop; REPORTED_SPEECH needs a ≥2-char subject ("Note that X" kept, "Marcel notes that" dropped).
- R2-C leading-negation neutralize + HARD_STOP += about/node/nobody/none/neither.
- R2-D hygiene: statementHash collapses `[\s_-]+`; sentence-split lookahead now incl. lowercase; mergeLedgers `>=`→`>`; loadGraphNodeIndex strips parens + separator-stripped key; `resetGraphIndex()`.
- R2-E decision-sim HONESTY (wave3-decision.mjs prints live): identity anchor+node-vs-anchor-bound `|Δ|≤0.0021` = WITHIN NOISE (coin-flip the 3b hook settles); promote tie labeled (CE→sync-gate vs LOCKED async-bakeoff); pgdWitness/infoGap are SCALAR-ONLY.

CODEX REVIEW (gpt-5.5 xhigh via llm-compat, DRAFT, 2026-06-13) verdict BLOCK — both findings re-verified live + fixed, suite now 25 extractor + 7 sim + 4 wave3 = 36:
- R2-A re-opened (HIGH): one GENERIC shared token laundered evidence (`claim-router` shared "claim" with `prose-claim-extractor.test.mjs` → ASSERT). FIXED: RELATION_STOP_TOKENS exclude generic words; relation needs EXACT canonical match OR ≥2 shared non-generic tokens (compound target). + realpath containment in fileExists (symlink-escape). Locked by `CODEX-R2A` test.
- R2-E re-opened (MED) + **CORRECTS MY EARLIER WRONG CORRECTION:** the §14 "−0.026 weight-corner flip" was RIGHT all along. My first §14.1 "it didn't reproduce, joint worst +0.032" was the ACTUAL error — I used a random-Dirichlet joint search, but the margin is AFFINE in the weight simplex so the min is at a VERTEX (measure-zero under Dirichlet → never sampled). Codex's deterministic vertex×corner scan found −0.0264 at w=[0,0,0,0,1]. FIXED: honesty() now enumerates corners; reports the real flip (LOCKED loses to NULL only when ALL weight is on build-cheapness + low smuggle — i.e. it dominates NULL whenever prevention/safety has any weight). Locked by wave3-decision.test.mjs (affine-in-w proof + "interior sampling hides flip" test).
- LESSON: an independent lane caught a math-method error I'd used to overturn a correct finding. "verified live" is only as good as the sampling method; for affine/multilinear objectives, enumerate corners, don't Monte-Carlo the interior.

STEP 1 ARMED (owner-authorized 2026-06-13). Pre-arm 4-lens adversarial safety audit (ultracode Workflow wf_8903be23-dea, sonnet) → ARM-WITH-CHANGES: found+fixed a real BLOCKER = UNBOUNDED LEDGER GROWTH (measureClaims is O(ledger), runs every write; ~100k claims in weeks → silent timeout forever). FIX: `mergeLedgers(prior,fresh,{nowMs,maxClaims})` = bounded rolling window (recency `_seenMs` evict-oldest); hook arms MAX_LEDGER_CLAIMS=5000. Verified bounded hot-path: 200k-prior+4000-write → merge+measure 423ms (8% of 5s budget). Also closes the "RETRACT ledger no eviction" residual. Hook now in `.claude/settings.json` PostToolUse Write|Edit|MultiEdit block (async, timeout 5, beside filing-ledger). Live-fire verified end-to-end (exit 0, advisory, shadow+metrics written). Shadow reset → soak running. Suites: 27 extractor + 7 sim + 4 wave3 = 38 green. UNWIND: remove the prose-claim-extract entry from the PostToolUse block.

WAVE-3 PARTITION GATE BUILT+DISARMED (2026-06-13). Red-team: ultracode Workflow wf_d8a80606-5cb (2 Opus + 2 sonnet + Opus synthesis) + my own verification. Findings: (a) the gap is the OFFSET form — 6 depth-1 advisory fabrications across 6 targets funded by resolving honest debt on a 7th → accept=true (identity veto blind=no RETRACT, L∞ blind=each shallow, ΔU advisory). (b) per-target aggK is the WRONG axis (cross-target partition defeats it). RIGHT signal = GLOBAL, target-agnostic, evidence-kind-weighted, depth² unsupported-inversion mass (executable kinds=test/runtime_trace/fixture/schema/operator_note; advisory/report=unsupported). (c) SELF-CORRECTION: the converged "non-offsettable NET-delta floor" is offsettable by construction — my repro defeated it (resolve −6 + add +6 = net 0). Fixed → PER-CLAIM new-or-deeper unsupported-mass (mirrors identity-veto beforeDepth) — see [[feedback-nonoffsettable-is-per-claim-not-net-delta]]. BUILT in claim-cortex.mjs: cortexSnapshot adds unsupportedInversionMass/unsupportedDepthById/untrackedUnsupportedMass; gateClaimTransition veto on addedUnsupportedMass > `unsupportedMassAddedCap` (DEFAULT Infinity=OFF, byte-identical). Eviction HARDENED in mergeLedgers (never evict inversions>0, bounded). Tests: claim-cortex 61→67, extractor 27→28; full battery 133 green incl energy-tick-core 27 (integration intact). Residual: evidence-kind AUTHENTICITY (forged test/fixture refs) is the new attack surface; patient standing-debt drift bounded by per-claim measure. Report §16.

ARM DECISION (Marcel delegated "arm if beneficial" 2026-06-13): VETO NOT armed — evidence-based: (1) gateClaimTransition has NO live production caller (shadow/test-only; the PostToolUse hook collects but never calls the gate), so a finite cap is a no-op in prod; (2) no soak-grounded threshold yet → blind cap=0 would false-veto honest WIP (the binding constraint). Arming blind = cargo-cult security (no-op or regression). INSTEAD shipped the safe beneficial upgrade: the live collector now LOGS `unsupportedInversionMass` per write (measureClaims metrics) — the exact calibration signal. Eviction hardening is already live via the armed hook.

NEXT (owner-gated): soak collects unsupportedInversionMass per write → set `unsupportedMassAddedCap` from honest p99 (likely 0-1) → wire gateClaimTransition onto the live PostToolUse hot path + arm. Arm energy-enforce stays owner-only.

SEE: [[ref-claim-partition-attack-aggregate-gate]] (the aggregate gate it feeds), [[proj-claim-wiring-audit-2026-06-13]] (the open-ends this closes #3b/#4 of), ops plan §3③/§9/§11/§13.
