# Generated Artifact Hygiene

Yuri OS treats generated artifacts as rebuildable evidence, not active source truth. A generated graph can help navigation, but it must not outrank current files after source renames, deletions, or identity assimilation work.

## What Counts

Generated artifacts include files produced by graph builders, RAG emitters, visualization tools, source manifests, claim graphs, build outputs, caches, and reports derived from those outputs. They are allowed to exist, but they must be labeled and either reproducible or quarantined when stale.

## Current Generated Paths

- `graphify-out/GRAPH_REPORT.md` - graphify report derived from a prior graph run.
- `graphify-out/cost.json` - graphify run-cost metadata.
- `graphify-out/v2_graph.json` - tracked graphify export retained for reference.
- `graphify-out/v3_graph.json` - tracked graphify export retained for reference.
- `graphify-out/ruflo_core_graph.json` - tracked graphify export retained for reference.
- `graphify-out/graph.json` - removed from the active surface when stale; regenerate only through a bounded, reviewed command.
- `graphify-out/cache/`, `graphify-out/.graphify_*.json`, `graphify-out/.chunk_*.txt`, `graphify-out/chunk_*.txt`, and `graphify-out/.graphify_python` - ignored runtime artifacts.
- `graph/` and `claude-palace-out/` - ignored regenerated navigation outputs.

## Regeneration

The available wrapper is:

```bash
npm run graphify -- <bounded-target>
```

This calls `_SYSTEM/Scripts/graphify-run.sh`, which runs `graphify update "$TARGET"`.

Do not run root-level regeneration as a reflex. Before regenerating, choose a bounded target, confirm the corpus size, and confirm protected paths are excluded. If the only available command would scan the full repository or an unclear corpus, remove or quarantine the stale artifact instead.

## Quarantine And Removal

Generated output must be removed from the active surface when it references deleted active source paths. If the old artifact still has forensic value, move it under a dated archive path such as `07_ARCHIVE/generated-artifacts/<date>/` with a short reason. Archived generated output is historical context only.

Do not hand-edit massive generated JSON to hide stale nodes. Regenerate from current source, remove the stale output, or quarantine it as historical.

## Protected Path Exclusions

Generated artifact checks and regeneration planning must avoid:

- `backend/data/`
- `.claude/state/`
- `.claude/history/`
- `.env`
- secrets, API keys, credentials
- dependency trees such as `node_modules/` and `backend/node_modules/`

Do not run tests or scripts against live protected databases unless the script already exposes an explicit safe flag.

## Guardrails

`_SYSTEM/Scripts/generated-artifact-hygiene.test.mjs` scans tracked generated graph outputs and fails when they preserve deleted active source paths as current graph nodes or edges. The test deliberately treats historical archives as allowlisted only with explicit reasons.

Before committing generated artifact changes, run:

```bash
node _SYSTEM/Scripts/generated-artifact-hygiene.test.mjs
node _SYSTEM/Scripts/backend-release-gate.test.mjs
node _SYSTEM/Scripts/gitnexus-mcp-check.mjs
npm test
```

Also run GitNexus detect before staging and again after staging.
