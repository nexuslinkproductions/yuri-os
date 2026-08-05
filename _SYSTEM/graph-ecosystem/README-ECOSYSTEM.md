# YURI FULL-ECOSYSTEM GRAPH — PR #46 (feat/yuri-ecosystem-graph-v1)

## What & why
The G2 loop-extension deliverable: the unified graph covering the ENTIRE YURI ecosystem. This remains the v3 artifact: 6,971 raw node/edge records reduced by deterministic keep-last dedup to 6,742 total records (6,350 unique node IDs and 392 edges), with graph pin `f5597cc33c3b0e5e93683b4af5f8265544f59d31b5055221b45889fc8f164475`.

## Layer table (17 layers, 6,971 records)

| Layer file | Records | Source |
|---|---|---|
| deps_audit.jsonl | 0 | v3 dependency/audit layer |
| env_files.jsonl | 102 | environment-file inventory |
| file_inventory.jsonl | 6,127 | repository file inventory |
| formula_banks.jsonl | 2 | formula bank nodes |
| git_history.jsonl | 1 | repo-history seed node |
| hygiene.jsonl | 4 | hygiene indicators |
| launchd.jsonl | 26 | launchd/job nodes |
| live_ports.jsonl | 66 | live listener metadata |
| mcp_servers.jsonl | 14 | MCP server inventory |
| memory_schema.jsonl | 3 | memory schema nodes |
| network_probe.jsonl | 0 | network probe layer |
| organs.jsonl | 21 | governance organs |
| protected_paths.jsonl | 15 | protected paths inventory |
| registries.jsonl | 6 | registry metadata |
| secrets_control.jsonl | 0 | secrets-control inventory |
| test_wiring.jsonl | 338 | test-wire routing |
| writers.jsonl | 246 | writer and edge records |

## Pin
- full-graph.jsonl sha256: f5597cc33c3b0e5e93683b4af5f8265544f59d31b5055221b45889fc8f164475

## Regen contract
1. `cd _SYSTEM/graph-ecosystem && node merge-full.mjs`
2. Re-run the command; both `full-graph.sha256` and `full-graph.dedup-report.json` must be byte-identical.
3. New layer files → drop into `layers/` → re-run → new pin.

## Freshness watcher (E12)
See WATCHER.md.
