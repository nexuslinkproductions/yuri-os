"""Protected-surface catalog (metadata-only classification)."""
from __future__ import annotations
import re
from pathlib import Path

CATALOG = [
    re.compile(r"\.env($|\.|/)|\.env\.local|secrets\.env"),            # env/secret files
    re.compile(r"\.claude/(state|history|file-history|projects)(/|$)"),  # claude protected surfaces
    re.compile(r"backend/data(/|$)"),                                 # backend runtime data
    re.compile(r"node_modules(/|$)"),                                 # deps (huge, skip content)
    re.compile(r"\.amp(/|$)"),                                        # amp runtime
    re.compile(r"memory\.db$|search-index.*\.db$|work-ledger\.db$"),  # kernels DBs
    re.compile(r"auth\.json$|credentials\.json$"),                    # agent auth files
    re.compile(r"\.omp(/|$)|\.pi(/|$)|\.smart-env(/|$)"),             # runtime config dirs
    re.compile(r"OS_KERNEL/memory|OS_KERNEL/search-index"),           # canonical kernels
    re.compile(r"\.claude/user-auth\.json$"),
    re.compile(r"Application Support/October/(?!worktrees/)[^/]+\.(db|sqlite|sqlite3)"),  # October app DBs (worktrees stay readable)
]

def is_protected(rel_path: str) -> bool:
    p = rel_path.replace("\\", "/")
    return any(r.search(p) for r in CATALOG)

def meta_only(path: Path) -> dict:
    """Metadata-only stat: never opens content. Returns hash of content bytes
    (a hash is not a value — safe for evidence), or None when unreadable."""
    try:
        st = path.stat()
        sha = None
        try:
            import hashlib
            with open(path, "rb") as f: sha = hashlib.sha256(f.read(1 << 20)).hexdigest()  # first 1MiB only
        except Exception: sha = None
        return {"path": str(path), "exists": True, "size": st.st_size,
                "mtime": st.st_mtime, "perm_octal": oct(st.st_mode & 0o777), "content_sha256_prefix": (sha or "")[:16]}
    except FileNotFoundError:
        return {"path": str(path), "exists": False}
