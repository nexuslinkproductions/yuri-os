"""M4-W2 query engine — read-only queries over a merged graph JSONL (stdlib-only).

Consumes the same record format as the rest of the loop: node records
`{"id","kind","props","evidence","src"}` and edge records
`{"from","to","kind","props","evidence","boundary"}`. Deterministic by
contract: input edges are sorted by (from, to, kind) once; every emitted
record set is sorted; BFS expands neighbors in sorted order with a visited
set (cycle-safe); no timestamps/PIDs anywhere. Fail-closed on input
problems: QueryError is raised and the CLI emits a single `status:error`
record with a nonzero exit — never a partial answer.

Verbs (implemented in the CLI as `query --graph <file> <verb> [args]`):

  touchers <node-id>  — distinct nodes connected to <node-id> by ANY edge
                        (bidirectional: incoming and outgoing both count).
                        Emits the neighbor node records sorted by id, then a
                        terminal `{"query":"touchers","status":"ok|not_found",
                        "node":..., "count":N}` record. Dangling edge
                        endpoints are treated as graph citizens: they get a
                        synthesized minimal record (id-prefix kind), mirroring
                        graphio.load_graph.
  exec-path <from> <to> — shortest directed path from <from> to <to> using
                        ONLY exec-family edges (kinds: exec, executes,
                        spawns, network, network_conn — the template's
                        exec/spawns/network vocabulary), cycle-safe BFS with
                        sorted neighbor expansion (deterministic winner on
                        equal-length routes). Emits the from-node record, the
                        path edge records in order, the to-node record, then
                        `{"query":"exec-path","status":"ok|not_found|
                        unreachable","from":...,"to":...,"hops":N,
                        "visited":M}`. hops=0 (from==to) emits no edges.
  protected — all nodes of kind `protected_path` (the protected_paths
                        scanner's surface), sorted by id, then the terminal
                        `{"query":"protected","status":"ok","count":N}`.
  counts — nodes and edges per kind: `{"query":"counts","record":"node|
                        "edge","kind":K,"count":C}` sorted by (record, kind),
                        then `{"query":"counts","status":"ok","nodes":N,
                        "edges":M}`.
"""
from __future__ import annotations
import json
from collections import Counter, deque
from pathlib import Path

# exec/spawns/network edge vocabulary for exec-path: the template emits
# "executes"/"spawns"/"network_conn"; the task vocabulary says
# exec/spawns/network — both spellings are honored (documented in README).
EXEC_PATH_KINDS = {"exec", "executes", "spawns", "network", "network_conn"}

PROTECTED_KIND = "protected_path"  # kind emitted by scanners/protected_paths.py


class QueryError(RuntimeError):
    """Input-level failure (missing/unreadable graph). Fail-closed."""


def load_graph(path: str | Path) -> tuple[dict, list]:
    """Return (nodes_by_id, edges_sorted). Raises QueryError on any problem.

    nodes: {id: record} (last record wins, file order preserved); edges:
    list sorted by (from, to, kind) — the same canonical order graphio uses,
    so parallel edges tie-break stably.
    """
    p = Path(path)
    if not p.exists():
        raise QueryError(f"graph file not found: {path}")
    nodes: dict = {}
    edges: list = []
    try:
        for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
            if not line.strip():
                continue
            rec = json.loads(line)
            if not isinstance(rec, dict):
                continue
            if "from" in rec and "to" in rec:
                edges.append(rec)
            elif "id" in rec:
                nodes[rec["id"]] = rec
    except Exception as e:  # noqa: BLE001 — fail-closed contract
        raise QueryError(f"graph unreadable: {e}") from None
    edges.sort(key=lambda e: (e["from"], e["to"], e.get("kind", "")))
    return nodes, edges


def _synth_node(rec_id: str) -> dict:
    """Minimal node record for a dangling edge endpoint (id-prefix kind)."""
    kind = rec_id.split(":", 1)[0] if ":" in rec_id else "unknown"
    return {"id": rec_id, "kind": kind, "props": {},
            "evidence": ["query: dangling endpoint of merged graph"],
            "src": "query-synthetic"}


def _node_record(nodes: dict, rec_id: str) -> dict:
    """Node record for an id — real record, or synthesized for dangling
    endpoints (graph citizens, mirroring graphio.load_graph)."""
    rec = nodes.get(rec_id)
    return rec if rec is not None else _synth_node(rec_id)


def _incident(edges: list) -> dict:
    """{node_id: [edge records]} — every edge under both endpoints."""
    inc: dict = {}
    for e in edges:
        inc.setdefault(e["from"], []).append(e)
        inc.setdefault(e["to"], []).append(e)
    for k in inc:
        inc[k].sort(key=lambda e: (e["from"], e["to"], e.get("kind", "")))
    return inc


def _outgoing(edges: list) -> dict:
    """{from_id: [(to, kind, edge_index)]} over EXEC_PATH_KINDS, sorted
    deterministically by (to, kind, edge_index) — stable tie-break for
    parallel edges on the same (from,to,kind)."""
    out: dict = {}
    for i, e in enumerate(edges):
        if e.get("kind") in EXEC_PATH_KINDS:
            out.setdefault(e["from"], []).append((e["to"], e.get("kind", ""), i))
    for k in out:
        out[k].sort()
    return out


# --------------------------------------------------------------------------
# verbs — each returns (status, data_records, summary_record)
# --------------------------------------------------------------------------

def touchers(nodes: dict, edges: list, node_id: str) -> tuple[str, list, dict]:
    """Bidirectional adjacency. status: ok | not_found."""
    inc = _incident(edges)
    if node_id not in nodes and node_id not in inc:
        return ("not_found", [],
                {"query": "touchers", "status": "not_found", "node": node_id,
                 "count": 0})
    nbrs = set()
    for e in inc.get(node_id, []):
        nbrs.add(e["to"] if e["from"] == node_id else e["from"])
    nbrs.discard(node_id)
    recs = [_node_record(nodes, n) for n in sorted(nbrs)]
    return ("ok", recs,
            {"query": "touchers", "status": "ok", "node": node_id,
             "count": len(recs)})


def exec_path(nodes: dict, edges: list, from_id: str, to_id: str
              ) -> tuple[str, list, dict]:
    """Shortest directed path over EXEC_PATH_KINDS (cycle-safe BFS, sorted
    neighbor expansion). status: ok | not_found | unreachable."""
    known = set(nodes) | {e["from"] for e in edges} | {e["to"] for e in edges}
    missing = [x for x in (from_id, to_id) if x not in known]
    if missing:
        return ("not_found", [],
                {"query": "exec-path", "status": "not_found", "from": from_id,
                 "to": to_id, "missing": missing, "hops": 0, "visited": 0})
    if from_id == to_id:
        return ("ok", [_node_record(nodes, from_id)],
                {"query": "exec-path", "status": "ok", "from": from_id,
                 "to": to_id, "hops": 0, "visited": 1})
    out = _outgoing(edges)
    parent: dict = {}
    visited = {from_id}
    q = deque([from_id])
    while q:
        cur = q.popleft()
        for nxt, _kind, _i in out.get(cur, []):
            if nxt in visited:
                continue
            visited.add(nxt)
            parent[nxt] = cur
            if nxt == to_id:
                # reconstruct edge records in path order
                path_ids = [to_id]
                while path_ids[-1] != from_id:
                    path_ids.append(parent[path_ids[-1]])
                path_ids.reverse()
                recs = [_node_record(nodes, path_ids[0])]
                for a, b in zip(path_ids, path_ids[1:]):
                    cands = [e for e in edges if e["from"] == a and e["to"] == b]
                    cands.sort(key=lambda e: (e.get("kind", ""),))
                    recs.append(cands[0])
                    recs.append(_node_record(nodes, b))
                return ("ok", recs,
                        {"query": "exec-path", "status": "ok", "from": from_id,
                         "to": to_id, "hops": len(path_ids) - 1,
                         "visited": len(visited)})
            q.append(nxt)
    return ("unreachable", [],
            {"query": "exec-path", "status": "unreachable", "from": from_id,
             "to": to_id, "hops": 0, "visited": len(visited)})


def protected_nodes(nodes: dict, edges: list) -> tuple[str, list, dict]:
    """All nodes of kind protected_path, sorted by id. edges unused but kept
    for a uniform verb signature."""
    recs = sorted((r for r in nodes.values() if r.get("kind") == PROTECTED_KIND),
                  key=lambda r: r["id"])
    return ("ok", recs,
            {"query": "protected", "status": "ok", "count": len(recs)})


def counts(nodes: dict, edges: list) -> tuple[str, list, dict]:
    """Per-kind node/edge counts + totals. Sorted by (record, kind)."""
    nc = Counter(r.get("kind", "unknown") for r in nodes.values())
    ec = Counter(e.get("kind", "unknown") for e in edges)
    recs = []
    for kind in sorted(nc):
        recs.append({"query": "counts", "record": "node", "kind": kind,
                     "count": nc[kind]})
    for kind in sorted(ec):
        recs.append({"query": "counts", "record": "edge", "kind": kind,
                     "count": ec[kind]})
    return ("ok", recs,
            {"query": "counts", "status": "ok",
             "nodes": len(nodes), "edges": len(edges)})


VERBS = {
    "touchers": touchers,
    "exec-path": exec_path,
    "protected": protected_nodes,
    "counts": counts,
}
