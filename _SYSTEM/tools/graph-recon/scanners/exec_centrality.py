"""M1 analytics: exec-capable file ranking by reach + trust-boundary crossings.

Graph-understanding phase (E-2, owner-approved 2026-08-04). Consumes the merged
graph artifact (reconloop.graphio).

Exec-capable sources = nodes that:
  - carry props.exec_capable == true, or
  - are kind script/service, or
  - are the target of a launchd_to_script edge, or
  - are the target of a mcp_registration edge (MCP servers execute tools).

For each source, computes:
  - reach: distinct nodes reachable via outgoing edges of kinds
    {spawns, executes, network_conn, file_write, tests, mcp_registration,
    launchd_to_script, calls, imports} — BFS over directed edges, deterministic
    (sorted neighbors, sorted starts),
  - reach_score: weighted reach (port/network_endpoint = 3, process = 2,
    shell/script/service = 2, other node = 1),
  - port_reach: count of port/network_endpoint nodes reached,
  - trust_crossings: incident edges with boundary != none (count + histogram).

Emits:
  - one `exec_source` node per source: id `exec:<node_id>`, props: kind,
    reach, reach_score, port_reach, trust_crossings, boundary histogram,
    top_reachable (first 10, sorted),
  - `exec:top` summary node: ranking table (score desc, id asc),
  - findings: source reaching ports with trust crossings (sev high),
    source with any trust crossing (sev medium), launchd-persisted exec
    target (sev info, persistence surface).
Determinism: sorted starts/neighbors/emission; no timestamps/PIDs in ids.
Evidence always non-empty.
"""
from __future__ import annotations
from collections import Counter, deque
from .base import BaseScanner, ScanResult
from reconloop.model import Node, Edge, Finding
from reconloop.graphio import load_graph

REACH_EDGE_KINDS = {
    "spawns", "executes", "network_conn", "file_write", "tests",
    "mcp_registration", "launchd_to_script", "calls", "imports",
}
WEIGHT = {"port": 3, "network_endpoint": 3, "process": 2,
          "script": 2, "service": 2, "shell": 2}
SOURCE_KINDS = {"script", "service"}


class ExecCentralityScanner(BaseScanner):
    name = "exec_centrality"
    dim = "analytics"

    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        nodes, edges, src = load_graph(ctx)
        if not nodes:
            r.notes = f"no graph input ({src})"
            return r

        # outgoing edge index (deterministic: sorted target list)
        outgoing: dict[str, list] = {}
        for e in edges:
            if e.get("kind") not in REACH_EDGE_KINDS:
                continue
            outgoing.setdefault(e["from"], []).append(e)
        for k in outgoing:
            outgoing[k].sort(key=lambda e: (e["to"], e.get("kind")))

        # exec sources
        sources: set = set()
        for nid, rec in nodes.items():
            if rec.get("kind") in SOURCE_KINDS or rec.get("props", {}).get("exec_capable"):
                sources.add(nid)
        for e in edges:
            if e.get("kind") in ("launchd_to_script", "mcp_registration"):
                if e.get("to") in nodes:
                    sources.add(e["to"])

        if not sources:
            r.notes = f"no exec-capable sources ({src})"
            return r

        # incident boundary stats per node
        boundary_inc: dict[str, Counter] = {}
        for e in edges:
            for nid in (e.get("from"), e.get("to")):
                if nid in nodes and e.get("boundary") and e["boundary"] != "none":
                    boundary_inc.setdefault(nid, Counter())[e["boundary"]] += 1

        # BFS reach per source (deterministic: sorted BFS over sorted neighbors)
        def reach_stats(source: str) -> tuple[int, int, int, list]:
            seen = set()
            q = deque([source])
            order = []
            while q:
                v = q.popleft()
                for e in outgoing.get(v, []):
                    w = e["to"]
                    if w in nodes and w not in seen:
                        seen.add(w)
                        order.append(w)
                        q.append(w)
            score = sum(WEIGHT.get(nodes[w].get("kind"), 1) for w in seen)
            port_reach = sum(1 for w in seen
                             if nodes[w].get("kind") in ("port", "network_endpoint"))
            return len(seen), score, port_reach, sorted(seen)[:10]

        rows: list[tuple] = []
        for sid in sorted(sources):
            reach_n, score, ports, top = reach_stats(sid)
            b = boundary_inc.get(sid, Counter())
            rows.append((sid, reach_n, score, ports, top, dict(sorted(b.items()))))
            r.nodes.append(Node(
                id=f"exec:{sid}",
                kind="exec_source",
                props={
                    "kind": nodes[sid].get("kind", "?"),
                    "reach": reach_n, "reach_score": score, "port_reach": ports,
                    "trust_crossings": sum(b.values()),
                    "boundaries": dict(sorted(b.items())),
                    "top_reachable": top,
                },
                evidence=[f"graph:{src}", f"node:{sid}"],
                src=self.name,
            ))
            # findings
            if ports > 0 and sum(b.values()) > 0:
                r.findings.append(Finding(
                    id=f"EXEC-{sid}", sev="high", dim="analytics",
                    desc=(f"exec source reaches {ports} network endpoint(s) AND crosses "
                          f"trust boundaries ({dict(b)}): {sid}"),
                    evidence=[f"graph:{src}", f"node:{sid}"],
                ))
            elif sum(b.values()) > 0:
                r.findings.append(Finding(
                    id=f"EXEC-{sid}", sev="medium", dim="analytics",
                    desc=f"exec source crosses trust boundaries ({dict(b)}): {sid}",
                    evidence=[f"graph:{src}", f"node:{sid}"],
                ))
            elif any(e.get("kind") == "launchd_to_script" and e.get("to") == sid
                     for e in edges):
                r.findings.append(Finding(
                    id=f"EXEC-{sid}", sev="info", dim="analytics",
                    desc=f"launchd-persisted exec target (persistence surface): {sid}",
                    evidence=[f"graph:{src}", f"node:{sid}"],
                ))

        # ranking table: score desc, then id asc (deterministic)
        ranked = sorted(rows, key=lambda x: (-x[2], x[0]))
        r.nodes.append(Node(
            id="exec:top",
            kind="exec_ranking",
            props={"top10": [f"exec:{x[0]}" for x in ranked[:10]],
                   "total_sources": len(sources)},
            evidence=[f"graph:{src}", f"sources:{len(sources)}"],
            src=self.name,
        ))

        r.nodes.sort(key=lambda n: n.id)
        r.edges.sort(key=lambda e: (e.from_, e.to, e.kind))
        r.findings.sort(key=lambda f: f.id)
        return r
