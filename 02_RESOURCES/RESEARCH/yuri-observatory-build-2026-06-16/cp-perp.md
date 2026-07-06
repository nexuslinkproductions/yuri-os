# CONTROL PACKET — perp-adapter

GOAL: Author a complete, production-quality READ-ONLY crypto perpetuals adapter (funding / open-interest / basis) for the YURI AFL organ. Feeds the crypto-native factors (perp-funding, price-OI quadrant, basis-term-structure).

GROUND FIRST (read in order):
1. 02_RESOURCES/RESEARCH/yuri-observatory-build-2026-06-16/00-MASTER-BRIEF.md — mission + §4 hard constraints (BINDING).
2. 02_RESOURCES/RESEARCH/afl-venue-adapter-spec-2026-06-14.md — INV-1..9 contract.
3. _SYSTEM/Scripts/alpha-factor-library/afl-crypto-factors-2026-06-14.json — the crypto factors that consume funding_rate / open_interest / basis (match their data_inputs naming).
4. _SYSTEM/Scripts/alpha-factor-library/data-quality-gate.mjs — canonical bar shape for any OHLCV-shaped output.

TARGET FILE: _SYSTEM/Scripts/alpha-factor-library/adapters/perp-adapter.mjs (write_file).

REQUIREMENTS:
- Exports: getFunding, getOpenInterest, getBasis, getMarkets, mapFunding, mapOpenInterest, annualizeFunding, setHttpGet, parseNum, hasCreds, VenueApiError, MappingError, SsrfError.
- Target a public perp venue REST (pick a keyless one with stable public funding/OI endpoints, e.g. a major CEX public API) OR accept a CCXT-shaped injected interface — keep HTTP injectable via setHttpGet so it is offline-testable and venue-swappable.
- annualizeFunding: APR = rate * periods_per_year (1095 for 8h funding). Document the period assumption; expose periods_per_year as a param.
- getBasis: (perp_price - spot_price)/spot_price; accept spot via injected getter or param (do NOT hard-couple to the coinbase adapter — pass it in).
- parseNum at boundary (wire strings), parseNum('')→null. Fail-closed on malformed (VenueApiError/MappingError).
- INV-1: no order path at all (read-only). INV-2: NO key reads (public endpoints only; if a venue needs a key, gate it behind env + hasCreds and no-op without).
- SSRF guard: deny private/loopback/link-local/metadata; allow ONLY the explicit public venue host(s) you choose.
- Pure ESM. `node --check` must pass.

ACCEPTANCE: node --check passes; all exports present; annualizeFunding correct for 8h (×1095); getBasis sign correct (perp>spot → positive); SSRF denies a private host; zero secret reads; output field names match the crypto factors' data_inputs.

AFTER WRITING: run `node --check` on the file; report PASS/FAIL + ≤6-line summary + which public venue you chose + any shape caveat. Do NOT git commit.
