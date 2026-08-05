"""reconproject.json — per-project configuration for the recon loop (stdlib-only).

Sections (all optional; missing sections fall back to built-in defaults so a
stock template behaves exactly like the pre-config engine):

  root      — project-root discovery markers (used when --root is not given)
  protected — path patterns for the protected catalog. Default-if-absent:
              when the file or this section is missing/empty, reconloop/
              protected.py falls back to its built-in heritage catalog.
              mode ("configured" | "heritage", default "configured"):
              selects configured patterns or the built-in YURI heritage set.
              hash_content (bool, default true): content-hash prefix on/off.
              Owner-authorized: hashing is allowed by the rails (location/
              type/context/hash only — a sha256 prefix is a hash, never a
              value). When false, meta_only() skips opening protected files
              entirely (stat only). hash_bytes (int, default 1048576):
              number of leading content bytes fed to the hash.
  ephemeral — per-layer stability overrides ("ephemeral" | "stable"); keys are
              scanner layer names, values override the scanner-declared
              layer_stability (ephemeral layers are excluded from the
              determinism pin and carry a freshness stamp).
  lenses    — enable/disable lens scanners + admission-threshold overrides.
              enabled: non-empty list => allowlist (only these lenses run);
              empty => all lenses run. disabled: exclusion list. admission:
              {lens_name: threshold_string} overrides the lens class default.
  review    — findings budget: max_findings_per_layer caps the deduped
              findings written per layer (excess is truncated and reported in
              findings/<layer>.review.json).
  packs     — optional scanner packs to auto-load (e.g. ["yuri"]); packs load
              from <template_root>/packs/<name>/*.py.

Discovery order: $GRAPH_RECON_CONFIG (explicit path, for tests/power users),
then <template_root>/reconproject.json. Loads fail open: a missing or
malformed config degrades to defaults — scanning must never break because of
a config typo (protected classification then falls back to the heritage
catalog).
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path

DEFAULTS: dict = {
    "root": {"markers": ["pyproject.toml", "package.json", "go.mod",
                          "Cargo.toml", "Gopkg.toml", "build.gradle", ".git"]},
    "protected": {"patterns": [],     # empty => heritage catalog fallback
                   "mode": "configured",
                   "hash_content": True,   # content-hash prefix on/off (owner-authorized)
                   "hash_bytes": 1048576}, # leading bytes hashed (first 1MiB)
    "ephemeral": {"layers": {}},
    "lenses": {"enabled": [], "disabled": [], "admission": {}},
    "review": {"max_findings_per_layer": 100},
    "packs": [],
}


def _config_candidates() -> list[Path]:
    """Deterministic discovery order: env override, then engine install root."""
    cands: list[Path] = []
    env = os.environ.get("GRAPH_RECON_CONFIG", "")
    if env:
        cands.append(Path(env))
    cands.append(Path(__file__).resolve().parent.parent / "reconproject.json")
    return cands


def _resolve(path: str | Path | None) -> Path | None:
    if path is not None:
        return Path(path)
    for c in _config_candidates():
        if c.exists():
            return c
    return None


def resolve_reconproject(path: str | Path | None = None) -> Path | None:
    """Resolve the effective config path without loading it.

    Public so one run can bind configuration once and pass the same resolved
    file to every consumer instead of re-reading ambient environment state.
    """
    return _resolve(path)


def _normalize(data: dict) -> dict:
    out: dict = {}
    for key, default in DEFAULTS.items():
        v = data.get(key, default)
        if isinstance(default, dict):
            out[key] = {**default, **v} if isinstance(v, dict) else dict(default)
        elif isinstance(default, list):
            out[key] = list(v) if isinstance(v, list) else list(default)
        else:
            out[key] = v
    return out


@dataclass(frozen=True)
class ConfigSnapshot:
    """One immutable read of the effective reconproject configuration."""

    path: Path | None
    normalized_json: str
    sha256: str

    def as_dict(self) -> dict:
        """Return a fresh copy so consumers cannot mutate retained state."""
        return json.loads(self.normalized_json)


def load_config_snapshot(path: str | Path | None = None) -> ConfigSnapshot:
    """Resolve, read, normalize, and hash config exactly once."""
    resolved = resolve_reconproject(path)
    data: dict = {}
    raw_bytes = b""
    if resolved is not None and resolved.exists():
        try:
            raw_bytes = resolved.read_bytes()
            raw = json.loads(raw_bytes.decode("utf-8"))
            if isinstance(raw, dict):
                data = raw
        except Exception:
            data = {}
    normalized_json = json.dumps(
        _normalize(data), sort_keys=True, separators=(",", ":")
    )
    digest_bytes = raw_bytes or normalized_json.encode("utf-8")
    return ConfigSnapshot(
        path=resolved,
        normalized_json=normalized_json,
        sha256=hashlib.sha256(digest_bytes).hexdigest(),
    )


def load_reconproject(path: str | Path | None = None) -> dict:
    """Load + shallow-validate reconproject.json. Never raises."""
    return load_config_snapshot(path).as_dict()


def discover_root(start: str | Path = ".", markers: list[str] | None = None) -> Path:
    """Walk up from `start` to the first directory containing any root marker.

    Deterministic; used by the CLI when --root is not explicit. Falls back to
    the deepest existing ancestor when no marker is found.
    """
    if markers is None:
        markers = DEFAULTS["root"]["markers"]
    cur = Path(start).resolve()
    if not cur.is_dir():
        cur = cur.parent
    for d in [cur, *cur.parents]:
        if any((d / m).exists() for m in markers):
            return d
    return cur
