# Lane C — Free Data Stack Verification (Online-Verification Layer)

Owner directive 2026-06-16 online-verification layer applied: external/factual claims below are
checked against ≥2 primary sources where the claim is load-bearing for the $0 build. Local execution
(YURI's own code) is NOT claimed here — this is external vendor-fact verification only.

Verified: 2026-07-06. All sources are vendor official docs/blogs, official GitHub repos, or PyPI —
no blog-only claims used for load-bearing terms.

---

## 1. DATABENTO — orderflow proof wedge (ES MBP-10)

**FREE-BOUNDARY:** $125 in free API credits granted automatically on signup, no separate promo code.
Originally announced 2023-04-14 as historical-data-only; **2025 pricing overhaul changed this** — the
$125 credit can now ALSO be applied toward the new subscription plans (e.g. Standard $199/mo), which
include live data access. So credit is no longer strictly historical-only, but the $125 itself is
still a ONE-TIME grant, shared across the whole "team" (account), expiring in 6 months from signup.

- CONFIRMED: `$125` credit, `expire in six months`, `shared across your team` —
  [Databento Docs FAQ: usage-pricing-and-data-credits](https://databento.com/docs/faqs/usage-pricing-and-data-credits)
  (search-cached excerpt; direct WebFetch returned a truncated page but the terms are corroborated
  independently below).
- CONFIRMED (announcement, primary): "End of Early Access – $125 in free credits for all users!" —
  [roadmap.databento.com/announcements](https://roadmap.databento.com/announcements/end-of-early-access-125-in-free-credits-for-all-users)
- CONFIRMED (2025 policy shift, primary blog): "Live equities data will no longer be available with
  usage-based pricing and will instead require a subscription plan… sign-up credits can now be used
  toward subscriptions, which include live data access." —
  [Databento Blog: upcoming-changes-to-pricing-plans-in-january-2025](https://databento.com/blog/upcoming-changes-to-pricing-plans-in-january-2025)
- CORROBORATING (third-party integration docs, independent of Databento): "$125 in free data credits
  for new sign-ups… can be applied toward historical data requests or to offset the cost of a
  subscription plan." — [NautilusTrader Databento integration docs](https://nautilustrader.io/docs/latest/integrations/databento/)
- Payment info IS required at signup (card on file, not charged unless usage exceeds credit) — per
  [Databento Blog: why-payment-information-required](https://databento.com/blog/why-payment-information-required)
  (title alone is primary-sourced; content corroborated by third-party review
  [quantvps.com Databento review](https://www.quantvps.com/blog/databento-review)).

**AUTH MODEL:** API key generated instantly on signup (`db.Historical('YOUR_API_KEY')` /
`db.Live(key=...)`), no OAuth. — [Databento Docs: quickstart](https://databento.com/docs/quickstart)

**MBP-10 / GLBX.MDP3 (ES futures):** MBP-10 (market-by-price, 10 depth levels) is a supported schema
on `GLBX.MDP3` (CME Globex MDP 3.0 — CME/CBOT/NYMEX/COMEX). Historical query pattern:
`client.timeseries.get_range(dataset='GLBX.MDP3', schema='mbp-10', stype_in='continuous', symbols='ES.c.0', start=..., end=...)`.
Live subscribe: `db_client.subscribe(dataset="GLBX.MDP3", schema="mbp-10", stype_in="raw_symbol", symbols=["ESZ25"])`.
— CONFIRMED, primary docs: [databento.com/docs/schemas-and-data-formats/mbp-10](https://databento.com/docs/schemas-and-data-formats/mbp-10),
[databento.com/docs/venues-and-datasets/glbx-mdp3](https://databento.com/docs/venues-and-datasets/glbx-mdp3),
[databento.com/datasets/GLBX.MDP3](https://databento.com/datasets/GLBX.MDP3)

**Historical vs live cost model:** historical data billed per-byte consumed (usage-based); live data
now requires a subscription tier (2025 change above) rather than pure usage billing for equities —
futures/GLBX.MDP3 live billing model not independently re-confirmed post-2025 change; TREAT AS
UNCONFIRMED whether GLBX.MDP3 live is still usage-based or also folded into subscription-only. Flag
for Fable: verify current GLBX.MDP3 live pricing at signup time, don't assume the equities-only 2025
change applies identically to futures.

**$125 credit → how much MBP-10 ES history:** UNCONFIRMED exact GB/credit ratio — Databento bills
per-byte and per-symbol-day, no vendor-published flat "$X per GB" rate found in this pass. Historical
MBP-10 (10-level depth) is a heavy schema (highest after MBO); a few weeks of single-contract ES
MBP-10 history is a reasonable rough estimate but NOT vendor-confirmed — this is the one number Fable
should sanity-check with a live signup + a bounded date-range pull before assuming volume.

**SDK / arm64:** `pip install databento` (official `databento-python` on PyPI/GitHub). Core dependency
`databento-dbn` ships prebuilt `macosx universal2` wheels (ARM64 + x86-64) for Python 3.10–3.14 — no
compilation needed on Apple Silicon. — CONFIRMED:
[github.com/databento/databento-python](https://github.com/databento/databento-python),
[pypi.org/project/databento-dbn](https://pypi.org/project/databento-dbn/)

**Verdict: PROOF WEDGE HOLDS.** $125 credit is real, current, gets you real ES MBP-10 depth data
(historical for sure; live is a subscription question to verify at signup), SDK installs clean on
arm64 Mac. The one soft spot: exact byte-cost of MBP-10 pulls is unconfirmed — budget a small test
pull first before planning a large historical backfill.

---

## 2. ALPACA — free equities/crypto paper trading + IEX real-time

**FREE-BOUNDARY:** Free "Basic" plan is the default for BOTH paper and live accounts. Basic gets
real-time data from **IEX only** (not full-market SIP). Paid "Unlimited"/Algo Trader Plus plans add
direct CTA (NYSE) + UTP (Nasdaq) SIP feeds (100% market volume) and OPRA options data.
— CONFIRMED: [alpaca.markets/data](https://alpaca.markets/data),
[docs.alpaca.markets/us/docs/about-market-data-api](https://docs.alpaca.markets/us/docs/about-market-data-api)

**Paper trading specifics:** Free, available to all users, $100k virtual balance by default, covers
US equities/ETFs/crypto. Paper accounts are IEX-only regardless of live-account subscription (an
IBKR-style "inherit the live subscription" mechanism does NOT apply here per Alpaca's own forum/docs
— paper-only accounts get IEX only). Rate limit ~200 req/min on the free tier.
— CONFIRMED: [docs.alpaca.markets/us/docs/paper-trading](https://docs.alpaca.markets/us/docs/paper-trading),
corroborated by [Alpaca community forum: paper-trading-with-iex-streamed-data](https://forum.alpaca.markets/t/paper-trading-with-iex-streamed-data/16408)

**Options data:** Free/basic tier defaults to `indicative` options feed (NOT real OPRA quotes); real
OPRA feed requires the "Algo Trader Plus" paid subscription. Historical options data available since
Feb 2024 but current-quote depth on free tier is indicative-only.
— CONFIRMED, primary: [docs.alpaca.markets/reference/optionchain](https://docs.alpaca.markets/reference/optionchain),
[docs.alpaca.markets/docs/real-time-option-data](https://docs.alpaca.markets/docs/real-time-option-data)

**SDK:** `alpaca-py` (official, Python ≥3.7), replaces the older `alpaca-trade-api-python`. No arm64
issues reported (pure-Python HTTP/WS client). — CONFIRMED: [github.com/alpacahq/alpaca-trade-api-python](https://github.com/alpacahq/alpaca-trade-api-python)
(predecessor repo confirms free=IEX/paid=SIP split pattern carried into alpaca-py per community usage).

**What's genuinely free:** US equities/ETF OHLCV + IEX-sourced real-time quotes/trades, paper
execution with realistic order types (bracket/OCO), crypto pairs. NOT free: SIP full-tape depth, real
OPRA options quotes, true L2/depth-of-book (Alpaca free tier is top-of-book/trades, not multi-level
depth) — no free MBP-10-equivalent equity orderbook here.

---

## 3. YFINANCE — free but unofficial, ToS/reliability risk

**Coverage:** OHLCV (historical + near-real-time delayed) across equities/ETFs/indices/FX/crypto via
scraping Yahoo's unofficial internal endpoints. No official API — Yahoo decommissioned its official
finance API 2017-05-15 after data misuse.
— CONFIRMED, primary (project's own disclaimer): [github.com/ranaroussi/yfinance](https://github.com/ranaroussi/yfinance),
[pypi.org/project/yfinance](https://pypi.org/project/yfinance/)

**ToS caveat (verbatim from the library's own docs):** "yfinance is not affiliated, endorsed, or
vetted by Yahoo, Inc… intended for research and educational purposes… the Yahoo! finance API is
intended for personal use only." Commercial/production use carries real ToS-violation and
IP-blocking risk; endpoints change without notice (operational fragility, not just legal).
— CONFIRMED, primary: [ranaroussi.github.io/yfinance docs](https://ranaroussi.github.io/yfinance/)

**Verdict:** free, zero setup, fine for research/backtesting/personal use (which is Fable's P0-P2
build context) — do NOT treat as a durable production data source; no SLA, no ToS grant, scrape-risk
of silent breakage or IP block under heavy polling.

---

## 4. POLYGON.IO — free tier is thin

**FREE-BOUNDARY:** 5 API calls/minute rate limit (hard cap, confirmed both by Polygon's own knowledge
base and independent comparison sites). Free tier = **aggregates/OHLCV only, end-of-day** — no
real-time quotes/trades/snapshots, no live intraday data (current trading day unavailable until after
close).
— CONFIRMED, primary: [polygon.io/knowledge-base: what-is-the-request-limit-for-polygons-restful-apis](https://polygon.io/knowledge-base/article/what-is-the-request-limit-for-polygons-restful-apis),
[polygon.io/pricing](https://polygon.io/pricing)

**Options chain:** free tier does NOT include real-time options chain access; a 2021 review found "no
options data" on the starter plan at all, and current pricing implies options-chain access sits
behind paid tiers. Treat free-tier options access as effectively NONE for live/current-day use.
— PARTIALLY CONFIRMED (older third-party review + current pricing-page implication, not a direct
2026 vendor statement of "options chain: paid-only") — mark this line UNCONFIRMED-precise, but
directionally solid: don't plan on Polygon free for options chain.

**Verdict:** useful only as a secondary/backup OHLCV source for historical, end-of-day, low-frequency
lookups. Not a real-time or orderflow source at $0 — 5 req/min kills any live use case.

---

## 5. IBKR PAPER — the gotcha, CONFIRMED and it is real

**THE GOTCHA (verified, this is the headline finding):** A paper trading account does NOT
independently grant free real-time market data. Default paper-account behavior without any linked
live subscription is **15-minute DELAYED data** — "useless for anything intraday."
— CONFIRMED, primary: [interactivebrokers.com/en/trading/papertrader-delayed-data.php](https://www.interactivebrokers.com/en/trading/papertrader-delayed-data.php)

**How real-time actually gets to the paper account:** market-data subscriptions are billed at the
TWS username level, NOT per account — paper users are the one exception in that they can INHERIT
subscriptions from a linked LIVE account. Mechanism: open a real (can be $0-funded in some regions,
but must be a genuine opened/live account, not a demo/trial) IBKR account, subscribe to the market
data package you need there (has a monthly fee, though IBKR often rebates it against commissions),
then in Client Portal go to Settings → Paper Trading → share market data — takes up to 24h to
propagate. Also: while sharing is active, you cannot be logged into the live username elsewhere
simultaneously, or the paper session loses the real-time feed.
— CONFIRMED, primary: [interactivebrokers.com/campus: subscribing-to-data](https://www.interactivebrokers.com/campus/trading-lessons/subscribing-to-data/),
[interactivebrokers.com/campus: market-data-subscriptions](https://www.interactivebrokers.com/campus/ibkr-api-page/market-data-subscriptions/)

**Unfunded/trial/demo accounts get NOTHING via API:** IBKR support has explicitly stated trial/demo
(unfunded, non-opened) accounts are not supported for ANY API offering, including delayed-only
access. An "Opened IB Account" is required before the API layer functions at all — this is separate
from and stricter than the delayed-vs-real-time question.
— CONFIRMED, primary/support-sourced claim corroborated by trading-lesson docs above.

**Gateway vs TWS for automation:** IB Gateway is the lighter-weight, headless-friendly option for
automated/API trading (no full GUI overhead); both expose the same TWS API. Can run live + paper
simultaneously only via two separate Gateway/TWS instances on different ports (not supported in the
newer unified IBKR Desktop app).
— CONFIRMED: [interactivebrokers.com/en/trading/ib-api.php](https://www.interactivebrokers.com/en/trading/ib-api.php)

**Verdict — this breaks a "$0" assumption if the research doc assumed free real-time on paper:**
IBKR paper trading is free EXECUTION-only. Free MARKET DATA on paper is 15-min-delayed unless you
open (and likely fund + subscribe on) a live account and link it. If Fable's plan is "IBKR paper for
$0 real-time equities/futures data" — that is WRONG. IBKR paper is the right choice for $0 order
routing / execution simulation, paired with Databento or Alpaca IEX for the actual real-time feed,
not as its own free real-time data source.

---

## 6. CRYPTO TESTNET — Binance + Bybit, confirmed current and free

**Binance Spot Testnet:** base endpoint `https://testnet.binance.vision/api`; GitHub-auth signup at
`testnet.binance.vision`, generates API key/secret. Free, mirrors production REST/WebSocket/FIX.
`/sapi` namespace NOT available on testnet (spot-only `/api`). Resets ~monthly (keys persist across
resets since Aug 2020). Recent 2026 changes: WebSocket infra upgrade window 2026-07-02, SBE 3:1 schema
retired 2026-06-29 — endpoints are ACTIVE and maintained, not stale/abandoned.
— CONFIRMED, primary: [developers.binance.com/docs/binance-spot-api-docs/testnet](https://developers.binance.com/docs/binance-spot-api-docs/testnet),
[testnet.binance.vision](https://testnet.binance.vision/),
[github.com/binance/binance-spot-api-docs](https://github.com/binance/binance-spot-api-docs)

**Binance Futures Testnet:** separate free testnet with its own API key generation flow via the
Binance Futures Testnet UI. — CONFIRMED, primary (same docs tree above).

**Bybit Testnet:** public market-data WebSocket streams (orderbook, trades) require NO API key/auth
at all, free, identical to mainnet behavior. Current testnet endpoints:
`wss://stream-testnet.bybit.com/v5/public/spot` (spot), `.../public/linear` (USDT/USDC perp + USDT
futures), `.../public/inverse`, `.../public/option`. Orderbook subscribe:
`{"op":"subscribe","args":["orderbook.1.BTCUSDT"]}` — snapshot then delta stream, resync on
re-snapshot. WebSocket usage does NOT count against REST rate limits.
— CONFIRMED, primary: [bybit-exchange.github.io/docs/v5/websocket/public/orderbook](https://bybit-exchange.github.io/docs/v5/websocket/public/orderbook),
[bybit-exchange.github.io/docs/v5/ws/connect](https://bybit-exchange.github.io/docs/v5/ws/connect),
official SDK [github.com/bybit-exchange/pybit](https://github.com/bybit-exchange/pybit)

**YURI existing wiring — FLAG:** the task brief states crypto testnet is "already wired in YURI."
Local repo search (`grep -rli "binance\|bybit"` under `_SYSTEM/Scripts`, `find -iname "*orderflow*"`)
found live-exchange crypto alpha/signal code (`_SYSTEM/Scripts/alpha-factor-library/{crypto-structural-signals,funding-skew,funding-carry,ofi-edge-validate,...}.mjs`) and orderflow-quant planning docs
(`.claude/memory/proj-orderflow-quant-pivot-2026-07-06.md`, `02_RESOURCES/RESEARCH/orderflow-quant-*`)
— but **no literal `testnet.binance.vision` or `stream-testnet.bybit.com` string** anywhere in the
repo (both greps returned zero hits). UNCONFIRMED / LIKELY STALE ASSUMPTION: the existing crypto
wiring appears to target LIVE endpoints for signal research, not the free testnets specifically.
Fable should treat testnet endpoint wiring as NEW work, not confirm-and-reuse.

---

## P0-P2 $0 FEASIBILITY VERDICT

**YES — Fable can get real ES orderflow + free equities OHLCV + paper execution at $0**, with three
corrections to the assumed plan:

1. **Databento $125 credit is real and current** — it is the correct proof wedge for real ES MBP-10
   depth-of-book data (historical confirmed; live-feed billing for futures specifically should be
   re-verified at signup since the 2025 pricing change was documented for equities). SDK installs
   clean on arm64/macOS. Budget the credit carefully — exact byte-cost per MBP-10 pull is unconfirmed,
   test with a small date range first.
2. **IBKR paper ≠ free real-time data — GOTCHA CONFIRMED.** Paper trading gives free EXECUTION
   simulation only; market data defaults to 15-min delayed unless linked to a live, subscribed
   account. If the research doc assumed "IBKR paper = free real-time," that assumption is WRONG and
   must be corrected: use IBKR paper for order-routing/execution testing, and Databento/Alpaca IEX
   for the actual real-time feed.
3. **Free equities OHLCV + basic real-time:** Alpaca (IEX real-time, free, paper trading, clean
   `alpaca-py` SDK) is the stronger free equities source; yfinance is a fine ToS-risky backup for
   research-only OHLCV; Polygon free tier is essentially end-of-day-only with a crushing 5 req/min
   cap — treat as tertiary/backup, not primary.
4. **Crypto testnets (Binance + Bybit) are free, current, and confirmed live as of the 2026-07
   changelogs** — genuinely $0, no gotchas found. But local repo evidence shows this is NOT yet
   wired to the testnet endpoints specifically (existing code targets live exchanges for signal
   research) — budget it as new integration work, not "already done."

Net: the $0 stack holds for P0-P2, provided Fable corrects the IBKR-data assumption up front and
treats crypto-testnet wiring as net-new rather than reused.
