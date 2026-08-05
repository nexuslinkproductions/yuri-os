"""P2 port: test files -> first local import edges (E5 logic)."""
from __future__ import annotations
import re
from .base import BaseScanner, ScanResult
from reconloop.model import Edge

IMPORT_RE = re.compile(r"from\s+('|\")(\.[^'\"]+)\1")

class TestWiringScanner(BaseScanner):
    name = "test_wiring"; dim = "static"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        for t in sorted((ctx.root / "_SYSTEM").rglob("*.test.mjs")):
            if "node_modules" in str(t): continue
            try: src = t.read_text(encoding="utf-8", errors="ignore")
            except Exception: continue
            m = IMPORT_RE.search(src)
            if m:
                r.edges.append(Edge(from_=f"test_suite:{t.relative_to(ctx.root)}", to=f"file:{m.group(2)}",
                                    kind="tests", props={}, evidence=[f"{t} import"], boundary="none"))
        return r
