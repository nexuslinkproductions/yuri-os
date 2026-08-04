"""Shared graph-input loading for analytics scanners (deterministic; fail-closed).

Analytics scanners (connected_components, articulation, cross_layer_links,
exec_centrality) do not scan the filesystem — they consume a MERGED graph
(nodes + edges, the model JSONL record format) and emit analytics records.

Input resolution order (first hit wins):
  1. ctx.graph_input                     (explicit, e.g. CLI --graph-input)
  2. $GRAPH_RECON_GRAPH                   (environment override)
  3. <repo-root>/_SYSTEM/graph-ecosystem/full-graph.jsonl   (default artifact)

Evidence label is PATH-INDEPENDENT: load_graph returns a content-addressed
source label `graph:<sha256-prefix-of-input>` (16 hex chars), never an
absolute path, so scanner evidence is byte-identical across environments
(M1 refinement, Orion verdict 2026-08-04).

M1.5 (fail-closed): analytics scanners require a graph input. require_graph()
raises GraphInputRequiredError when none resolves, so a missing input is a
loud per-scanner failure (error layer + nonzero exit) — never a silent empty
layer. load_graph() itself stays deterministic and raises nothing.
"""
from __future__ import annotations
import hashlib
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


class GraphInputRequiredError(RuntimeError):
    """Raised when an analytics (requires_graph) scanner has no graph input."""


def require_graph(ctx) -> Path:
    """Fail-closed: return the resolved graph path or raise."""
    p = resolve_graph_path(ctx)
    if p is None or not p.exists():
        raise GraphInputRequiredError(
            "analytics scanner requires graph input: pass --graph-input <path>, "
            f"set $GRAPH_RECON_GRAPH, or provide {DEFAULT_GRAPH_REL}"
        )
    return p


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
    h = hashlib.sha256()
    try:
        raw = path.read_bytes()  # hash raw bytes => matches shasum/pin files exactly
        h.update(raw)
        for line in raw.decode("utf-8", errors="replace").splitlines():
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
    # ---- content-addressed, path-independent source label (M1 refinement) ----
    pin16 = h.hexdigest()[:16]
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
    return nodes, edges, f"graph:{pin16} (+{synth} synthesized endpoints)"


def layer_kind(rec: dict) -> str:
    """The layer/surface a record belongs to: its node kind."""
    return rec.get("kind", "unknown")


def sorted_ids(ids) -> list:
    return sorted(ids)
