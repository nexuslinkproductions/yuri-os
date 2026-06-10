---
name: session-handoff-2026-06-05-adapters
description: "FRESH-SESSION HANDOFF (2026-06-05): reasoning-lane adapters (nemotron+deepseek) built, max-reasoning policy, circuitry wired, bash-guard hardened, DeepSeek empty-content FIXED. Both lanes functioning. 5 new commits on feat/xref-propagation-scan-v1, UNPUSHED (owner holds push). Follow-up queue inside."
metadata: 
  node_type: memory
  type: project
  tier: working
  scope: main
  trig: 
    - resume
    - fresh session
    - handoff
    - where we left off
    - nemotron
    - deepseek
    - adapters
    - next session
  refs: 
    - "[[nemotron-framework-adapter-idea]]"
    - "[[energy-gate-Linfinity-doubly-inert]]"
    - "[[bash-guard-role-matcher-lexical-bypass]]"
    - "[[yuri-mode-toggle-idea]]"
    - "[[gitnexus-query-is-lexical-context-is-structural]]"
  originSessionId: 2448e5f4-5e5f-4625-bfa9-db81dc67ab4c
---

GOAL: clean pickup for the fresh session Marcel asked for, with BOTH nemotron + deepseek functioning. WHEN: 2026-06-05. WHERE: branch feat/xref-propagation-scan-v1 (UNPUSHED — owner holds push).

COMMITS THIS SESSION (newest first, all pre-commit-hook green):
- 652acccb fix(lanes): DeepSeek empty-content fix — budget (16384/32768) + reasoning_content fallback (pure reasoning-finalize.mjs + test 7/7). Live-proven 7.3KB content at max.
- bb4d70d6 docs(research): nemotron-framework-adapter + mode-toggle specs.
- b355f5b1 feat(circuitry): wire LANE_NEMOTRON + PROPAGATION_SCAN + XREF_QUERY (124->127 nodes).
- b7b6ac57 feat(lanes): reasoning-lane adapters (nemotron+deepseek over shared reasoning-lane-dispatch core) + max-reasoning policy + ai nemotron / ai ds-reason facades.
- c6070f17 feat(security): PC-1 protected-path single-source + role-matcher hardening (4 rounds).
- (earlier on branch: 4ad1bf83 nav synthesis, 357c7274 propagation-scan V1.)

LANE STATE FOR FRESH SESSION:
- DeepSeek (ai ds-reason / deepseek-v4-pro) = FUNCTIONING. Returns real content at max reasoning; counts reasoning_tokens against max_tokens so budget was raised; empty-content fallback in place.
- Nemotron (ai nemotron / nvidia/nemotron-3-ultra-550b-a55b) = FUNCTIONING but two caveats: (1) its --reasoning tier is DECORATIVE — reasoning is NOT forwarded over the NIM chat transport (offload.sh:509/370 + the NIM body builder), so max is a no-op for NIM; cutoff control is task-bounding. (2) the 550B lane was NIM-UNREACHABLE late this session (transient outage; sibling nemotron-3-nano verified instead).
- Adapters give tool-grounding (lane --tools is on; the model reads live files). Cross-model triangulation works: Nemotron found a VERIFIED energy-gate bug ([[energy-gate-Linfinity-doubly-inert]]).

FOLLOW-UP QUEUE (next-work, none blocking):
1. Nemotron NIM reasoning-forwarding — wire --reasoning into the NIM chat transport so max isn't decorative (offload.sh + offload-runner NIM body / maxTokens).
2. kagami-boot AggregateError — `ai reindex` (and direct yuri-search-index.mjs) die on a kagami-start.sh boot error; exec-bit was fixed, the boot is the remaining blocker. FTS5 corpus is stale for new content until fixed.
3. Energy L∞ Wave-3 — arming the cap is NOT enough; must also populate maxLadderInversion in energy-tick-core (see [[energy-gate-Linfinity-doubly-inert]]).
4. Mode-toggle build — spec ready (yuri-mode-toggle-spec-2026-06-05.md).
5. gitnexus analyze — 2 commits behind (sibling-ranking only); deferred.
6. PUSH the branch + the 3 owner scripts (start-workers/rick-watch/launch-readiness-wrapper) made portable but uncommitted (owner's to keep).

SEE: specs in 02_RESOURCES/RESEARCH/ (nemotron-framework-adapter, yuri-mode-toggle, nemotron-3-ultra-eval, external-reasoning-lane-dispatch-guide).
