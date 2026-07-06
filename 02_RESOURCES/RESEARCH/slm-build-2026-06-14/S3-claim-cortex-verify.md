# S3 — Claim Cortex + Verification Loop: slm-build research → SYSTEM upgrades

> Subsystem-3 integration map. The slm-build corpus was for **YURI THE SYSTEM** (the deterministic
> substrate), 7B SLM a *downstream consumer*. Maps verifier/PRM/generate-then-verify/constrained-decoding
> literature onto LIVE claim-cortex + energy-gate mechanisms — zero-GPU, now. All arXiv IDs verified live.

## Mechanism reality (HEAD)
- `claim-cortex.mjs` — pure claim LIFECYCLE; `cortexSnapshot` emits computeU's field shape. Lights α/β/ε/ζ/θ.
- `gateProposal` (`math/yuri-energy.mjs`) — Lyapunov ΔU gate + 3 non-offsettable vetoes (protected-path,
  structural-floor, L∞ max-severity). **Already a verifier** — GRPO `reward_fn` slot exists for free.
- `gateClaimTransition` — swap-immune per-claim identity veto. **Only caller is OBSERVE-mode.** Never enforces.
- `prose-claim-extractor.mjs` + `.claude/hooks/prose-claim-extract.mjs` — LIVE PostToolUse collector, runs
  `measureClaims` in **SHADOW** mode (P_emit/churn/partition → `_SYSTEM/state/claim-extractor/`). Fail-open.
- `claim-ledger.mjs` — v1 PROXY (tool-event-derived claims). Only thing feeding cortex into the live tick.
- **Peer-lanes (mimo/deepseek): NO constrained generation.** `llm-lane.mjs`/`mimo.mjs` set no grammar/
  json_schema. Only structure = `deepseek-guarded-handoff.mjs` POST-HOC reject-on-malformed-fence.

## The four real gaps (vs cargo-cult)
1. **Generate-then-verify is not a loop.** gateProposal scores ONE transition; no N-candidate argmax driver.
2. **ΔU is per-TICK, not per-STEP.** Multi-step candidates get one terminal verdict; PRM signal dark.
3. **Peer-lane structure is reject-only.** Malformed output is discarded, not constrained-regenerated.
4. **Verifier is never measured.** Nothing scores computeU/gateProposal vs labeled correct/incorrect pairs.

## Cross-domain transfer ledger
| Source | Target | Shared mechanism | Mismatch / caveat | Conf |
|---|---|---|---|---|
| GRPO reward_fn (2402.03300) | gateProposal as candidate scorer | scalar reward, no value net | training optimizer → here inference-time best-of-N; RL doesn't transfer | HIGH |
| Let's Verify Step (2305.20050) | per-step ΔU over candidate steps | step>outcome reward | our steps heuristic, not labeled | MED |
| SLMs need strong verifiers (2404.17140) | cortex/gate wraps any lane | external>self-verify | peers are big models, gain may shrink | MED-HIGH |
| VERGE (2601.20055) | gate-reason → re-prompt | decompose→verify→localize | SMT vs our regex; coarser | MED |
| Thinking Before Constraining (2601.07525) | trigger-then-constrain | free CoT then schema-lock tail | only token-maskable lanes (local SLM) | HIGH(SLM)/LOW(API) |
| Constraint Tax (2605.26128) | gate stays AFTER grammar | valid≠correct | guardrail, not a build | HIGH |
| VerifyBench (2507.09884)/FC-RewardBench (2509.11963) | labeled bench for the gate | measure the verifier | labeled set is the cost; small=overfit | MED-HIGH |

## TOP MOVE
Build the **generate-then-verify driver** around `gateProposal`: N candidates → extractClaims →
cortexSnapshot → gateProposal → accept argmin-ΔU clearing all vetoes, reject batch if none. Best-of-N
rerank (rStar-Math 2501.04519 / R1 2501.12948) on YURI's OWN loop with the verifier we already have.
One move lights three dark mechanisms (gateProposal-scorer, gateClaimTransition, cortexSnapshot) with no GPU.

## buildIn
- **gate-rerank.mjs** N-candidate rerank driver (2501.04519/2501.12948/2402.03300) → gateProposal+cortexSnapshot+extractClaims · M/high.
- **Arm gateClaimTransition** as a real caller (advisory→opt-in) (2404.17140) → claim-transition-observer.mjs · S/high.
- **Grammar-constrain local SLM output** to cortex schema via llama.cpp --grammar (2411.15100/2506.03887/2501.10868) → llm-compat-contract serve path · M/high (local only).
- **VERGE error-localized re-prompt** from gate reason-string (2601.20055/2511.04662) → rerank driver · M/med.

## simulate
- **Best-of-N lift** on 46k trace (2501.04519/2506.14245) → yuri-energy-gate-trace.mjs · M/high.
- **Constraint-tax replay** wrong-but-valid rate (2605.26128/2604.25359) → shadow ledger · S/med.
- **PRM vs outcome ablation** per-step vs terminal ΔU (2305.20050/2410.08146) → computeU/energy-tick · L/med.

## calculate
- **VerifyBench score for gateProposal** vs ToolRM-1.7B (2507.09884/2509.11963) → claim-cortex.test · L/high.
- **Calibrate rerank threshold** ECE/isotonic on ΔU→accept (2509.21882) → yuri-energy-calibrate.mjs · M/med.

## Anti-cargo-cult (do NOT)
- Don't RL-train the gate — reward_fn transfers now, policy update is the GPU leg.
- Don't grammar-constrain API peers — can't token-mask remote; keep post-hoc reject for mimo/deepseek.
- Don't arm an enforcing block before the VerifyBench number — an unmeasured blocking verifier is worse than advisory.

RESULT_LABEL: `03CV_CLAIM_CORTEX_VERIFY_SLM_INTEGRATION_MAP_X_PASS_COMMITTED`