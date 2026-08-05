"""ScanContext — repo root, read-only guards, protected classification."""
from __future__ import annotations
from pathlib import Path
from .protected import is_protected, meta_only

class ScanContext:
    def __init__(self, repo_root: str, revision: str = "origin/main", graph_input: str = ""):
        self.root = Path(repo_root).resolve()
        self.revision = revision  # pinned git revision for branch-independent scans
        self.graph_input = graph_input  # merged-graph input for analytics scanners
    def abs(self, rel: str) -> Path: return (self.root / rel).resolve()
    def is_protected(self, rel: str) -> bool: return is_protected(rel)
    def meta_only(self, rel: str) -> dict: return meta_only(self.abs(rel))
    def read_text(self, rel: str) -> str | None:
        if is_protected(rel): return None  # read-only guard: never content of protected
        try: return self.abs(rel).read_text(encoding="utf-8", errors="ignore")
        except Exception: return None
