"""Shared graph-input loading for analytics scanners (deterministic, fail-open).

Analytics scanners (connected_components, articulation, cross_layer_links,
exec_centrality) do not scan the filesystem — they consume a MERGED graph
(nodes + edges, the model JSONL record format) and emit analytics records.

Input resolution order (first hit wins):
  1. ctx.graph_input                     (explicit, e.g. CLI --graph-input)
  2. $GRAPH_RECON_GRAPH                   (environment override)
  3. <repo-root>/_SYSTEM/graph-ecosystem/full-graph.jsonl   (default artifact)

Fail-open: a missing/unreadable input yields empty (nodes, edges) with a note;
it never raises, so `graph-recon run` keeps the loop alive without the artifact.
"""
from __future__ import annotations
import json
import os
from pathlib import Path

DEFAULT_GRAPH_REL = "_SYSTEM/graph-ecosystem/full-graph.jsonl"


def resolve_graph_path(ctx) -> Path | None:
    """Resolve the merged-graph input path, or None if absent."""
    p = getattr(ctx, "graph_input", "") or os.environ.get("GRAPH_RECON_GRAPH", "")
    if p:
        return Path(p)
    cand = ctx.root / DEFAULT_GRAPH_REL
    return cand if cand.exists() else None


def load_graph(ctx) -> tuple[dict, list, str]:
    """Return (nodes_by_id, edges_sorted, source_desc).

    nodes: {id: record}; edges: list of records sorted by (from, to, kind).
    Deterministic: file order preserved for nodes, edges sorted.
    """
    path = resolve_graph_path(ctx)
    if path is None or not path.exists():
        return {}, [], (
            f"no graph input (ctx.graph_input, $GRAPH_RECON_GRAPH, "
            f"{ctx.root / DEFAULT_GRAPH_REL} all absent)"
        )
    nodes: dict = {}
    edges: list = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                rec = json.loads(line)
                if "from" in rec and "to" in rec:
                    edges.append(rec)
                elif "id" in rec:
                    nodes[rec["id"]] = rec  # last wins; file order deterministic
    except Exception as e:  # noqa: BLE001 — fail-open per contract
        return {}, [], f"graph input error: {e}"
    edges.sort(key=lambda e: (e["from"], e["to"], e.get("kind", "")))
    # ---- synthesize dangling edge endpoints (deterministic, id-prefix kind) ----
    # Some layers (e.g. test_wiring) emit edges whose endpoint nodes live in
    # other layers/merges. Analytics must treat edge endpoints as graph
    # citizens; synthesize minimal records so every edge endpoint is addressable.
    synth = 0
    for e in edges:
        for eid in (e["from"], e["to"]):
            if eid not in nodes:
                kind = eid.split(":", 1)[0] if ":" in eid else "unknown"
                nodes[eid] = {
                    "id": eid, "kind": kind, "props": {},
                    "evidence": [f"dangling endpoint of {e['from']}->{e['to']} ({e.get('kind')})"],
                    "src": "graphio-synthetic",
                }
                synth += 1
    return nodes, edges, f"{path} (+{synth} synthesized endpoints)"


def layer_kind(rec: dict) -> str:
    """The layer/surface a record belongs to: its node kind."""
    return rec.get("kind", "unknown")


def sorted_ids(ids) -> list:
    return sorted(ids)
