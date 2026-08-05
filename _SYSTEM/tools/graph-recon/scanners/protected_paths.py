"""Protected surfaces -> protected_path nodes (read-only; metadata + content-hash prefix — hash only, values never emitted).

Config-driven since M4-W1: the catalog is the active pattern set from
reconproject.json `protected.patterns` (with the built-in heritage catalog as
default-if-absent fallback) — the same classification reconloop.protected
uses for read-guards, so this scanner and ctx.read_text()/ctx.meta_only()
always agree.

Walk is bounded and deterministic: the tree is walked in sorted order,
protected directories are surfaced but never descended into (node_modules,
.git, secrets dirs stay shallow), and records are emitted sorted by id.
Protected content is handled via ctx.meta_only(): metadata + content-hash
prefix (first 1MiB, sha256-16) — hash only, values never emitted. The
reconproject.json gate protected.hash_content (default true) switches
hashing off; when false, meta_only() never opens the file (stat only) and
each node records hash_content:false. Every node records hash_content and
hash_bytes so consumers can see exactly what was touched.
"""
from __future__ import annotations
from .base import BaseScanner, ScanResult
from reconloop.model import Node
from reconloop.protected import is_protected


class ProtectedPathsScanner(BaseScanner):
    name = "protected_paths"; dim = "protected"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        seen = set()
        stack = [ctx.root]
        while stack:
            d = stack.pop()
            try:
                entries = sorted(d.iterdir(), key=lambda p: p.name)
            except Exception:
                continue
            for p in entries:
                try:
                    rel = p.relative_to(ctx.root).as_posix()
                except ValueError:
                    continue
                if is_protected(rel):
                    meta = ctx.meta_only(rel) if p.exists() else {"path": rel, "exists": False}
                    meta["surface"] = "protected"
                    meta["scan_state"] = "scanned"
                    meta.setdefault("hash_content", False)  # missing file: nothing hashed
                    nid = f"protected_path:{rel}"
                    if nid not in seen:
                        seen.add(nid)
                        r.nodes.append(Node(
                            id=nid, kind="protected_path", props=meta,
                            evidence=["catalog: reconproject.json protected.patterns (fallback: built-in)"],
                            src="protected_paths"))
                    continue  # never descend into protected dirs
                if p.is_dir() and not p.is_symlink():
                    stack.append(p)
        r.nodes.sort(key=lambda n: n.id)
        return r
