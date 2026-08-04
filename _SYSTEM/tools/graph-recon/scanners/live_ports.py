"""P2 port: lsof/ps -> port+process nodes, network_conn edges (mjs L1 logic)."""
from __future__ import annotations
import subprocess
from .base import BaseScanner, ScanResult
from reconloop.model import Node, Edge

class LivePortsScanner(BaseScanner):
    name = "live_ports"; dim = "live"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        try:
            out = subprocess.run(["lsof", "-iTCP", "-sTCP:LISTEN", "-n", "-P"],
                                 capture_output=True, text=True, timeout=30).stdout
        except Exception as e:
            return ScanResult(notes=f"lsof unavailable: {e}")
        seen = set()
        for line in out.splitlines()[1:]:
            parts = line.split()
            if len(parts) < 9: continue
            proc, pid, addr = parts[0], parts[1], parts[8]
            port = addr.rsplit(":", 1)[-1]
            exposure = "lan" if addr.startswith("*") else "local"
            nid = f"port:{port}"
            if nid in seen: continue
            seen.add(nid)
            r.nodes.append(Node(id=nid, kind="port",
                                props={"exposure": exposure, "auth_status": "unknown", "scan_state": "scanned"},
                                evidence=[f"lsof {proc} pid={pid} {addr}"], src="live_ports"))
            r.edges.append(Edge(from_=f"process:{proc}@{pid}", to=nid, kind="network_conn",
                                props={"bind": addr}, evidence=["lsof"], boundary=exposure))
        return r
