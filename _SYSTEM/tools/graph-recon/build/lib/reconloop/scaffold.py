"""M4-W2 scaffold — `graph-recon init <target-dir>` project scaffolding.

Vendors the template engine into a NEW project directory (the README's
"copy the template into your repo" step, automated and idempotent):

  - copies reconloop/, scanners/, packs/ (engine + core scanners + optional
    packs; __pycache__/*.pyc never copied) and pyproject.toml,
  - writes reconproject.json — the template's default config, with
    `reconproject.json` added to root.markers so the scaffolded project is
    always root-discoverable,
  - writes a starter .gitignore (env / protected / runtime patterns).

Idempotency contract: scaffold_project refuses to touch an existing
non-empty target unless force=True (returns/raises rather than clobbering);
with force=True the managed files are regenerated deterministically. The
target directory itself is created if missing.

All content is deterministic: no timestamps, no PIDs, sorted key JSON.
"""
from __future__ import annotations
import json
import shutil
import sys
from pathlib import Path

# Starter .gitignore — env/protected/runtime patterns aligned with the
# reconproject.json protected catalog (secrets never reach git even if the
# read-only guards are bypassed by other tooling).
STARTER_GITIGNORE = """\
# graph-recon scaffold — starter ignore (env / protected / runtime)
# extend for your project. protected.patterns in reconproject.json is the
# read-only classification; this file keeps the same classes out of git.

# env / secrets
.env
.env.*
!.env.example
!.env.sample
secrets.env
credentials.json
auth.json
service-account*.json
*.pem
*.key
*.p12
*.pfx

# deps / caches / runtime data
node_modules/
.cache/
data/
runtime/
__pycache__/
*.pyc

# graph-recon outputs (regenerable)
out/
findings/
"""

# dirs copied wholesale (excluding __pycache__ / *.pyc)
_COPIED_DIRS = ("reconloop", "scanners", "packs")
# files copied wholesale
_COPIED_FILES = ("pyproject.toml",)
# files regenerated from the template config (never copied verbatim)
_GENERATED = ("reconproject.json", ".gitignore")


class ScaffoldError(RuntimeError):
    """Refusal: target exists non-empty and force=False."""


def _ignore_pycache(directory: str, names: list) -> set:
    return {n for n in names
            if n == "__pycache__" or n.endswith(".pyc")}


def scaffold_config(template_root: Path) -> dict:
    """Project reconproject.json: template defaults + self root marker."""
    from .config import load_reconproject, DEFAULTS  # local import (no cycle)
    cfg = dict(load_reconproject(template_root / "reconproject.json"))
    markers = list((cfg.get("root") or {}).get("markers")
                   or DEFAULTS["root"]["markers"])
    if "reconproject.json" not in markers:
        markers = sorted(set(markers) | {"reconproject.json"})
    cfg["root"] = {"markers": markers}
    return cfg


def scaffold_project(target: str | Path, force: bool = False) -> dict:
    """Scaffold a new graph-recon project at `target`.

    Returns {"target": str, "files": [rel paths written]} on success.
    Raises ScaffoldError (refusal) when the target exists non-empty and
    force=False — the idempotency guard. Deterministic.
    """
    target = Path(target).resolve()
    # Template root resolution: when running from an installed wheel, the
    # scaffold sources live in data-files (graphrecon-template at sys.prefix
    # root for venvs — setuptools installs data-files to sys.prefix); when
    # running from a source checkout, they are the package's parent dir.
    # M4-W5 fix: installed-wheel init previously copied only reconloop/ and
    # produced a project with 0 scanners (scanners/ + packs/ absent from wheel).
    here = Path(__file__).resolve()
    candidates = [
        here.parent.parent,                                  # source checkout
        Path(sys.prefix) / "graphrecon-template",            # venv data-files
        here.parent.parent.parent / "graphrecon-template",   # site-packages sibling
    ]
    template_root = next((c for c in candidates if (c / "scanners").is_dir()), candidates[0])

    if target.exists() and not target.is_dir():
        raise ScaffoldError(f"refusing to scaffold: {target} exists and is not a directory")
    if target.exists() and any(target.iterdir()) and not force:
        raise ScaffoldError(
            f"refusing to overwrite non-empty {target} (pass --force to regenerate)")

    target.mkdir(parents=True, exist_ok=True)
    written: list[str] = []

    for d in _COPIED_DIRS:
        src = template_root / d
        if not src.is_dir():
            continue
        dst = target / d
        if dst.exists():
            shutil.rmtree(dst)  # force-mode regeneration (deterministic)
        shutil.copytree(src, dst, ignore=_ignore_pycache)
        written.append(d)
    for f in _COPIED_FILES:
        src = template_root / f
        if src.exists():
            shutil.copy2(src, target / f)
            written.append(f)

    (target / "reconproject.json").write_text(
        json.dumps(scaffold_config(template_root), indent=2, sort_keys=True) + "\n")
    written.append("reconproject.json")
    (target / ".gitignore").write_text(STARTER_GITIGNORE)
    written.append(".gitignore")

    return {"target": str(target), "files": sorted(written),
            "template": str(template_root)}
