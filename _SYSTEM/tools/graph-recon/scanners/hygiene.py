"""P3 NEW: hygiene dim — crontab, dotfiles, unix sockets, symlink inventory."""
from __future__ import annotations
import glob, os, subprocess
from .base import BaseScanner, ScanResult
from reconloop.model import Node

class HygieneScanner(BaseScanner):
    name = "hygiene"; dim = "hygiene"
    def run(self, ctx) -> ScanResult:
        r = ScanResult()
        # crontab
        try:
            out = subprocess.run(["crontab", "-l"], capture_output=True, text=True, timeout=10)
            if out.returncode == 0:
                lines = [l for l in out.stdout.splitlines() if l.strip() and not l.startswith("#")]
                r.nodes.append(Node(id="hygiene:crontab", kind="layer", props={"entries": len(lines), "scan_state": "scanned"},
                                    evidence=["crontab -l"], src="hygiene"))
        except Exception: pass
        # dotfiles in repo root (literal ~ and bash:cd ~ artifacts)
        for d in ["~", "bash:cd ~"]:
            p = ctx.root / d
            if p.exists():
                r.nodes.append(Node(id=f"hygiene:dotdir:{d}", kind="file",
                                    props={"note": "literal dir (shell artifact)", "scan_state": "scanned"},
                                    evidence=[f"ls {d}"], src="hygiene"))
        # unix sockets
        try:
            out = subprocess.run(["lsof", "-U"], capture_output=True, text=True, timeout=30).stdout
            socks = set()
            for line in out.splitlines()[1:]:
                parts = line.split()
                if len(parts) >= 9: socks.add(parts[8])
            r.nodes.append(Node(id="hygiene:unix-sockets", kind="layer", props={"count": len(socks), "scan_state": "scanned"},
                                evidence=["lsof -U"], src="hygiene"))
        except Exception: pass
        # symlink inventory in repo (top-level only, bounded)
        symlinks = [str(p) for p in ctx.root.iterdir() if p.is_symlink()]
        r.nodes.append(Node(id="hygiene:symlinks", kind="layer", props={"count": len(symlinks), "scan_state": "scanned"},
                            evidence=[", ".join(symlinks[:10])], src="hygiene"))
        return r
