# CONTROL PACKET — polymarket-adapter

GOAL: Author a complete, production-quality READ-ONLY Polymarket adapter for the YURI AFL organ (prediction-market data + advisory order bodies).

GROUND FIRST (read in order):
1. 02_RESOURCES/RESEARCH/yuri-observatory-build-2026-06-16/00-MASTER-BRIEF.md — mission + §3 adapter source-of-truth + §4 hard constraints (BINDING).
2. 02_RESOURCES/RESEARCH/afl-grounding-venue-apis-2026-06-13.md §2 — Polymarket CLOB/Gamma, py-clob-client ARCHIVED, L0/L1/L2 auth, neg-risk, EIP-712+HMAC, fee.
3. 02_RESOURCES/RESEARCH/afl-venue-adapter-spec-2026-06-14.md — INV-1..9 contract.
4. _SYSTEM/Scripts/alpha-factor-library/data-quality-gate.mjs — canonical bar {t,open,high,low,close,volume}.

TARGET FILE: _SYSTEM/Scripts/alpha-factor-library/adapters/polymarket-adapter.mjs (write_file).

REQUIREMENTS:
- Exports: getMarkets, getMarketBook, getPrice, getTrades, getFeeRate, getPositions, buildOrder, mapMarket, mapBook, reconstructBars, setHttpGet, parseNum, hasCreds, MappingError, MissingCredentialError, VenueApiError, SsrfError.
- Write against the RAW CLOB HTTP protocol (clob.polymarket.com) + read-only L0 data via data-api.polymarket.com (py-clob-client is ARCHIVED — do NOT use it).
- getTrades: window by time; offset pagination is capped on hot markets — handle it. reconstructBars: build canonical OHLCV via VWAP time-bucketing from trades; parseNum at boundary, parseNum('')→null.
- getFeeRate: price-dependent fee = ceil(c*rate*p*(1-p)), peaks at p=0.5 (document the constant).
- Auth levels: L0 read = no auth; authed exports (getPositions/buildOrder) no-op/throw MissingCredentialError if creds absent. neg_risk flag governs the exchange contract — expose it.
- INV-1: buildOrder returns the body only, NEVER signs+POSTs a live order. INV-2: NO key reads from .env/files (env vars only). INV-5: US-geo read-only guard field (geoGate) per spec.
- httpGet injectable via setHttpGet (offline-testable); SSRF guard (deny private/loopback/link-local/metadata; allow ONLY clob.polymarket.com + data-api.polymarket.com + gamma-api.polymarket.com). Fail-closed on malformed.
- Pure ESM. `node --check` must pass.

ACCEPTANCE: node --check passes; all exports present; reconstructBars emits canonical chronological bars; getFeeRate peaks at p=0.5; SSRF denies a private host; buildOrder never POSTs; zero secret reads.

AFTER WRITING: run `node --check` on the file; report PASS/FAIL + ≤6-line summary + any live-shape mismatch vs spec. Do NOT git commit.
