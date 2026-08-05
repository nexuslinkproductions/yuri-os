"""P2 port: commits + large blobs (E9 logic)."""
from __future__ import annotations
import subprocess
from .base import BaseScanner, ScanResult
from reconloop.model import Node

class GitHistoryScanner(BaseScanner):
    name = "git_history"; dim = "history"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        try:
            n = subprocess.run(["git", "rev-list", ctx.revision, "--count"], cwd=ctx.root, capture_output=True, text=True, timeout=60).stdout.strip()
            r.nodes.append(Node(id="git:history", kind="git_commit", props={"commits": int(n or 0), "revision": ctx.revision, "scan_state": "scanned"},
                                evidence=[f"git rev-list {ctx.revision} --count"], src="git_history"))
        except Exception as e:
            r.notes = f"git failed: {e}"
        return r
