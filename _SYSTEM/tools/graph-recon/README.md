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
- `graph-recon run` — execute all scanners → per-scanner layers → merged graph + sha256 pin; findings → `findings/<scanner>.jsonl` (deduped by fingerprint); analysis-bundle manifest → `layers/analysis-manifest.json`. Scanner errors are FAIL-CLOSED: an error layer `<name>.ERROR.jsonl` is written and the run exits nonzero — never a silent empty layer.
- `graph-recon merge` / `verify` — merge/verify layers vs pin.
- `graph-recon verify --rerun` — re-runs the full pipeline and compares the regenerated hash against the stored pin (determinism re-check; first run sets the baseline).
- `graph-recon ledger` — findings severity summary.
- `graph-recon manifest --manifest <path>` — validates an analysis-manifest against the pinned schema.

## Stability & pin coverage (M1.5)
- Scanners declare `layer_stability`: `stable` (default) or `ephemeral`.
- The determinism pin covers the STABLE subset only. `live_ports` is ephemeral
  (live lsof state): its layer is kept, carries `layers/live_ports.meta.json`
  with a freshness stamp, and is excluded from the pinned merged graph.
- `layers/analysis-manifest.json` records input-graph pin (content-addressed,
  path-independent), per-scanner file hashes, run config, layer stability,
  pinned-layer list, and `generated_at`. It is run metadata — never part of
  the pin. Schema is pinned at `reconloop/schemas/analysis-manifest.schema.json`
  (+ `.sha256`, asserted by tests).
- Analytics scanners REQUIRE a merged-graph input (fail-closed): without one
  they raise, cmd_run writes an error layer and exits 1. Base (filesystem)
  scanners keep fail-open semantics.

## M2 — grammar lenses (lens-spec.md, Marcel-approved 2026-08-04)
- Six versioned query lenses in `scanners/` (dim=lens, requires_graph, inherit
  `_base_lens.BaseLens`): `route_binding`, `protected_writer`, `hook_projection`,
  `mcp_registration`, `launchd_existence`, `env_to_process`.
- Lenses read ONLY the pinned graph input + rev-pinned registry files
  (`git show ctx.revision:...` — same revision the file layer came from);
  never live state.
- Output: `lens:<name>` summary node + VIOLATION CARDS as findings
  (verified:false, schema `reconloop/schemas/lens-card.schema.json`, pinned).
- Negative controls + metamorphic tests per lens (tests/test_lenses.py);
  record-reorder determinism; input-swap detection.
- `hashfreeze.json`: pinned scanner/schema/engine/fixture hashes + input pins
  (v3 deduped f5597cc3…, canonical deduped 148818ea…) + lens config;
  `verify_hashfreeze` fails on any tamper (tests/test_hashfreeze.py).
- Frozen-snapshot run (f5597cc3): 107 cards — route_binding 4, launchd 1
  (lane-health dead loop `-l`), env_to_process 102 (graph has zero
  env_to_process edges => modeling gap, not 102 independent violations),
  protected_writer/hook_projection/mcp_registration 0.

## M2.1 (F-041/F-043 fixes, Orion order 2026-08-04)
- `scanners/env_process_edges.py`: emits env_to_process edges from tracked-source
  consumers (rev-pinned git grep for source/--env-file/env_file/dotenv refs,
  resolved against the env inventory; metadata-only, values never read).
- `scanners/launchd.py`: ProgramArguments parsing fix — F-041 was a scanner
  artifact (`args[1]` grabbed `-l`; lane-health.sh EXISTS). Now resolves real
  script paths (skips interpreters/flags, extracts from `-c` strings).
- `scanners/env_to_process.py`: template env files (.env.example/.env.sample)
  exempt from orphan cards (documentation, never consumed); real env files card.
- Re-run on the M2.1 graph (pin 8f393911…): env_to_process 102 → 2 (100
  templates exempt; backend/.env + _SYSTEM/yuri-os/.env have no tracked
  consumer), launchd_existence 1 → 0.

## M2.2 + Lens Family V1 (Orion/Marcel approved 2026-08-04)
- M2.2 (SUB-A patch): `env_files.py` + `env_process_edges.py` rev-pinned via
  `git ls-tree` at `ctx.revision` (branch-independent deterministic inventory;
  untracked env files excluded from inventory); hashfreeze re-pinned;
  `tests/test_env_revpin.py`.
- Lens Family V1 (2 lenses + 1 v0 fix):
  - `security_path`: untrusted-input → exec → boundary-crossing path
    witnesses; shortest-witness BFS over FLOW_EDGE_KINDS, branch stops at
    first boundary edge; exec waypoint strictly inside path (root excluded);
    severity by terminal boundary class (network/internet critical, lan high,
    local medium, other high); path-aware card id canon (ordered path,
    collision-free).
  - `writer_to_protected`: dynamic writers (dynamic_targets>0) with protected
    reach card via 4 channels (flow BFS, env_consumption, literal_write,
    location); high sev for proven literal write / writer location, medium for
    reach-only; witness edge now included in card evidence.
  - v0 fix: `route_binding` exempts owner-excluded identities (Marcel round-1
    label: 2 cards rejected as noise).
  - v0 base fix: violation cards now carry ledger fingerprint at creation.
  - Fixture fix: writer records no longer shadowed by duplicate
    file-inventory records.
  - Expected frozen-snapshot (f5597cc3) outcome: both v1 lenses 0 cards (no
    modeled untrusted→exec→boundary paths; writers have empty protected
    reach) — proven live by negative controls + 3 metamorphic mutations each
    + reorder/swap/schema tests.

## Merge dedup (M1.6, F-040)
- `cmd_merge` (and `cmd_run`'s inline merge) dedup node records by id with a
  keep-last conflict policy (later layer wins), and emit a duplicate report
  at `<graph-dir>/graph.dedup-report.json` (counts + per-id conflict detail).
- The pinned v3 ecosystem graph carried 229 duplicate `file:` node records
  (file_inventory/writers cross-layer overlap). Re-merge dedups to 6,742
  records / 6,350 unique ids; v3 pin moved 57931c33 → f5597cc3 (expected,
  documented). Analytics input label reports NET-NEW UNIQUE ids after
  synthesis (`+416` for v3 = 645 synthesized − 229 dup records), not
  endpoint events.
- Edge records (no id) pass through untouched.

## Analytics scanners (graph-understanding phase, M1/M1.5)
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
  reach score; `trust_crossings` counts boundary edges on REACHABLE PATHS
  (cycle-safe BFS with visited set, deterministic sorted traversal), not
  incident-only; `exec:top` ranking; findings for sources reaching ports
  across trust boundaries (high) / any path crossing (medium) / launchd
  persistence (info).

Input resolution (`graphio`): `--graph-input <path>` >
`$GRAPH_RECON_GRAPH` > `<repo>/_SYSTEM/graph-ecosystem/full-graph.jsonl`.
Dangling edge endpoints (e.g. test_suite nodes emitted only as edge endpoints)
are synthesized as minimal node records, deterministically, so every edge
endpoint is addressable. A bare `load_graph` with no resolved input returns an
empty result and note. A resolved but unreadable or malformed input raises
`GraphInputMalformedError`; `requires_graph` scanners therefore fail closed.

Evidence labels are PATH-INDEPENDENT (M1 refinement, Orion verdict
2026-08-04): the source evidence item is `graph:<sha256-prefix-of-input>`
(16 hex chars, content-addressed), never an absolute path, so scanner
output is byte-identical across environments for the same input content.
The pinned v3 ecosystem artifact yields `graph:57931c3327693081`.

## Scanners (22)
live_ports, launchd, mcp_servers, file_inventory, organs, registries, memory_schema, formula_banks,
test_wiring, writers, git_history, secrets_control (wraps YURI control), deps_audit (network-gated),
network_probe (config-gated), env_files, protected_paths, hygiene.
+
Analytics (M1): connected_components, articulation, cross_layer_links, exec_centrality.
Lenses V1: security_path, writer_to_protected.
