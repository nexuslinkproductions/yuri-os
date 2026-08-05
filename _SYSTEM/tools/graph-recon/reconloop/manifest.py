"""manifest.json — items, statuses, convergence block."""
from __future__ import annotations
import json
from pathlib import Path

DEFAULT = {"name": "graph-recon", "version": 1, "convergence": {"requiredCleanCycles": 2, "cleanCycles": 0}, "items": []}

def load(path: Path) -> dict:
    try: return json.loads(path.read_text())
    except Exception: return dict(DEFAULT)

def save(path: Path, m: dict) -> None:
    path.write_text(json.dumps(m, indent=2, sort_keys=True))
