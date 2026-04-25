# Offload Package

This package is optimized for local querying and downstream ingest.

## Files
- `design_uiux.db`: SQLite database with nodes, edges, and clusters
- `nodes.jsonl`: node stream for embeddings or search index ingest
- `edges.jsonl`: edge stream for relationship-aware tooling
- `clusters.jsonl`: cluster stream for taxonomy views
- `manifest.json`: schema and counts

## Tables
- `nodes(id, label, type, url, raw_json)`
- `edges(id, source, target, relation, weight, raw_json)`
- `clusters(id, label, member_count, members_json)`
