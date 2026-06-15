---
name: feedback-mimo-peer-lane
description: "Mimo AND DeepSeek are PEER lanes — run them as equal co-workers (full heavy work), never capped advisory sidecars; their OUTPUT stays advisory-until-verified like any lane, but the DISPATCH is peer-grade"
metadata:
  node_type: memory
  type: feedback
  tier: hot
  scope: claude-behavioral
  trig:
    - mimo
    - fire mimo
    - dispatch mimo
    - work with mimo
    - deepseek
    - deepseek peer
    - ds lane
    - swarm
    - lane assignment
    - offload
  refs:
    - ref-mimo-firing
    - ref-mimo-integration
    - feedback-research-via-mimo-lane
  originSessionId: 27e6476f-energy-calibration
---

RULE: Mimo (mimo-v2.5-pro, via `node _SYSTEM/Scripts/mimo.mjs`, unsandboxed, reads no files so inline all context) AND DeepSeek (deepseek-v4-pro, via `node _SYSTEM/Scripts/llm-lane.mjs deepseek`, has read/grep/xref/fetch tools so it CAN read the real files) are heavy, reliable, near-parity PEER lanes. Run BOTH as EQUAL co-workers to the main Claude lane — hand them whole work packages (design, build, adversarial review, synthesis), not sidecar / advisory / "second opinion" / cheap-fallback scraps. Their OUTPUT is still advisory-until-local-evidence-verifies (same as any lane, including Mimo) — "peer" describes how you DISPATCH (full, equal), not the authority of the result. Cross-family swarms (Opus + Mimo + DeepSeek on the same question) give genuine convergence signal, not framing artifact.

WHEN: any time work is parallelizable or could be done by another lane — design, build, synthesis, review, drafting, analysis. Especially multi-lane swarms.

DO: hand Mimo whole work packages (architecture-level, not just "well-scoped trivial" ones); split work between Claude and Mimo by parallelizability, not by an assumed quality hierarchy; trust its output (still verify against local evidence like any lane); fire it via `node _SYSTEM/Scripts/mimo.mjs` unsandboxed.

DONT: cap its max_tokens below the model ceiling (131072) — the API range is (0,131072] and a low cap silently truncates a reasoning model to empty output; describe it as a "side car", "advisory", "perspective", or "second opinion"; reflexively keep the heavy/architecture work for Claude and give Mimo the scraps; ASYMMETRICALLY tag a peer lane's output `advisory_only=true` while leaving Claude's own output unstamped — the verify-before-fact floor is SYMMETRIC across ALL lanes including Claude itself, so stamping only the model lane silently re-demotes it to sidecar even when dispatch was peer-grade.

WHY: Marcel corrected this twice in one session (2026-06-13) — I capped Mimo at 8192 then 32768 and framed it as an advisory cross-check, despite the 2026-06-10 directive ([[ref-mimo-integration]]) that Mimo is a first-class peer. Then again 2026-06-13: I framed DeepSeek as a "compact advisory 80-line query" (the research-pipeline DEEPSEEK_REINFORCEMENT format) while firing Mimo as a full peer — Marcel: "no, deepseek peer lane too." DeepSeek's dispatch is peer-grade like Mimo; the 80-line compact-evidence format is for cost-bounded RESEARCH reinforcement, NOT for sidelining the lane on real work. Treating a peer lane as a sidecar wastes a cheap, capable equal. Corrected AGAIN 2026-06-14 (memory-architecture mission): I wrote "Mimo/DeepSeek output is advisory_only=true" in the master-brief while not applying the same tag to my own Claude reasoning — Marcel: "mimo is peer too, dont treat it as advisory only rick." The floor is symmetric; the right framing is "no lane's claim climbs to local-truth until local evidence promotes it, Claude's included" — verification is how peer work EARNS fact-status, not a per-lane demotion.

SEE: [[ref-mimo-firing]] (how to fire, no-cap) · [[ref-mimo-integration]] (peer-status directive + claude-mimo launcher) · [[feedback-research-via-mimo-lane]]
