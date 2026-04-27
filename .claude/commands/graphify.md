---
name: graphify
description: "any input (code, docs, papers, images) - knowledge graph - clustered communities - HTML + JSON + audit report"
trigger: /graphify
skill: graphify
---

# /graphify

Invoke the `graphify` skill to turn any folder of files into a navigable knowledge graph with community detection and audit trail.

## Usage

```
/graphify [path] [--mode deep] [--update] [--directed] [--cluster-only] [--neo4j] [--wiki] ...
```

Outputs: interactive HTML graph, GraphRAG-ready JSON, and structured GRAPH_REPORT.md.

## What graphify does

Extracts relationships from any source (code, docs, PDFs, images, screenshots) and builds a persistent knowledge graph. Every edge is tagged EXTRACTED, INFERRED, or AMBIGUOUS. Community detection finds cross-document connections you wouldn't think to ask about directly.

## Behavior Authority

Full usage options, mode descriptions, export formats, and query syntax are in `.claude/skills/graphify/SKILL.md`.
