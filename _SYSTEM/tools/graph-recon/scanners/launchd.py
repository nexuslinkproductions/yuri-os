"""P2 port: launchd plists -> launchd_agent nodes + launchd_to_script edges (mjs L2 logic)."""
from __future__ import annotations
import glob, os, plistlib
from .base import BaseScanner, ScanResult
from reconloop.model import Node, Edge

class LaunchdScanner(BaseScanner):
    name = "launchd"; dim = "live"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        for f in sorted(glob.glob(os.path.expanduser("~/Library/LaunchAgents/com.yuri-os-musubi.*.plist"))):
            try:
                with open(f, "rb") as fh: pl = plistlib.load(fh)
            except Exception:
                continue
            label = pl.get("Label", os.path.basename(f))
            args = pl.get("ProgramArguments", [])
            prog = args[1] if len(args) > 1 else (args[0] if args else "")
            r.nodes.append(Node(id=f"launchd_agent:{label}", kind="launchd_agent",
                                props={"exec_capable": True, "exposure": "local", "auth_status": "none", "scan_state": "scanned"},
                                evidence=[f], src="launchd"))
            if prog:
                r.edges.append(Edge(from_=f"launchd_agent:{label}", to=f"file:{prog}",
                                    kind="launchd_to_script", props={}, evidence=[f], boundary="local"))
        return r
