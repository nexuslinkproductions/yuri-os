# AFL Venue API Grounding — 2026-06-13

**Phase:** Pre-Phase-3 (venue adapter design verification)
**Sources:** coinbase-advanced-py@main, py-clob-client@main, Polymarket py-sdk@main, polymarket.com/fees
**Method:** Local xref first → GitHub API raw source → WebFetch for fee schedule

---

## 1. Coinbase Advanced Trade API — Current State

### Auth (DESIGN ASSUMPTION: PARTLY STALE)

Design §5.1 says "EC private key + key name, JWT-signed."
Current reality (verified from `coinbase/jwt_generator.py` main branch):

- **Ed25519 is now the recommended key type.** EC/ECDSA (ES256) still works but raises an active
  `UserWarning`: *"Ed25519 is the recommended key type. Consider switching at portal.cdp.coinbase.com"*
- JWT payload: `sub=key_name`, `iss="cdp"`, `nbf=now`, `exp=now+120s`, `uri="METHOD host/path"`
- JWT header: `kid=key_name`, `nonce=hex_random`
- Auth header: `Authorization: Bearer <JWT>` on every authenticated request
- Keys created at `portal.cdp.coinbase.com` (CDP portal) — the design references `cloud.coinbase.com`
  which is the legacy URL; CDP portal is current.

**Action:** Update adapter to prefer Ed25519 key loading; emit warning if EC key detected.

### REST Endpoints

- Base URL: `api.coinbase.com`, prefix `/api/v3/brokerage` — MATCHES design.
- Endpoint paths match design: `/products`, `/products/{id}/candles`, `/market_book`, `/orders`.

### WebSocket

- Public: `wss://advanced-trade-ws.coinbase.com`
- Auth (user): `wss://advanced-trade-ws-user.coinbase.com`
- Channels confirmed live (from `coinbase/constants.py`):
  `heartbeats`, `candles`, `market_trades`, `status`, `ticker`, `ticker_batch`, `level2`,
  `user`, `futures_balance_summary`
- Auth-required channels: `user`, `futures_balance_summary` — MATCHES design.

### Rate Limits

- The design states "30 req/s REST." The SDK does NOT hardcode a numeric rate limit.
- Rate limit values are returned in response headers: `x-ratelimit-limit`,
  `x-ratelimit-remaining`, `x-ratelimit-reset` (per-endpoint, per-key-tier).
- The adapter should read these headers dynamically rather than assuming 30 req/s for all
  endpoints. Some endpoints have different limits.

**Action:** Implement dynamic rate limit tracking from response headers, not a fixed 30 req/s token bucket.

---

## 2. Polymarket CLOB + Gamma API — Current State

### SDK DEPRECATED (DESIGN ASSUMPTION: WRONG)

The `py-clob-client` the design implicitly references was **archived 2026-05-11** (commit `387b8359`):
> "no longer functional, migrate to py-sdk: https://github.com/Polymarket/py-sdk"

The new `polymarket-client` (py-sdk) is in **beta** with a different unified API surface.
The CLOB protocol itself at `clob.polymarket.com` is still live; only the client library changed.

**Action:** The adapter must be written against the raw CLOB HTTP protocol (or new py-sdk beta),
NOT the archived py-clob-client. Verify py-sdk auth flow before Phase 3.

### Auth Levels (protocol still valid, confirmed from archived client source)

Three levels, confirmed from `headers.py` and `constants.py`:

| Level | What | Headers required |
|-------|------|-----------------|
| L0 | Read-only, no auth | None |
| L1 | Wallet ownership proof | `POLY_ADDRESS`, `POLY_SIGNATURE` (EIP-712), `POLY_TIMESTAMP`, `POLY_NONCE` |
| L2 | Full trading | L1 headers + `POLY_API_KEY`, `POLY_PASSPHRASE` (HMAC-signed per request) |

EIP-712 domain: `ClobAuthDomain` v1, signed message: `"This message attests that I control the given wallet"`.
L2 uses HMAC-SHA256 over `timestamp + method + path + body`.

Design §5.2 says "Polygon private key (EOA) signs orders via EIP-712" — CORRECT for L1.
L2 also requires HMAC — design omits this distinction.

### Chain

- Polygon mainnet: chain ID 137 — MATCHES design.
- Amoy testnet: chain ID 80002 (formerly Mumbai 80001 — if design references 80001, that is stale).
- Exchange contract (mainnet): `0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E`
- Neg-risk exchange (mainnet): `0xC5d563A36AE78145C45a50134d48A1215220f80a` — NEW, not in design.

### Neg-Risk Markets (NOT IN DESIGN)

A `neg_risk` boolean flag now governs which exchange contract is used. Neg-risk markets
(where YES on one outcome = NO on another) use a separate contract. The adapter must handle
this routing or it will send orders to the wrong contract for neg-risk markets.

**Action:** Add `neg_risk` field to `polymarket-adapter.mjs` market model; route contract accordingly.

### Fee Model (DESIGN ASSUMPTION: WRONG — CRITICAL)

Design §5.2 states: "0% trading fee."
Current reality (verified from `polymarket.com/fees`, 2026-06-13):

Polymarket now charges **category-tiered fees**:
- Sports: 0–0.75% (0–0.56% after rebate)
- Politics: 0–1.00% (0–0.75% after rebate)
- Crypto: 0–1.75% (0–1.40% after rebate)
- Culture/Tech/Finance/Other: 0–1.25% (with rebates)

**The 0% fee assumption is wrong and breaks P&L attribution.** The `halfKelly` edge calculation
and spread-adjusted cost model must incorporate the category fee. Use `GET /fee-rate` endpoint
(confirmed in `endpoints.py`) to fetch live fee rate per market.

**Action (BLOCKER for Phase 3):** Update `polymarket-adapter.mjs` to fetch fee rate per market
and pass it to `halfKelly()` as a cost. Update `factorQualityScore` to net fees from Sharpe estimate.

### API Base URLs

- CLOB: `https://clob.polymarket.com` — MATCHES design.
- Gamma: `gamma-api.polymarket.com` — MATCHES design.
- Data: `data-api.polymarket.com` — MATCHES design.

### Rate Limits

Local cached skill (Hermes archive) states: Gamma 4,000/10s, CLOB 9,000/10s, Data 1,000/10s.
These are not confirmed from live source in this pass (py-sdk beta README does not detail them).
Treat as advisory. Add runtime 429 backoff to adapter.

### US Geo-Restriction

Confirmed hard constraint. CLOB exposes `/auth/ban-status/closed-only` endpoint — US persons
get `closed-only` status, blocking order placement. Read-only L0 data access remains global.
Design §6.4 compliance table is correct: "Polymarket: NOT for US persons, geo-block enforced."

### WebSocket

Live-activity endpoint exists at `/live-activity/events/{condition_id}` and heartbeat at
`/v1/heartbeats` (confirmed from `endpoints.py`). No dedicated WS client surfaced in current
SDK. Design references "orderbook + trades channels" — protocol exists but client implementation
needs to use the raw WebSocket protocol or wait for py-sdk beta to expose it.

---

## 3. Design §5 Discrepancies Summary

| # | Location | Design Assumption | Current Reality | Severity |
|---|----------|-------------------|-----------------|----------|
| 1 | §5.1 Auth | EC private key recommended | Ed25519 recommended; EC deprecated with warning | LOW — backward compatible |
| 2 | §5.1 Key portal | `cloud.coinbase.com` | `portal.cdp.coinbase.com` | LOW — cosmetic |
| 3 | §5.1 Rate limit | Fixed 30 req/s token bucket | Per-endpoint dynamic via response headers | MEDIUM — wrong throttle model |
| 4 | §5.2 SDK | py-clob-client | ARCHIVED 2026-05-11; migrate to py-sdk beta | HIGH — Phase 3 blocker |
| 5 | §5.2 Fee model | 0% trading fee | Category-tiered 0–1.75% (after rebate) | HIGH — breaks P&L/edge calc |
| 6 | §5.2 Auth | EIP-712 only | EIP-712 (L1) + HMAC (L2 for trading) | MEDIUM — incomplete |
| 7 | §5.2 Markets | No neg-risk | Neg-risk market type with separate contract | MEDIUM — wrong contract routing |
| 8 | §5.2 Testnet | Not specified | Amoy (80002), not Mumbai (80001) | LOW — testnet only |

---

## 4. Phase 3 Blockers (from this grounding pass)

1. **Polymarket fee model wrong** — `halfKelly()` edge calc will overestimate edge by 0–1.75%.
   Must fetch `GET /fee-rate` per market and net it before sizing.
2. **py-clob-client archived** — adapter cannot import it. Either write against raw HTTP
   protocol (stable) or adopt py-sdk beta (unstable). Raw HTTP is safer for Phase 3.
3. **Neg-risk market type** — new contract address required; adapter needs routing logic.

---

RESULT_LABEL: `AFL_VENUE_API_GROUNDING_2026-06-13_X_PASS_COMMITTED`
