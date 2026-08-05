"""Lens Family V1 — writer_to_protected (Orion design doc §3, approved 2026-08-04).

Invariant: a dynamic writer (unresolved write target, props.dynamic_targets > 0)
must not have reach to protected paths. One card per writer node (the writer is
the accountable unit), severity by channel:
  - high: proven literal file_write -> protected target, or writer lives inside
    protected space (location)
  - medium: reach-only (flow BFS path / env consumption)

Reach channels (deterministic, sorted):
  1. flow — directed BFS over FLOW_EDGE_KINDS to any protected-adjacent node
  2. env_consumption — incoming env_to_process edge (writer is the `to`)
  3. literal_write — outgoing file_write whose target resolves under is_protected
  4. location — the writer's own id resolves under is_protected

Protected-adjacent classes: protected_path kind | env_file kind | file/database
kinds whose id (minus prefix) passes reconloop.protected.is_protected.

Reads ONLY the pinned graph via load_graph. No git_show, no exec layer.
"""
from __future__ import annotations
from collections import Counter, deque
from ._base_lens import BaseLens, LensResult
from reconloop.graphio import load_graph
from reconloop.protected import is_protected

FLOW_EDGE_KINDS = {
    "spawns", "executes", "network_conn", "file_write", "tests",
    "mcp_registration", "launchd_to_script", "calls", "imports",
    "env_to_process",
}
PROTECTED_PREFIX_KINDS = {"file", "database"}


class WriterToProtectedLens(BaseLens):
    name = "writer_to_protected"
    invariant = "dynamic writers must not have reach to protected paths"
    scope = "dynamic writers + protected-adjacent nodes + FLOW_EDGE_KINDS + literal file_write"
    admission = "dynamic writer with non-empty protected reach (flow | env_consumption | literal_write | location)"

    def run(self, ctx) -> LensResult:
        r = LensResult(lens_name=self.name, invariant=self.invariant,
                       scope=self.scope, admission=self.admission)
        nodes, edges, src = load_graph(ctx)

        # ---- node classes ----
        writers: list[str] = []
        literal_only = 0
        for nid, rec in nodes.items():
            if rec.get("kind") != "file":
                continue
            props = rec.get("props", {})
            if "write_calls" not in props:
                continue
            if (props.get("dynamic_targets") or 0) > 0:
                writers.append(nid)
            else:
                literal_only += 1

        def protected_adjacent(nid: str) -> bool:
            rec = nodes.get(nid, {})
            k = rec.get("kind")
            if k == "protected_path":
                return True
            if k == "env_file":
                return True
            if k in PROTECTED_PREFIX_KINDS:
                return is_protected(nid.split(":", 1)[1] if ":" in nid else nid)
            return False

        prot_counts: Counter = Counter()
        for nid, rec in nodes.items():
            k = rec.get("kind")
            if k in ("protected_path", "env_file"):
                prot_counts[k] += 1
            elif k in PROTECTED_PREFIX_KINDS and protected_adjacent(nid):
                prot_counts[k] += 1

        # ---- adjacency (flow kinds, sorted) ----
        adj: dict[str, list] = {}
        for e in edges:
            if e.get("kind") not in FLOW_EDGE_KINDS:
                continue
            f, t = e.get("from"), e.get("to")
            if f in nodes and t in nodes:
                adj.setdefault(f, []).append(e)
        for k in adj:
            adj[k].sort(key=lambda e: (e["to"], e.get("kind")))

        fw_edges = [e for e in edges if e.get("kind") == "file_write"]
        env_to_writer: dict[str, list] = {}
        for e in edges:
            if e.get("kind") == "env_to_process" and e.get("to") in writers:
                env_to_writer.setdefault(e["to"], []).append(e)

        # ---- reach per writer ----
        cards = []
        writers_with_reach = 0
        for w in sorted(writers):
            channels: dict[str, str] = {}
            witness_node: str | None = None
            witness_edge: dict | None = None
            sev = "medium"

            # channel 4: location
            if protected_adjacent(w):
                channels["location"] = w
                witness_node = w
                sev = "high"

            # channel 3: literal protected write
            if "literal_write" not in channels:
                for e in fw_edges:
                    if e.get("from") != w:
                        continue
                    tgt = e.get("to", "").split(":", 1)[1] if ":" in e.get("to", "") else e.get("to", "")
                    if is_protected(tgt):
                        channels["literal_write"] = e["to"]
                        witness_node = e["to"]
                        witness_edge = e
                        sev = "high"
                        break

            # channel 2: env consumption
            if "env_consumption" not in channels and w in env_to_writer:
                e = env_to_writer[w][0]
                channels["env_consumption"] = e["from"]
                witness_node = e["from"]
                witness_edge = e
                if sev != "high":
                    sev = "medium"

            # channel 1: flow BFS (only if no higher channel yet, but still count)
            if "flow" not in channels:
                seen = {w}
                q = deque([w])
                flow_hit: tuple[str, dict] | None = None
                parent: dict[str, tuple[str, dict]] = {}
                while q:
                    v = q.popleft()
                    for e in adj.get(v, []):
                        t = e["to"]
                        if protected_adjacent(t):
                            flow_hit = (t, e)
                            break
                        if t not in seen and t in nodes:
                            seen.add(t)
                            parent[t] = (v, e)
                            q.append(t)
                    if flow_hit:
                        break
                if flow_hit:
                    channels["flow"] = flow_hit[0]
                    witness_node = flow_hit[0]
                    witness_edge = flow_hit[1]
                    if sev != "high":
                        sev = "medium"

            if not channels:
                continue
            writers_with_reach += 1
            ch = "|".join(sorted(channels))
            desc = (f"dynamic writer reaches protected path: {w} "
                    f"(dynamic_targets={nodes[w].get('props', {}).get('dynamic_targets')}) "
                    f"-> {witness_node} [reach: {ch}]")
            ev = [f"{src}", f"node:{w}", f"node:{witness_node}"]
            if witness_edge:
                ev.append(f"edge:{witness_edge['from']}->{witness_edge['to']} {witness_edge.get('kind')}")
            cards.append(self.card(r, node_ids=[w, witness_node], evidence=ev,
                                   sev=sev, desc=desc))

        extra = {
            "dynamic_writers": len(writers),
            "literal_only_writers": literal_only,
            "protected_adjacent": dict(sorted(prot_counts.items())),
            "writers_with_reach": writers_with_reach,
            "file_write_edges": len(fw_edges),
        }
        return self.finish(r, src=src, cards=cards, extra_props=extra)
