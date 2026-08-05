"""M2 lens 2/6: protected_writer — file_write targets under protected paths need a gate.

Invariant: every file_write edge whose target resolves to a protected path
(protected.py catalog, e.g. backend/data, .env, memory.db, .claude/state)
must carry gate evidence on the edge or its source node. file_write -> protected
target without a gate = violation card (verified:false).

Consumes ONLY the pinned graph (file_write edges + protected classifier).
"""
from __future__ import annotations
from ._base_lens import BaseLens, LensResult
from reconloop.graphio import load_graph
from reconloop.protected import is_protected

GATE_HINTS = ("gate", "allow", "approved", "sanctioned", "audit")


class ProtectedWriterLens(BaseLens):
    name = "protected_writer"
    invariant = "file_write targets under protected paths must pass a gate"
    scope = "file_write edges + protected-path classifier"
    admission = "file_write -> protected target without gate evidence"

    def run(self, ctx) -> LensResult:
        r = LensResult(lens_name=self.name, invariant=self.invariant,
                       scope=self.scope, admission=self.admission)
        nodes, edges, src = load_graph(ctx)
        cards = []
        gated_targets = 0
        for e in sorted(edges, key=lambda x: (x.get("from", ""), x.get("to", ""))):
            if e.get("kind") != "file_write":
                continue
            tgt = e.get("to", "").removeprefix("file:")
            if not is_protected(tgt):
                continue
            # gate evidence: edge props/evidence or source node props mention a gate
            gate_ev = [str(v) for v in (e.get("props") or {}).values()
                       if any(h in str(v).lower() for h in GATE_HINTS)]
            src_rec = nodes.get(e.get("from", ""), {})
            gate_ev += [str(v) for v in (src_rec.get("props") or {}).values()
                        if any(h in str(v).lower() for h in GATE_HINTS)]
            if gate_ev:
                gated_targets += 1
                continue
            cards.append(self.card(
                r, node_ids=[e.get("from", "?"), e.get("to", "?")],
                evidence=[f"{src}", f"edge:{e.get('from')}->{e.get('to')} file_write"],
                sev="high",
                desc=f"file_write into protected path without gate: {e.get('from')} -> {tgt}"))
        return self.finish(r, src=src, cards=cards,
                           extra_props={"file_write_edges": sum(1 for e in edges
                                                                if e.get("kind") == "file_write"),
                                        "gated_protected_writes": gated_targets})
