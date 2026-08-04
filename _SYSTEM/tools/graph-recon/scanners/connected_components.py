"""M1 analytics: connected components across the whole merged graph (union-find over node ids).

Graph-understanding phase (E-2, owner-approved 2026-08-04). Consumes the merged
graph artifact (reconloop.graphio) and emits:
  - one `component` node per connected component (all node kinds, all edge kinds),
    with size, member-kind histogram, and top members; id embeds zero-padded size
    so id-sorted emission is also size-descending,
  - one `member_of` edge per (component, member) pair,
  - a `cc:top` summary node listing top-N components by size,
  - findings for components that mix secret/protected surfaces with network
    endpoints (evidence-linked to the component).
Determinism: union-find over sorted node ids; all emission sorted by id /
(from, to, kind). No timestamps/PIDs in ids. Evidence always non-empty.
"""
from __future__ import annotations
from collections import Counter
from .base import BaseScanner, ScanResult
from reconloop.model import Node, Edge, Finding
from reconloop.graphio import load_graph

SECRET_KINDS = {"env_file", "secret_bearing_file", "protected_path"}
NETWORK_KINDS = {"port", "network_endpoint", "process"}


class ConnectedComponentsScanner(BaseScanner):
    name = "connected_components"
    dim = "analytics"
    requires_graph = True  # M1.5: fail-closed — merged-graph input required

    def run(self, ctx) -> ScanResult:
        from reconloop.graphio import require_graph  # noqa: E402
        require_graph(ctx)  # M1.5: fail-closed when no graph input
        r = ScanResult()
        nodes, edges, src = load_graph(ctx)

        # ---- union-find over node ids (deterministic: sorted id iteration) ----
        parent = {nid: nid for nid in nodes}
        size = {nid: 1 for nid in nodes}

        def find(x: str) -> str:
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a: str, b: str) -> None:
            ra, rb = find(a), find(b)
            if ra == rb:
                return
            if size[ra] < size[rb]:
                ra, rb = rb, ra
            parent[rb] = ra
            size[ra] += size[rb]

        for e in edges:
            f, t = e.get("from"), e.get("to")
            if f in parent and t in parent:
                union(f, t)

        # ---- group members per component root ----
        comps: dict[str, list[str]] = {}
        for nid in sorted(nodes):
            comps.setdefault(find(nid), []).append(nid)

        # ---- emit component nodes + membership edges (size desc, id asc) ----
        ordered = sorted(comps.items(), key=lambda kv: (-len(kv[1]), kv[0]))
        comp_id_by_root: dict[str, str] = {}
        for i, (root, members) in enumerate(ordered):
            cid = f"cc:{len(members):04d}:{root}"
            comp_id_by_root[root] = cid
            kinds = Counter(nodes[m].get("kind", "?") for m in members)
            r.nodes.append(Node(
                id=cid,
                kind="component",
                props={
                    "rank": i,
                    "size": len(members),
                    "member_kinds": dict(sorted(kinds.items())),
                    "layers": len(kinds),
                    "top_members": members[:10],
                },
                evidence=[f"{src}", f"union-find over {len(nodes)} nodes / {len(edges)} edges"],
                src=self.name,
            ))
            for m in members:
                r.edges.append(Edge(
                    from_=cid, to=m, kind="member_of",
                    props={}, evidence=[f"{src}", f"component {cid}"], boundary="none",
                ))
            # finding: secret/protected surface shares a component with network endpoints
            if kinds.keys() & SECRET_KINDS and kinds.keys() & NETWORK_KINDS:
                r.findings.append(Finding(
                    id=f"CC-{cid}",
                    sev="medium",
                    dim="analytics",
                    desc=(f"component of {len(members)} nodes mixes secret/protected surface "
                          f"({sorted(kinds.keys() & SECRET_KINDS)}) with network surface "
                          f"({sorted(kinds.keys() & NETWORK_KINDS)})"),
                    evidence=[f"{src}", f"component:{cid}"],
                ))

        # ---- top-N summary node ----
        top = [comp_id_by_root[root] for root, _ in ordered[:10]]
        r.nodes.append(Node(
            id="cc:top",
            kind="component_ranking",
            props={"top10": top, "total_components": len(ordered),
                   "singletons": sum(1 for m in comps.values() if len(m) == 1)},
            evidence=[f"{src}"],
            src=self.name,
        ))

        # ---- deterministic final sort ----
        r.nodes.sort(key=lambda n: n.id)
        r.edges.sort(key=lambda e: (e.from_, e.to, e.kind))
        r.findings.sort(key=lambda f: f.id)
        return r
