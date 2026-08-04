# graph-recon — reusable graph-engineered recon loop (Python 3.11+, stdlib-only)

## The extension contract ("add code to the loop")
1. Drop a file in `scanners/` (or register via `@scanner` — any module defining a `BaseScanner` subclass).
2. Class `XScanner(BaseScanner)` with `name`, `dim`, `run(ctx) -> ScanResult`.
3. `run()` returns nodes/edges/findings; ALL records carry `evidence: [file:line | command | hash]`.
4. Determinism: emit in sorted order (or the merge sorts); no timestamps/PIDs in record ids (meta only).
5. `graph-recon run --root <repo> --scanners-dir scanners --layers out/layers --graph out/graph.jsonl --pin out/graph.sha256` — runs everything, merges, pins.
6. `graph-recon verify --graph ... --pin ...` — determinism re-check (two runs must produce the identical pin).

## Rails (binding)
- Read-only scans. NO secret VALUES in output (location/type/context/hash only). NO egress.
- Keychain = NODE-ONLY (zero access).
- Protected surfaces (protected.py catalog): metadata-only via `ctx.meta_only()` — path/size/mtime/perm/sha256-prefix. `ctx.read_text()` returns None for protected paths (fail-closed).
- Tracked promotion via PRs only.

## CLI
- `graph-recon scan` — list loaded scanners.
- `graph-recon run` — execute all scanners → per-scanner layers → merged graph + sha256 pin.
- `graph-recon merge` / `verify` — merge/verify layers vs pin.
- `graph-recon ledger` — findings severity summary.

## Analytics scanners (graph-understanding phase, M1)
Four scanners consume the MERGED graph (not the filesystem) and emit analytics:
- `connected_components` — union-find components across all layers; component
  nodes + `member_of` edges; `cc:top` ranking; findings for components mixing
  secret/protected surfaces with network surfaces.
- `articulation` — Tarjan bridges/articulation points on the code subgraph
  (kinds file/script/service/test_suite); `art:top` ranking; findings for
  exec-capable cut vertices.
- `cross_layer_links` — query tables: every (surface→surface, edge_kind)
  aggregate with boundary histogram; targeted queries `query:memory_bus`,
  `query:writers`, `query:secrets`; findings for secret↔network links,
  file_write into protected/database targets, memory-bus touches.
- `exec_centrality` — exec-capable source ranking by directed reach + weighted
  reach score + trust-boundary crossing counts; `exec:top` ranking; findings
  for sources reaching ports across trust boundaries.

Input resolution (graphio.load_graph, fail-open): `--graph-input <path>` >
`$GRAPH_RECON_GRAPH` > `<repo>/_SYSTEM/graph-ecosystem/full-graph.jsonl`.
Dangling edge endpoints (e.g. test_suite nodes emitted only as edge endpoints)
are synthesized as minimal node records, deterministically, so every edge
endpoint is addressable. Missing input => empty result + note, never a crash.

## Scanners (22)
live_ports, launchd, mcp_servers, file_inventory, organs, registries, memory_schema, formula_banks,
test_wiring, writers, git_history, secrets_control (wraps YURI control), deps_audit (network-gated),
network_probe (config-gated), env_files, protected_paths, hygiene.
+
Analytics (M1): connected_components, articulation, cross_layer_links, exec_centrality.
