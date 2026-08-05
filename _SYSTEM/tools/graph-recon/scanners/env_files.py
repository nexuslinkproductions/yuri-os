"""P3 NEW: env file inventory — REVISION-PINNED (metadata-only: path, size,
sha256-prefix from git blobs; mtime/perm unavailable from git => null).

M2.2 determinism fix (Orion): the previous implementation scanned the
WORKING TREE with rglob("*.env*"), so the same command produced different
graphs depending on the working-tree state (102 env files on the dev
working tree vs 4 tracked at the pinned revision). Now enumerates TRACKED
env files via `git ls-tree -r --name-only <revision>` filtered to the same
glob semantics (*.env* basename, excluding node_modules/.venv), mirroring
file_inventory.py's rev-pinning (same fallback: git ls-files when the
revision is unavailable).

Metadata: size from `git cat-file -s`; content_sha256_prefix = sha256 of
the first 1MiB of `git cat-file blob` bytes (16 hex chars). Hash only —
file contents/values are NEVER read into the graph. mtime/perm do not
exist in git => null. Sorted emission; deterministic across working trees.
"""
from __future__ import annotations
import fnmatch
import hashlib
import subprocess
from .base import BaseScanner, ScanResult
from reconloop.model import Node

ENV_GLOB = "*.env*"
_SKIP_SUBSTRINGS = ("node_modules", ".venv")


def tracked_env_files(ctx) -> list:
    """Revision-pinned tracked env-file inventory (sorted rel paths).

    Mirrors the old working-tree rglob semantics: basename matches *.env*,
    excluding paths containing node_modules/.venv. Same enumeration source
    as file_inventory (git ls-tree -r --name-only <rev>), so the inventory
    is working-tree- and branch-independent. Shared by env_files and
    env_process_edges so both scanners consume the SAME inventory.
    """
    rev = ctx.revision
    out = ""
    try:
        p = subprocess.run(["git", "ls-tree", "-r", "--name-only", rev],
                           cwd=ctx.root, capture_output=True, text=True, timeout=60)
        if p.returncode == 0:
            out = p.stdout
        else:  # revision unavailable -> index fallback, noted (like file_inventory)
            out = subprocess.run(["git", "ls-files"], cwd=ctx.root,
                                 capture_output=True, text=True, timeout=60).stdout
    except Exception:
        return []
    paths = []
    for line in out.splitlines():
        rel = line.strip()
        if not rel:
            continue
        if not fnmatch.fnmatch(rel.split("/")[-1], ENV_GLOB):
            continue
        if any(s in rel for s in _SKIP_SUBSTRINGS):
            continue
        paths.append(rel)
    return sorted(set(paths))


def blob_meta(ctx, rel: str) -> dict:
    """Metadata for a tracked env file, derived from the git blob at
    ctx.revision — NEVER file contents or values (hash prefixes only).

    size from `git cat-file -s`; content_sha256_prefix = sha256 of the
    first 1MiB of blob bytes (16 hex chars). mtime/perm do not exist in
    git => null. All fields deterministic across working trees.
    """
    rev = ctx.revision
    spec = f"{rev}:{rel}"
    size = None
    try:
        p = subprocess.run(["git", "cat-file", "-s", spec], cwd=ctx.root,
                           capture_output=True, text=True, timeout=30)
        if p.returncode == 0 and p.stdout.strip().isdigit():
            size = int(p.stdout.strip())
    except Exception:
        size = None
    sha = None
    try:
        proc = subprocess.Popen(["git", "cat-file", "blob", spec], cwd=ctx.root,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        h = hashlib.sha256()
        if proc.stdout is not None:
            h.update(proc.stdout.read(1 << 20))  # first 1MiB only
            proc.stdout.close()
        proc.wait(timeout=60)
        sha = h.hexdigest()
    except Exception:
        sha = None
    return {"path": rel, "exists": size is not None, "size": size,
            "mtime": None, "perm": None,
            "content_sha256_prefix": (sha or "")[:16], "revision": rev}


class EnvFilesScanner(BaseScanner):
    name = "env_files"; dim = "protected"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        for rel in tracked_env_files(ctx):
            meta = blob_meta(ctx, rel)
            r.nodes.append(Node(id=f"env_file:{rel}", kind="env_file",
                                props=meta, evidence=["E3 env inventory"],
                                src="env_files"))
        r.nodes.sort(key=lambda n: n.id)
        return r
