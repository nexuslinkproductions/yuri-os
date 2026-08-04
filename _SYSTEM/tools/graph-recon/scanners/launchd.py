"""P2 port: launchd plists -> launchd_agent nodes + launchd_to_script edges (mjs L2 logic).

M2.1 fix (F-041): ProgramArguments parsing now resolves the real script path.
Previous code used args[1] which grabbed `-l` for lane-health
(plist: /bin/bash -l -c "bash .../lane-health.sh") — lane-health.sh EXISTS,
so F-041 was a scanner artifact, not a dead loop. Resolution: skip
interpreters/flags, extract paths from `-c` command strings, map repo-absolute
paths to repo-relative file ids.
"""
from __future__ import annotations
import glob, os, plistlib, re
from .base import BaseScanner, ScanResult
from reconloop.model import Node, Edge

SKIP_ARGS = {"bash", "sh", "node", "python3", "/bin/bash", "/bin/sh",
             "/usr/bin/env", "env", "/opt/homebrew/bin/node"}
CMD_RE = re.compile(r"(?:^|\s)(/[^\s]+\.(?:sh|mjs|js|py))(?=\s|$)")


def _resolve_program(args: list, ctx) -> str | None:
    """Find the script path in ProgramArguments (M2.1 F-041 fix)."""
    for a in args:
        if not a or a.startswith("-") or a in SKIP_ARGS:
            continue
        if a.startswith(("bash ", "sh ", "node ")):
            m = CMD_RE.search(a)
            a = m.group(1) if m else None
            if not a:
                continue
        root = str(ctx.root)
        if a.startswith(root + "/"):
            return a[len(root) + 1:]
        if a.startswith("/"):
            return a  # absolute outside root: keep for file layer
        return a
    return None


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
            args = pl.get("ProgramArguments", []) or []
            prog = _resolve_program(args, ctx)
            r.nodes.append(Node(id=f"launchd_agent:{label}", kind="launchd_agent",
                                props={"exec_capable": True, "exposure": "local", "auth_status": "none", "scan_state": "scanned"},
                                evidence=[f], src="launchd"))
            if prog:
                r.edges.append(Edge(from_=f"launchd_agent:{label}", to=f"file:{prog}",
                                    kind="launchd_to_script", props={}, evidence=[f], boundary="local"))
        return r
