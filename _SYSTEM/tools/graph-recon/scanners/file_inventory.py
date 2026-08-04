"""P2 port: git ls-files -> file nodes (E1 logic)."""
from __future__ import annotations
import subprocess
from .base import BaseScanner, ScanResult
from reconloop.model import Node

class FileInventoryScanner(BaseScanner):
    name = "file_inventory"; dim = "static"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        try:
            out = subprocess.run(["git", "ls-files"], cwd=ctx.root, capture_output=True, text=True, timeout=60).stdout
        except Exception as e:
            return ScanResult(notes=f"git ls-files failed: {e}")
        for line in sorted(out.splitlines()):
            if not line.strip(): continue
            props = {"tracked": True, "scan_state": "pending", "protected": ctx.is_protected(line)}
            r.nodes.append(Node(id=f"file:{line}", kind="file", props=props, evidence=["git ls-files"], src="file_inventory"))
        return r
