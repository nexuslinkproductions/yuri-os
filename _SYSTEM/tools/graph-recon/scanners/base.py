"""Scanner protocol: name, dim, run(ctx) -> ScanResult(nodes, edges, findings, notes)."""
from __future__ import annotations
from dataclasses import dataclass, field
from reconloop.model import Node, Edge, Finding

@dataclass
class ScanResult:
    nodes: list = field(default_factory=list)
    edges: list = field(default_factory=list)
    findings: list = field(default_factory=list)
    notes: str = ""

class BaseScanner:
    name: str = "base"
    dim: str = "static"
    # M1.5: analytics scanners REQUIRE a merged-graph input (fail-closed);
    # filesystem scanners stay fail-open.
    requires_graph: bool = False
    # M1.5: layer stability for pin coverage. "stable" layers feed the pinned
    # merged graph; "ephemeral" layers (live state) carry a freshness stamp and
    # are excluded from the determinism pin.
    layer_stability: str = "stable"

    def run(self, ctx) -> ScanResult:
        raise NotImplementedError
