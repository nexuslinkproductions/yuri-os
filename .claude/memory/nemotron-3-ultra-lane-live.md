---
name: nemotron-3-ultra-lane-live
description: "NVIDIA nemotron-3-ultra-550b-a55b is live + callable zero-config via our NIM passthrough; strong cold reasoning, reserve for hard system/infra security+architecture"
metadata: 
  node_type: memory
  type: reference
  tier: 2
  scope: project
  trig: 
    - nemotron
    - ultra
    - nvidia nim
    - 550b
    - reasoning lane
    - second opinion
    - red-team lane
  refs: 
    - feedback_codex_powerhouse_nim_scope
    - delta-gate-severity-laundering
  originSessionId: 3d279e0a-1920-45f5-9911-db14baebce08
---

FACTS:
- model_id == `nvidia/nemotron-3-ultra-550b-a55b` (550B total / ~55B active MoE); slug == build.nvidia.com page.
- callable TODAY zero-config: `_SYSTEM/Scripts/ai offload --model "nvidia/nemotron-3-ultra-550b-a55b" "<prompt>"` — works via the `nvidia/*` passthrough in offload.sh:366; `--model` bypasses the pulse classifier.
- auth: NVIDIA_API_KEY + NVIDIA_NIM_BASE_URL, hydrated inside offload.sh (keychain/env-file). Never touch the key directly.
- NOT in the contract's named live registry yet (last NIM probe 2026-05-20/21 predates it). Friendly `@nvidia-nemotron-ultra` alias unregistered.

IMPLICATION:
- It is a top-tier reasoning lane available now. Graded A on a cold red-team of our own energy gate (2026-06-04): independently rediscovered the conserved-sum severity-laundering vuln + math, fix A- (proved non-offsettability but discarded the legitimate-permit constraint a senior reviewer holds).
- Use for HARD system/infra security + architecture reasoning and refute-by-default second opinions — NIM-scope per [[feedback_codex_powerhouse_nim_scope]]. NOT for routine/cheap work (550B = slower + pricier than daily nemotron-120b/super-49b).
- Full eval: 02_RESOURCES/RESEARCH/nemotron-3-ultra-550b-eval-2026-06-04.md.

USAGE LAW (full-package eval 2026-06-04, 63KB/6-organ briefing + 5-verifier live cross-ref):
- Profile: A- at architecture PERCEPTION (holds a whole system, finds the load-bearing seam — its top finding survived live verification and was its own inference). C+ at unverified concrete output.
- It HALLUCINATES function names + import paths the instant it writes implementation code (invented projectStateAfter, loadCurrentEnergyState), and makes confident layer-conflation logic errors with zero hedge.
- RULE: use it to find the seam, NEVER to write the patch. ALWAYS wrap the dispatch in a live-code cross-reference/verify loop (dispatch -> verify every beyond-briefing claim vs live code). It is a poster child for why the advisory-until-verified floor exists; the output-rail auto-tags it ADVISORY_HYPOTHESIS_ONLY.
- It pads: discount volume — most "findings" re-dress the risks you fed it. The new signal is the 1-2 it infers, not the 10 it lists.

DISPATCH GUIDE (proven 2026-06-04 A/B): the 3 failure modes (symbol-hallucination, confident layer-conflation, padding) are grounding+discipline gaps, not capacity limits. Fix with the 5 scaffolds (symbol inventory + [NEW]/[RESTATED] tags + trace-before-assert + per-claim CONFIDENCE/BASIS/FALSIFIER + reason-step-by-step) = YURI's own evidence grammar exported to the external lane. Scaffolds removed hallucination-as-fact, added calibration, surfaced new findings, stopped the layer error recurring. Ceiling: it STILL fabricates file:line precision (only tool-grounding fixes that) → verify loop is permanent. Full template: 02_RESOURCES/RESEARCH/external-reasoning-lane-dispatch-guide-2026-06-04.md.

HYGIENE: ALWAYS dispatch with LANE_FRESH=1 for a clean eval — the NIM lane persists+prepends per-model history (offload-runner.mjs:1922), so a bare re-run sees its own prior answer and rehashes (A/B contamination). A 550B long-reasoning run can collapse into token garbage mid-output; it's transient, retry fresh once.

SEE: [[delta-gate-severity-laundering]] (the ground-truth problem it was tested on)
