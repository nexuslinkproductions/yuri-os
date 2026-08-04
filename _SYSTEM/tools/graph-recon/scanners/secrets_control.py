"""P2 port: wraps existing secret-leak-scan control (evidence passthrough, no reimplementation)."""
from __future__ import annotations
import json, subprocess
from .base import BaseScanner, ScanResult

class SecretsControlScanner(BaseScanner):
    name = "secrets_control"; dim = "control"
    def run(self, ctx) -> ScanResult:
        script = ctx.root / "_SYSTEM" / "Scripts" / "secret-leak-scan.mjs"
        if not script.exists(): return ScanResult(notes="secret-leak-scan.mjs absent")
        try:
            out = subprocess.run(["node", str(script)], cwd=ctx.root, capture_output=True, text=True, timeout=120).stdout
            data = json.loads(out)
            return ScanResult(notes=f"secret-leak-scan: ok={data.get('ok')} findings={len(data.get('findings', []))} scanned={data.get('scanned_files')}")
        except Exception as e:
            return ScanResult(notes=f"secret-leak-scan failed: {e}")
