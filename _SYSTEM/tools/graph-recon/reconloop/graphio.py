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
layer. For malformed or unreadable graph files, load_graph() raises
GraphInputMalformedError so analytics scanners fail closed instead of silently
emitting an empty layer.
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


class GraphInputMalformedError(GraphInputRequiredError):
    """Raised when the resolved graph input is unreadable or malformed."""


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
    raw_node_records = 0
    h = hashlib.sha256()
    try:
        raw = path.read_bytes()  # hash raw bytes => matches shasum/pin files exactly
        h.update(raw)
        for lineno, line in enumerate(raw.decode("utf-8").splitlines(), start=1):
            if not line.strip():
                continue
            rec = json.loads(line)
            if not isinstance(rec, dict):
                raise ValueError(f"line {lineno}: record must be a JSON object")
            if "from" in rec or "to" in rec:
                if not all(
                    isinstance(rec.get(field), str) and rec[field]
                    for field in ("from", "to", "kind")
                ):
                    raise ValueError(
                        f"line {lineno}: edge requires non-empty string from/to/kind"
                    )
                edges.append(rec)
            elif all(
                isinstance(rec.get(field), str) and rec[field]
                for field in ("id", "kind")
            ):
                raw_node_records += 1
                nodes[rec["id"]] = rec  # last wins; file order deterministic
            else:
                raise ValueError(
                    f"line {lineno}: node requires non-empty string id/kind"
                )
        edges.sort(key=lambda e: (e["from"], e["to"], e["kind"]))
        # ---- synthesize dangling edge endpoints (deterministic, id-prefix kind) ----
        # Some layers (e.g. test_wiring) emit edges whose endpoint nodes live in
        # other layers/merges. Analytics must treat edge endpoints as graph
        # citizens; synthesize minimal records so every edge endpoint is addressable.
        for e in edges:
            for eid in (e["from"], e["to"]):
                if eid not in nodes:
                    kind = eid.split(":", 1)[0] if ":" in eid else "unknown"
                    nodes[eid] = {
                        "id": eid, "kind": kind, "props": {},
                        "evidence": [f"dangling endpoint of {e['from']}->{e['to']} ({e['kind']})"],
                        "src": "graphio-synthetic",
                    }
    except OSError as e:
        raise GraphInputMalformedError(
            f"graph input unreadable: {type(e).__name__}: {e.strerror or 'I/O error'}"
        ) from None
    except GraphInputMalformedError:
        raise
    except Exception as e:  # noqa: BLE001
        raise GraphInputMalformedError(
            f"graph input parse failure: {e}"
        ) from None
    # ---- content-addressed, path-independent source label (M1 refinement) ----
    pin16 = h.hexdigest()[:16]
    # M1.6 (F-040): label reports NET-NEW UNIQUE ids (post-synthesis unique
    # minus raw input node records), not endpoint events: for v3 that is
    # 6,995 - 6,579 = +416 (645 synthesized minus 229 duplicate records).
    net_new_unique = len(nodes) - raw_node_records
    return nodes, edges, f"graph:{pin16} (+{net_new_unique} net-new unique)"


def layer_kind(rec: dict) -> str:
    """The layer/surface a record belongs to: its node kind."""
    return rec.get("kind", "unknown")


def sorted_ids(ids) -> list:
    return sorted(ids)
