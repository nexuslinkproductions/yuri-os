# T1 MERGE PLAN — unified YURI security graph

## Source schema inventory
| Artifact | On disk | Size | Kind | Notes |
|---|---|---|---|---|
| _SYSTEM/yuri-graph.json | YES | 392KB | canonical architecture graph v0 | flowMeta/mechMeta/flowOrder/mechOrder; CANONICAL (state is generated from it via yuri-graph-unify.mjs) |
| _SYSTEM/yuri-graph-state.json | YES | 164KB | GENERATED view v15 | sectors[]; never hand-edit; derived from yuri-graph.json @commit 381f9876 |
| .gitnexus/ (meta.json) | YES | 683B meta | code index | 3998 files / 89,109 nodes / 128,520 edges; indexed 2026-08-02; STALE lastCommit 94752ec2 (HEAD is 0158a8fd) — needs re-index before merge |
| graphify-out/*.json | NO (history-only) | 79MB | AST graph | absent on disk; skip or restore-from-history (not needed for security layer) |
| walker nodes/edges.jsonl | YES | 47n/68e | security recon graph | our layer |

## Merge rules (lossless)
1. Namespace node ids by source: `yuri:` (canonical), `gitnexus:` (code index), `walker:` (security) — cross-link by path where derivable, never re-key.
2. Walker findings attach via `linked_to_finding` edges (already the pattern).
3. gitnexus re-index before merge (stale by 1 commit — 94752ec2 vs 0158a8fd).
4. Deterministic regen: merge script must be pure (sorted keys, stable ids); output sha256 pinned in meta.
5. graphify-out: SKIP (absent; AST layer redundant with gitnexus call graph + ast-js scan results).

## Conflicts to resolve
- yuri-graph-state.json is derived → merge from yuri-graph.json ONLY (avoid double-counting).
- gitnexus nodes (function-level) vs walker nodes (file/service-level): keep separate namespaces; edge cross-links only where 1:1 (file paths).
- stale generatedAt/commit fields must be re-stamped, never trusted.

## Tooling direction
- networkx (python) or jq-based queries over merged.jsonl; Cytoscape/Gossamer for viz (research-notes.md); Neo4j optional.
- Hash-pinned regen test: run merge twice → identical sha256.
9. REGEN STEP (documented): `npx gitnexus analyze --skip-agents-md` BEFORE merge (44.9s, fresh index at HEAD; verified gitignored/untracked/derived/reversible — approved re-index 2026-08-04 by Orion).

## APPENDIX A — CODEX RUNTIME-PROOF RECEIPTS (procedure, owner-gated execution)
For the 14 native-collision projector entries (registryResolution: native-collision-only-exact-path-state; runtimeProofRequired: codex-debug-prompt-input-bounded-full-description-receipt). Execution inside Marcel's live Codex session only — owner go required.
1. In the Codex session, from repo root, run: `codex debug prompt-input` (bounded, once).
2. Capture the full output to a file: `codex debug prompt-input > /tmp/codex-proof-prompt-input.txt`.
3. Assert the following in the output (expected shape):
   - No `Exceeded skills context budget` warning (2% budget respected).
   - The 12-entry enabled projection is present with descriptions retained (activate-yuri-skills + xref/preflight/plugin-control/verification/orchestration entrypoints).
   - Zero omitted skills among the enabled projection.
   - Disabled/reference-only skills NOT eager-loaded (recallable via `skill-recall --show <id>` instead).
4. For each of the 14 native-collision ids (hatch-pet, browser-harness, etc.), record: presence/absence in the debug output + the exact `skill-recall --show` recall path.
5. Save the receipt at `/tmp/yuri-recon/codex-proof-receipt.txt`, sha256 it, and report to Orion for ledgering (F-039 pending) + projector --check re-run expectation: ok:true.

## APPENDIX B — E12 FRESHNESS WATCHER (design, per G2 loop-extension)
Purpose: keep the unified graph current between recon campaigns; catches drift (new procs/ports/files, HEAD moves, secret regressions) without full re-walks.
Cadence: every 6h (launchd interval) + on git HEAD change (post-checkout hook, non-blocking).
Checks (all read-only, cheap):
1. `git rev-parse HEAD` vs pinned graph HEAD in _SYSTEM/graph/manifest.json — mismatch → mark graph stale, queue re-walk.
2. `lsof -iTCP -sTCP:LISTEN` diff vs pinned port baseline → new/removed listener → update port nodes + alert on unexpected LAN bind (*).
3. LAN probes: 8471/8472/8777/11434 curl → if a previously-flagged exposure disappears → mark F-003 node mitigated-candidate (owner confirms); if new 200 on unknown port → finding candidate.
4. `secret-leak-scan.mjs` run → regression gate (nonzero findings = alert).
5. whatsapp-mcp proc count diff → drift note.
6. .agents/skills projector --check → unmanaged-overwrite guard status (F-036 re-regression).
Output: append-only watcher log /tmp/yuri-recon/watcher.log + node freshness updates; alerts to Orion for verdict.
Stop policy: G2 — owner interrupt at any time; watcher auto-silences after 3 consecutive clean ticks until next HEAD change.
