# CONTROL PACKET — coinbase-adapter

GOAL: Author a complete, production-quality READ-ONLY Coinbase Advanced Trade market-data adapter for the YURI AFL organ. Replace the 7-line stub.

GROUND FIRST (read in order, you have read/grep tools):
1. 02_RESOURCES/RESEARCH/yuri-observatory-build-2026-06-16/00-MASTER-BRIEF.md — mission + §3 adapter source-of-truth + §4 hard constraints (BINDING).
2. 02_RESOURCES/RESEARCH/afl-grounding-venue-apis-2026-06-13.md §1 — current Coinbase endpoints, Ed25519 JWT, rate-limit headers, candle ordering.
3. 02_RESOURCES/RESEARCH/afl-venue-adapter-spec-2026-06-14.md — the INV-1..9 contract.
4. _SYSTEM/Scripts/alpha-factor-library/data-quality-gate.mjs — the canonical bar shape getCandles MUST emit: {t:ms-epoch, open, high, low, close, volume}.

TARGET FILE: _SYSTEM/Scripts/alpha-factor-library/adapters/coinbase-adapter.mjs (write_file with overwrite:true).

REQUIREMENTS:
- Exports (preserve the stub's @exports): getProducts, getCandles, getTicker, getOrderBook, getAccounts, buildOrder, mapProduct, mapCandle, mapBook, makeJwt, parseRateLimit, setHttpGet, parseNum, hasCreds, MappingError, MissingCredentialError, VenueApiError, SsrfError.
- KEYLESS market-data path: getCandles/getTicker/getOrderBook work with NO credentials against `api.coinbase.com/api/v3/brokerage/market/...`.
- getCandles: REVERSE newest-first → chronological (else data-quality-gate non-monotone trip); map each row to the canonical bar via parseNum (wire values are strings); parseNum('')→null.
- httpGet injectable via setHttpGet (offline-testable); default uses node:https. Do NOT depend on undici-only APIs.
- SSRF guard (SsrfError): deny private/loopback/link-local/169.254.169.254; allow ONLY api.coinbase.com (+ the public WS host if you expose WS).
- INV-1: buildOrder returns the request BODY only, NEVER POSTs. INV-2: NO key reads from .env/files — Ed25519 key + key-name from env vars only inside makeJwt; authed exports throw MissingCredentialError when creds absent (hasCreds=false). INV-6: parseNum at the mapping boundary. Fail-closed on malformed responses (throw VenueApiError/MappingError).
- parseRateLimit reads x-ratelimit-* response headers dynamically (NOT a fixed 30/s).
- Pure ESM (import). `node --check` must pass.

ACCEPTANCE: node --check passes; all declared exports present; getCandles emits canonical bars in chronological order; SSRF denies a private host; buildOrder never POSTs; zero .env/secret reads.

AFTER WRITING: run `node --check _SYSTEM/Scripts/alpha-factor-library/adapters/coinbase-adapter.mjs` yourself; report PASS/FAIL + a ≤6-line summary of what you built + any live-shape mismatch vs the spec. Do NOT git commit.
