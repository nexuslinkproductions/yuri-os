---
title: YURI Originator Bridge
date: 2026-06-07
status: design-locked-next-build
class: system-architecture
authority: local-evidence-first
---

# YURI Originator Bridge

The Originator Bridge is the LLM-facing entry point for YURI as a mathematical operating instrument. It is the surface a model uses to turn raw operator input into a structured, recallable, energy-scored, verifiable work state.

This is not a new model lane and not a marketing layer. It is the shared origin contract that lets Codex, Claude, DeepSeek, Gemma, Kimi, Nemotron, and future local SLMs dock onto the same deterministic substrate:

- input genome and braindump decoding
- xref-first recall and propagation scanning
- complete match/federated recall
- math kernel and formula banks
- energy/GVF state evaluation
- memory and evidence ledger
- llm-compat advisory lanes
- local verification and promotion gates

The platform becomes a front-end. YURI keeps the math, evidence, memory, and routing shape.

## Current Live Ground

Verified local evidence for this design:

- `_SYSTEM/Scripts/yuri-input-genome.mjs` builds `yuri.input-genome.v0` packets from raw text: objective, constraints, risks, work packets, route hints, verification needs, provenance, and a prompt contract.
- `_SYSTEM/Scripts/llm-lane.mjs` injects the YURI spine, exposes `xref_query` and `propagation_scan` tools, accepts `--context`, and writes advisory outputs through `lane-core-hooks`.
- `_SYSTEM/Scripts/lane-core-hooks.mjs` fires `coreOnDispatch` and `coreOnResult`: energy dispatch trace, memory recall, evidence ledger, and docked-output pulse.
- `_SYSTEM/Scripts/math/yuri-energy.mjs` implements `computeU`, `computeDeltaU`, and `gateProposal` with component deltas, hard protected-path vetoes, structural promotion-ladder floors, and bounded verified-evidence credit.
- `02_RESOURCES/RESEARCH/MATH-SCIENCE-MANUAL.md` is the living dock-on guide for math/science methods.
- `02_RESOURCES/RESEARCH/yuri-mainspring-synthesis-2026-06-07.md` confirms `yuri-match` and adapters are built, while cross-surface comparable scores remain blocked on the GVF calibration C-layer.
- `02_RESOURCES/RESEARCH/yuri-clockwork-northstar-2026-06-06.md` defines the decoder correctly as an LLM-wielded instrument, not a hidden ingress hook.

Local xref evidence on 2026-06-07 surfaced `lane-core-hooks`, `llm-lane`, `yuri-input-genome`, `yuri-energy`, `xref-query`, and `propagation-scan` together for the Originator query. The GitNexus structural leg was one commit stale, so structural hits are treated as directional until reanalysis.

## The Operating Equation

Raw operator input `r` becomes an Originator state `O`.

```text
G = buildInputGenome(r)

F(q) = tok(q) union c4(q) union sem(q) union sem2(q) union opt_num(q)

R_s(q,t) = { item in corpus_s | J(F(q), F(item)) >= t }

R_all(q,t) = union_s R_s(q,t)

H = (V, E_similarity union E_structural)

p_next = rho * e_seed + (1 - rho) * A^T * p
where A = normalize(alpha * S + beta * T)

U(x) =
  w_entropy * H_claim(x)
  + w_kl * KL(claimed || verified)
  + w_log * logLoss(predictions, outcomes)
  + w_brier * brier(forecasts, results)
  + w_fail * repeatedFailures
  + w_malformed * malformedForecasts
  - w_info * informationGain(prior, posterior)
  + w_stale * staleness(evidence)
  + w_protected * protectedPathViolations
  + w_ladder * promotionLadderInversions
  - w_verified * log(1 + min(verifiedEvidenceCount, cap))

DeltaU = U(after) - U(before)

accept(action) =
  DeltaU <= threshold
  AND no protected-path veto
  AND no promotion-ladder structural floor
  AND no armed max-severity floor
```

The important part is sequencing:

1. Decode raw input into a reversible genome.
2. Retrieve with xref and complete match, not silent top-N truncation.
3. Build a state vector from recall, risks, constraints, and intended action.
4. Evaluate energy and vetoes before trusting a transition.
5. Use advisory model lanes only through llm-compat.
6. Promote only after local verification.

## The Bridge Flow

```text
operator input
  -> Originator decode
  -> input genome G
  -> xref_query / propagation_scan / yuri-match recall
  -> formula/mechanism selection
  -> energy/GVF state x
  -> local action or llm-compat advisory lane
  -> local verification
  -> evidence ledger / memory proposal / docs and graph propagation
```

For an LLM, the behavior should feel like this:

```text
decode("large messy operator request")
  -> objective, constraints, risks, work packets, route hints

xref("originator bridge math energy llm compat")
  -> broad current workspace visibility with no arbitrary top-10 ceiling

energy.computeDeltaU(before, after)
  -> whether the proposed transition reduces disorder or raises risk

match.recallAll(cue)
  -> complete per-surface recall envelope with true counts

lane.deepseek(prompt, context)
  -> advisory only, routed through llm-compat, logged by core hooks
```

This is how Codex or Claude "registers" the math and energy core: it does not need to believe in the math from prose. It calls the same YURI tools, receives deterministic envelopes, and then verifies the resulting claims locally.

## Live Versus Next Build

Already live:

- xref-first navigation surface
- propagation scans for known circuitry nodes
- `llm-lane` tools for `xref_query` and `propagation_scan`
- `lane-core-hooks` on llm-compat lanes
- input genome decoder
- math kernel primitives
- energy potential and gate
- Gemma/Ollama local lane policy through llm-compat
- complete matching and surface adapters
- numerology feature channels as opt-in deterministic recall features

Next build:

- `_SYSTEM/Scripts/yuri-originator.mjs` as the single callable bridge facade.
- A tool envelope such as `yuri_originator({ op, args })` for platform adapters.
- Shared result schema: `{ op, result, completeness, advisory_only, local_truth_claim, provenance, verification }`.
- Contract tests for protected-surface refusal, advisory-only result flags, completeness envelopes, and energy-veto behavior.
- Adapter wiring for Claude/Codex/Gemma/DeepSeek without reviving old workhorse, swarm, clone, or offload surfaces.

## Formula And Mechanism Provenance Log

| Mechanism | Formula or rule | YURI source | Operating use |
|---|---|---|---|
| Braindump decoder | `G = buildInputGenome(r)` | `yuri-input-genome.mjs` | Converts raw operator input into objective, constraints, risks, work packets, route hints, provenance, and verification needs. |
| Expanded features | `F = tok union c4 union sem union sem2 union opt_num` | `yuri-token-expand.mjs`, `nexus-numerology.mjs` | Deterministic feature set for recall and matching, with numerology default-off and opt-in. |
| Complete match | `R_s = {i | J(Fq, Fi) >= t}` | `corpus-match.mjs`, `yuri-match.mjs` | Returns complete per-surface candidate sets and true counts above threshold. |
| Federation | `R_all = union_s R_s` | `yuri-mainspring-synthesis-2026-06-07.md` | Preserves completeness per surface without pretending cross-surface scores are calibrated yet. |
| Structural bridge | `H = (V, E_sim union E_struct)` | circuitry graph plus yuri-match adapters | Connects similarity edges to graph/source relationships through deterministic ids. |
| Navigation | `p_next = rho e + (1-rho) A^T p` | mainspring synthesis | Deterministic random walk with restart for consequences and reverse-cause navigation. |
| Energy potential | weighted sum of entropy, KL, log loss, Brier, failures, malformed forecasts, info gain, staleness, protected violations, ladder inversions, verified-evidence credit | `yuri-energy.mjs` | Scores whether a proposed transition lowers or raises control-plane disorder/risk. |
| GVF | `verdict = S + V + C`, with vetoes non-offsettable | GVF research notes and `yuri-energy.mjs` floors | Prevents scalar score laundering by keeping hard vetoes separate from soft evidence. |
| Transfer distance | `value = distance * bridge * structuralConf` | `transfer-distance.mjs`, `MATH-SCIENCE-MANUAL.md` | Advisory ranking aid for cross-domain mechanism transfer, fail-closed on blockers. |
| Phi/Fibonacci | golden-section and Fibonacci search; phi cadence | `yuri-phi.mjs` | Efficient scalar tuning, threshold search, anti-phase-lock scheduling, and layout cadence. |
| Numerology channels | gematria hash, digital root, harmonic ratio buckets | `nexus-numerology.mjs` | Deterministic symbolic feature channels for recall only; not a truth metric. |
| LLM compat core hook | `coreOnDispatch -> lane -> coreOnResult` | `lane-core-hooks.mjs`, `llm-lane.mjs` | Makes external/local model output advisory, remembered, pulsed, and tied to energy trace. |

## DeepSeek Advisory Lanes

Two advisory lanes were run through the active LLM compatibility lane only:

```text
_SYSTEM/Scripts/ai llm deepseek ... --context ... --out _SYSTEM/reports/yuri-originator-bridge-deepseek-lane-a-2026-06-07.md
_SYSTEM/Scripts/ai llm deepseek ... --context ... --out _SYSTEM/reports/yuri-originator-bridge-deepseek-lane-b-2026-06-07.md
```

Lane A contribution:

- Framed YURI as a callable deterministic instrument rather than a prose-only system prompt.
- Proposed a single `yuri-originator.mjs` facade over math, energy, recall, navigation, and memory.
- Preserved advisory-only envelopes and protected-surface refusal.
- Highlighted tool-loop convergence and completeness envelopes as required safeguards.

Lane B contribution:

- Red-teamed platform parity, especially Codex adapter visibility into core hooks.
- Flagged that every platform adapter should eventually call the same dispatch/result hook pair.
- Proposed transport and ledger schema hardening as a later lane-specific build.

Both outputs are advisory. Local evidence above decides what is promoted.

## How This Helps A User Who Switches LLM Platforms

Without the Originator bridge, every model depends on whatever context it happened to read in that session. Claude might know one memory slice, Codex another, a local SLM another. The user experiences platform switching as amnesia and drift.

With the Originator bridge:

- install/startup points every model at the same origin contract
- xref and complete recall expose the whole workspace directly
- memory is Track-A governed, not trapped in one provider
- energy/GVF turns "should I do this" into a deterministic state transition check
- llm-compat lanes become advisory workers over the same substrate
- local verification remains final authority

The value is not just memory. The value is mathematically governed cognition over the workspace: recall, compare, simulate, reject, verify, and propagate.

## Non-Negotiables

- No context-router revival for active navigation. Use xref-first and propagation-scan for known graph nodes.
- No workhorse, swarm, clone orchestrator, or old offload surfaces for DeepSeek. DeepSeek goes through llm-compat only.
- No silent top-10 ceilings for recall. Small displays may page or summarize, but the underlying operation must preserve large recall and true counts.
- No occult truth claims. Numerology and alchemy are used as deterministic feature channels and mechanism vocabulary: correspondence, transmutation, decomposition, recomposition, resonance, cadence.
- No model output becomes local truth without deterministic verification.
- No protected runtime or secrets are read by the bridge.

## Next Implementation Slice

1. Build `_SYSTEM/Scripts/yuri-originator.mjs` as a read-only facade over existing functions.
2. Add `yuri-originator.test.mjs` with negative tests for protected paths, unknown operations, mutation attempts, and missing capabilities.
3. Add `yuri_originator` as a tool to `llm-lane.mjs` first, because that path already has tool-call handling and core hooks.
4. Add a text protocol for `ollama-lane.mjs` so Gemma can call it even if native tool calling is weak.
5. Add adapter-specific wiring for Codex/Claude only after the facade and tests are stable.
6. Re-run xref/propagation docs so circuitry, index, context registry, and manuals all point to the same origin.

## One-Line North Star

YURI Originator turns an LLM from a text-only assistant into an operator over a deterministic mathematical workspace: decode input, recall broadly, compare structurally, simulate energy, reject unsafe transitions, ask advisory lanes through llm-compat, and verify locally before anything becomes truth.
