# AFL Phase-3 Venue Adapter — BUILD CONTRACT

**Date:** 2026-06-14
**Status:** BUILD CONTRACT (pre-code, advisory-mode only)
**Phase:** 3 (Venue Adapters — signals only, NO execution)
**Authority:** `_SYSTEM/yuri-origin.md` > `SOUL.md` > this document
**Builds on (do NOT redo):**
- Grounding/corrections: `02_RESOURCES/RESEARCH/afl-grounding-venue-apis-2026-06-13.md`
- Design §5: `02_RESOURCES/RESEARCH/afl-organ-design-2026-06-13.md` (§5.1/5.2/5.3)
- Researched API specs (Coinbase + Polymarket, inline in dispatch packet)
- Already-built Phase 0–2 organs verified live in `_SYSTEM/Scripts/alpha-factor-library/`:
  `data-quality-gate.mjs`, `regime-detector.mjs`, `factor-circuit.mjs`, `factor-evaluator.mjs`,
  `factor-scorer.mjs`, `afl-organ-adapter.mjs`, `alpha-factor-store.mjs`

This is a buildable contract: exact files, exact exports, exact endpoint→unified mappings, exact wiring
seams against verified function signatures. Not prose.

---

## 1. SCOPE + ADVISORY-MODE INVARIANTS

**Target files (build these, three only):**
- `_SYSTEM/Scripts/alpha-factor-library/coinbase-adapter.mjs`
- `_SYSTEM/Scripts/alpha-factor-library/polymarket-adapter.mjs`
- `_SYSTEM/Scripts/alpha-factor-library/portfolio-abstract.mjs`

**Hard invariants (every export must honor — these are gates, not preferences):**

| # | Invariant | Enforcement |
|---|-----------|-------------|
| INV-1 | **No execution.** No adapter export EVER POSTs an order, cancel, or any state-mutating request to a venue. `buildOrder` RETURNS a request body object and stops. | Adapters export no `submitOrder`/`postOrder`/`cancelOrder`. `buildOrder` is pure (no `fetch`). Order SUBMISSION is owner-gated to Phase 4 behind `YURI_LIVE_TRADING=1`. |
| INV-2 | **No key reading.** Code against `process.env.COINBASE_API_KEY` / `process.env.COINBASE_API_SECRET` / `process.env.COINBASE_KEY_NAME` and `process.env.POLY_*` only. NEVER read `.env`, never log a secret, never echo a key. | No `fs.read` of `.env`. Auth helpers take secrets as args sourced from `process.env` by the caller; missing env → throw `MissingCredentialError`, never silent. |
| INV-3 | **Live read is OK.** Fetching live market data (products, candles, ticker, book, fee-rate, markets) over HTTPS is permitted and expected. | Read endpoints only. Coinbase keyless ADVISORY variants (`/market/...`) used when no key present; authed endpoints used only when env keys exist. |
| INV-4 | **Advisory-no-key mode.** If venue credentials are absent, adapter operates read-only via keyless/public endpoints; authenticated-only exports (`getAccounts`) **no-op return `{ accounts: [], advisory: 'no-key' }`** rather than throwing. | Each authed export checks `hasCreds()` first; no-op shape documented per export. |
| INV-5 | **US-geo read-only guard (Polymarket).** Read (L0) is global; any path that would build a *signed/submittable* order is gated. | `polymarket-adapter` `buildOrder` returns body + `submittable: false` + `geoGate: 'US_READ_ONLY'` unless `process.env.POLY_GEO_OK === '1'` AND Phase-4 flag set. |
| INV-6 | **Numbers are strings on the wire.** Both venues return numeric fields as STRINGS. Parse with explicit `Number()`/`parseFloat` at the mapping boundary; never do math on raw API strings. | Every unified mapping coerces. A `parseNum(x)` helper (returns `NaN`-guarded finite or throws on non-numeric) is shared. |
| INV-7 | **Deterministic, testable.** Network calls go through a single injectable `httpGet(url, headers)` (default `fetch`) so tests pass a mock. Mapping functions are pure and exported for unit test. | `httpGet` is a module-level injectable; mappers (`mapProduct`, `mapCandle`, `mapBook`, `mapMarket`, ...) are exported pure functions. |

**Phase boundary:** Phase 3 = ingest + map + signal advisory. Phase 4 (NOT this build) = signed order submission, paper-then-live, owner approval per trade.

---

## 2. coinbase-adapter.mjs

**Capability tag (annotate at file head, then `node _SYSTEM/Scripts/capability-scan.mjs`):**
```
// @capability: coinbase-venue-adapter
// @serves: coinbase advanced trade | crypto venue | spot products | candles OHLCV | L2 orderbook | coinbase ticker | account balances | advisory order body
// @does: Advisory-mode read client for Coinbase Advanced Trade v3 — products/candles/ticker/L2-book/accounts mapped to AFL-unified shapes; Ed25519 JWT auth; dynamic rate-limit from response headers; buildOrder returns a body and NEVER submits
// @use: Reach for this before any Coinbase market-data, portfolio-read, or order-construction code
// @exports: getProducts, getCandles, getTicker, getOrderBook, getAccounts, buildOrder, mapProduct, mapCandle, mapBook, makeJwt, parseRateLimit
```

**Base:** `https://api.coinbase.com`, prefix `/api/v3/brokerage`. Keyless ADVISORY variant prefix `/api/v3/brokerage/market` (used when no creds — INV-4). Source: grounding doc L26–29.

### 2.1 Ed25519 JWT auth flow (grounding L11–24; design §5.1 says EC — CORRECTED to Ed25519)
```
makeJwt({ keyName, privateKeyPem, method, requestPath }) -> string
```
- Prefer Ed25519 key. If an EC/ES256 key is detected, emit a single `UserWarning` (grounding L17) and still sign.
- JWT header: `{ alg: 'EdDSA' (Ed25519) | 'ES256' (EC), kid: keyName, typ: 'JWT', nonce: <hex 16B random> }`
- JWT payload: `{ sub: keyName, iss: 'cdp', nbf: now, exp: now+120, uri: \`${method} api.coinbase.com${requestPath}\` }`
- Auth header on every AUTHED request: `Authorization: Bearer <jwt>`. (grounding L18–20)
- Keys from CDP portal `portal.cdp.coinbase.com` (NOT legacy `cloud.coinbase.com`; grounding L21).
- `keyName`=`process.env.COINBASE_KEY_NAME`, PEM=`process.env.COINBASE_API_SECRET` (caller passes; INV-2). Use Node `crypto.sign`/`jose` for EdDSA — verify which is available before coding (Open Q O-1).

### 2.2 Dynamic rate limit (grounding L41–48; design §5 "30 req/s" CORRECTED)
```
parseRateLimit(responseHeaders) -> { limit:int|null, remaining:int|null, resetSec:int|null }
```
- Read `x-ratelimit-limit` / `x-ratelimit-remaining` / `x-ratelimit-reset` from each response (per-endpoint, per-key-tier).
- Maintain a per-endpoint dynamic budget from observed headers; back off when `remaining` low or on HTTP 429. Do NOT hardcode 30 req/s.

### 2.3 Exports → unified mapping

| Export | Method+path (authed / keyless) | Request params | Response → unified |
|--------|--------------------------------|----------------|--------------------|
| `getProducts(opts)` | GET `/products` / `/market/products` | query (all optional): `limit?`, `offset?`, `product_type?('SPOT'\|'FUTURE')`, `product_ids?[]` (repeated param), `get_tradability_status?=false`, `get_all_products?=false` | `{ products: Product[], num_products }`. Map each via `mapProduct` (see 2.4). |
| `getCandles(productId, {start,end,granularity,limit?})` | GET `/products/{product_id}/candles` / `/market/products/{product_id}/candles` | path `product_id`; query REQUIRED `start`(unix-sec str), `end`(unix-sec str), `granularity` ENUM (2.5); optional `limit` (≤350). | `{ candles: Candle[] }` newest-first. Map each via `mapCandle` → OHLCV. |
| `getTicker(productId, {limit, start?, end?})` | GET `/products/{product_id}/ticker` / `/market/products/{product_id}/ticker` | path `product_id`; query `limit` REQUIRED (recent-trades count), `start?`, `end?`. | **CORRECTION (spec):** `/ticker` = Get Market Trades, returns `{ trades: HistoricalMarketTrade[], best_bid, best_ask }`. Build unified ticker (2.4). |
| `getOrderBook(productId, {limit?, aggregation_price_increment?})` | GET `/product_book` / `/market/product_book` | **CONFIRMED path = top-level `/product_book`, `product_id` as QUERY param** (NOT `/market_book`, NOT `/products/{id}/product_book` — design §5.1 "/market_book" is WRONG). query `product_id` REQUIRED, `limit?`, `aggregation_price_increment?`. | `{ pricebook:{product_id,bids:L2Level[],asks:L2Level[],time}, last?, mid_market?, spread_bps?, spread_absolute? }`. Map via `mapBook`. |
| `getAccounts(opts)` | GET `/accounts` (**AUTHED ONLY — no keyless variant**) | query `limit?=49`(≤250), `cursor?`, `retail_portfolio_id?` | INV-4: if no creds → `{ accounts: [], advisory:'no-key' }`. Else `{ accounts: Account[], has_next, cursor, size }` → unified `Balance[]` (2.4). |
| `buildOrder(p)` | **POST target `/api/v3/brokerage/orders` — DO NOT CALL (INV-1)** | `buildOrder({ product_id, side:'BUY'\|'SELL', size, price?, type:'limit'\|'market', timeInForce? })` | Returns body only; does not fetch. Shape in 2.6. |

### 2.4 Unified mappers (Coinbase fields are STRINGS — `parseNum` at boundary, INV-6)

`mapProduct(p)` reads ONLY: `product_id, price, base_increment, quote_increment, price_increment, base_min_size, base_max_size, quote_min_size, quote_max_size, status, trading_disabled, product_type` →
```
{ symbol:p.product_id, venue:'coinbase', price:parseNum(p.price),
  baseIncrement:parseNum(p.base_increment), quoteIncrement:parseNum(p.quote_increment),
  priceIncrement:parseNum(p.price_increment),
  baseMin:parseNum(p.base_min_size), baseMax:parseNum(p.base_max_size),
  quoteMin:parseNum(p.quote_min_size), quoteMax:parseNum(p.quote_max_size),
  status:p.status, tradable:(p.trading_disabled===false), productType:p.product_type }
```

`mapCandle(c)` — Candle is a NAMED OBJECT (not legacy positional array). Source field order `start,low,high,open,close,volume`, all strings →
```
{ time:Number(c.start), open:parseNum(c.open), high:parseNum(c.high),
  low:parseNum(c.low), close:parseNum(c.close), volume:parseNum(c.volume) }
```
(emit as OHLCV bar shape consumed by the data-quality-gate — see §6.)

Unified ticker from getTicker (`/ticker`=Market Trades):
```
{ venue:'coinbase', symbol:productId,
  bid:parseNum(best_bid), ask:parseNum(best_ask),
  mid:(parseNum(best_bid)+parseNum(best_ask))/2,
  last:parseNum(trades[0]?.price),                 // most-recent trade
  volume: parseNum(getProducts→volume_24h) ?? sum(trades[].size) }  // 24h vol pref'd; trade-agg fallback
```

`mapBook(r)` reads `r.pricebook.bids[].{price,size}`, `r.pricebook.asks[].{price,size}`, optional `r.mid_market`, `r.spread_bps` →
```
{ venue:'coinbase', symbol:r.pricebook.product_id,
  bids:r.pricebook.bids.map(l=>({price:parseNum(l.price),size:parseNum(l.size)})),
  asks:r.pricebook.asks.map(l=>({price:parseNum(l.price),size:parseNum(l.size)})),
  mid: r.mid_market!=null?parseNum(r.mid_market):null,
  spreadBps: r.spread_bps!=null?parseNum(r.spread_bps):null }
```

Account → Balance (per account; Amount={value,currency}):
```
{ venue:'coinbase', currency:a.currency,
  available:parseNum(a.available_balance.value),
  hold:parseNum(a.hold.value), total:parseNum(a.available_balance.value)+parseNum(a.hold.value) }
```

### 2.5 Granularity enum (REQUIRED on getCandles)
`ONE_MINUTE | FIVE_MINUTE | FIFTEEN_MINUTE | THIRTY_MINUTE | ONE_HOUR | TWO_HOUR | SIX_HOUR | ONE_DAY`
(`UNKNOWN_GRANULARITY` is the null sentinel — never send it). Source: docs.cdp.coinbase.com get-product-candles.

### 2.6 buildOrder body (advisory — INV-1)
```
buildOrder({product_id, side, size, price, type, timeInForce}) -> {
  venue:'coinbase', product_id, side,                       // 'BUY'|'SELL'
  order_configuration: type==='market'
    ? { market_market_ioc: { base_size: String(size) } }
    : { limit_limit_gtc: { base_size: String(size), limit_price: String(price) } },
  time_in_force: timeInForce ?? 'GTC',
  _advisory: true, _submittable: false                       // Phase-4 only
}
```
(Verify exact `order_configuration` keys against raw `coinbase/rest/orders.py` before coding — Open Q O-2.)

---

## 3. polymarket-adapter.mjs

**Capability tag:**
```
// @capability: polymarket-venue-adapter
// @serves: polymarket | prediction market | CLOB | gamma markets | neg-risk | binary outcome token | fee-rate | market book | clob price midpoint spread | advisory order body
// @does: Advisory-mode raw-HTTP read client for Polymarket Gamma + CLOB — markets/book/price/fee-rate mapped to AFL-unified shapes; L0/L1/L2 auth model; neg-risk contract routing; fee-rate wired so dynamic fees net into halfKelly; US read-only geo-guard; buildOrder returns body and NEVER submits
// @use: Reach for this before any Polymarket market-data, fee, position, or order-construction code
// @exports: getMarkets, getMarketBook, getPrice, getFeeRate, getPositions, buildOrder, mapMarket, mapBook, effectiveTakerFee, hasCreds
```

**Bases (grounding L116–118):** Gamma `https://gamma-api.polymarket.com`, CLOB `https://clob.polymarket.com`, Data `https://data-api.polymarket.com`. **Raw HTTP** — do NOT import `py-clob-client` (ARCHIVED 2026-05-11; grounding L54–63). Chain 137; neg-risk exchange `0xC5d563A36AE78145C45a50134d48A1215220f80a` (Phase-4 routing only; grounding L86).

### 3.1 Auth levels (grounding L65–80)

| Level | Use | Headers | Phase-3 scope |
|-------|-----|---------|---------------|
| L0 | All reads (markets/events/book/price/midpoint/spread/fee-rate) | none | **THIS BUILD — full** |
| L1 | wallet-ownership proof | `POLY_ADDRESS`, `POLY_SIGNATURE`(EIP-712 `ClobAuthDomain` v1, msg "This message attests that I control the given wallet"), `POLY_TIMESTAMP`, `POLY_NONCE` | helper only (no live use Phase-3) |
| L2 | trading | L1 + `POLY_API_KEY`, `POLY_PASSPHRASE`, HMAC-SHA256 over `timestamp+method+path+body` | Phase-4 only |

`hasCreds()` = `!!(process.env.POLY_ADDRESS)`. All §3.3 reads are L0 — work with no creds.

### 3.2 Neg-risk contract routing (grounding L88–94; NOT in design)
- Neg-risk is an **EVENT-level** grouping; the event flags `negRisk:true`/`enableNegRisk:true` and **every child market inherits `negRisk`**.
- Three independent signals all carry it: Gamma market `negRisk`, Gamma event `negRisk`+`negRiskMarketID`, CLOB `/book` `neg_risk` (bool, direct — usable for routing WITHOUT a second call).
- `mapMarket` MUST surface `negRisk` + `negRiskMarketID`. Phase-4 picks the exchange contract from it; Phase-3 only records it on the unified shape.

### 3.3 Exports → unified mapping (numeric fields STRINGS or JSON-STRINGS — INV-6)

| Export | Method+path | Params | Response → unified |
|--------|-------------|--------|--------------------|
| `getMarkets(opts)` | GET `gamma-api.../markets?limit&active=true&closed=false&order=volume&ascending=false[&slug][&offset][&tag]` (L0) | `limit, offset, active, closed, order(volume\|createdAt\|updatedAt), ascending, slug, tag` | **Returns a JSON ARRAY** (NOT `{data:...}`). Map each via `mapMarket`. |
| `getMarketBook(tokenId)` | GET `clob.../book?token_id=<TOKEN_ID>` (L0; token_id = a `clobTokenIds` entry, NOT conditionId) | `token_id` | `{market,asset_id,bids:[{price,size}],asks:[{price,size}],min_order_size,tick_size,neg_risk,last_trade_price}`. **CRITICAL: bids/asks are STRINGS and NOT pre-sorted — sort bids desc, asks asc** before reading top-of-book. Map via `mapBook`. Empty token → `{error:"No orderbook exists..."}` → return `{bids:[],asks:[],empty:true}`. |
| `getPrice(tokenId, side)` | GET `clob.../price?token_id&side=buy\|sell` (L0) | `token_id, side` (buy=best ask/cost-to-buy, sell=best bid/proceeds) | `{ price:str }` → `parseNum(price)` |
| `getMidpoint(tokenId)` | GET `clob.../midpoint?token_id` (L0) | `token_id` | `{ mid:str }` (field is **`mid`** not `midpoint`) → `parseNum(mid)` |
| `getSpread(tokenId)` | GET `clob.../spread?token_id` (L0) | `token_id` | `{ spread:str }` → `parseNum(spread)` |
| `getFeeRate(tokenId)` | GET `clob.../fee-rate?token_id` (L0) — **CRITICAL for halfKelly** | `token_id` | `{ base_fee:int }` in **BASIS POINTS**, a **CAP/ceiling** not a flat per-share fee (1000=10% cap; 0=fee-free). Returns `{ baseFeeBps:Number(base_fee) }`. |
| `getPositions()` | GET `data-api.../positions?user=<addr>` (L1+, AUTHED) | wallet | INV-4: no creds → `{ positions:[], advisory:'no-key' }`. Else map to unified `Position[]` (§4). (Verify exact data-api positions path live — Open Q O-3.) |
| `buildOrder(p)` | **signed order — DO NOT SUBMIT (INV-1/INV-5)** | see 3.5 | body only, `submittable:false`, `geoGate` set. |

`mapMarket(m)` — JSON-STRING fields MUST be `JSON.parse`d (double-encoded):
```
outcomes      = JSON.parse(m.outcomes)        // e.g. ["Yes","No"]
outcomePrices = JSON.parse(m.outcomePrices)   // ["0.225","0.775"]
clobTokenIds  = JSON.parse(m.clobTokenIds)    // [YES_TOKEN,NO_TOKEN]; index0<->outcomes[0]
->
{ venue:'polymarket', id:m.id, question:m.question, conditionId:m.conditionId, slug:m.slug,
  outcomes, prices:outcomePrices.map(parseNum), tokenIds:clobTokenIds,
  yesTokenId:clobTokenIds[0], noTokenId:clobTokenIds[1],
  negRisk:!!m.negRisk, negRiskMarketID:m.negRiskMarketID ?? null,
  makerBaseFee:Number(m.makerBaseFee), takerBaseFee:Number(m.takerBaseFee),
  feesEnabled:!!m.feesEnabled, enableOrderBook:!!m.enableOrderBook, acceptingOrders:!!m.acceptingOrders,
  orderMinSize:Number(m.orderMinSize), tickSize:Number(m.orderPriceMinTickSize),
  bestBid:parseNum(m.bestBid), bestAsk:parseNum(m.bestAsk),
  liquidity:parseNum(m.liquidity), volume:parseNum(m.volume), active:!!m.active, closed:!!m.closed }
```

`mapBook(r)` — sort first (live data is mixed-order), then map:
```
bids = r.bids.map(l=>({price:parseNum(l.price),size:parseNum(l.size)})).sort((a,b)=>b.price-a.price)
asks = r.asks.map(l=>({price:parseNum(l.price),size:parseNum(l.size)})).sort((a,b)=>a.price-b.price)
-> { venue:'polymarket', conditionId:r.market, tokenId:r.asset_id, bids, asks,
     minOrderSize:parseNum(r.min_order_size), tickSize:parseNum(r.tick_size),
     negRisk:!!r.neg_risk, lastTradePrice:parseNum(r.last_trade_price) }
```

### 3.4 Dynamic fee — `effectiveTakerFee` (grounding L96–112; design §5.2 "0% fee" WRONG — CRITICAL)
`base_fee` is a CAP in bps; the EFFECTIVE taker fee is **price-dependent — peaks near p=0.50, decays toward p=0/1**. Do NOT flatly subtract `base_fee/10000`.
```
effectiveTakerFee(priceP, baseFeeBps) -> effectiveFeeFraction   // in [0, baseFeeBps/10000]
```
- Model the dynamic curve as a function of `priceP` and `baseFeeBps` (symmetric, max at 0.5). **Verify the exact Polymarket fee formula live before coding** — Open Q O-4; until confirmed, ship a documented conservative upper-bound = `baseFeeBps/10000` and TODO-mark it.
- This fraction is what nets into `halfKelly` and `factorQualityScore` (§6).

### 3.5 buildOrder (advisory — INV-1/INV-5)
```
buildOrder({conditionId, outcome:'yes'|'no', side:'BUY'|'SELL', size, price, tokenId, negRisk, tickSize}) -> {
  venue:'polymarket', conditionId, tokenId: tokenId ?? (outcome==='yes'?yesTokenId:noTokenId),
  side, size:String(size), price:String(price), type:'GTC',
  feeRateBps: <from getFeeRate>,                 // embed the live cap
  exchange: negRisk ? 'NEG_RISK' : 'STANDARD',   // Phase-4 picks contract addr from this
  _advisory:true, _submittable:false,
  geoGate: (process.env.POLY_GEO_OK==='1') ? 'OK' : 'US_READ_ONLY'   // INV-5
}
```

---

## 4. portfolio-abstract.mjs

**Capability tag:**
```
// @capability: portfolio-abstract
// @serves: unified position | unified order | unified fill | unified balance | venue-agnostic portfolio | cross-venue normalization
// @does: Venue-agnostic Position/Order/Fill/Balance type builders + validators mapping BOTH Coinbase and Polymarket fields into one shape for the AFL signal/risk layer
// @use: Reach for this before reading any venue-specific position/order/fill/balance field downstream of the adapters
// @exports: makePosition, makeOrder, makeFill, makeBalance, fromCoinbaseAccount, fromPolymarketPosition, validatePosition
```

Unified types (builders return frozen objects; field provenance from BOTH venues):

```
makePosition({venue,asset,side,size,entryPrice,currentPrice,venueSpecific}) -> {
  venue:'coinbase'|'polymarket',
  asset:string,            // coinbase product_id | polymarket conditionId(+outcome)
  side:'long'|'short',     // polymarket: holding YES==long, holding NO==short(of YES)
  size:number,             // base-asset qty (coinbase) | shares (polymarket)
  entryPrice:number, currentPrice:number,
  unrealizedPnl:number,    // (current-entry)*size*(side==='long'?1:-1)
  venueSpecific:object }

makeOrder({venue,asset,side,size,price,type,timeInForce}) -> {
  venue, asset, side:'buy'|'sell', size:number, price:number|null,   // null=market
  type:'limit'|'market', timeInForce:'GTC'|'GTD'|'FOK',
  status:'advisory' }      // Phase-3 is ALWAYS 'advisory'; Phase-4 mutates to submitted/filled

makeFill({venue,asset,side,size,price,fee,feeCurrency,timestamp,orderId}) -> {...same fields, numbers...}

makeBalance({venue,currency,available,hold,total}) -> { venue, currency, available, hold, total }   // numbers
```

**Cross-venue field map (the load-bearing translation):**

| Unified field | Coinbase source | Polymarket source |
|---------------|-----------------|-------------------|
| `asset` | `product_id` (`mapProduct.symbol`) | `conditionId` + outcome label |
| Position `size` | base-asset qty | shares of outcome token |
| Position `side` | long/short of base | hold YES → long; hold NO → short(YES) |
| `currentPrice` | ticker `mid`/`last` | CLOB `getMidpoint`/`getPrice` |
| Balance `currency`/`available`/`hold` | Account.currency / available_balance.value / hold.value | USDC collateral (data-api positions; O-3) |
| Fill `fee`/`feeCurrency` | Coinbase fee tier (quote ccy) | `effectiveTakerFee` × notional (USDC) |

`fromCoinbaseAccount(account)` → `makeBalance`. `fromPolymarketPosition(p)` → `makePosition`.
**LLM-risk invariant (design §5.3):** the LLM NEVER generates price/position data — all of it flows FROM these adapters into context; sizing is deterministic (`halfKelly`), order params are adapter-built and owner-reviewed.

---

## 5. CORRECTIONS-vs-DESIGN §5 (the 8 discrepancies → build action)

Discrepancy table carried from grounding §3 (L143–153); each row is now a concrete build action in THIS contract.

| # | Design §5 said | Verified reality | BUILD ACTION (this contract) |
|---|----------------|------------------|------------------------------|
| 1 | EC private key recommended (§5.1) | Ed25519 recommended; EC deprecated w/ active warning | §2.1 `makeJwt` prefers EdDSA; emits one warning if EC detected. |
| 2 | key portal `cloud.coinbase.com` (§5.1) | `portal.cdp.coinbase.com` | §2.1 doc/comment uses CDP portal URL only. |
| 3 | fixed 30 req/s token bucket (§5.1) | per-endpoint dynamic via `x-ratelimit-*` headers | §2.2 `parseRateLimit` + per-endpoint dynamic budget + 429 backoff; NO fixed bucket. |
| 4 | uses `py-clob-client` (§5.2) | ARCHIVED 2026-05-11 → use raw HTTP (or py-sdk beta) | §3 raw-HTTP only; no SDK import. |
| 5 | 0% trading fee (§5.2) — breaks edge calc | category-tiered 0–1.75%; dynamic effective fee | §3.4 `effectiveTakerFee` + §6 fee nets into halfKelly + factorQualityScore. |
| 6 | EIP-712 only (§5.2) | L1 EIP-712 + L2 HMAC for trading | §3.1 L0/L1/L2 table; L2 HMAC documented (Phase-4). |
| 7 | no neg-risk (§5.2) | neg-risk market type w/ separate contract, EVENT-level inheritance | §3.2 `mapMarket` surfaces `negRisk`/`negRiskMarketID`; CLOB `/book.neg_risk` for routing; §3.5 `exchange` field. |
| 8 | testnet unspecified (§5.2) | Amoy 80002 (NOT Mumbai 80001) | Adapter testnet const = 80002 if/when a test path needs it (Phase-4). |
| +A | book path `/market_book` (§5.1) | **CONFIRMED `/product_book`, product_id as QUERY** | §2.3 `getOrderBook` uses `/product_book`. (New correction from Coinbase spec; supersedes design §5.1 + grounding L29.) |
| +B | `/ticker` = single ticker object | `/ticker` = Get Market Trades (`{trades,best_bid,best_ask}`) | §2.3/2.4 build unified ticker from best_bid/best_ask/trades[0]. |

(Rows +A/+B are NEW corrections surfaced by the researched API specs in this packet, beyond the original grounding 8 — flagged so the design doc gets a follow-up patch.)

---

## 6. WIRING — where the built Phase-0/1/2 organs plug in

Verified signatures (read from live source 2026-06-14):
- `dataQualityGate(bars, opts) -> {pass, rejectCount, flagCount, nonMonotonicCount, report}` (fail-closed; `data-quality-gate.mjs:336`)
- `detectRegimeShift(input, opts) -> {...}` where `input` accepts `signedStream`, `seriesByKeyBefore/After`, `commMatrixBefore/After` (`regime-detector.mjs:289`)
- `optimizeFactorCircuit(factors, opts)` / `circuitQuality(orderedProjectors, classicalProjectors, psi, opts)` (`factor-circuit.mjs:644/585`)
- `factorPromotionGate({...}) ` + `backtestFactor`, `deflatedSharpe` (`factor-evaluator.mjs:324/132/234`)
- `factorQualityScore(factor, {calibrationBrier, maxPairwiseCorr, daysSinceConfirmed, stabilityDays}) -> [0,1]` (`factor-scorer.mjs:189`)
- `computeU(state,weights)` / `gateProposal({before,after,weights})` (`math/yuri-energy.mjs:454/590`)

**Pipeline (the seam Phase-3 must honor):**
```
ADAPTER INGEST                 SIGNAL/RISK LAYER (already built)
─────────────                  ────────────────────────────────
coinbase.getCandles  ─mapCandle→ OHLCV bars ─┐
polymarket.getMarketBook ─mapBook→ book      │
                                             v
                            (1) dataQualityGate(bars)         data-quality-gate.mjs
                                  └ pass===false  → DROP the symbol this cycle (fail-closed); do NOT compute factors on poisoned data
                                             v (pass===true)
                            (2) factor computation → factor-circuit.optimizeFactorCircuit(factors)
                                             v
                            (3) regime check: detectRegimeShift({          regime-detector.mjs
                                  signedStream: <vol/return signal from new bars>,
                                  commMatrixBefore: <prev circuit comm matrix>,
                                  commMatrixAfter:  <current> })
                                  └ regime shift → RECOMPUTE circuit (invalidate cached optimal ordering); skip signal emit this cycle
                                             v (stable)
                            (4) SIGNAL = circuit output × factorQualityScore-ranked factors
```

**Fee netting (the §5 #5 fix — the critical wire):**
```
edgeRaw   = signalEdge(factor, market)                      // pre-cost edge estimate
feeFrac   = coinbase: feeTier(account)                      // taker/maker tier
            polymarket: effectiveTakerFee(price, getFeeRate(tokenId).baseFeeBps)   // §3.4
spreadFrac= (ask - bid) / mid                               // from mapBook top-of-book
edgeNet   = edgeRaw - feeFrac - 0.5*spreadFrac              // half-spread crossing cost
size      = halfKelly(edgeNet, odds, maxFraction=0.10)      // afl-validation.mjs:483 — fee-NET edge, never raw
```
- **factorQualityScore is fee-aware via the Sharpe input, not a new param.** `factorQualityScore` (signature verified) has NO fee argument — so the fee MUST be netted *upstream*: feed it the fee-NET Sharpe (`backtest_results.sharpe` computed on fee-netted returns) so Term-1 already reflects cost. Do NOT call `factorQualityScore` with a gross Sharpe and expect it to subtract fees — it cannot.
- Polymarket `getFeeRate` is fetched **per market/token** at signal time and cached briefly; never assume 0% (design §5.2 was wrong).

**Energy/promotion (advisory, owner-gated):** signal-emission and any factor promotion driven by venue data still route through `gateProposal`/`factorPromotionGate` exactly as Phase-1/2 — Phase-3 adds NO new gate, it only feeds clean, fee-netted, regime-checked inputs.

---

## 7. OPEN QUESTIONS — verify LIVE before coding each adapter

**Coinbase:**
- O-1: EdDSA(Ed25519) JWT in Node — confirm `crypto.sign(null, msg, ed25519Key)` vs needing `jose`/`jsonwebtoken`+`EdDSA`. Check what's already a dep before adding one (no install without owner approval).
- O-2: exact `order_configuration` keys for limit/market in `buildOrder` — verify against raw `coinbase/rest/orders.py`@master (`create_order` body) before finalizing §2.6.
- O-5: keyless ADVISORY endpoints (`/market/...`) — confirm they return the SAME response shape as authed (spec says yes via `public.py`; probe one live).
- O-6: confirm `x-ratelimit-*` header names are exactly as grounding states on a live response (some Coinbase endpoints use `CB-...` style).

**Polymarket:**
- O-3: exact `data-api.polymarket.com` positions path + auth level for `getPositions` (not in the probed spec; grounding lists data-api but no positions endpoint shape).
- O-4: the EXACT dynamic taker-fee formula (curve peaking at p=0.5). Spec warns it's dynamic but gives no closed form — find it (polymarket.com/fees + py-clob-client fee calc) before shipping anything better than the conservative `baseFeeBps/10000` upper bound.
- O-7: Gamma `getMarkets` pagination — confirm `offset` works alongside `order=volume` (array response has no cursor); cap page size.
- O-8: CLOB rate limits (grounding L120–124 are advisory/unconfirmed: Gamma 4000/10s, CLOB 9000/10s) — add 429 backoff regardless; don't hardcode the unconfirmed numbers as a budget.

**Cross-cutting:**
- O-9: confirm `httpGet` injection point is mockable in the AFL test harness style (`afl-phase2.test.mjs` pattern) so adapter tests run with NO network.
- O-10: design §5 doc should get a follow-up patch for corrections +A (`/product_book`) and +B (`/ticker`=Market Trades) — they post-date the grounding doc.

---

## 8. PEER-REVIEW HARDENING (Claude + Mimo + DeepSeek, 2026-06-14)

This contract was peer-reviewed by three lanes. Mimo (MiMo-v2.5-pro) and DeepSeek (deepseek-v4-pro)
each reviewed independently. The deltas below are BINDING amendments to §1–7 — a builder must honor them.

### 8.0 Factual-conflict resolution (multi-lane cross-check)
DeepSeek raised two HIGH *factual* API claims that CONTRADICT the live-fetched research; both are
non-fetching-model claims and were over-ruled by 2 lanes + live source, NOT silently flipped:
- **Rate-limit header names:** DeepSeek asserts `cb-rate-limit-*`; the research read `x-ratelimit-*` from
  `coinbase-advanced-py`. UNRESOLVED by reasoning alone → **live-verify (O-6)**; `parseRateLimit` must read
  header names case-insensitively and try BOTH families (`x-ratelimit-*` AND `cb-rate-limit-*`), using whichever a live response actually carries.
- **`/ticker` shape:** DeepSeek asserts a single ticker object; the research (live SDK source) AND Mimo both
  confirm `/ticker` = Get Market Trades `{trades, best_bid, best_ask}`. KEEP the §2.4 trades-based mapping;
  builder confirms once on a live call (added to O-5). Mimo: "no factual errors found; the 10 corrections all check out."

### 8.1 BINDING amendments
| ID | Severity | Section | Amendment |
|----|----------|---------|-----------|
| H-1 | CRITICAL | §1 INV-6 | **`parseNum` contract (exact):** `parseNum('')→null`, `parseNum(null\|undefined)→null`, `parseNum('0.5')→0.5`, `parseNum('abc')→throw MappingError`. (Polymarket `bestBid/bestAsk/liquidity` are often `''` for illiquid markets; `Number('')===0` would silently fabricate a 0 price.) Mappers tolerate `null` (advisory degrade); only malformed non-empty strings throw. |
| H-2 | CRITICAL | §3.4 | **`effectiveTakerFee` is not yet buildable** (no closed-form curve). Ship behind `FEATURE_FLAG POLY_FEE_NETTING` (DEFAULT OFF). While OFF: emit NO Polymarket trade signals (advisory only; do not size on an unknown fee). Impl path: recover the price-dependent curve from `py-clob-client@v0.18.0` (pre-archival) fee calc OR polymarket.com/fees, reproduce in JS, unit-test against ≥3 known `(price, baseFeeBps)→fee` triples. Until then the conservative upper bound `baseFeeBps/10000` is a CEILING for risk display only, never for sizing a live edge. (O-4 is now a HARD prereq for any Polymarket sizing.) |
| H-3 | CRITICAL | §1 INV-1, §2.6, §3.5 | **`buildOrder` is PURE — no fetch.** Both adapters' `buildOrder` take fee/rate inputs as PARAMS, never fetch them inline: Coinbase `buildOrder({...})` (no fee fetch); Polymarket `buildOrder({..., feeRateBps, yesTokenId, noTokenId})` — the CALLER fetches `getFeeRate(tokenId)` and passes `feeRateBps` in. This keeps INV-1 (no fetch in buildOrder) consistent. |
| H-4 | HIGH | §1 (new INV-9) | **`httpGet` contract (exact):** `httpGet(url, headers?) -> Promise<{ status:number, headers:Record<string,string>(lowercased keys), json():Promise<any>, text():Promise<string> }>`. Default = a `fetch` wrapper that throws only on network/transport error and returns non-2xx `status` for the caller to handle. Injection: module-level `let _httpGet = defaultHttpGet; export function setHttpGet(fn){ _httpGet = fn; }` so `afl-*.test.mjs` runs with NO network. `parseRateLimit` reads `.headers`. |
| H-5 | HIGH | §1 (new §1.8) | **Error-handling contract:** non-2xx after retries → throw `VenueApiError({venue,status,endpoint,message})`; unexpected response shape → `MappingError`. The signal/risk layer MUST catch; an adapter error must NEVER propagate unhandled into LLM context (design §5.3 LLM-risk). Transient 5xx/timeout → bounded retry+backoff; 429 → honor `parseRateLimit` reset. |
| H-6 | HIGH | §3.1 | **Creds checks split:** `hasL1Creds()` = `POLY_ADDRESS && POLY_SIGNATURE && POLY_TIMESTAMP` (all three); `hasL2Creds()` = L1 + `POLY_API_KEY && POLY_PASSPHRASE && POLY_SECRET`. The single-`POLY_ADDRESS` check would let partial creds attempt auth → 401. L0 reads need none. |
| H-7 | HIGH | §2.6 | **Coinbase `buildOrder` order_configuration key is DYNAMIC:** `cfgKey = type==='market' ? 'market_market_ioc' : 'limit_limit_'+tif` where `tif = (timeInForce??'GTC').toLowerCase()` validated ∈ {gtc,gtd,fok} (gtd requires `end_time`); throw on unknown. The hardcoded `limit_limit_gtc` was wrong for GTD/FOK. |
| H-8 | HIGH | §3.5 | **Polymarket order field name:** use `orderType` (∈ GTC/GTD/FOK/FAK), not `type` — the CLOB EIP-712 schema keys on `orderType`. Added to O-4/O-8 live-verify. |
| H-9 | HIGH | new §3.6 | **L2 HMAC signing spec (Phase-4, but the buildOrder body must carry the fields):** env `POLY_API_KEY/POLY_PASSPHRASE/POLY_SECRET`; canonical string `timestamp + method.toUpperCase() + path + body` (EXACT concatenation/encoding = O-live-verify); HMAC-SHA256(base64) → header `POLY_SIGNATURE`; plus `POLY_TIMESTAMP/POLY_API_KEY/POLY_PASSPHRASE` headers. Phase-3 does not sign; `buildOrder` returns all fields a Phase-4 signer needs. |
| M-1 | MEDIUM | §2.4 | **Candle ordering + units:** Coinbase candles return NEWEST-FIRST in UNIX SECONDS. The data-quality gate's non-monotone check would flag every bar → `getCandles` MUST `reverse()` to CHRONOLOGICAL (oldest-first) before returning, and `mapCandle` documents `time` is UNIX **seconds** (downstream uses seconds consistently; convert ×1000 only if a consumer needs ms). |
| M-2 | MEDIUM | §2.4 | **Ticker volume dependency:** `getTicker` cannot get 24h volume from `/ticker` alone. Signature: `getTicker(productId, {limit, volume24h?})` — caller pre-fetches `getProducts().volume_24h` and passes it; if absent, unified `volume:null` (downstream handles null). No hidden second fetch inside `getTicker`. |
| M-3 | MEDIUM | §4 | **Add `fromPolymarketBalance(positionEntry)`** → `makeBalance({venue:'polymarket',currency:'USDC',available,hold,total})` from the data-api positions USDC collateral (shape pending O-3). Without it the Polymarket balance path is unbuildable. |

### 8.2 Verify-live list additions (append to §7)
- O-5+: confirm `/ticker` returns `{trades,best_bid,best_ask}` (research+Mimo say yes; DeepSeek dissents) on one live call.
- O-6+: `parseRateLimit` must try BOTH `x-ratelimit-*` and `cb-rate-limit-*` (header-name conflict unresolved by reasoning).
- O-4 (UPGRADED to hard prereq): the exact Polymarket dynamic fee curve — blocks `POLY_FEE_NETTING=1` and ALL Polymarket sizing.
- O-11: confirm Polymarket CLOB order field name `orderType` (vs `type`) + the L2 HMAC canonical-string exact format.

**Net:** the contract is BUILDABLE for the read/advisory path today (Coinbase + Polymarket L0 reads, mappers, unified
types, wiring). Polymarket *sizing/signals* are gated OFF until O-4 (fee curve) is resolved. No path can submit an order
(INV-1) or read a key (INV-2); buildOrder is pure (H-3); errors never reach the LLM (H-5).

---

RESULT_LABEL: `AFL_PHASE3_VENUE_ADAPTER_BUILD_CONTRACT_PEER_HARDENED_X_PASS`
