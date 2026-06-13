---
name: proj-claim-wiring-audit-2026-06-13
description: Full claim-to-wiring integrity audit of YURI; ledger of ~34 confirmed open ends at _SYSTEM/reports/claim-wiring-audit-2026-06-13.md
metadata: 
  node_type: memory
  type: project
  tier: 2
  scope: yuri-os
  trig: 
    - open ends
    - wiring
    - claims hold up
    - "what's unwired"
    - audit
    - claim integrity
  refs: 
    - feedback-live-recall-not-stale-trackers
    - feedback-prose-not-outrun-wiring
    - energy-gate-Linfinity-doubly-inert
  originSessionId: d0121710-5fe7-4681-801a-e863c3393975
---

GOAL: prove every YURI capability CLAIM holds up to its WIRING; surface unwired/broken/fail-silent open ends.
WHO: Marcel asked; Claude ran 16-agent fan-out (8 find + 8 adversarial verify, sonnet-pinned), verified vs live HEAD 8dffc7ee.
WHEN: 2026-06-13.
WHERE: full ledger → _SYSTEM/reports/claim-wiring-audit-2026-06-13.md (indexed in FTS5 corpus).
STATE: ~34 confirmed open ends. 3 diseases — (1) graph rot / dual-graph split: _SYSTEM/yuri-graph.json=240 nodes vs 02_RESOURCES/RESEARCH/yuri-circuitry-graph.json=118 nodes, and xref/propagation read the SMALLER one; (2) enforcement theater: energy-enforce/musubi-enforce/tirith/claude-protocol-guard are advisory/fail-open/fail-silent by default, real boundary = settings.json deny + operator-write-guard (file tools only); (3) half-wired autonomic layer: dream enqueues-no-drain, homeostat advisory-no-exec, 2 session-bound crons dead since 2026-06-11, continuous-EOT auto-trigger never wired. Top P1s: `ai auto` code-local lane silently dies; `~/.local/bin/ai` PATH shadow breaks `ai` in non-interactive shells; 4 dangling skill commands (gpt-oss/kimi/math-curve-loaders/yuri-dna-ingest). CORRECTION: the L∞ "doubly-inert" memory is now OBSOLETE — cap=1, armed; see [[energy-gate-Linfinity-doubly-inert]].
NEXT: Marcel to pick fix lane — cheap P1s (PATH shadow, code-local lane, crons→LaunchAgents, dangling commands) need no intent call; energy-enforce guarantee-vs-aspirational + graph-merge + formula-foundry-live are intent calls.
SEE: [[feedback-live-recall-not-stale-trackers]] (live HEAD = truth, trackers stale), [[feedback-prose-not-outrun-wiring]].
