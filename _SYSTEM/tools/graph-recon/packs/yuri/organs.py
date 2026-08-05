# M4-W1: moved to packs/yuri/ — YURI-OS-specific scanner, loaded via
# --packs yuri or "packs": ["yuri"] in reconproject.json (absolute imports).
from __future__ import annotations
from pathlib import Path
from scanners.base import BaseScanner, ScanResult
from reconloop.model import Node

ORGANS = ["energy-tick-core", "neuron-loop", "sentinel", "observatory-gather", "eot-refresh",
          "lane-health", "learning-score-weekly", "memory-governor", "launch-readiness",
          "independence-check", "task-queue-runner", "yuri-sentinel"]

class OrgansScanner(BaseScanner):
    name = "organs"; dim = "static"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        kernel = ctx.root / "_SYSTEM" / "OS_KERNEL"
        if kernel.exists():
            for f in sorted(kernel.glob("*.py")) + sorted((kernel / "syscalls").glob("*")):
                r.nodes.append(Node(id=f"governance_organ:{f.name}", kind="governance_organ",
                                    props={"layer": "OS_KERNEL", "scan_state": "pending"},
                                    evidence=[str(f)], src="organs"))
        for o in ORGANS:
            r.nodes.append(Node(id=f"governance_organ:{o}", kind="governance_organ",
                                props={"layer": "launchd-or-script", "scan_state": "pending"},
                                evidence=["launchd/Scripts inventory"], src="organs"))
        return r
