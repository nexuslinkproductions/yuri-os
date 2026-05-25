# YURI Security And Structure Sprint

Date: 2026-05-24
Mode: secret exposure hardening, canonical navigation audit, lane-cache posture
Baseline commit before sprint: `898bdf66`

## Executive Read

The current tree is cleaner than it looks in the file explorer.

The root navigation spine is now operational: folder census validates zero unclassified root entries and zero missing registry entries. The remaining problem is not root chaos; it is lifecycle discipline for candidate-review surfaces, runtime/cache surfaces, and historical security residue.

The security finding is sharper: the live repo scan is clean, but git history contains a masked NVIDIA API-key pattern in an old `.claude/yuri-sentinel/learning/.dream-prompt.txt` path. The stale file still existed locally as an untracked file and was removed without reading its contents. Because git history still contains the old value, the matching NVIDIA key must be rotated or revoked by the owner.

## Evidence

### Live Secret Scan

Command:

```bash
node _SYSTEM/Scripts/secret-leak-scan.mjs
```

Result:

- scanned files: `5447`
- latest scanned files after lane-cache-rotator work: `5452`
- skipped large files: `3`
- tracked protected files: `0`
- findings: `0`
- status: `ok`

### History Secret Scan

Command:

```bash
node _SYSTEM/Scripts/secret-leak-scan.mjs --history
```

Result:

- live tree remained clean
- history mode scanned high-confidence key prefixes
- finding: masked `nvapi-...` pattern in `.claude/yuri-sentinel/learning/.dream-prompt.txt`
- affected historical commit prefixes: `6b7b68f5bcd5`, `2f5e4d196bc0`, `ecbb7fcc0143`
- action taken locally: removed the exact stale untracked prompt file without reading it
- action still required: rotate/revoke the NVIDIA key in the provider dashboard

History rewrite is intentionally not performed in this sprint. Rewriting git history is destructive, coordination-heavy, and should require explicit owner approval after key rotation.

### Keychain Posture

Checked with `yuri-keychain.mjs has <KEY>`; no secret values were printed.

Present:

- `DEEPSEEK_API_KEY`
- `NVIDIA_API_KEY`

Missing or optional:

- `CODE_DEEPSEEK_API_KEY`
- `NVIDIA_KEY_MINIMAX_M27`
- `MINIMAX_M27_NIM_API_KEY`
- `MINIMAX_NIM_API_KEY`
- `BROWSER_USE_API_KEY`
- `OPENAI_API_KEY`

Meaning: core DeepSeek and NVIDIA routes can hydrate through Keychain. Optional/specialized keys should be added only when actively needed.

### Folder Census

Command:

```bash
node _SYSTEM/Scripts/folder-census.mjs --validate
```

Result:

- root entries: `57`
- unclassified: `0`
- protected: `2`
- folder registry entries after artifact-registry work: `68`
- missing registry entries: `0`

Resolved legacy root surfaces after the tracked-root cleanup:

- `backend` — untracked legacy backend runtime surface with ignored/sealed contents; `backend/.env`, `backend/data`, nested dependencies, logs, and build output stay sealed
- `Scripts` — untracked legacy tool surface with ignored/runtime contents; `_SYSTEM/Scripts` is canonical
- `test` — untracked legacy workspace surface with ignored/runtime contents; active tests live beside canonical scripts/packages

Resolved during follow-up:

- `debug-hardstop.mjs` — removed from the active tree; tracked ad hoc debug residue with no live references
- `debug-preflight.mjs` — removed from the active tree; tracked ad hoc debug residue with no live references
- `yuri-os-dashboard.html` — reclassified as a tracked generated dashboard snapshot; source truth remains the generator/spec docs
- `_SYSTEM/config/artifact-registry.json` — added as the durable artifact registry seed
- `_SYSTEM/Scripts/artifact-registry.mjs` — added as the validator and future artifact placement classifier
- `backend`, `Scripts`, and `test` — reclassified from candidate-review roots into explicit legacy/runtime surfaces without reading protected contents

### Context Router

The cybersecurity, memory, and automation packets resolve to existing files. This confirms the current context layer can route without blind repo crawling.

Commands:

```bash
node _SYSTEM/Scripts/context-router.mjs "secret leak scan, keychain credential hardening, DeepSeek lane session cache, canonical folder architecture cleanup, cybersecurity sprint"
node _SYSTEM/Scripts/context-router.mjs "memory rag recall neuron profile eot wiki"
node _SYSTEM/Scripts/context-router.mjs "automation launchd agent health stale daemon worker"
```

## Changes Made

- Added `--history` mode to `_SYSTEM/Scripts/secret-leak-scan.mjs`.
- Added `_SYSTEM/Scripts/secret-leak-scan.test.mjs`.
- Wired live secret scanning into `_SYSTEM/Scripts/yuri-supercharge-gate.mjs`.
- Extended `_SYSTEM/Scripts/yuri-supercharge-gate.test.mjs` to require the secret scan checks.
- Removed stale untracked `.claude/yuri-sentinel/learning/.dream-prompt.txt` without reading it.
- Moved active lane session continuity into `_SYSTEM/state/lane-sessions/`.
- Added `_SYSTEM/config/artifact-registry.json` and `_SYSTEM/Scripts/artifact-registry.mjs`.
- Wired artifact-registry syntax/tests into the release gate.
- Registered the cybersecurity proof chain so the cyber packet maps to concrete docs, scripts, data, reports, and lab fixtures.
- Added `_SYSTEM/Scripts/lane-cache-rotator.mjs` as the YURI-owned lane-session hygiene wrapper.
- Hardened lane-session compaction so prior `[LANE-MEMORY]` summaries are not recursively re-summarized into cache bloat.
- Added and regression-tested `_SYSTEM/Scripts/cyber-memory-rollback-proof.mjs` with `_SYSTEM/Scripts/cyber-memory-rollback-proof.test.mjs` and `_SYSTEM/labs/cyber/fixtures/memory-rollback-corpus.json`.
- Hardened Shintai health preflight so scoped assemblies do not silently rebuild into broader councils after a lane timeout or health failure.

## DeepSeek Advisory Notes

DeepSeek agreed on the core order:

1. rotate/revoke the historical NVIDIA key
2. keep history rewrite separate and approval-gated
3. classify candidate-review surfaces instead of letting them become permanent haze
4. use persistent DeepSeek sessions, but add session-cache hygiene and pruning

DeepSeek also suggested direct inspection of lane-session files. That recommendation is rejected as written. Lane sessions must be accessed through wrappers, metadata, and health summaries instead of raw reads.

## DeepSeek Session / Cache Posture

Current code supports persistent DeepSeek and NIM sessions:

- `_SYSTEM/Scripts/lane-session.mjs`
- `_SYSTEM/Scripts/offload-runner.mjs`

Follow-up hardening moved the default lane session store from Claude runtime into YURI-owned runtime:

- new default: `_SYSTEM/state/lane-sessions/`
- legacy import: `.claude/lane-sessions/` is read by `lane-session.mjs` only when a YURI-owned session file does not exist yet
- test isolation: `YURI_LANE_SESSION_DIR` and `YURI_LEGACY_LANE_SESSION_DIR` can override both stores for workers/tests

Observed from this sprint:

- DeepSeek direct call used `deepseek-v4-pro`.
- first cache metric returned: `hit=0`, `miss=29538`, ratio `0.00`.
- later same-session advisory call returned: `hit=27776`, `miss=2799`, ratio `0.91`.
- session persisted through the wrapper.
- `lane-cache-rotator.mjs --dry-run` found `7` YURI-owned lane-session files, `397233` bytes total, `0` compactable, and `0` secret-like sessions.

Interpretation: persistence works. Cold starts still happen, but stable session reuse can push cache hit rate high when prompts keep a stable prefix. To raise cache hit rate, future large DeepSeek work should:

- reuse one stable `--session` name per sprint
- keep stable prefix instructions across calls
- avoid constantly changing massive preambles
- summarize old context into a stable lane memory instead of restating everything
- keep using stable `--session` names so the same YURI-owned session prefix accrues cache hits
- repair or replace lane-session pruning so long-lived sessions stay useful without becoming secret-bearing archives

## Next Implementation Order

1. Rotate/revoke the exposed NVIDIA key.
2. Add a history-secret scan target to a slower/manual release command, not every pre-commit.
3. Wire the `lane-memory-prune` automation to call `lane-cache-rotator.mjs --apply` after a manual dry-run passes.
4. Expand the artifact registry across skills, model runtimes, generated assets, and remaining project surfaces.
5. Extend memory/RAG proof with richer synthetic corpus coverage. Initial synthetic rollback proof is now implemented and test-gated; keep future work to bounded fixture expansion unless a live memory safety task is explicitly scoped.
6. Add a slow cleanup lane for ignored legacy/runtime roots after rebuild/archive proof exists.

## Guardrails

- Do not request or print raw keys.
- Do not read `.env`.
- Do not read `.claude/state`, `.claude/history`, `.claude/lane-sessions`, `.claude/projects`, or credential files directly.
- Treat `.claude/lane-sessions` as legacy-import-only; active DeepSeek/NIM continuity belongs under `_SYSTEM/state/lane-sessions`.
- Do not rewrite git history without explicit owner approval.
- Do not treat old provider/runtime folders as active architecture unless the registry says so.
