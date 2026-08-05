"""ScanContext — repo root, read-only guards, protected classification."""
from __future__ import annotations
from pathlib import Path
from .config import ConfigSnapshot, load_config_snapshot
from .protected import build_catalog, meta_only

class ScanContext:
    def __init__(self, repo_root: str, revision: str = "origin/main", graph_input: str = "",
                 config_path: str | Path | None = None,
                 config_snapshot: ConfigSnapshot | None = None):
        self.root = Path(repo_root).resolve()
        self.revision = revision  # pinned git revision for branch-independent scans
        self.graph_input = graph_input  # merged-graph input for analytics scanners
        self._config_snapshot = config_snapshot or load_config_snapshot(config_path)
        self.config_path = self._config_snapshot.path
        self.catalog = build_catalog(self._config_snapshot)
    @property
    def config(self) -> dict:
        return self._config_snapshot.as_dict()
    def abs(self, rel: str) -> Path: return (self.root / rel).resolve()
    def is_protected(self, rel: str) -> bool: return self.catalog.matches(rel)
    def meta_only(self, rel: str) -> dict:
        return meta_only(self.abs(rel), hash_content=self.catalog.hash_content,
                         hash_bytes=self.catalog.hash_bytes)
    def read_text(self, rel: str) -> str | None:
        if self.is_protected(rel): return None  # read-only guard: never content of protected
        try: return self.abs(rel).read_text(encoding="utf-8", errors="ignore")
        except Exception: return None
