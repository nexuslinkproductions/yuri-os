"""P2 port: skills/route/hook/capability registries -> registry nodes (E3 logic)."""
from __future__ import annotations
import json
from .base import BaseScanner, ScanResult
from reconloop.model import Node

REGISTRIES = ["_SYSTEM/capabilities.json", "_SYSTEM/skill-hash-registry.json",
              "_SYSTEM/config/provider-route-registry.json", "_SYSTEM/config/yuri-hook-registry.json",
              ".agents/agent-index.json", "_SYSTEM/organ-guides.json"]

class RegistriesScanner(BaseScanner):
    name = "registries"; dim = "static"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        for rel in REGISTRIES:
            p = ctx.abs(rel)
            if not p.exists(): continue
            try: data = json.loads(p.read_text())
            except Exception: continue
            n = len(data) if isinstance(data, list) else len(data.keys())
            r.nodes.append(Node(id=f"registry:{rel}", kind="registry_entry",
                                props={"entries": n, "scan_state": "pending"}, evidence=[rel], src="registries"))
        return r
