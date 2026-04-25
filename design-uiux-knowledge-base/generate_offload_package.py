#!/usr/bin/env python3
from __future__ import annotations

import json
import sqlite3
from pathlib import Path


ROOT = Path("/Users/marcelspatz/design-uiux-knowledge-base")
GRAPH = ROOT / "graph.json"
OUT = ROOT / "offload_package"


def main() -> None:
    data = json.loads(GRAPH.read_text(encoding="utf-8"))
    nodes = data["nodes"]
    edges = data["edges"]

    OUT.mkdir(parents=True, exist_ok=True)
    db_path = OUT / "design_uiux.db"
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.executescript(
        """
        PRAGMA journal_mode=DELETE;

        CREATE TABLE nodes (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            type TEXT NOT NULL,
            url TEXT,
            raw_json TEXT NOT NULL
        );

        CREATE TABLE edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            target TEXT NOT NULL,
            relation TEXT NOT NULL,
            weight REAL NOT NULL DEFAULT 1,
            raw_json TEXT NOT NULL,
            FOREIGN KEY(source) REFERENCES nodes(id),
            FOREIGN KEY(target) REFERENCES nodes(id)
        );

        CREATE TABLE clusters (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            member_count INTEGER NOT NULL,
            members_json TEXT NOT NULL
        );

        CREATE INDEX idx_edges_source ON edges(source);
        CREATE INDEX idx_edges_target ON edges(target);
        CREATE INDEX idx_nodes_type ON nodes(type);
        """
    )

    by_id = {node["id"]: node for node in nodes}
    for node in nodes:
        cur.execute(
            "INSERT INTO nodes (id, label, type, url, raw_json) VALUES (?, ?, ?, ?, ?)",
            (
                node.get("id", ""),
                node.get("label", ""),
                node.get("type", ""),
                node.get("url"),
                json.dumps(node, ensure_ascii=False),
            ),
        )

    for edge in edges:
        cur.execute(
            "INSERT INTO edges (source, target, relation, weight, raw_json) VALUES (?, ?, ?, ?, ?)",
            (
                edge.get("source", ""),
                edge.get("target", ""),
                edge.get("relation", ""),
                float(edge.get("weight", 1)),
                json.dumps(edge, ensure_ascii=False),
            ),
        )

    for node in nodes:
        if node.get("type") != "cluster":
            continue
        member_ids = [
            edge["target"]
            for edge in edges
            if edge["source"] == node["id"] and edge.get("relation") == "contains"
        ]
        cur.execute(
            "INSERT INTO clusters (id, label, member_count, members_json) VALUES (?, ?, ?, ?)",
            (
                node["id"],
                node["label"],
                len(member_ids),
                json.dumps(member_ids, ensure_ascii=False),
            ),
        )

    conn.commit()

    nodes_jsonl = OUT / "nodes.jsonl"
    edges_jsonl = OUT / "edges.jsonl"
    clusters_jsonl = OUT / "clusters.jsonl"

    with nodes_jsonl.open("w", encoding="utf-8") as f:
        for node in nodes:
            f.write(json.dumps(node, ensure_ascii=False) + "\n")

    with edges_jsonl.open("w", encoding="utf-8") as f:
        for edge in edges:
            f.write(json.dumps(edge, ensure_ascii=False) + "\n")

    with clusters_jsonl.open("w", encoding="utf-8") as f:
        for node in nodes:
            if node.get("type") != "cluster":
                continue
            member_ids = [
                edge["target"]
                for edge in edges
                if edge["source"] == node["id"] and edge.get("relation") == "contains"
            ]
            f.write(
                json.dumps(
                    {
                        "id": node["id"],
                        "label": node["label"],
                        "member_count": len(member_ids),
                        "members": member_ids,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    manifest = {
        "graph_path": str(GRAPH),
        "sqlite_path": str(db_path),
        "jsonl": {
            "nodes": "nodes.jsonl",
            "edges": "edges.jsonl",
            "clusters": "clusters.jsonl",
        },
        "counts": {
            "nodes": len(nodes),
            "edges": len(edges),
            "clusters": sum(1 for node in nodes if node.get("type") == "cluster"),
        },
        "tables": ["nodes", "edges", "clusters"],
        "recommended_use": [
            "Use SQLite for local querying and joins",
            "Use JSONL for embeddings, search indexes, and bulk ingest",
            "Keep graph.json as the source of truth",
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    readme = "\n".join(
        [
            "# Offload Package",
            "",
            "This package is optimized for local querying and downstream ingest.",
            "",
            "## Files",
            "- `design_uiux.db`: SQLite database with nodes, edges, and clusters",
            "- `nodes.jsonl`: node stream for embeddings or search index ingest",
            "- `edges.jsonl`: edge stream for relationship-aware tooling",
            "- `clusters.jsonl`: cluster stream for taxonomy views",
            "- `manifest.json`: schema and counts",
            "",
            "## Tables",
            "- `nodes(id, label, type, url, raw_json)`",
            "- `edges(id, source, target, relation, weight, raw_json)`",
            "- `clusters(id, label, member_count, members_json)`",
        ]
    )
    (OUT / "README.md").write_text(readme + "\n", encoding="utf-8")

    conn.close()

    for suffix in ("-wal", "-shm"):
        sidecar = db_path.with_name(db_path.name + suffix)
        if sidecar.exists():
            sidecar.unlink()


if __name__ == "__main__":
    main()
