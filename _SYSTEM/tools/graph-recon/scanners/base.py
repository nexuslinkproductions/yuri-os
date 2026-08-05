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
    name: str = "base"; dim: str = "static"
    def run(self, ctx) -> ScanResult: raise NotImplementedError
