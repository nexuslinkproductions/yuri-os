All evidence collected. The `onBook` emits `{bids, asks}` (not `topBids/topAsks`), and consumers expect `bids/asks` — so the naming is consistent, the brief's "emits bids/asks not topBids/topAsks" concern is a non-issue (consumers consume `bids/asks` correctly). The fail-open + reconnect pattern is correct across all feeds. Now I have everything needed.

```
AGENT 07 — Microstructure feeds + live daemon + server
SUMMARY: The 94.7% crossed-book bug is fixed OFFLINE only (tape-replay.mjs insideMarket L31-44); the LIVE depth-book.mjs emit() still ships crossed levels to as-quote-live — and tick-stream is Coinbase-wired against a Binance-only daemon (A14 CONFIRMED).

[A | CRITICAL | BUG] tick-stream.mjs:16 — CONFIRMED cross-venue. tick-stream connects to wss://ws-feed.exchange.coinbase.com (Coinbase, product_id 'BTC-USD'). The daemon main cycle is Binance-only (orchestrator.mjs:82-87 "binance only", PerpAdapter, venue:'binance' at L1053). observatory-server.mjs:447 feeds applyTick(...,venue:'coinbase') from the Coinbase feed into a Binance-modeled paper engine. Two venues, two symbol formats ('BTC-USD' vs 'BTCUSDT'), two price regimes — risk-exits fire against the wrong venue's price. FIX: rewrite tick-stream to consume Binance USDⓈ-M @trade or @bookTicker WS (wss://fstream.binance.com), or delete it (depth-book+trades-stream already cover Binance feeds).

[A | HIGH | BUG] depth-book.mjs:176 (emit) + :82 (extractTopN) — the 94.7% crossed-book fix was applied ONLY in tape-replay.mjs (insideMarket L31-44, L165-175). The LIVE depth-book emit() calls extractTopN which sorts-all-then-slices WITHOUT uncrossing; stale crossed extremes still leak to bids[0]/asks[0] → as-quote-live computeLiveQuote L70-72 detects isCrossed but only falls back to mid (does NOT fix the bid/ask arrays it feeds to computeMicroprice/multi-level-OFI). FIX: port insideMarket into depth-book extractTopN or emit() so the live book guarantees uncrossed top-of-book before onBook.

[B | HIGH | DESIGN-FLAW] observatory-server.mjs:447 — even after a venue fix, tick-stream's applyTick writes venue:'coinbase' hardcoded, overriding the engine's Binance venue on tick entries. Paper positions opened on Binance prices would have risk-exits computed on Coinbase ticks. FIX: hardcode venue:'binance' or pass-through the stream's actual venue.

[B | MED | DESIGN-FLAW] observatory-server.mjs:489-491 — as-quote-live is started with symbol:'BTCUSDT' (Binance) which is correct for its depth-book/trades/mark feeds (all Binance fstream). But if tick-stream is also armed, fastRiskExit (L452) evaluates paper positions from the orchestrator's Binance cycle against Coinbase tick prices — silent venue mismatch in the risk-exit path. FIX: both feeds must be the same venue.

[C | LOW] depth-book.mjs:180, as-quote-live.mjs:72 — onBook emits {bids,asks} (NOT topBids/topAsks); computeMicroprice/computeOBI (orderbook-imbalance.mjs:104,61) expect bids/asks — naming is CONSISTENT, not a bug.

[C | LOW] depth-book.mjs:243-246, tick-stream.mjs:65-68, trades-stream.mjs:85-88, mark-price.mjs:153-156 — WS fail-open + exp-backoff reconnect is CORRECT across all 4 feeds (onclose→scheduleReconnect, onerror→close→reconnect, backoff capped at maxBackoffMs, reset on open). No fail-open vulnerability.

[C | LOW] depth-book.mjs:23 — "10s→100ms" latency claim is HONEST: MIN_RESYNC_MS=10_000 (L23) is the REST snapshot rate-limit floor (1 req/10s/IP per Binance), NOT the tick cadence. The diff-depth WS stream IS @depth@100ms (L241). The comment "turns the daemon's 10s REST poll into ~100ms" is accurate — depth-book IS event-driven at 100ms.

[B | MED | DESIGN-FLAW] as-quote-live.mjs:47-56 — INV-1 paper-only is VERIFIED: imports only view-only modules (depth-book, trades-stream, mark-price) + pure math; fills are simulated via maker-exec-measure onTrade against public trade stream. No order/auth path exists. But κ (L142) loads from fill-surface JSON — if stateDir or κ load fails, quoting blocks (fail-open, no quoting) which is safe but means the engine silently idles.

[C | LOW] as-quote-live.mjs:126, observatory-server.mjs:558 — stateDir resolves via module-relative path.dirname(fileURLToPath(import.meta.url)),'../../../state' → _SYSTEM/state. VERIFIED CORRECT (resolves to _SYSTEM/state where fill-surface-*.json lives). NOT cwd-relative. Brief's "stateDir cwd-relative" concern is a non-issue.

[C | LOW] observatory-auth.mjs:117-128 — auth gate is CORRECT: env-only token (INV-2), constant-time timingSafeEqual (L91), loopback open, X-Forwarded-For ignored (L36), 401 on failure. No bypass.

VERDICT for slice: REFACTOR needed — the cross-venue tick-stream bug (Coinbase feed into Binance engine) is a live correctness defect if armed, and the live depth-book crossed-book gap is a silent data-corruption path into as-quote-live's quote/OFI/microprice math.
MISSING quant principle: venue-consistency invariant — all feeds feeding a single paper engine + risk-exit path MUST be the same venue (price basis, fee model, symbol format). No cross-venue price-stitching exists or is attempted; this is assumed-but-not-enforced.
```