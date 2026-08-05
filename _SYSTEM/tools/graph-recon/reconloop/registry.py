"""Scanner plugin registry — drop a file in scanners/ to add code to the loop.

Auto-discovery loads scanners/ (core) only. Optional packs load from
<template_root>/packs/<name>/*.py — opt-in via the `packs` argument (CLI
--packs / reconproject.json "packs": ["yuri"]) so the core stays
project-agnostic and YURI-specific scanners ship as an optional pack.

Each load_scanners call resets the registry and returns exactly the scanners
from the requested dir(s) + packs — deterministic, no cross-call bleed.

Pack scanner modules use absolute imports (e.g. `from scanners.base import
BaseScanner`) since they do not live inside the core scanners package.
"""
from __future__ import annotations
import importlib.util, inspect, sys, types
from pathlib import Path

_REGISTRY: dict = {}


def _load_module(f: Path, pkg_dir: Path, modname: str) -> None:
    """Exec one scanner file into a fresh module; register BaseScanner/
    BaseLens subclasses whose __module__ matches modname."""
    src = f.read_text(encoding="utf-8")
    if "BaseScanner" not in src and "BaseLens" not in src:
        return  # not a scanner/lens module — silently skip (info)
    mod = types.ModuleType(modname)
    mod.__file__ = str(f)
    mod.__package__ = pkg_dir.name
    sys.modules[modname] = mod  # required: dataclass + relative imports
    try:
        exec(compile(src, str(f), "exec"), mod.__dict__)
        for _, cls in inspect.getmembers(mod, inspect.isclass):
            if hasattr(cls, "name") and hasattr(cls, "run") and cls.__module__ == modname:
                _REGISTRY[cls.name] = cls
    except Exception as e:
        print(f"[registry] skip {f.name}: {e}")


def _config_packs(template_root: Path | str | None) -> list[str]:
    """Packs declared in reconproject.json (honored when caller passes None).

    template_root may be a str or a Path — normalized here so the public
    load_scanners API accepts either (regression: a str template_root used to
    crash with TypeError at `template_root / "reconproject.json"`).
    """
    if template_root is None:
        return []
    from .config import load_reconproject
    return list(load_reconproject(Path(template_root) / "reconproject.json").get("packs") or [])


def load_scanners(scanners_dir: Path | str, template_root: Path | str | None = None,
                  packs: list[str] | None = None) -> dict:
    # M4-FIX2 (DEFECT 1, cycle 2): accept str callers for BOTH inputs — the
    # public API normalizes here so no str can reach a Path method
    # (regression: a str scanners_dir crashed with AttributeError at
    # `scanners_dir.glob`; a str template_root crashed in `_config_packs`).
    scanners_dir = Path(scanners_dir)
    if template_root is not None:
        template_root = Path(template_root)
    if template_root is not None and str(template_root) not in sys.path:
        sys.path.insert(0, str(template_root))
    _REGISTRY.clear()  # deterministic: each call returns exactly its own set
    if packs is None:
        packs = _config_packs(template_root)
    for f in sorted(scanners_dir.glob("*.py")):
        if f.name.startswith("_"):
            continue
        import importlib as _il
        try: _il.import_module(scanners_dir.name)  # register parent package for relative imports
        except Exception: pass
        _load_module(f, scanners_dir, f"scanners_{f.stem}")
    for pack in packs or []:
        pdir = template_root / "packs" / pack if template_root else Path("packs") / pack
        if not pdir.is_dir():
            print(f"[registry] pack not found: {pack} (looked in {pdir})")
            continue
        for f in sorted(pdir.glob("*.py")):
            if f.name.startswith("_"):
                continue
            _load_module(f, pdir, f"pack_{pack}_{f.stem}")
    return dict(_REGISTRY)
