---
name: feedback-online-verification-layer
description: "Owner directive 2026-06-16: online verification is now a STANDARD certainty layer for external/factual claims — layered ON TOP of local-execution ground truth, never replacing it."
metadata:
  node_type: memory
  type: feedback
  tier: 1
  scope: evidence/verification doctrine — all work, all lanes
  trig: "any external/factual claim (library/API behavior, CVE, prior-art, benchmark, upstream-current); finalizing work; 'verify'/'is this true'/'confirm'"
  refs:
    - feedback-nano-swarm-orchestration
    - research_pipeline
  originSessionId: 27e6476f-e479-4e3a-a38a-a94ec10b4c86
---

RULE: Add ONLINE verification as a STANDARD layer of certainty (not just escalate-when-local-insufficient). After local evidence, cross-check EXTERNAL/FACTUAL claims against authoritative online sources — one extra layer before trusting them. BUT the layering is strict: local EXECUTION stays GROUND TRUTH for our own system's correctness; online is the verification layer for claims about the EXTERNAL world + our assumptions about it. Online NEVER overrides a local execution result for our own code.

WHEN: any external/factual claim — library/API behavior, CVE/security fact, prior-art, benchmark numbers, "is this still current upstream," third-party contract; and when finalizing external-facing work. NOT for "does our code work" (that's local execution, ground truth).

DO:
- Verify against PRIMARY / authoritative sources (official docs, the source repo via raw.githubusercontent / api.github), not random blogs.
- Cite the source; capture genuinely-useful synthesized findings to 02_RESOURCES/research/<topic>-<date>.md + `ai reindex` (the local-first capture bridge — turns a one-off lookup into compounding corpus).
- Route through sanctioned tools (WebSearch / WebFetch / curl-gated to raw.githubusercontent + api.github); honor the research_pipeline STOP conditions.
- Treat a confident online source like a confident lane: advisory until corroborated. Prefer ≥2 independent primary sources for a load-bearing external claim.

DONT:
- Treat online as automatically MORE certain than local — the web hallucinates, goes stale, and is gameable (same failure class as a lane stating "7e13 > 9e15" with total confidence, NS2 2026-06-16 [[feedback-nano-swarm-orchestration]]).
- Let an online claim OVERRIDE a local execution result for OUR code. Run the test; the run wins.
- Full-crawl or hit non-allowlisted domains without owner approval.

WHY: Marcel 2026-06-16 — "since we confirm based on local evidence, it is time to upgrade that to online verification and evidence — one extra layer of certainty moving forward." This ELEVATES online from research_pipeline's "escalate only when local provably insufficient" to a standard verification layer for external claims. Canonical propagation DONE 2026-06-16 (owner-confirmed): `.claude/rules/research_pipeline.md` → ONLINE-VERIFICATION LAYER section + `_SYSTEM/yuri-origin.md` → Evidence Contract Grammar clause. All lanes now inherit it.

SEE: research_pipeline.md (LOCAL-FIRST MANDATE + research ladder); yuri-origin Output Contract (model output advisory_only until a local verifier proves otherwise); [[feedback-nano-swarm-orchestration]] (verify-every-claim).
