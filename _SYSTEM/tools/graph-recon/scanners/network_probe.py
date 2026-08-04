"""Optional live probes — config-gated (scan_live=1). Probes LAN-reachable services read-only."""
from __future__ import annotations
import os, urllib.request
from .base import BaseScanner, ScanResult
from reconloop.model import Node

PORTS = [8471, 8472, 8777, 11434]

class NetworkProbeScanner(BaseScanner):
    name = "network_probe"; dim = "live"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        if os.environ.get("GRAPH_RECON_LIVE_PROBE") != "1":
            return ScanResult(notes="probes disabled (GRAPH_RECON_LIVE_PROBE=1 to enable)")
        try:
            import socket
            host = socket.gethostbyname(socket.gethostname())
        except Exception: host = "127.0.0.1"
        for port in PORTS:
            try:
                with urllib.request.urlopen(f"http://{host}:{port}/", timeout=3) as resp:
                    code = resp.status
            except Exception as e:
                code = getattr(e, "code", "unreachable")
            r.nodes.append(Node(id=f"probe:{port}", kind="network_endpoint",
                                props={"code": code, "scan_state": "scanned"}, evidence=[f"curl {host}:{port}"], src="network_probe"))
        return r
