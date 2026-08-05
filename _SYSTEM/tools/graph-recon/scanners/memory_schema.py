"""P2 port: memory.db schema-level + Track A/B counts (E4 logic, metadata-only)."""
from __future__ import annotations
import subprocess
from .base import BaseScanner, ScanResult
from reconloop.model import Node

class MemorySchemaScanner(BaseScanner):
    name = "memory_schema"; dim = "static"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        db = ctx.root / "_SYSTEM" / "OS_KERNEL" / "memory.db"
        tables = []
        if db.exists():
            try:
                out = subprocess.run(["sqlite3", str(db), "SELECT name FROM sqlite_master WHERE type='table'"],
                                     capture_output=True, text=True, timeout=30).stdout
                tables = [t for t in out.splitlines() if t.strip()]
            except Exception: pass
            r.nodes.append(Node(id="database:memory.db", kind="database",
                                props={"schema_level_only": True, "tables": len(tables), "sample": tables[:5],
                                       "scan_state": "scanned"}, evidence=["sqlite_master (no content)"], src="memory_schema"))
        for name, path, is_dir in [("memory-track-A", "_SYSTEM/memory", True), ("memory-track-B", ".claude/memory", True)]:
            d = ctx.root / path
            if d.exists():
                cnt = sum(1 for _ in d.iterdir())
                r.nodes.append(Node(id=f"layer:{name}", kind="layer", props={"path": path, "files": cnt, "scan_state": "scanned"},
                                    evidence=["E4"], src="memory_schema"))
        return r
