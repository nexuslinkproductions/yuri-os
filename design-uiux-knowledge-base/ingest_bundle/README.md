# Ingest Bundle

This bundle is optimized for downstream ingestion.

## Files
- `nodes.csv`: normalized source registry
- `edges.csv`: normalized relationship table
- `clusters.csv`: cluster membership summary
- `manifest.json`: counts, schemas, and use guidance

## Best Use
1. Load `nodes.csv` into your source database.
2. Load `edges.csv` into your relationship store.
3. Use `clusters.csv` for category navigation.
4. Keep `graph.json` as the canonical graph source.
