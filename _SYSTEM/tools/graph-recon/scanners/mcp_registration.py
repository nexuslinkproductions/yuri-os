"""M2 lens 4/6: mcp_registration — mcp_server nodes need a registration edge.

Invariant: every mcp_server node must have >=1 incident mcp_registration edge
(from a harness_config). Orphan servers (no registration edge) = violation
cards (verified:false). Consumes ONLY the pinned graph.
"""
from __future__ import annotations
from ._base_lens import BaseLens, LensResult
from reconloop.graphio import load_graph


class McpRegistrationLens(BaseLens):
    name = "mcp_registration"
    invariant = "mcp servers need a registration edge"
    scope = "mcp_server nodes + mcp_registration edges"
    admission = "orphan mcp_server (no incident mcp_registration edge)"

    def run(self, ctx) -> LensResult:
        r = LensResult(lens_name=self.name, invariant=self.invariant,
                       scope=self.scope, admission=self.admission)
        nodes, edges, src = load_graph(ctx)
        servers = {nid for nid, rec in nodes.items() if rec.get("kind") == "mcp_server"}
        registered = {e.get("to") for e in edges if e.get("kind") == "mcp_registration"}
        cards = []
        for sid in sorted(servers):
            if sid in registered:
                continue
            cards.append(self.card(r, node_ids=[sid], evidence=[f"{src}", f"node:{sid}"],
                                   sev="medium",
                                   desc=f"orphan mcp_server (no mcp_registration edge): {sid}"))
        return self.finish(r, src=src, cards=cards,
                           extra_props={"mcp_servers": len(servers),
                                        "registered": len(servers & registered)})
