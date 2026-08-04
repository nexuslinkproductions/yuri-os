"""M2 lens base: versioned query lens -> VIOLATION CARDS (grammar as product).

A lens is a scanner subclass that reads ONLY the pinned graph input (plus
rev-pinned registry files via git show ctx.revision) — never live state —
and emits:
  - one `lens` node per lens run (props: invariant, scope, admission,
    cards count),
  - violation cards as FINDINGS with verified:false (per lens-spec.md):
      {id, lens, invariant, node(s), evidence, severity, status: open, verified: false}

Negative controls: lenses MUST produce zero cards on the clean fixture
(admission threshold). Metamorphic tests mutate the fixture and assert the
expected cards appear.

Card id grammar: L-<lens>-<seq> (seq deterministic from sorted evidence).
"""
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, field
from .base import BaseScanner, ScanResult  # noqa: F401
from reconloop.model import Node, Finding
from reconloop.graphio import load_graph


@dataclass
class LensResult(ScanResult):
    lens_name: str = ""
    invariant: str = ""
    scope: str = ""
    admission: str = ""


class BaseLens(BaseScanner):
    """Lens protocol: name, invariant, scope, admission + run(ctx) -> LensResult."""
    dim = "lens"
    requires_graph = True  # lenses always need the pinned graph input
    invariant: str = ""
    scope: str = ""
    admission: str = ""

    def card(self, r: LensResult, *, node_ids: list, evidence: list, sev: str,
             desc: str) -> Finding:
        """Emit one violation card (verified:false per lens-spec D)."""
        canon = json.dumps({"lens": self.name, "node": sorted(node_ids),
                            "desc": desc[:200]}, sort_keys=True)
        seq = hashlib.sha256(canon.encode()).hexdigest()[:8]
        return Finding(
            id=f"L-{self.name}-{seq}",
            sev=sev, dim="lens",
            desc=f"[{self.name}] {desc} (nodes: {', '.join(sorted(node_ids)[:5])})",
            evidence=sorted(evidence), status="open", verified=False,
        )

    def finish(self, r: LensResult, *, src: str, cards: list, extra_props: dict | None = None) -> LensResult:
        """Attach the lens summary node + sort findings."""
        props = {
            "invariant": self.invariant,
            "scope": self.scope,
            "admission": self.admission,
            "cards": len(cards),
        }
        if extra_props:
            props.update(extra_props)
        r.nodes.append(Node(
            id=f"lens:{self.name}",
            kind="lens",
            props=props,
            evidence=[f"{src}"],
            src=self.name,
        ))
        r.findings = cards
        r.nodes.sort(key=lambda n: n.id)
        r.edges.sort(key=lambda e: (e.from_, e.to, e.kind))
        r.findings.sort(key=lambda f: f.id)
        return r

    def git_show(self, ctx, rel: str) -> str | None:
        """Read a tracked file at ctx.revision (rev-pinned, deterministic).

        Lenses read registry content from the pinned revision — the same
        revision the graph's file layer was built from — never the live
        working tree. Mirrors file_inventory's git ls-tree at --revision.
        """
        import subprocess
        try:
            p = subprocess.run(
                ["git", "show", f"{ctx.revision}:{rel}"],
                cwd=ctx.root, capture_output=True, text=True, timeout=30)
            if p.returncode == 0:
                return p.stdout
        except Exception:
            pass
        return None
