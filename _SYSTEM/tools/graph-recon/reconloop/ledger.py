"""Findings fingerprint/dedup/severity."""
from __future__ import annotations
import hashlib, json
from .model import Finding

SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}

def fingerprint(f: Finding) -> str:
    canon = json.dumps({"sev": f.sev, "dim": f.dim, "desc": f.desc[:200]}, sort_keys=True)
    return hashlib.sha256(canon.encode()).hexdigest()[:16]

def dedup(findings: list[Finding]) -> list[Finding]:
    seen = set(); out = []
    for f in findings:
        if f.fingerprint in seen: continue
        seen.add(f.fingerprint); out.append(f)
    return sorted(out, key=lambda f: (SEV_ORDER.get(f.sev, 9), f.id))
