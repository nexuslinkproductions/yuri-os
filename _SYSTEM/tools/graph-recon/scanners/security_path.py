"""Lens Family V1 — security_path (Orion design doc §2, approved 2026-08-04).

Invariant: no untrusted-input node may have a directed path through an
exec-capable node to a boundary-crossing edge. Each shortest witness path
(root -> ... -> v --boundary--> w) is one card.

- Reads ONLY the pinned graph via load_graph (no git_show, no dependency on
  the exec_centrality layer — exec set derived from base records, §2.2).
- Untrusted roots: port/network_endpoint (reverse network_conn ingress),
  mcp_server (reverse mcp_registration ingress), env_file (forward
  env_to_process ingress).
- Exec class: kind in {script, service} | props.exec_capable | launchd target
  | mcp_registration target.
- BFS over FLOW_EDGE_KINDS, branch stops at the FIRST boundary edge (the
  terminal edge); card iff (root..v] contains >=1 exec node (root itself
  excluded — mcp_server roots are registration targets, not waypoints).
- Severity by terminal boundary class: network/internet -> critical, lan ->
  high, local -> medium, other non-none -> high (fail-safe).
- Card id canon includes the ORDERED path (distinct witnesses never collide).
"""
from __future__ import annotations
from collections import Counter, deque
from ._base_lens import BaseLens, LensResult
from reconloop.graphio import load_graph

FLOW_EDGE_KINDS = {
    "spawns", "executes", "network_conn", "file_write", "tests",
    "mcp_registration", "launchd_to_script", "calls", "imports",
    "env_to_process",
}
UNTRUSTED_INPUT_KINDS = {"port", "network_endpoint", "ws_endpoint",
                         "mcp_server", "env_file"}
EXEC_KINDS = {"script", "service"}

SEV_BY_BOUNDARY = {"network": "critical", "internet": "critical",
                   "lan": "high", "local": "medium"}


class SecurityPathLens(BaseLens):
    name = "security_path"
    invariant = "no untrusted-input -> exec -> boundary-crossing path (each shortest witness is a card)"
    scope = "untrusted roots + exec nodes + boundary edges over FLOW_EDGE_KINDS"
    admission = "directed path root -> ... -> v --(boundary!=none)--> w with exec waypoint on [root..v]"

    def run(self, ctx) -> LensResult:
        r = LensResult(lens_name=self.name, invariant=self.invariant,
                       scope=self.scope, admission=self.admission)
        nodes, edges, src = load_graph(ctx)

        # ---- exec set (derived from base records — never exec_centrality) ----
        exec_nodes = {nid for nid, rec in nodes.items()
                      if rec.get("kind") in EXEC_KINDS
                      or rec.get("props", {}).get("exec_capable")}
        for e in edges:
            if e.get("kind") in ("launchd_to_script", "mcp_registration") \
               and e.get("to") in nodes:
                exec_nodes.add(e["to"])

        # ---- adjacency (FLOW kinds only, deterministic sorted) ----
        adj: dict[str, list] = {}
        boundary_edges: list[dict] = []
        for e in edges:
            k = e.get("kind")
            if k not in FLOW_EDGE_KINDS:
                continue
            f, t = e.get("from"), e.get("to")
            if f in nodes and t in nodes:
                adj.setdefault(f, []).append(e)
            if e.get("boundary") and e["boundary"] != "none":
                boundary_edges.append(e)
        for k in adj:
            adj[k].sort(key=lambda e: (e["to"], e.get("kind")))

        # ---- ingress per root class ----
        # reverse network_conn: listener edge owner -> port walked port -> owner
        rev_network: dict[str, list] = {}
        rev_mcp: dict[str, list] = {}
        fwd_env: dict[str, list] = {}
        for e in edges:
            k = e.get("kind")
            f, t = e.get("from"), e.get("to")
            if k == "network_conn" and f in nodes and t in nodes:
                rev_network.setdefault(t, []).append(e)
            elif k == "mcp_registration" and f in nodes and t in nodes:
                rev_mcp.setdefault(t, []).append(e)
            elif k == "env_to_process" and f in nodes and t in nodes:
                fwd_env.setdefault(f, []).append(e)

        root_counts: Counter = Counter()
        witnesses: list[dict] = []

        def ingress_edges(root: str) -> list[tuple[str, dict]]:
            """(start_node, ingress_edge_or_None) pairs per root."""
            kind = nodes[root].get("kind")
            if kind in ("port", "network_endpoint"):
                return [(e["from"], e) for e in rev_network.get(root, [])]
            if kind == "mcp_server":
                out = [(root, None)]
                out += [(e["from"], e) for e in rev_mcp.get(root, [])]
                return out
            if kind == "env_file":
                return [(root, None)]  # forward env_to_process handled by BFS
            return [(root, None)]

        # ---- BFS per root (shortest witness per (root, terminal edge)) ----
        for root in sorted(nodes):
            kind = nodes[root].get("kind")
            if kind not in UNTRUSTED_INPUT_KINDS:
                continue
            root_counts[kind] += 1
            for start, _ing in ingress_edges(root):
                if start not in nodes:
                    continue
                seen = {start}
                parent: dict[str, tuple[str, dict]] = {}
                q = deque([start])
                while q:
                    v = q.popleft()
                    for e in adj.get(v, []):
                        b = e.get("boundary") or "none"
                        if b != "none":
                            # terminal boundary edge: stop this branch here
                            path = []
                            cur = v
                            while cur is not None:
                                path.append(cur)
                                cur = parent.get(cur, (None, None))[0]
                            path.reverse()
                            inside = [root] + [n for n in path if n != root]
                            # exec waypoint strictly inside the path, root excluded
                            if any(n in exec_nodes for n in inside[1:]):
                                witnesses.append({
                                    "root": root, "path": inside,
                                    "terminal": e, "boundary": b,
                                })
                            continue
                        w = e["to"]
                        if w in seen or w not in nodes:
                            continue
                        seen.add(w)
                        parent[w] = (v, e)
                        q.append(w)

        # ---- cards (dedup by (root, terminal edge); id canon includes path) ----
        seen_witness: set = set()
        cards = []
        for w in witnesses:
            key = (w["root"], w["terminal"]["from"], w["terminal"]["to"],
                   w["terminal"].get("kind"), w["boundary"])
            if key in seen_witness:
                continue
            seen_witness.add(key)
            sev = SEV_BY_BOUNDARY.get(w["boundary"], "high")
            term = w["terminal"]
            path_str = " -> ".join(w["path"])
            desc = (f"untrusted input {w['root']} -> exec -> boundary({w['boundary']}): "
                    f"{path_str} --{term.get('kind')}--> {term['to']} (path: {len(w['path'])} nodes)")
            ev = [f"{src}", f"node:{w['root']}"] + \
                 [f"node:{n}" for n in w["path"][1:]] + \
                 [f"edge:{term['from']}->{term['to']} {term.get('kind')}"]
            import hashlib, json as _json
            canon = _json.dumps({"lens": self.name, "path": w["path"],
                                 "terminal": f"{term['from']}->{term['to']} {term.get('kind')}",
                                 "boundary": w["boundary"], "desc": desc[:200]}, sort_keys=True)
            seq = hashlib.sha256(canon.encode()).hexdigest()[:8]
            cards.append(self.card(r, node_ids=w["path"], evidence=ev, sev=sev, desc=desc))
            # fix id to path-aware canon (ordered, not sorted)
            cards[-1].id = f"L-{self.name}-{seq}"

        # ---- lens summary ----
        bc = Counter(e.get("boundary") or "none" for e in boundary_edges)
        extra = {
            "untrusted_inputs": dict(sorted(root_counts.items())),
            "exec_nodes": len(exec_nodes),
            "boundary_edges": {k: v for k, v in sorted(bc.items()) if k != "none"},
            "flow_edges": sum(len(v) for v in adj.values()),
            "witnesses": len(seen_witness),
        }
        return self.finish(r, src=src, cards=cards, extra_props=extra)
