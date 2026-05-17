#!/usr/bin/env python3
"""
palace-rebuild.py — YURI-OS-MUSUBI Claude Palace Generator
Scans the YURI-OS-MUSUBI vault, parses wikilinks, builds semantic index outputs.

Usage:
  python3 palace-rebuild.py
  python3 palace-rebuild.py --vault /Volumes/T7/NUDIMMUD --output /Volumes/T7/claude-palace-out
  python3 palace-rebuild.py --dry-run   (scan only, no file writes)

Outputs (in OUTPUT_DIR):
  palace.json          Full graph + analysis (used by palace-index.md)
  _scan.json           Raw scan data
  _analysis.json       Analysis layer
  palace-index.md      Hub concepts + cluster overview
  palace-map.md        Spatial layout + folder structure
  cross-domain.md      Bridging concepts across vault domains
  orphaned-content.md  Low-connectivity files
  suggested-connections.md  ML-proxy: name-similarity suggested links
"""

import os
import re
import json
import math
import argparse
import difflib
from datetime import datetime
from pathlib import Path
from collections import defaultdict, Counter, deque

# ─── CONFIG ──────────────────────────────────────────────────────────────────

DEFAULT_VAULT  = Path("/Users/marcelspatz/YURI-OS-MUSUBI")
DEFAULT_OUTPUT = Path("/Users/marcelspatz/YURI-OS-MUSUBI/claude-palace-out")
VERSION        = "2.0"

EXCLUDE_DIRS = {
    ".obsidian", ".git", "claude-palace-out", "graphify-out",
    "graph", "node_modules", ".claude", "deleted-backups",
    "__pycache__", ".DS_Store", "RESEARCH", "_QUARANTINE_2026-05-07",
}

WIKILINK_RE = re.compile(r'\[\[([^\]|#\n]+?)(?:[|#][^\]\n]*)?\]\]')
MDLINK_RE   = re.compile(r'\[[^\]\n]*\]\(([^)]+\.md)(?:#[^)]*)?\)')
TOP_HUBS    = 15
TOP_CROSS   = 20
TOP_ORPHANS = 100
TOP_SUGGEST = 15


# ─── SCAN ────────────────────────────────────────────────────────────────────

def scan_vault(vault_root: Path):
    """Walk vault; collect folder + file nodes; extract raw wikilinks."""
    nodes       = []
    raw_links   = []   # [(source_rel_path_str, target_name)]
    file_index  = defaultdict(list)   # stem_lower -> [file_id, ...]

    for dirpath_str, dirnames, filenames in os.walk(vault_root):
        dirpath = Path(dirpath_str)

        # Prune excluded dirs in-place
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDE_DIRS and not d.startswith("._")
        ]

        rel_dir = dirpath.relative_to(vault_root)
        rel_dir_str = str(rel_dir) if str(rel_dir) != "." else "."

        md_files = [f for f in filenames if f.endswith(".md") and not f.startswith("._")]

        # Folder node (only if it contains .md files, or is root)
        if md_files or rel_dir_str == ".":
            nodes.append({
                "id"         : f"folder:{rel_dir_str}",
                "label"      : dirpath.name if rel_dir_str != "." else "ROOT",
                "type"       : "folder",
                "path"       : rel_dir_str,
                "file_count" : len(md_files),
                "size_bytes" : 0,
                "last_modified": datetime.now().isoformat(),
            })

        for fname in md_files:
            fpath   = dirpath / fname
            rel_f   = fpath.relative_to(vault_root)
            rel_str = str(rel_f)
            file_id = f"file:{rel_str}"
            stem    = fpath.stem

            try:
                content = fpath.read_text(encoding="utf-8", errors="ignore")
                wiki_links = WIKILINK_RE.findall(content)
                md_links   = MDLINK_RE.findall(content)
                
                # Combine and clean
                links = [lnk.strip() for lnk in wiki_links] + [Path(lnk.strip()).stem for lnk in md_links]
                size    = len(content.encode("utf-8"))
            except OSError:
                content, links, size = "", [], 0

            for lnk in links:
                raw_links.append((rel_str, lnk))

            # Top-level folder (first path component)
            parts   = rel_f.parts
            top_lvl = parts[0] if len(parts) > 1 else "."

            nodes.append({
                "id"          : file_id,
                "label"       : stem,
                "type"        : "file",
                "path"        : rel_str,
                "folder"      : rel_dir_str,
                "top_folder"  : top_lvl,
                "size_bytes"  : size,
                "last_modified": datetime.fromtimestamp(fpath.stat().st_mtime).isoformat(),
            })

            file_index[stem.lower()].append(file_id)

    return nodes, raw_links, file_index


def build_edges(raw_links, file_index):
    """Resolve wikilink target names to node IDs → edge list."""
    edges = []
    seen  = set()
    for source_path, target_name in raw_links:
        source_id  = f"file:{source_path}"
        target_key = Path(target_name).stem.lower()
        for target_id in file_index.get(target_key, []):
            key = (source_id, target_id)
            if key not in seen and source_id != target_id:
                edges.append({"source": source_id, "target": target_id})
                seen.add(key)
    return edges


# ─── GRAPH ANALYSIS ──────────────────────────────────────────────────────────

def degree_map(edges):
    """Return {node_id: degree} for all nodes that appear in edges."""
    deg = Counter()
    for e in edges:
        deg[e["source"]] += 1
        deg[e["target"]] += 1
    return deg


def centrality_scores(nodes, deg):
    """Normalised degree centrality per node."""
    n = max(len(nodes) - 1, 1)
    return {nid: count / n for nid, count in deg.items()}


def hub_nodes(nodes, centrality, deg, top_n=TOP_HUBS):
    """Top-N most central nodes (files + folders)."""
    scored = [
        {
            "node_id" : n["id"],
            "label"   : n["label"],
            "type"    : n["type"],
            "score"   : centrality.get(n["id"], 0.0),
            "degree"  : deg.get(n["id"], 0),
        }
        for n in nodes
    ]
    scored.sort(key=lambda x: (-x["score"], -x["degree"]))
    return scored[:top_n]


def connected_components(nodes, edges):
    """Union-Find community detection."""
    id_set = {n["id"] for n in nodes}
    parent = {nid: nid for nid in id_set}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for e in edges:
        if e["source"] in parent and e["target"] in parent:
            union(e["source"], e["target"])

    groups = defaultdict(list)
    for nid in id_set:
        groups[find(nid)].append(nid)

    node_map = {n["id"]: n for n in nodes}
    clusters = []
    for root, members in sorted(groups.items(), key=lambda x: -len(x[1])):
        cluster_nodes = [
            {"node_id": nid, "label": node_map[nid]["label"], "type": node_map[nid]["type"]}
            for nid in members if nid in node_map
        ]
        n = len(cluster_nodes)
        edge_count = sum(
            1 for e in edges
            if e["source"] in set(members) and e["target"] in set(members)
        )
        density = (2 * edge_count / (n * (n - 1))) if n > 1 else 0
        clusters.append({
            "size"    : n,
            "nodes"   : cluster_nodes[:8],  # sample only
            "density" : round(density, 3),
        })

    # Number them
    for i, c in enumerate(clusters):
        c["id"] = i
    return clusters


def orphaned_nodes(nodes, deg, top_n=TOP_ORPHANS):
    """Nodes with degree < 3 (few connections)."""
    result = []
    for n in nodes:
        d = deg.get(n["id"], 0)
        if d < 3:
            result.append({
                "node_id"    : n["id"],
                "label"      : n["label"],
                "type"       : n["type"],
                "path"       : n.get("path", ""),
                "connections": d,
            })
    result.sort(key=lambda x: x["connections"])
    return result[:top_n]


def cross_domain_patterns(nodes, edges, top_n=TOP_CROSS):
    """
    Find labels that appear as link TARGETS from files in multiple distinct
    top-level folders — these bridge domains.
    """
    node_map = {n["id"]: n for n in nodes}

    # For each target node, collect set of top-level folders that point to it
    target_sources = defaultdict(set)
    for e in edges:
        src = node_map.get(e["source"])
        tgt = node_map.get(e["target"])
        if src and tgt:
            src_top = src.get("top_folder", src.get("folder", "."))
            target_sources[e["target"]].add(src_top)

    # Also: if a FOLDER is referenced from multiple top-level folders via file nodes inside it
    folder_tops = defaultdict(set)
    for n in nodes:
        if n["type"] == "file":
            folder_tops[n.get("folder", ".")].add(n.get("top_folder", "."))

    # Deduplicate by label (case-insensitive) — keep highest bridge count
    by_label = {}
    for target_id, source_tops in target_sources.items():
        if len(source_tops) >= 2:
            n     = node_map.get(target_id, {})
            label = n.get("label", target_id)
            key   = label.lower()
            entry = {
                "concept"     : label,
                "node_id"     : target_id,
                "bridges"     : sorted(source_tops),
                "folder_count": len(source_tops),
            }
            if key not in by_label or len(source_tops) > by_label[key]["folder_count"]:
                by_label[key] = entry

    patterns = sorted(by_label.values(), key=lambda x: -x["folder_count"])
    return patterns[:top_n]


def suggested_connections(nodes, edges, top_n=TOP_SUGGEST):
    """
    Name-similarity proxy for ML-detected missing links.
    Find file pairs with high stem similarity that are not yet connected.
    """
    edge_set = {(e["source"], e["target"]) for e in edges}
    edge_set |= {(e["target"], e["source"]) for e in edges}

    file_nodes = [n for n in nodes if n["type"] == "file"]

    # Group by folder first to limit O(n²)
    by_folder = defaultdict(list)
    for n in file_nodes:
        by_folder[n.get("folder", ".")].append(n)

    suggestions = []
    seen_pairs  = set()

    for folder, members in by_folder.items():
        if len(members) < 2:
            continue
        for i, a in enumerate(members):
            for b in members[i+1:]:
                if (a["id"], b["id"]) in edge_set:
                    continue
                pair_key = tuple(sorted([a["id"], b["id"]]))
                if pair_key in seen_pairs:
                    continue
                seen_pairs.add(pair_key)

                ratio = difflib.SequenceMatcher(
                    None, a["label"].lower(), b["label"].lower()
                ).ratio()

                if ratio >= 0.6:
                    suggestions.append({
                        "from"      : a["label"],
                        "to"        : b["label"],
                        "from_id"   : a["id"],
                        "to_id"     : b["id"],
                        "folder"    : folder,
                        "reason"    : f"Similar names and same folder ({folder})",
                        "confidence": round(ratio, 1),
                    })

    suggestions.sort(key=lambda x: -x["confidence"])
    return suggestions[:top_n]


# ─── MARKDOWN GENERATORS ─────────────────────────────────────────────────────

def write_palace_index(output_dir, nodes, analysis):
    hubs     = analysis["hubs"]
    clusters = analysis["clusters"]
    cross    = analysis["cross_domain_patterns"]
    stats    = analysis["statistics"]

    lines = [
        "# Claude Palace Index",
        "",
        f"**Last Built:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        "## Vault Overview",
        "",
        f"- **Total Concepts:** {stats['node_count']}",
        f"- **Total Relationships:** {stats['edge_count']}",
        f"- **Graph Density:** {stats['density']:.4f}",
        f"- **Average Connections:** {stats['average_degree']:.1f}",
        "",
        "---",
        "",
        "## Hub Concepts (Most Central)",
        "",
        "These are the most important, most-referenced concepts in your vault:",
        "",
    ]

    for i, h in enumerate(hubs, 1):
        lines += [
            f"{i}. **{h['label']}** ({h['type']})",
            f"   - Centrality: {h['score']:.3f}",
            f"   - Connections: {h['degree']}",
            "",
        ]

    lines += [
        "---",
        "",
        "## Project Clusters",
        "",
        "Your projects naturally group into these clusters:",
        "",
    ]

    for c in clusters[:6]:
        node_labels = [n["label"] for n in c["nodes"][:8]]
        more        = c["size"] - len(node_labels)
        lines += [
            f"### Cluster {c['id'] + 1} ({c['size']} nodes)",
            f"Density: {c['density']}",
            "",
            "Nodes:",
        ]
        for lbl in node_labels:
            lines.append(f"- {lbl}")
        if more > 0:
            lines.append(f"- ... and {more} more")
        lines.append("")

    lines += [
        "---",
        "",
        "## Cross-Domain Patterns",
        "",
        "Concepts that bridge multiple areas of your vault:",
        "",
    ]

    for i, p in enumerate(cross, 1):
        bridge_str = ", ".join(p["bridges"][:8])
        lines.append(
            f"{i}. **{p['concept']}** bridges {p['folder_count']} domains"
        )
        lines.append(f"   Folders: {bridge_str}")
        lines.append("")

    lines += [
        "",
        "---",
        "",
        "## Navigation",
        "",
        "- See **palace-map.md** for spatial layout and folder structure",
        "- See **cross-domain.md** for detailed cross-domain analysis",
        "- See **orphaned-content.md** for files needing more connections",
        "- See **suggested-connections.md** for ML-detected links to add",
    ]

    (output_dir / "palace-index.md").write_text("\n".join(lines), encoding="utf-8")


def write_palace_map(output_dir, nodes):
    folder_nodes = [n for n in nodes if n["type"] == "folder"]
    folder_nodes.sort(key=lambda n: n["path"])

    lines = [
        "# Palace Map — Vault Spatial Layout",
        "",
        f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "",
        "## Folder Structure",
        "",
    ]

    for fn in folder_nodes[:60]:
        depth = fn["path"].count(os.sep) if fn["path"] != "." else 0
        indent = "  " * depth
        label  = fn["label"]
        count  = fn["file_count"]
        lines.append(f"{indent}- **{label}/** ({count} files) — `{fn['path']}`")

    (output_dir / "palace-map.md").write_text("\n".join(lines), encoding="utf-8")


def write_cross_domain(output_dir, cross):
    lines = [
        "# Cross-Domain Patterns",
        "",
        "Concepts, tools, and ideas that bridge multiple areas of your vault.",
        "",
        "These are opportunities for synthesis and integration.",
        "",
        "",
        "## Bridging Concepts",
        "",
    ]

    for i, p in enumerate(cross, 1):
        bridge_str = ", ".join(p["bridges"])
        lines += [
            f"{i}. **{p['concept']}**",
            f"   - Appears in: {bridge_str}",
            f"   - Bridges: {p['folder_count']} domains",
            "",
        ]

    lines += [
        "",
        "## Implications",
        "",
        "- These patterns show where your work naturally intersects",
        "- Use these connections to improve knowledge synthesis",
        "- Consider creating dedicated notes for major bridging concepts",
    ]

    (output_dir / "cross-domain.md").write_text("\n".join(lines), encoding="utf-8")


def write_orphaned_content(output_dir, orphans):
    lines = [
        "# Orphaned Content",
        "",
        "Files with few connections. These might benefit from more internal linking.",
        "",
        "## Isolated Files",
        "",
    ]

    isolated   = [o for o in orphans if o["connections"] == 0]
    low_linked = [o for o in orphans if 0 < o["connections"] < 3]

    for o in isolated[:40]:
        lines += [
            f"- **{o['label']}** ({o['type']})",
            f"  - Path: {o['path']}",
            f"  - Connections: {o['connections']}",
            "",
        ]

    if low_linked:
        more = len(orphans) - len(isolated)
        lines += [
            f"",
            f"... and {more} more with 1–2 connections",
            "",
        ]

    lines += [
        "## Suggestions",
        "",
        "1. Review these files — do they belong in your vault?",
        "2. Consider adding wikilinks to connect them to related content",
        "3. Some might be candidates for archiving",
    ]

    (output_dir / "orphaned-content.md").write_text("\n".join(lines), encoding="utf-8")


def write_suggested_connections(output_dir, suggestions):
    lines = [
        "# Suggested Connections",
        "",
        "ML-proxy: name-similarity detected missing links.",
        "",
        "These suggestions are based on semantic similarity and folder proximity.",
        "",
        "## Connection Suggestions",
        "",
    ]

    for i, s in enumerate(suggestions, 1):
        lines += [
            f"{i}. Link **{s['from']}** → **{s['to']}**",
            f"   - Reason: {s['reason']}",
            f"   - Confidence: {int(s['confidence'] * 100)}%",
            "",
        ]

    lines += [
        "",
        "## How to Use",
        "",
        "1. Review these suggestions in order of confidence",
        "2. For each suggestion you agree with, add a wikilink: `[[target]]`",
        "3. Run palace rebuild after making changes",
        "4. Watch this list evolve as your vault grows",
    ]

    (output_dir / "suggested-connections.md").write_text("\n".join(lines), encoding="utf-8")


# ─── ENTRY POINT ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Rebuild YURI-OS-MUSUBI Claude Palace")
    parser.add_argument("--vault",   default=str(DEFAULT_VAULT),  help="Vault root path")
    parser.add_argument("--output",  default=str(DEFAULT_OUTPUT), help="Output directory")
    parser.add_argument("--dry-run", action="store_true",         help="Scan only, no writes")
    args = parser.parse_args()

    vault_root = Path(args.vault)
    output_dir = Path(args.output)

    if not vault_root.exists():
        print(f"ERROR: vault root not found: {vault_root}")
        return 1

    print(f"[palace-rebuild] Vault: {vault_root}")
    print(f"[palace-rebuild] Output: {output_dir}")
    print(f"[palace-rebuild] Scanning...", flush=True)

    nodes, raw_links, file_index = scan_vault(vault_root)
    print(f"[palace-rebuild] {len(nodes)} nodes, {len(raw_links)} raw wikilinks")

    edges = build_edges(raw_links, file_index)
    print(f"[palace-rebuild] {len(edges)} resolved edges")

    deg       = degree_map(edges)
    centrality = centrality_scores(nodes, deg)

    print("[palace-rebuild] Computing analysis...")
    hubs     = hub_nodes(nodes, centrality, deg)
    clusters = connected_components(nodes, edges)
    orphans  = orphaned_nodes(nodes, deg)
    cross    = cross_domain_patterns(nodes, edges)
    suggest  = suggested_connections(nodes, edges)

    n         = len(nodes)
    e         = len(edges)
    density   = (2 * e / (n * (n - 1))) if n > 1 else 0
    avg_deg   = (2 * e / n) if n > 0 else 0

    stats = {
        "node_count"   : n,
        "edge_count"   : e,
        "density"      : round(density, 6),
        "average_degree": round(avg_deg, 2),
    }

    analysis = {
        "centrality"          : {k: round(v, 6) for k, v in list(centrality.items())[:500]},
        "hubs"                : hubs,
        "clusters"            : clusters,
        "orphaned_nodes"      : orphans,
        "cross_domain_patterns": cross,
        "suggested_connections": suggest,
        "statistics"          : stats,
    }

    scan_data = {
        "nodes"   : nodes,
        "edges"   : edges,
        "metadata": {
            "vault_path": str(vault_root),
            "scan_time" : datetime.now().isoformat(),
            "node_count": n,
            "edge_count": e,
        },
    }

    palace_data = {
        "metadata": {
            "vault_path": str(vault_root),
            "built_at"  : datetime.now().isoformat(),
            "version"   : VERSION,
        },
        "nodes"   : nodes,
        "edges"   : edges,
        "analysis": analysis,
    }

    if args.dry_run:
        print("[palace-rebuild] DRY RUN — no files written")
        print(f"  Hubs: {[h['label'] for h in hubs[:5]]}")
        print(f"  Clusters: {len(clusters)}")
        print(f"  Orphans: {len(orphans)}")
        print(f"  Cross-domain patterns: {len(cross)}")
        print(f"  Suggested connections: {len(suggest)}")
        return 0

    output_dir.mkdir(parents=True, exist_ok=True)
    print("[palace-rebuild] Writing outputs...")

    (output_dir / "_scan.json").write_text(
        json.dumps(scan_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output_dir / "_analysis.json").write_text(
        json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output_dir / "palace.json").write_text(
        json.dumps(palace_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    write_palace_index(output_dir, nodes, analysis)
    write_palace_map(output_dir, nodes)
    write_cross_domain(output_dir, cross)
    write_orphaned_content(output_dir, orphans)
    write_suggested_connections(output_dir, suggest)

    print(f"[palace-rebuild] Done. Outputs written to {output_dir}")
    print(f"  Nodes: {n} | Edges: {e} | Clusters: {len(clusters)} | Orphans: {len(orphans)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
