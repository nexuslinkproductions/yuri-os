#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent
GRAPH = ROOT / "graph.json"
OUT = ROOT / "ingest_bundle"


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    data = json.loads(GRAPH.read_text(encoding="utf-8"))
    nodes = data["nodes"]
    edges = data["edges"]

    by_id = {node["id"]: node for node in nodes}
    type_counts = Counter(node.get("type", "unknown") for node in nodes)
    relation_counts = Counter(edge.get("relation", "related_to") for edge in edges)

    node_rows = []
    for node in nodes:
        node_rows.append(
            {
                "id": node.get("id", ""),
                "label": node.get("label", ""),
                "type": node.get("type", ""),
                "url": node.get("url", ""),
                "tag": node.get("type", ""),
                "source_degree": str(sum(1 for edge in edges if edge["source"] == node["id"])),
                "target_degree": str(sum(1 for edge in edges if edge["target"] == node["id"])),
            }
        )

    edge_rows = []
    for edge in edges:
        src = by_id.get(edge["source"], {})
        tgt = by_id.get(edge["target"], {})
        edge_rows.append(
            {
                "source": edge.get("source", ""),
                "source_label": src.get("label", ""),
                "source_type": src.get("type", ""),
                "target": edge.get("target", ""),
                "target_label": tgt.get("label", ""),
                "target_type": tgt.get("type", ""),
                "relation": edge.get("relation", ""),
                "weight": str(edge.get("weight", 1)),
            }
        )

    cluster_rows = []
    for node in nodes:
        if node.get("type") != "cluster":
            continue
        members = [
            edge["target"]
            for edge in edges
            if edge["source"] == node["id"] and edge.get("relation") == "contains"
        ]
        cluster_rows.append(
            {
                "cluster_id": node["id"],
                "cluster_label": node["label"],
                "member_count": str(len(members)),
                "members": " | ".join(members),
            }
        )

    OUT.mkdir(parents=True, exist_ok=True)
    write_csv(OUT / "nodes.csv", ["id", "label", "type", "url", "tag", "source_degree", "target_degree"], node_rows)
    write_csv(OUT / "edges.csv", ["source", "source_label", "source_type", "target", "target_label", "target_type", "relation", "weight"], edge_rows)
    write_csv(OUT / "clusters.csv", ["cluster_id", "cluster_label", "member_count", "members"], cluster_rows)

    manifest = {
        "graph_path": str(GRAPH),
        "node_count": len(nodes),
        "edge_count": len(edges),
        "node_types": dict(type_counts),
        "relation_types": dict(relation_counts),
        "outputs": {
            "nodes_csv": "nodes.csv",
            "edges_csv": "edges.csv",
            "clusters_csv": "clusters.csv",
        },
        "recommended_use": [
            "Import nodes.csv into a relational table or spreadsheet",
            "Import edges.csv into a graph tool or joinable relational table",
            "Use clusters.csv for top-level navigation or taxonomy views",
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    readme = "\n".join(
        [
            "# Ingest Bundle",
            "",
            "This bundle is optimized for downstream ingestion.",
            "",
            "## Files",
            "- `nodes.csv`: normalized source registry",
            "- `edges.csv`: normalized relationship table",
            "- `clusters.csv`: cluster membership summary",
            "- `manifest.json`: counts, schemas, and use guidance",
            "",
            "## Best Use",
            "1. Load `nodes.csv` into your source database.",
            "2. Load `edges.csv` into your relationship store.",
            "3. Use `clusters.csv` for category navigation.",
            "4. Keep `graph.json` as the canonical graph source.",
        ]
    )
    (OUT / "README.md").write_text(readme + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
