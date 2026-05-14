#!/usr/bin/env python3
from __future__ import annotations

import json
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "handoff_bundle"
ZIP_PATH = OUT / "design_uiux_knowledge_base_bundle.zip"


def add_path(zf: zipfile.ZipFile, path: Path, arc_prefix: str) -> None:
    if path.is_dir():
        for child in path.rglob("*"):
            if child.is_file():
                zf.write(child, arc_prefix / child.relative_to(path))
    elif path.is_file():
        zf.write(path, arc_prefix / path.name)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    items = [
        ROOT / "graph.json",
        ROOT / "GRAPH_REPORT.md",
        ROOT / "PLAYBOOK.md",
        ROOT / "ingest_bundle",
        ROOT / "offload_package",
        ROOT / "vector_package",
        ROOT / "obsidian-vault",
    ]

    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for item in items:
            if item.exists():
                if item.is_dir():
                    for child in item.rglob("*"):
                        if child.is_file():
                            zf.write(child, child.relative_to(ROOT))
                else:
                    zf.write(item, item.relative_to(ROOT))

    counts = {
        "graph_nodes": 0,
        "graph_edges": 0,
        "obsidian_notes": len(list((ROOT / "obsidian-vault" / "sources").glob("*.md"))),
        "ingest_csv_files": len(list((ROOT / "ingest_bundle").glob("*.csv"))),
        "offload_jsonl_files": len(list((ROOT / "offload_package").glob("*.jsonl"))),
        "vector_chunks": 0,
    }
    graph_path = ROOT / "graph.json"
    if graph_path.exists():
        data = json.loads(graph_path.read_text(encoding="utf-8"))
        counts["graph_nodes"] = len(data.get("nodes", []))
        counts["graph_edges"] = len(data.get("edges", []))

    vector_manifest = ROOT / "vector_package" / "manifest.json"
    if vector_manifest.exists():
        counts["vector_chunks"] = json.loads(vector_manifest.read_text(encoding="utf-8")).get("chunk_count", 0)

    manifest = {
        "bundle_path": str(ZIP_PATH),
        "included": [
            "graph.json",
            "GRAPH_REPORT.md",
            "PLAYBOOK.md",
            "ingest_bundle/",
            "offload_package/",
            "vector_package/",
            "obsidian-vault/",
        ],
        "counts": counts,
        "recommended_use": [
            "Share one archive instead of many loose files",
            "Import derived artifacts into separate tools as needed",
            "Keep graph.json as the canonical source",
        ],
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    readme = "\n".join(
        [
            "# Handoff Bundle",
            "",
            "Single archive containing the full research/offload set.",
            "",
            "## Files",
            "- `design_uiux_knowledge_base_bundle.zip`: full archive",
            "- `manifest.json`: included paths and counts",
        ]
    )
    (OUT / "README.md").write_text(readme + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
