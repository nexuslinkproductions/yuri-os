# YURI FULL-ECOSYSTEM GRAPH — PR #2 (feat/yuri-ecosystem-graph-v1)

## What & why
The G2 loop-extension deliverable: the unified graph covering the ENTIRE YURI ecosystem, not just security. Merges 11 layers from the E1-E12 sequence (owner ruling 2026-08-04, Orion-verified depth pass) into one deterministically-regenerable graph. Kept SEPARATE from PR #45 (security-only) so Marcel reviews the two deliverables independently.

## Layer table (11 layers, 6,755 records)

| Layer file | Records | Source |
|---|---|---|
| nodes.jsonl | 47 | security walker (ports/launchd/processes/files/mcp) |
| edges.jsonl | 68 | security walker edges |
| file-nodes.jsonl | 6,127 | E1 tracked-file inventory |
| organ-nodes.jsonl | 22 | E2 governance organs (OS_KERNEL + launchd/script) |
| skills-registry-nodes.jsonl | 33 | E3 registries/capabilities/skills counts |
| memory-nodes.jsonl | 3 | E4 memory surfaces (schema-level) |
| formula-services-nodes.jsonl | 9 | E6 formula banks + E7 MCP servers (7 incl obsidian-mcp, plan) |
| history-writers-nodes.jsonl | 3 | E9 git history (1,866 commits, 24 large blobs) |
| test-wiring-edges.jsonl | 226 | E5 R/G/G test-suite wiring |
| writer-edges.jsonl | 1 | E8 literal write target (browser-harness-bridge → /tmp/harness-last-result.json) |
| dynamic-writers-nodes.jsonl | 216 | E8 dynamic write targets (~99.6% of write surface — hardening signal) |

## Pins
- full-graph.jsonl sha256: 5d14aa4afb6211c6… (promoted regen, alphabetical layer order — deterministic) (determinism: two runs identical — verified by Orion)
- Security layer pin (PR #45): e461ad0c… (unchanged — layer isolation holds)

## Regen contract
1. `node _SYSTEM/graph-ecosystem/merge-full.mjs` (reads layers/ — repo-relative, deterministic)
2. Run twice → identical full-graph.sha256 (fails otherwise)
3. New layer files → drop into layers/ → re-run → new pin

## Freshness watcher (E12)
See WATCHER.md — 6h launchd cadence + HEAD-change trigger, 6 read-only checks, alerts to Orion, auto-silence after 3 clean ticks.

## Codex runtime-proof receipts (pending owner go)
See PLAN.md Appendix A (PR #45) — 14 native-collision entries need codex debug prompt-input receipts; execution only on Marcel's explicit go in his live Codex session.
