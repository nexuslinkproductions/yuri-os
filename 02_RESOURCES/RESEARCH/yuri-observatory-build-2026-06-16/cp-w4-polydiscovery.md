# CONTROL PACKET — W4 Polymarket market discovery (glm-5.1 lane)

GOAL: Build a READ-ONLY helper that discovers the most active/liquid CURRENT Polymarket markets and returns them in the exact shape the orchestrator's `DEFAULT_CONFIG.polymarkets` expects: `[{ tokenId, question }]`. The orchestrator already has a full `runPolymarketCycle(tokenId, question, snap)` — it just needs a live list of token IDs to track. This helper supplies that list.

GROUND FIRST (read these — do NOT guess signatures):
1. `_SYSTEM/Scripts/alpha-factor-library/adapters/polymarket-adapter.mjs` — match its EXACT style: `@capability` header, injectable `setHttpGet(fn)`, SSRF guard (ALLOWED_HOSTS), error classes, `parseNum`. The Gamma API host is `gamma-api.polymarket.com` (markets/events metadata, public, no-auth). The CLOB host is `clob.polymarket.com`. Confirm the existing adapter's allowlist + reuse that host set; ADD gamma-api host if not present.
2. `_SYSTEM/Scripts/alpha-factor-library/observatory/orchestrator.mjs` — read `runPolymarketCycle` (≈ line 425) and `DEFAULT_CONFIG` (≈ line 544) to confirm the `{tokenId, question}` shape EXACTLY. `tokenId` is the CLOB ERC1155 token id (the YES/NO outcome token), `question` is the human market question string.
3. `02_RESOURCES/RESEARCH/afl-grounding-venue-apis-2026-06-13.md` — Polymarket grounding (py-clob archived → raw CLOB/Gamma; L0 no-auth reads).
4. `00-MASTER-BRIEF.md` §4 constraints.

TARGET FILE (new): `_SYSTEM/Scripts/alpha-factor-library/adapters/polymarket-discovery.mjs`

REQUIREMENTS / INV CONTRACT:
- READ-ONLY (INV-1), NO key reads (INV-2), live reads OK (INV-3).
- Injectable `setHttpGet(fn)` (default node:https); ALL network through it. SSRF allowlist (gamma-api.polymarket.com + clob.polymarket.com only). `parseNum` at boundaries.
- `discoverMarkets(opts?) -> Promise<Array<{ tokenId, question, liquidity?, volume?, endDate? }>>` — query the Gamma markets endpoint for ACTIVE, non-closed, liquidity-sorted markets, take the top N (opts.limit default 5), and for each extract the CLOB token id for one outcome (YES) + the question text. Filter out resolved/closed/archived markets. Sort by liquidity (or volume) desc.
- A pure `mapMarket(raw) -> {tokenId, question, liquidity, volume, endDate}` exported for unit testing.
- Pure ESM, node built-ins only, NO new npm dep.

ACCEPTANCE:
- `node --check` passes.
- `--test` with INJECTED mock httpGet (canned Gamma JSON) exits 0, asserting: returns an array of `{tokenId, question}`, closed/resolved markets are filtered out, sorted by liquidity desc, SSRF denies a private host, limit is honored.
- Self-test prints `N pass, 0 fail`.

TEST CMD: `node _SYSTEM/Scripts/alpha-factor-library/adapters/polymarket-discovery.mjs --test`
ROLLBACK: delete the new file.
AFTER WRITING: write the file, run node --check + --test yourself, report PASS/FAIL + exact counts + the Gamma endpoint/query you used + a ≤8-line summary. DO NOT git commit. Your final message IS the result.
