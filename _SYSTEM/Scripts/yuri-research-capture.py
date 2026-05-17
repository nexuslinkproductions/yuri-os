#!/usr/bin/env python3
# yuri-research-capture.py
# advisory_only=true | local_truth_claim=false
# Lane: P1-SCRAPLING-INTEGRATION
#
# Scrapling-based capture with tiered escalation matching _SYSTEM/yuri-token-ops.md:
#   T1 (Fetcher) — static HTTP, no JS, lowest cost
#   T2 (PlayWrightFetcher) — full browser, JS execution, medium cost
#   T3 (StealthyFetcher) — stealth/Cloudflare bypass, highest cost (unverified)
# Output conforms to _SYSTEM/yuri-evidence-pack-schema.md

from scrapling.fetchers import Fetcher, PlayWrightFetcher, StealthyFetcher
import json, hashlib, sys
from datetime import datetime, timezone

TIER_MAP = {
    "t1": lambda url: Fetcher.get(url),
    "t2": lambda url: PlayWrightFetcher.fetch(url, network_idle=True, timeout=30000),
    "t3": lambda url: StealthyFetcher.fetch(url, headless=True, solve_cloudflare=True),
}

def capture(url, tier="t1", escalate=True, source_type="unknown"):
    """
    Capture a URL using Scrapling with optional tier escalation.

    Per _SYSTEM/yuri-token-ops.md:
    - T1 (static Fetcher) is the default.
    - escalate=True auto-escalates T1->T2->T3 on failure.
    - Each tier raises token cost (JS rendering, stealth headers).

    Returns dict conforming to _SYSTEM/yuri-evidence-pack-schema.md
    for browser/HTML evidence packs.
    """
    tiers = ["t1", "t2", "t3"] if escalate else [tier]
    page = None
    used_tier = tier
    for t in tiers[tiers.index(tier):]:
        try:
            page = TIER_MAP[t](url)
            used_tier = t
            if page and page.status == 200:
                break
        except Exception:
            if t == tiers[-1]:
                raise
            continue

    body_text = page.get_all_text(ignore_tags=("script", "style")) if page else ""

    return {
        "url": url,
        "content_hash": hashlib.sha256(body_text.encode()).hexdigest()[:16],
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "advisory_only": True,
        "local_truth_claim": False,
        "ingestion_status": "REFERENCE_ONLY",
        "source_type": source_type,
        "capture_method": "scrapling",
        "source_sanitization": "stripped_scripts",
        "fetcher_tier": used_tier,
        "status": page.status if page else 0,
        "body_text": body_text,
        "browser_used": used_tier in ("t2", "t3"),
        "token_cost_estimate": len(body_text),
    }

if __name__ == "__main__":
    url = sys.argv[1]
    tier = sys.argv[2] if len(sys.argv) > 2 else "t1"
    source_type = sys.argv[3] if len(sys.argv) > 3 else "unknown"
    result = capture(url, tier=tier, escalate=True, source_type=source_type)
    print(json.dumps(result, indent=2, ensure_ascii=False))
