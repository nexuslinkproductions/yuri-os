"""Node/Edge/Finding dataclasses + JSONL IO (append-only, dedup)."""
from __future__ import annotations
import json
from dataclasses import dataclass, field, asdict
from typing import Any

@dataclass
class Node:
    id: str; kind: str; props: dict = field(default_factory=dict)
    evidence: list = field(default_factory=list); src: str = ""
    def to_jsonl(self) -> str: return json.dumps(asdict(self), sort_keys=True)

@dataclass
class Edge:
    from_: str; to: str; kind: str; props: dict = field(default_factory=dict)
    evidence: list = field(default_factory=list); boundary: str = "none"
    def to_jsonl(self) -> str:
        d = asdict(self); d["from"] = d.pop("from_")
        return json.dumps(d, sort_keys=True)

@dataclass
class Finding:
    id: str; sev: str; dim: str; desc: str; evidence: list = field(default_factory=list)
    status: str = "open"; verified: bool = False; fingerprint: str = ""
    def to_jsonl(self) -> str: return json.dumps(asdict(self), sort_keys=True)

class JsonlStore:
    def __init__(self, path: str): self.path = path
    def append(self, records: list) -> int:
        seen = set()
        try:
            with open(self.path) as f: seen = {json.loads(l)["id"] for l in f if l.strip()}
        except FileNotFoundError: pass
        with open(self.path, "a") as f:
            for r in records:
                if r.id in seen: continue
                f.write(r.to_jsonl() + "\n"); seen.add(r.id)
        return len(records)
