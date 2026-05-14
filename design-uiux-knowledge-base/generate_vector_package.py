#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
GRAPH = ROOT / "graph.json"
REPORT = ROOT / "GRAPH_REPORT.md"
PLAYBOOK = ROOT / "PLAYBOOK.md"
VULT = ROOT / "obsidian-vault" / "sources"
OUT = ROOT / "vector_package"


def read_note(node_id: str) -> str:
    path = VULT / f"{node_id}.md"
    return path.read_text(encoding="utf-8") if path.exists() else ""


def strip_frontmatter(text: str) -> str:
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) == 3:
            return parts[2].strip()
    return text.strip()


def main() -> None:
    data = json.loads(GRAPH.read_text(encoding="utf-8"))
    nodes = data["nodes"]
    edges = data["edges"]

    by_id = {node["id"]: node for node in nodes}
    outgoing = {}
    incoming = {}
    for edge in edges:
        outgoing.setdefault(edge["source"], []).append(edge)
        incoming.setdefault(edge["target"], []).append(edge)

    OUT.mkdir(parents=True, exist_ok=True)
    chunks_path = OUT / "chunks.jsonl"

    chunk_count = 0
    with chunks_path.open("w", encoding="utf-8") as f:
        for node in nodes:
            if node.get("type") == "cluster":
                continue

            note_text = strip_frontmatter(read_note(node["id"]))
            refs = []
            for edge in outgoing.get(node["id"], []):
                target = by_id.get(edge["target"])
                if target:
                    refs.append(f"out:{edge['relation']}:{target['label']}")
            for edge in incoming.get(node["id"], []):
                source = by_id.get(edge["source"])
                if source:
                    refs.append(f"in:{edge['relation']}:{source['label']}")

            content_parts = [
                f"Title: {node['label']}",
                f"Type: {node.get('type', '')}",
            ]
            if node.get("url"):
                content_parts.append(f"URL: {node['url']}")
            if note_text:
                content_parts.append("")
                content_parts.append(note_text)
            if refs:
                content_parts.append("")
                content_parts.append("Related:")
                for ref in refs[:20]:
                    content_parts.append(f"- {ref}")

            record = {
                "chunk_id": node["id"],
                "source_id": node["id"],
                "source_label": node["label"],
                "source_type": node.get("type", ""),
                "url": node.get("url", ""),
                "text": "\n".join(content_parts).strip(),
                "metadata": {
                    "tags": [node.get("type", "")],
                    "node_count": 1,
                    "edge_count": len(outgoing.get(node["id"], [])) + len(incoming.get(node["id"], [])),
                },
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            chunk_count += 1

        report_text = REPORT.read_text(encoding="utf-8") if REPORT.exists() else ""
        if report_text:
            f.write(
                json.dumps(
                    {
                        "chunk_id": "report_overview",
                        "source_id": "report_overview",
                        "source_label": "GRAPH_REPORT",
                        "source_type": "summary",
                        "url": str(REPORT),
                        "text": report_text,
                        "metadata": {"tags": ["summary", "report"], "node_count": 0, "edge_count": 0},
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            chunk_count += 1

        playbook_text = PLAYBOOK.read_text(encoding="utf-8") if PLAYBOOK.exists() else ""
        if playbook_text:
            f.write(
                json.dumps(
                    {
                        "chunk_id": "playbook_overview",
                        "source_id": "playbook_overview",
                        "source_label": "PLAYBOOK",
                        "source_type": "summary",
                        "url": str(PLAYBOOK),
                        "text": playbook_text,
                        "metadata": {"tags": ["summary", "playbook"], "node_count": 0, "edge_count": 0},
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            chunk_count += 1

    manifest = {
        "graph_path": str(GRAPH),
        "chunk_path": str(chunks_path),
        "chunk_count": chunk_count,
        "source_note_count": sum(1 for node in nodes if node.get("type") != "cluster"),
        "summary_docs": [str(REPORT), str(PLAYBOOK)],
        "recommended_use": [
            "Use chunks.jsonl for embeddings",
            "Use chunks.jsonl for search index ingest",
            "Keep graph.json as the relationship source",
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    readme = "\n".join(
        [
            "# Vector Package",
            "",
            "This package is optimized for embeddings and semantic search.",
            "",
            "## Files",
            "- `chunks.jsonl`: one record per source note plus summary documents",
            "- `manifest.json`: counts and usage notes",
            "",
            "## Record Shape",
            "- `chunk_id`",
            "- `source_id`",
            "- `source_label`",
            "- `source_type`",
            "- `url`",
            "- `text`",
            "- `metadata`",
        ]
    )
    (OUT / "README.md").write_text(readme + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
