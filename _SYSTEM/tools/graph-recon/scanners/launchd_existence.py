"""M2 lens 5/6: launchd_existence — launchd_agent -> script target must exist.

Invariant: every launchd_to_script edge's target must resolve to a file node
in the graph's file layer (absolute path normalized to repo-relative). Dead
loops (target absent) = violation cards (verified:false). Consumes ONLY the
pinned graph — existence means "present in the pinned file layer", not a live
stat() (determinism).
"""
from __future__ import annotations
from ._base_lens import BaseLens, LensResult
from reconloop.graphio import load_graph


class LaunchdExistenceLens(BaseLens):
    name = "launchd_existence"
    invariant = "launchd agent -> script target exists"
    scope = "launchd_to_script edges + file layer"
    admission = "target absent from file layer"

    def run(self, ctx) -> LensResult:
        r = LensResult(lens_name=self.name, invariant=self.invariant,
                       scope=self.scope, admission=self.admission)
        nodes, edges, src = load_graph(ctx)
        cards = []
        total = 0
        ok = 0
        for e in sorted(edges, key=lambda x: (x.get("from", ""), x.get("to", ""))):
            if e.get("kind") != "launchd_to_script":
                continue
            total += 1
            tgt = e.get("to", "").removeprefix("file:")
            # absolute repo path -> relative; else keep as-is
            rel = tgt
            root = str(ctx.root)
            if tgt.startswith(root + "/"):
                rel = tgt[len(root) + 1:]
            elif tgt.startswith("/"):
                rel = tgt.lstrip("/")
            # M1 synthesis must not resurrect missing targets: a synthetic node
            # is an edge artifact, not file-layer evidence.
            if f"file:{rel}" in nodes and nodes[f"file:{rel}"].get("src") != "graphio-synthetic":
                ok += 1
                continue
            cards.append(self.card(r, node_ids=[e.get("from", "?"), e.get("to", "?")],
                                   evidence=[f"{src}", f"edge:{e.get('from')}->{e.get('to')}"],
                                   sev="high",
                                   desc=f"launchd target missing from file layer: {tgt}"))
        return self.finish(r, src=src, cards=cards,
                           extra_props={"launchd_edges": total, "resolved": ok})
