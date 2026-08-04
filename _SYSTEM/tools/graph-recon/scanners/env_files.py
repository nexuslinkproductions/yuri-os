"""P3 NEW: env file inventory (metadata-only: path,size,mtime,perm,sha256-prefix)."""
from __future__ import annotations
from .base import BaseScanner, ScanResult
from reconloop.model import Node

class EnvFilesScanner(BaseScanner):
    name = "env_files"; dim = "protected"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        for p in sorted(ctx.root.rglob("*.env*")):
            if "node_modules" in str(p) or ".venv" in str(p): continue
            meta = ctx.meta_only(str(p.relative_to(ctx.root)))
            meta["perm"] = oct(p.stat().st_mode & 0o777)
            r.nodes.append(Node(id=f"env_file:{p.relative_to(ctx.root)}", kind="env_file",
                                props=meta, evidence=["E3 env inventory"], src="env_files"))
        return r
