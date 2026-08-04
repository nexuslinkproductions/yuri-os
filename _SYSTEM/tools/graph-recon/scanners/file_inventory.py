"""P2 port: git ls-files -> file nodes (E1 logic)."""
from __future__ import annotations
import subprocess
from .base import BaseScanner, ScanResult
from reconloop.model import Node

class FileInventoryScanner(BaseScanner):
    name = "file_inventory"; dim = "static"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        rev = ctx.revision
        out = ""
        try:
            p = subprocess.run(["git", "ls-tree", "-r", "--name-only", rev], cwd=ctx.root,
                               capture_output=True, text=True, timeout=60)
            if p.returncode == 0:
                out = p.stdout
            else:  # revision unavailable -> fallback, noted
                out = subprocess.run(["git", "ls-files"], cwd=ctx.root, capture_output=True, text=True, timeout=60).stdout
        except Exception as e:
            return ScanResult(notes=f"git ls-tree failed: {e}")
        for line in sorted(out.splitlines()):
            if not line.strip(): continue
            props = {"tracked": True, "revision": rev, "scan_state": "pending", "protected": ctx.is_protected(line)}
            r.nodes.append(Node(id=f"file:{line}", kind="file", props=props,
                                evidence=[f"git ls-tree -r {rev}"], src="file_inventory"))
        return r
