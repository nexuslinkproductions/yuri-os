"""M4-W2 scaffold — `graph-recon init <target-dir>` project scaffolding.

Vendors the template engine into a NEW project directory (the README's
"copy the template into your repo" step, automated and idempotent):

  - copies reconloop/, scanners/, packs/ (engine + core scanners + optional
    packs; __pycache__/*.pyc never copied) and a pyproject.toml template,
  - writes reconproject.json — the template's default config, with
    `reconproject.json` added to root.markers so the scaffolded project is
    always root-discoverable,
  - writes a starter .gitignore (env / protected / runtime patterns).

M5-W1: installed-wheel completeness. The wheel's [tool.setuptools.data-files]
ships the FULL template — graphrecon-template/{reconloop, scanners,
pack/yuri} + graphrecon-template/pyproject.toml — and scaffold_project
sources every vendored file from the resolved template root (the installed
data-files dir when running from a wheel, the source tree when running from
a checkout), so `graph-recon init` from an installed package yields a
complete runnable project (reconloop/ + pyproject.toml included).

Idempotency contract: scaffold_project refuses to touch an existing
non-empty target unless force=True (returns/raises rather than clobbering);
with force=True the managed files are regenerated deterministically. The
target directory itself is created if missing.

M5-W3 (Athena blocker 6): the template's own tree is NEVER a valid target.
When the resolved target equals the template root (the dir containing
reconloop/) or contains it (target is an ancestor), scaffold_project raises
ScaffoldSafetyError (CLI rc 2) before touching anything — --force does not
override this guard, because force-regeneration would rmtree the engine's
own reconloop/scanners/packs.

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


class ScaffoldSafetyError(ScaffoldError):
    """Refusal: target equals or contains the template root — destructive
    even with --force (would overwrite the engine's own tree). CLI rc 2."""


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


def template_root_candidates(here: Path, prefix: Path) -> list:
    """Ordered candidate template roots (M5-W1: first with scanners/ wins).

    - source checkout: the package's parent dir (scaffold.py lives in
      reconloop/ of the checkout),
    - installed wheel data-files: setuptools installs [tool.setuptools.
      data-files] under sys.prefix (venv root) — and on some layouts under
      sys.prefix/share — plus the site-packages sibling layout.
    """
    return [
        here.parent.parent,                                # source checkout
        prefix / "graphrecon-template",                    # data-files (prefix / venv root)
        prefix / "share" / "graphrecon-template",          # data-files (share scheme)
        here.parent.parent.parent / "graphrecon-template",  # site-packages sibling
    ]


def resolve_template_root(here: Path, prefix: Path) -> Path:
    """First candidate that carries a complete template (scanners/ present);
    falls back to the first candidate."""
    candidates = template_root_candidates(here, prefix)
    return next((c for c in candidates if (c / "scanners").is_dir()),
                candidates[0])


def _template_file(template_root: Path, rel: str) -> Path | None:
    """Vendored template file location: source-tree layout
    (template_root/template/<rel>, e.g. template/pyproject.toml) preferred,
    then the data-files layout (template_root/<rel>). None when absent."""
    for cand in (template_root / "template" / rel, template_root / rel):
        if cand.is_file():
            return cand
    return None


def scaffold_project(target: str | Path, force: bool = False,
                     template_root: Path | None = None) -> dict:
    """Scaffold a new graph-recon project at `target`.

    Returns {"target": str, "files": [rel paths written]} on success.
    Raises ScaffoldError (refusal) when the target exists non-empty and
    force=False — the idempotency guard. Deterministic.

    template_root: explicit template dir (tests); None resolves it — the
    source checkout when running from one, else the installed wheel's
    graphrecon-template data-files (M5-W1: ALL vendored files are sourced
    from there, so installed-wheel init yields a complete project).
    """
    target = Path(target).resolve()
    if template_root is None:
        template_root = resolve_template_root(Path(__file__).resolve(),
                                              Path(sys.prefix))
    template_root = template_root.resolve()

    # M5-W3 (defect 6): equality/containment safety guard — scaffold must
    # never target the template's own tree. Checked BEFORE the force logic:
    # --force must not override this (regeneration would rmtree the engine's
    # own reconloop/). A descendant target (new project inside the template
    # dir) is allowed.
    if target == template_root or template_root.is_relative_to(target):
        raise ScaffoldSafetyError(
            f"refusing to scaffold into the template's own tree: target "
            f"{target} equals or contains the template root {template_root} "
            f"(init would overwrite the engine's reconloop/scanners/packs) — "
            f"choose a target outside the template; --force does not override "
            f"this guard")

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
        src = _template_file(template_root, f)
        if src is None:
            continue
        shutil.copy2(src, target / f)
        written.append(f)

    (target / "reconproject.json").write_text(
        json.dumps(scaffold_config(template_root), indent=2, sort_keys=True) + "\n")
    written.append("reconproject.json")
    (target / ".gitignore").write_text(STARTER_GITIGNORE)
    written.append(".gitignore")

    return {"target": str(target), "files": sorted(written),
            "template": str(template_root)}
