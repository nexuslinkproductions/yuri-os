# T1 Merge-Script Research Notes (Orion seeds + walker notes)
- Gossamer: SQLite-backed graph + Cytoscape rendering pattern (local, deterministic)
- networkx (python): analysis (centrality, paths) — good for querying merged graph
- Neo4j: property-graph server — overkill for local; optional remote view
- hash-pinned regen: merge output sha256 pinned; regen deterministic (sorted keys, stable ids)
- Sources to merge: _SYSTEM/yuri-graph.json (architecture graph), yuri-graph-state.json, .gitnexus (code index), graphify-out/graph.json (AST), /tmp/yuri-recon/graph/{nodes,edges}.jsonl (walker)
- Merge rules: canonical id = kind:path; dedup; cross-link by id; findings attach via linked_to_finding
