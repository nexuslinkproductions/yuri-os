"""P2 port: formula banks / math kernels (E6 logic)."""
from __future__ import annotations
from .base import BaseScanner, ScanResult
from reconloop.model import Node

class FormulaBanksScanner(BaseScanner):
    name = "formula_banks"; dim = "static"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        for rel in ["_SYSTEM/labs/math", "_SYSTEM/Scripts/math"]:
            d = ctx.root / rel
            if d.exists():
                files = sum(1 for _ in d.rglob("*") if _.is_file())
                r.nodes.append(Node(id=f"formula_bank:{rel}", kind="formula_bank",
                                    props={"files": files, "scan_state": "pending"}, evidence=[rel], src="formula_banks"))
        return r
