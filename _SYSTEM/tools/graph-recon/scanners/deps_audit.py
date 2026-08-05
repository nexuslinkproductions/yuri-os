"""npm audit wrapper — network-gated (Orion-side; disabled by default)."""
from __future__ import annotations
import os, subprocess
from .base import BaseScanner, ScanResult

class DepsAuditScanner(BaseScanner):
    name = "deps_audit"; dim = "deps"
    def run(self, ctx) -> ScanResult:
        if os.environ.get("GRAPH_RECON_NET_AUDIT") != "1":
            return ScanResult(notes="network audit disabled (GRAPH_RECON_NET_AUDIT=1 to enable; Orion-side)")
        try:
            out = subprocess.run(["npm", "audit", "--omit=dev", "--json"], cwd=ctx.root, capture_output=True, text=True, timeout=180).stdout
            import json
            d = json.loads(out)
            v = d.get("metadata", {}).get("vulnerabilities", {})
            return ScanResult(notes=f"npm audit: {v}")
        except Exception as e:
            return ScanResult(notes=f"audit failed: {e}")
