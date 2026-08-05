# M4-W1: moved to packs/yuri/ — YURI-OS-specific scanner, loaded via
# --packs yuri or "packs": ["yuri"] in reconproject.json (absolute imports).
from __future__ import annotations
from scanners.base import BaseScanner, ScanResult
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
