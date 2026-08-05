"""M1 analytics: bridges + articulation points on the file/script/service graph (Tarjan, stdlib).

Graph-understanding phase (E-2, owner-approved 2026-08-04). Consumes the merged
graph artifact (reconloop.graphio) and restricts to the CODE subgraph: nodes of
kind {file, script, service, test_suite} (test files are code files) joined by
any edge whose both endpoints are code nodes (tests wiring, file_write, ...).
Non-code edges (launchd_to_script, network_conn, mcp_registration) do not join
this subgraph.

Emits:
  - one `articulation_point` node per cut vertex: id `art:<node_id>`, props:
    degree, kind, code-component size,
  - one `bridge` edge per bridge: from/to sorted by id (undirected canonical),
    only when the node pair has exactly one edge (parallel edge => not a bridge),
  - `art:top` summary node: counts + top-N articulation points by degree,
  - findings: exec-capable articulation points (sev medium), high-degree hubs
    (sev info).
Determinism: iterative Tarjan over sorted node ids, sorted adjacency per node;
all emission sorted. No timestamps/PIDs in ids. Evidence always non-empty.
"""
from __future__ import annotations
from collections import Counter
from .base import BaseScanner, ScanResult
from reconloop.model import Node, Edge, Finding
from reconloop.graphio import load_graph

CODE_KINDS = {"file", "script", "service", "test_suite"}


def tarjan(adj: dict[str, Counter]) -> tuple[set, set]:
    """Iterative Tarjan. Returns (articulation_points, bridges).

    adj: node -> Counter(neighbor -> edge_count). Parallel edges (count > 1)
    disqualify the pair from being a bridge but do not affect articulation.
    """
    tin: dict[str, int] = {}
    low: dict[str, int] = {}
    parent: dict[str, str] = {}
    art: set = set()
    bridges: set = set()
    timer = 0

    for start in sorted(adj):
        if start in tin:
            continue
        root_children = 0
        stack: list[tuple] = [(start, iter(sorted(adj[start])))]
        tin[start] = low[start] = timer
        timer += 1
        while stack:
            v, it = stack[-1]
            advanced = False
            for w in it:
                if w == parent.get(v):
                    continue  # skip the tree edge back to parent
                if w not in tin:
                    parent[w] = v
                    if v == start:
                        root_children += 1
                    tin[w] = low[w] = timer
                    timer += 1
                    stack.append((w, iter(sorted(adj[w]))))
                    advanced = True
                    break
                low[v] = min(low[v], tin[w])  # back edge
            if not advanced:
                stack.pop()
                if parent.get(v) is not None:
                    p = parent[v]
                    low[p] = min(low[p], low[v])
                    # bridge: low[child] > tin[parent] AND unique edge between pair
                    if low[v] > tin[p] and adj[p][v] == 1:
                        bridges.add(tuple(sorted((p, v))))
                    # articulation: low[child] >= tin[parent], parent not DFS root
                    if low[v] >= tin[p] and p != start:
                        art.add(p)
        if root_children > 1:
            art.add(start)

    return art, bridges


def comp_sizes(adj: dict[str, Counter]) -> dict[str, int]:
    """Node -> size of its connected component (deterministic BFS, sorted starts)."""
    sizes: dict[str, int] = {}
    seen: set = set()
    for start in sorted(adj):
        if start in seen:
            continue
        stack = [start]
        seen.add(start)
        members = []
        while stack:
            v = stack.pop()
            members.append(v)
            for w in adj[v]:
                if w not in seen:
                    seen.add(w)
                    stack.append(w)
        for m in members:
            sizes[m] = len(members)
    return sizes


class ArticulationScanner(BaseScanner):
    name = "articulation"
    dim = "analytics"
    requires_graph = True  # M1.5: fail-closed — merged-graph input required

    def run(self, ctx) -> ScanResult:
        from reconloop.graphio import require_graph  # noqa: E402
        require_graph(ctx)  # M1.5: fail-closed when no graph input
        r = ScanResult()
        nodes, edges, src = load_graph(ctx)

        # ---- build code-subgraph adjacency (undirected, with edge counts) ----
        code_ids = {nid for nid, rec in nodes.items() if rec.get("kind") in CODE_KINDS}
        adj: dict[str, Counter] = {}
        for e in edges:
            f, t = e.get("from"), e.get("to")
            if f in code_ids and t in code_ids:
                adj.setdefault(f, Counter())[t] += 1
                adj.setdefault(t, Counter())[f] += 1
        for nid in code_ids:
            adj.setdefault(nid, Counter())

        art, bridges = tarjan(adj)
        if not art and not bridges:
            r.notes = f"code subgraph has no cut vertices/bridges ({src})"
            return r
        sizes = comp_sizes(adj)

        # exec-capable definition shared with exec_centrality: props flag OR
        # launchd/mcp-persisted target
        exec_targets = {e["to"] for e in edges
                        if e.get("kind") in ("launchd_to_script", "mcp_registration")}

        def is_exec(nid: str) -> bool:
            return (bool(nodes[nid].get("props", {}).get("exec_capable"))
                    or nid in exec_targets)


        # ---- articulation point nodes ----
        for nid in sorted(art):
            degree = sum(adj[nid].values())
            r.nodes.append(Node(
                id=f"art:{nid}",
                kind="articulation_point",
                props={
                    "degree": degree,
                    "kind": nodes[nid].get("kind", "?"),
                    "component_size": sizes.get(nid, 0),
                    "exec_capable": is_exec(nid),
                },
                evidence=[f"{src}", f"node:{nid}"],
                src=self.name,
            ))
            if is_exec(nid):
                r.findings.append(Finding(
                    id=f"ART-{nid}",
                    sev="medium",
                    dim="analytics",
                    desc=f"exec-capable code node is an articulation point (single point of failure): {nid}",
                    evidence=[f"{src}", f"node:{nid}"],
                ))
            elif degree >= 10:
                r.findings.append(Finding(
                    id=f"ART-{nid}",
                    sev="info",
                    dim="analytics",
                    desc=f"high-degree articulation point (degree {degree}): {nid}",
                    evidence=[f"{src}", f"node:{nid}"],
                ))

        # ---- bridge edges ----
        for f, t in sorted(bridges):
            r.edges.append(Edge(
                from_=f, to=t, kind="bridge",
                props={}, evidence=[f"{src}", f"edge:{f}->{t}"], boundary="none",
            ))

        # ---- summary ----
        top = sorted(art, key=lambda nid: (-sum(adj[nid].values()), nid))[:10]
        r.nodes.append(Node(
            id="art:top",
            kind="articulation_ranking",
            props={
                "articulation_points": len(art),
                "bridges": len(bridges),
                "code_nodes": len(code_ids),
                "top10": [f"art:{nid}" for nid in top],
            },
            evidence=[f"{src}"],
            src=self.name,
        ))

        r.nodes.sort(key=lambda n: n.id)
        r.edges.sort(key=lambda e: (e.from_, e.to, e.kind))
        r.findings.sort(key=lambda f: f.id)
        return r
