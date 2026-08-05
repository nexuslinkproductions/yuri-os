"""M2 lens 6/6: env_to_process — env files need >=1 incident env_to_process edge.

Invariant: every env_file node must have >=1 incident env_to_process edge.
Orphan env files = violation cards (verified:false). Metadata-only — env node
props are never read for values, only ids/kinds.

M2.1 refinement (F-043): template env files (.env.example/.env.sample/
.env.template/… — documentation, never consumed by a process) are EXEMPT
from orphan cards; only real env files (.env, .env.local, …) produce cards.
This separates the structural template noise from genuine orphans once the
env_process_edges scanner emits consumer edges.

Consumes ONLY the pinned graph.
"""
from __future__ import annotations
import re
from ._base_lens import BaseLens, LensResult
from reconloop.graphio import load_graph

TEMPLATE_RE = re.compile(r"\.env\.(example|sample|template|dist|default|local\.example)$|\.env\.example$", re.I)


class EnvToProcessLens(BaseLens):
    name = "env_to_process"
    invariant = "real env files need >=1 incident env_to_process edge (templates exempt)"
    scope = "env_file nodes + env_to_process edges"
    admission = "orphan non-template env_file (no incident env_to_process edge)"

    def run(self, ctx) -> LensResult:
        r = LensResult(lens_name=self.name, invariant=self.invariant,
                       scope=self.scope, admission=self.admission)
        nodes, edges, src = load_graph(ctx)
        env_nodes = {nid for nid, rec in nodes.items() if rec.get("kind") == "env_file"}
        incident = {nid for e in edges if e.get("kind") == "env_to_process"
                    for nid in (e.get("from"), e.get("to")) if nid in env_nodes}
        real = {nid for nid in env_nodes
                if not TEMPLATE_RE.search(nid.removeprefix("env_file:"))}
        templates = env_nodes - real
        cards = []
        for nid in sorted(real):
            if nid in incident:
                continue
            cards.append(self.card(r, node_ids=[nid], evidence=[f"{src}", f"node:{nid}"],
                                   sev="medium",
                                   desc=f"orphan env_file (no env_to_process edge): {nid}"))
        return self.finish(r, src=src, cards=cards,
                           extra_props={"env_files": len(env_nodes),
                                        "templates_exempt": len(templates),
                                        "real_env_files": len(real),
                                        "with_env_to_process_edge": len(env_nodes & incident),
                                        "env_to_process_edges": sum(1 for e in edges
                                                                    if e.get("kind") == "env_to_process")})
