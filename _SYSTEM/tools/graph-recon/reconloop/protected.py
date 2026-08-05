"""Protected-surface catalog (metadata + content-hash prefix — hash only).

Config-driven since M4-W1: patterns come from reconproject.json
(`protected.patterns`) when present; otherwise the built-in heritage catalog
below is used (default-if-absent), so a stock template behaves exactly like
the original YURI catalog until a new project overrides it.

The shipped reconproject.json carries the generalized defaults (.env*,
.git, CI secrets, cloud configs, credentials, secrets dirs, node_modules,
runtime data dirs, agent runtime dirs). New projects edit their config file
instead of this module.

M5-W3 (Athena blocker 7): an invalid regex in protected.patterns never
crashes import. Each pattern compiles in isolation; failures are recorded
(config_errors()) with the bad pattern named, and the run CLI writes a
config error record + rc 1 (fail-closed). The valid remainder stays active.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import json
import re
from pathlib import Path

from .config import ConfigSnapshot, load_config_snapshot

# Built-in heritage catalog (YURI-specific) — ONLY used when reconproject.json
# is absent or declares no protected.patterns. Do not extend this list for new
# projects; put patterns in reconproject.json instead.
HERITAGE_CATALOG = [
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


def _compile_patterns(patterns: list) -> tuple[list[re.Pattern], list[dict]]:
    """Compile each configured pattern; never raise on a bad regex.

    Returns (compiled, errors) where errors = [{"pattern": <bad string>,
    "error": <re.error message>}] — the run CLI fails closed on any error.
    """
    compiled: list[re.Pattern] = []
    errors: list[dict] = []
    for p in patterns:
        if not (isinstance(p, str) and p.strip()):
            continue
        try:
            compiled.append(re.compile(p))
        except re.error as e:
            errors.append({"pattern": p, "error": f"{type(e).__name__}: {e}"})
    return compiled, errors


@dataclass(frozen=True)
class ProtectedCatalog:
    """Immutable protected-path policy bound to one scan context."""

    patterns: tuple[re.Pattern, ...]
    errors: tuple[tuple[str, str], ...]
    mode: str
    source: str
    config_sha256: str
    catalog_sha256: str
    hash_content: bool
    hash_bytes: int

    @property
    def pattern_count(self) -> int:
        return len(self.patterns)

    def matches(self, rel_path: str) -> bool:
        p = rel_path.replace("\\", "/")
        return any(r.search(p) for r in self.patterns)

    def error_records(self) -> list[dict]:
        return [{"pattern": p, "error": e} for p, e in self.errors]

    def provenance(self) -> dict:
        return {
            "mode": self.mode,
            "source": self.source,
            "config_sha256": self.config_sha256,
            "catalog_sha256": self.catalog_sha256,
            "pattern_count": self.pattern_count,
            "hash_content": self.hash_content,
            "hash_bytes": self.hash_bytes,
        }


def build_catalog(config: ConfigSnapshot | Path | None = None) -> ProtectedCatalog:
    """Build a path-independent, immutable catalog snapshot.

    The resolved config is read exactly once.  Empty/missing configured
    patterns and explicit ``mode=heritage`` select the built-in YURI policy.
    Invalid regexes are retained as errors so callers can fail closed.
    """
    snapshot = config if isinstance(config, ConfigSnapshot) else load_config_snapshot(config)
    cfg = snapshot.as_dict()
    protected = cfg.get("protected") or {}
    requested_mode = protected.get("mode", "configured")
    raw_patterns = protected.get("patterns") or []
    compiled, errors = _compile_patterns(raw_patterns)
    use_heritage = requested_mode == "heritage" or not compiled
    patterns = tuple(HERITAGE_CATALOG if use_heritage else compiled)
    mode = "heritage" if use_heritage else "configured"
    source = "built-in-heritage" if use_heritage else "reconproject.json"
    config_sha = snapshot.sha256
    hash_content = protected.get("hash_content")
    if not isinstance(hash_content, bool):
        hash_content = True
    hash_bytes = protected.get("hash_bytes")
    if not isinstance(hash_bytes, int) or hash_bytes <= 0:
        hash_bytes = 1 << 20
    catalog_payload = {
        "mode": mode,
        "patterns": [p.pattern for p in patterns],
        "hash_content": hash_content,
        "hash_bytes": hash_bytes,
    }
    catalog_sha = hashlib.sha256(
        json.dumps(catalog_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return ProtectedCatalog(
        patterns=patterns,
        errors=tuple((e["pattern"], e["error"]) for e in errors),
        mode=mode,
        source=source,
        config_sha256=config_sha,
        catalog_sha256=catalog_sha,
        hash_content=hash_content,
        hash_bytes=hash_bytes,
    )


# Pattern-compilation errors from the most recent load/reload (M5-W3).
CATALOG_ERRORS: list[dict] = []


def config_errors() -> list[dict]:
    """Configured-pattern compilation errors (empty list = config OK).

    Each entry names the bad pattern and its re.error message — the run CLI
    reports these in a config.ERROR.jsonl record and exits rc 1.
    """
    return [dict(e) for e in CATALOG_ERRORS]


def load_catalog(config_path: Path | None = None) -> list[re.Pattern]:
    """Active pattern list.

    - config_path given and readable with non-empty `protected.patterns`
      -> those patterns (each string compiled as a regex; invalid ones are
      recorded in config_errors(), never raised)
    - otherwise -> the built-in heritage catalog (default-if-absent).
    """
    global CATALOG_ERRORS
    CATALOG_ERRORS = []  # reset: a load without config problems clears prior errors
    snapshot = build_catalog(config_path)
    CATALOG_ERRORS = snapshot.error_records()
    return list(snapshot.patterns)


# Module-level active catalog, built once at import from discovered config.
CATALOG = load_catalog()


def reload_catalog(config_path: Path | None = None) -> list[re.Pattern]:
    """Rebuild the active catalog (tests / config edited at runtime)."""
    global CATALOG
    CATALOG = load_catalog(config_path)
    return CATALOG


def is_protected(rel_path: str) -> bool:
    p = rel_path.replace("\\", "/")
    return any(r.search(p) for r in CATALOG)


def meta_only(path: Path, hash_content: bool | None = None,
              hash_bytes: int | None = None) -> dict:
    """Protected-file inspection: metadata + content-hash prefix — hash only,
    values never emitted.

    Reads stat metadata (path/size/mtime/perm) and, when hashing is enabled,
    opens the file and hashes the first `hash_bytes` bytes (default 1MiB) to
    a sha256-16 prefix. A hash prefix is not a value (owner rails: location/
    type/context/hash only), so this is authorized. When the config gate
    `protected.hash_content` is false, content is NEVER opened: stat only,
    and `content_sha256_prefix` is empty.

    Explicit args override the config gate; otherwise the gate is read from
    reconproject.json at call time (env override first, engine config second).
    Returns None (via "exists": false) when the path is missing; hash errors
    degrade to an empty prefix, never to an exception.
    """
    if hash_content is None or hash_bytes is None:
        gate_content, gate_bytes = _hash_gate()
        if hash_content is None:
            hash_content = gate_content
        if hash_bytes is None:
            hash_bytes = gate_bytes
    try:
        st = path.stat()
        sha = None
        if hash_content:
            try:
                import hashlib
                with path.open("rb") as f:
                    sha = hashlib.sha256(f.read(hash_bytes)).hexdigest()
            except Exception:
                sha = None
        return {"path": str(path), "exists": True, "size": st.st_size,
                "mtime": st.st_mtime, "perm_octal": oct(st.st_mode & 0o777),
                "hash_content": bool(hash_content), "hash_bytes": hash_bytes,
                "content_sha256_prefix": (sha or "")[:16]}
    except FileNotFoundError:
        return {"path": str(path), "exists": False}


def _hash_gate() -> tuple[bool, int]:
    """reconproject.json protected.hash_content / protected.hash_bytes.

    Fail-open: missing/malformed config or wrong types => defaults
    (hash_content True, hash_bytes 1048576).
    """
    snapshot = load_config_snapshot()
    hash_content, hash_bytes = True, 1 << 20
    prot = snapshot.as_dict().get("protected") or {}
    if isinstance(prot.get("hash_content"), bool):
        hash_content = prot["hash_content"]
    hb = prot.get("hash_bytes")
    if isinstance(hb, int) and hb > 0:
        hash_bytes = hb
    return hash_content, hash_bytes
