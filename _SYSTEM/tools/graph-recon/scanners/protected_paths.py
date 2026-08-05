"""P3 NEW: protected surfaces -> protected_path nodes (read-only, metadata-only).
Catalog: yuri-origin.md + AGENTS.md protected list. Keychain = node-only, zero access."""
from __future__ import annotations
from .base import BaseScanner, ScanResult
from reconloop.model import Node

SURFACES = [  # (rel_path, owning_surface)
    ("backend/.env", "env"), (".env", "env"), (".env.example", "env"),
    (".claude/state", "claude-protected"), (".claude/history", "claude-protected"),
    (".claude/file-history", "claude-protected"), (".claude/projects", "claude-protected"),
    ("backend/data", "backend-runtime"), ("node_modules", "deps"),
    (".amp", "runtime"), ("_SYSTEM/OS_KERNEL/memory.db", "kernel-db"),
    ("_SYSTEM/OS_KERNEL/search-index.db", "kernel-db"),
    (".smart-env", "runtime-config"), (".omp", "runtime-config"),
]

class ProtectedPathsScanner(BaseScanner):
    name = "protected_paths"; dim = "protected"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        for rel, surface in SURFACES:
            p = ctx.abs(rel)
            meta = ctx.meta_only(rel) if p.exists() else {"path": rel, "exists": False}
            meta["surface"] = surface
            meta["scan_state"] = "scanned"
            r.nodes.append(Node(id=f"protected_path:{rel}", kind="protected_path",
                                props=meta, evidence=["catalog: yuri-origin.md + AGENTS.md"], src="protected_paths"))
        # Keychain: node-only, zero access
        r.nodes.append(Node(id="protected_path:keychain", kind="protected_path",
                            props={"surface": "keychain", "access": "node-only-zero", "scan_state": "scanned"},
                            evidence=["owner ruling 2026-08-04"], src="protected_paths"))
        return r
