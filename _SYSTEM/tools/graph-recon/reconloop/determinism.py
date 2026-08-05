"""sha256 pin, verify, regen contract."""
from __future__ import annotations
import hashlib, json
from pathlib import Path

def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()

def pin(graph_path: Path, pin_path: Path) -> str:
    s = sha256_file(graph_path)
    pin_path.write_text(s + "\n")
    return s

def verify(graph_path: Path, pin_path: Path) -> bool:
    try: return sha256_file(graph_path) == pin_path.read_text().strip()
    except FileNotFoundError: return False
