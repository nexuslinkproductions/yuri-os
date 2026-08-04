"""Scanner plugin registry — drop a file in scanners/ to add code to the loop."""
from __future__ import annotations
import importlib.util, inspect, sys, types
from pathlib import Path

_REGISTRY: dict = {}

def load_scanners(scanners_dir: Path, template_root: Path | None = None) -> dict:
    if template_root is not None and str(template_root) not in sys.path:
        sys.path.insert(0, str(template_root))
    for f in sorted(scanners_dir.glob("*.py")):
        if f.name.startswith("_"):
            continue
        import importlib as _il
        try: _il.import_module(scanners_dir.name)  # register parent package for relative imports
        except Exception: pass
        src = f.read_text(encoding="utf-8")
        if "BaseScanner" not in src:
            continue  # not a scanner module — silently skip (info)
        mod = types.ModuleType(f"scanners_{f.stem}")
        mod.__file__ = str(f)
        mod.__package__ = scanners_dir.name
        sys.modules[mod.__name__] = mod  # required: dataclass + relative imports
        try:
            exec(compile(src, str(f), "exec"), mod.__dict__)
            for _, cls in inspect.getmembers(mod, inspect.isclass):
                if hasattr(cls, "name") and hasattr(cls, "run") and cls.__module__ == f"scanners_{f.stem}":
                    _REGISTRY[cls.name] = cls
        except Exception as e:
            print(f"[registry] skip {f.name}: {e}")
    return dict(_REGISTRY)
