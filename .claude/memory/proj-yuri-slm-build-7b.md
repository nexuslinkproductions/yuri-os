---
name: proj-yuri-slm-build-7b
description: "HIGH-PRIORITY (owner 2026-06-14): build YURI's own 7B SLM, hybrid-trained (rent-GPU fine-tune → serve local on M2 Pro/16GB), wrapping YURI's deterministic substrate as the control/verifier layer. RESEARCH/PREP now; BUILD is owner-gated — execute only on explicit 'go'."
metadata:
  node_type: memory
  type: project
  tier: high
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

GOAL: Build **YURI's own 7B SLM** (target LOCKED at 7B, owner 2026-06-14) and **transform the existing YURI
deterministic substrate into the control / reasoning / verification layer that wraps it** — "YURI as a
functional extension expressed as an SLM." SLM = language faculty; YURI spine (energy gate, claim cortex,
memory graph, nexus-rs Rust kernels, sim arsenal) = deterministic reasoning/memory/verification. Ties to the
investor-deck "non-stochastic SLM" vision + ASIAN_MOE_STRATEGIES (distill large MoE → Small MoE).

WHO: Marcel (owner, holds the "go"). Claude researches + preps + (on go) builds + verifies; peers (mimo/
deepseek/glm) advisory.

WHEN: **Research/prep NOW. BUILD is OWNER-GATED — start ONLY on Marcel's explicit "go." "Right now it's not
the time yet."** Gather + capture enough to execute on command; do not begin building. Likely a few months out
(Marcel originally tied it to a hardware upgrade).

WHERE: research/playbook → `02_RESOURCES/RESEARCH/slm-build-2026-06-14/` (00-SLM-RESEARCH-BRIEF.md = ground
truth; per-angle cited docs A–E from the research swarm; reindexed into the corpus).

STATE: HARDWARE = MacBook Pro M2 Pro / **16GB unified** / 19 GPU cores (local evidence). Honest feasibility:
train-from-scratch=NO; QLoRA fine-tune 7B on 16GB = *barely*, 12B=OOM (16GB is the wall); **7B 4-bit inference
= comfortable**. → BUILDABLE-NOW PATH = **HYBRID**: fine-tune/distill 7B on RENTED cloud GPU → quantize →
serve locally via MLX + wrap with YURI. Hardware upgrade (64–128GB M3/M4 Max) later pulls training in-house;
NOT required to start. Deep research IN FLIGHT (5-angle swarm A–E + 3 peers) → outputs land in the research dir.

NEXT: (a) synthesize swarm + peers → cited corpus docs + `ai reindex`; (b) produce a ready-to-execute **7B
build playbook** (base model pick, rent-GPU pipeline, quant, MLX serve, YURI-wrap architecture); (c) HOLD for
"go". Do NOT install ML deps / start training before the go.

SEE: [[proj-language-consolidation-priorities]] (Rust/Mojo/ML feed this) · 00-SLM-RESEARCH-BRIEF.md · ASIAN_MOE_STRATEGIES.md · investor-deck slm_development
