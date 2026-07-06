# Energy Landscape ↔ Math Foundation — Integration Audit

**Date:** 2026-05-30 · **Method:** 10-agent workflow (9 module inventories + synthesis), all load-bearing claims spot-verified against live code by the main thread. Advisory until acted on; the verification grep/reads are in the session transcript.

## Verdict

The energy landscape **is honestly backed by real, certified math** — every term in `computeU` is a genuine `math-kernel.mjs` primitive (entropy, klDivergence, logLoss, brierScore, informationGain, confidenceDecay), each proof-gated by `math-proof-gate.mjs` and smoke-tested by `math-health.mjs`. Nothing fabricated. **But the gate is a thin island**, fixable by wiring, not more math.

## Three-layer map

1. **`math-kernel.mjs`** — 22 certified primitives (the executable truth).
2. **Formula banks** (`_SYSTEM/data/math/formula-banks/*.v0.json`, schema `yuri.math.formula-bank.v0.schema.json`) — declarative cards: notation, proof obligations, worked examples, and **`selectionGuidance` (useWhen/avoidWhen/yuriApplications)** — the per-scenario picker, by design. Cards bind to kernel impls; `math-proof-gate.mjs` certifies 18.
3. **`yuri-energy.mjs`** — imports **7 of 22** kernel symbols; `computeU` composes a fixed 6-primitive + 3-scalar 9-term weighted sum. Imports zero formula-bank JSON, zero proof-gate, zero adapters.

## The two dead spots (verified)

1. **Identical before/after in the live feeder** → ΔU=0 always in observability mode. The gate records that a dispatch happened; it never measures a delta.
2. **Hard-coded zeros** (`buildDispatchState`: `protectedPathViolations:0`, `promotionLadderInversions:0`) → **8 of 9 terms can never fire from real usage**, including the catastrophic `eta=100` protected-path term. Only `verifiedEvidenceCount` varies.

Live edge = only the 3 legacy dispatch surfaces (offload-runner, shintai-dispatch, codex-final-pass — **all being retired**). No everyday Claude Code hook touches the gate. *Verified: nothing outside `math/` + those 3 imports `computeU`/`gateProposal`.*

## The scenario picker exists but is inert (verified)

`selectionGuidance` is read by **exactly one file — a test** (`math-formula-card-professionalization.test.mjs`). Your equations declare which scenario each fits; nothing selects them at runtime. The picker is a routing table waiting for a consumer.

## Stranded valuable equations (certified, unwired)

`bayesUpdate` (claim-belief posterior — YURI's core thesis), `cosineSimilarity` (claim↔evidence vector drift), `crossEntropy` (calibration sibling of the wired KL), `logScale` (bound the unbounded staleness/violation terms), `softmax`, `expectedValue`, weighted-mean/variance/stddev, dijkstra/astar/topologicalSort. Each has a certified kernel impl + a formula card; only the gate wiring is missing.

## The fix — everyday-workflow ΔU (the design)

New hook `.claude/hooks/energy-tick.js` on **PostToolUse + Stop**, snapshotting a rolling session state to `_SYSTEM/state` and calling `gateProposal` per transition. The raw signal already exists in `post-tool-use.js:17-19` (`tool_name`, `file_path`, `is_error`).

**Transition → equation (each term already in `computeU`, just needs a live feeder):**

| Transition | Equation (term) | Effect |
|---|---|---|
| Edit/Write/Bash-test **passes** | +verifiedEvidence (iota) | ΔU↓ healthy progress |
| Bash/test **fails** (confidently-wrong) | logLoss (gamma) + brierScore (delta) | ΔU↑ — calibration terms that have NEVER fired |
| Claim moves draft→tested | entropy (alpha) over claimPromotionDistribution | mass into 'tested' lowers U |
| **Protected-path edit** (pre-tool-use.js detects) | protectedPathViolations → eta=100 | gate **REJECTS** — highest-value term, currently unreachable |
| End of turn (Stop) | informationGain (epsilon) prior→posterior | uncertainty reduced lowers U |
| Evidence ages across turns | confidenceDecay (zeta) | staleness term finally non-zero |

**Live picker:** classifier reads the 6 banks once, builds `{scenario-tag → [cardId, kernelFn, energyTerm]}` from `useWhen`, tags each transition → right `computeU` terms populated. Makes `selectionGuidance` live = your "pickable per scenario," real.

**Mode:** observability-first (telemetry, no blocking) until a real-traffic window proves descent on clean sessions / ascent on protected-path + failed-verification sessions; then flip those two transition types to ACTION (advise-reject), preserving `allowOverride` for operator authority.

## Honesty flags for the paper

- `descent-demo.mjs` exercises only **3 of 9 terms** (entropy, KL, verified-evidence-credit). Do NOT claim the full composition is empirically validated on the descent demo alone.
- `yuri-energy.mjs` header is accurate: "research → fixture_ready, NOT yet runtime_tested in dispatch." Don't claim runtime-tested until the hook stream shows correct descent/ascent on real sessions.
