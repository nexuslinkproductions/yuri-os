"""reconproject.json — per-project configuration for the recon loop (stdlib-only).

Sections (all optional; missing sections fall back to built-in defaults so a
stock template behaves exactly like the pre-config engine):

  root      — project-root discovery markers (used when --root is not given)
  protected — path patterns for the protected catalog. Default-if-absent:
              when the file or this section is missing/empty, reconloop/
              protected.py falls back to its built-in heritage catalog.
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
import json
import os
from pathlib import Path

DEFAULTS: dict = {
    "root": {"markers": ["pyproject.toml", "package.json", "go.mod",
                          "Cargo.toml", "Gopkg.toml", "build.gradle", ".git"]},
    "protected": {"patterns": []},   # empty => heritage catalog fallback
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


def load_reconproject(path: str | Path | None = None) -> dict:
    """Load + shallow-validate reconproject.json. Never raises."""
    resolved = _resolve(path)
    data: dict = {}
    if resolved is not None and resolved.exists():
        try:
            raw = json.loads(resolved.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                data = raw
        except Exception:
            data = {}
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
