#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
GRAPH = ROOT / "graph.json"
OUT = ROOT / "obsidian-vault"
SOURCES = OUT / "sources"


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def md_escape(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def write_note(path: Path, title: str, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"# {title}\n\n{body}\n", encoding="utf-8")


def wikilink(node_id: str, label: str) -> str:
    return f"[[sources/{node_id}|{label}]]"


def main() -> None:
    data = json.loads(GRAPH.read_text(encoding="utf-8"))
    nodes = data["nodes"]
    edges = data["edges"]

    node_by_id = {node["id"]: node for node in nodes}
    outgoing = {}
    incoming = {}
    for edge in edges:
        outgoing.setdefault(edge["source"], []).append(edge)
        incoming.setdefault(edge["target"], []).append(edge)

    OUT.mkdir(parents=True, exist_ok=True)
    SOURCES.mkdir(parents=True, exist_ok=True)

    sections = {
        "inspiration": [],
        "design_system": [],
        "ux_skill": [],
        "ai_tool": [],
        "curated_list": [],
        "cluster": [],
    }

    for node in nodes:
        ntype = node.get("type", "cluster")
        sections.setdefault(ntype, []).append(node)

        title = node["label"]
        node_file = SOURCES / f"{node['id']}.md"

        tags = [ntype]
        body_lines = [
            f"- Type: `{md_escape(ntype)}`",
        ]
        if node.get("url"):
            body_lines.append(f"- URL: {node['url']}")
        if node.get("id"):
            body_lines.append(f"- ID: `{node['id']}`")

        if ntype == "cluster":
            members = [
                edge["target"]
                for edge in outgoing.get(node["id"], [])
                if edge["relation"] == "contains"
            ]
            if members:
                body_lines.append("")
                body_lines.append("## Members")
                for member_id in members:
                    member = node_by_id.get(member_id)
                    if member:
                        body_lines.append(f"- {wikilink(member['id'], member['label'])}")

        outs = outgoing.get(node["id"], [])
        if outs:
            body_lines.append("")
            body_lines.append("## Outgoing")
            for edge in outs:
                target = node_by_id.get(edge["target"])
                target_label = target["label"] if target else edge["target"]
                if target:
                    body_lines.append(f"- `{edge['relation']}` -> {wikilink(target['id'], target_label)}")
                else:
                    body_lines.append(f"- `{edge['relation']}` -> {target_label}")

        ins = incoming.get(node["id"], [])
        if ins:
            body_lines.append("")
            body_lines.append("## Incoming")
            for edge in ins:
                source = node_by_id.get(edge["source"])
                source_label = source["label"] if source else edge["source"]
                if source:
                    body_lines.append(f"- `{edge['relation']}` <- {wikilink(source['id'], source_label)}")
                else:
                    body_lines.append(f"- `{edge['relation']}` <- {source_label}")

        frontmatter = [
            "---",
            f"title: {title}",
            f"type: {ntype}",
            f"id: {node['id']}",
        ]
        if node.get("url"):
            frontmatter.append(f"url: {node['url']}")
        use_when = node.get("use_when", "")
        if use_when:
            frontmatter.append(f"use_when: {use_when}")
        avoid_when = node.get("avoid_when", "")
        if avoid_when:
            frontmatter.append(f"avoid_when: {avoid_when}")
        fallback = node.get("fallback", "")
        if fallback:
            frontmatter.append(f"fallback: {fallback}")
        frontmatter.append("tags:")
        for tag in tags:
            frontmatter.append(f"  - {tag}")
        frontmatter.append("---")

        node_file.write_text(
            "\n".join(frontmatter + ["", "\n".join(body_lines), ""]),
            encoding="utf-8",
        )

    index_lines = [
        "This vault is generated from `graph.json`.",
        "",
        "## Counts",
        f"- Total nodes: {len(nodes)}",
        f"- Total edges: {len(edges)}",
        "",
        "## Categories",
    ]

    order = [
        ("inspiration", "Inspiration"),
        ("design_system", "Design Systems"),
        ("ux_skill", "UI/UX Skills"),
        ("ai_tool", "AI Tools"),
        ("curated_list", "Curated Lists"),
        ("cluster", "Clusters"),
    ]
    for key, label in order:
        items = sections.get(key, [])
        index_lines.append(f"- {label}: {len(items)}")
        for node in items:
            index_lines.append(f"  - {wikilink(node['id'], node['label'])}")

    (OUT / "index.md").write_text("# Design UI/UX Vault\n\n" + "\n".join(index_lines) + "\n", encoding="utf-8")

    map_lines = [
        "# Source Map",
        "",
        "## Cluster Overview",
    ]
    for key, label in order:
        if key == "cluster":
            continue
        items = sections.get(key, [])
        map_lines.append(f"### {label}")
        for node in items:
            map_lines.append(f"- {wikilink(node['id'], node['label'])}")
        map_lines.append("")
    (OUT / "map.md").write_text("\n".join(map_lines).rstrip() + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
