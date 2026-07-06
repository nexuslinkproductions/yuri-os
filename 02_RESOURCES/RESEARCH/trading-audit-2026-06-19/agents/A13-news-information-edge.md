I have everything needed. The picture is now complete and confirmed at current code. Findings below.

```
AGENT 13 — A13 CROSS-CUTTING: news / information-edge layer
SUMMARY: A news ingestion scaffold EXISTS (RSS + Exa web search → lexicon score) but the entire NLP/event/catalyst/on-chain/macro pipeline Marcel wants is ABSENT, and what exists is telemetry-only — never wired to sizing.

[B | HIGH | DESIGN-FLAW] orchestrator.mjs:640-665 — social/news sentiment is an OVERLAY: computed into overlaySignals, pushed into snap.signals:698 for telemetry, then EXCLUDED from combineSignals:738 (only price signals sized). FIX: this is the same UNWIRED pattern as funding/OI/OFI — sentiment can't move a position until it joins combineSignals.

[B | HIGH | MISSING-PRINCIPLE] social-adapter.mjs:342-375 (LEXICON) + orchestrator.mjs:525-530 — sentiment is a NAIVE WORD-COUNT lexicon ("moon"=+1, "crash"=-1). No NLP, no entity/event extraction, no sarcasm/negation handling, no temporal-decay weighting. FIX: replace scorer with an LLM-lane event extractor (YURI has gemma/ollama/deepseek lanes via llm-lane.mjs) OR buy a FinBERT/crypto-NLP API — a 20-word lexicon on crypto Twitter is pure noise.

[A | HIGH | DESIGN-FLAW] agent-reach.mjs (Exa via mcporter) + orchestrator.mjs:520-538 — the "real news" path is a 12s Exa search → titles fed through the SAME lexicon scorer (scorePost). So "real web news" collapses back to keyword-counting on 6 search-result titles, cached 5min. FIX: this is theater-grade — it's not sentiment extraction, it's title keyword-matching. Either run an LLM over the result text or drop the claim.

[B | MED | MISSING-PRINCIPLE] NO catalyst/event-calendar layer exists. grep for macro/fomc/cpi/economic-calendar/catalyst → 0 hits in alpha-factor-library. FIX: add a scheduled-event calendar feed (FOMC, CPI, token unlocks, listings, halvings) — these are the ONLY news events with measurable, retail-accessible crypto edge at 4h-7d horizon.

[B | MED | MISSING-PRINCIPLE] NO on-chain/whale-flow signal. high-mover-scanner.mjs (the only grep hit) scans price volatility only — zero blockchain data. FIX: on-chain flow (exchange inflow/outflow, large-transfer alerts) via Glassnode free tier / Whale Alert API / Etherscan is the highest-edge retail-accessible alt-data class and is entirely absent.

[C | LOW | THEATER] afl-field-research-factors-2026-06-14.json:123-139 (pm-gdelt-news-tone) — a well-specified factor card (GDELT GKG tone, 15-min, free, days-horizon) but status=hypothesis/observe-only, NO ingestion adapter, NO code path. FIX: GDELT is genuinely free+ToS-clean and a good first real news feed — but it needs an adapter + it's still tone-only (no event typing).

HORIZON ANSWER: News-edge for retail is REAL only at 4h–7d (scheduled catalysts, on-chain flow shifts, narrative momentum). At <1h it's already priced by faster participants; at μs-HFT it's unachievable on M2/retail-internet (see A14). The 1-min TA ensemble currently sized is the WORST horizon for news — news doesn't resolve in 60s.

CAN YURI LLM LANES FEED IT: YES — gemma4:12b/ollama or deepseek-v4-pro via launch_substrate/llm-lane.mjs can do per-asset event+sentiment extraction over fetched article text at 5-15min cadence (well within the 4h-7d edge window). This is the single highest-leverage LLM use in the engine: replace lexicon scorer with a structured {event_type, direction, magnitude, time_horizon} extraction per news item.

BUILD-VS-BUY: (1) BUILD the GDELT adapter (free, spec'd) + an LLM-lane event extractor over it — zero new cost. (2) BUILD a catalyst-calendar feed from free sources (token-unlocks.com RSS, investing.com econ calendar). (3) BUY on-chain data only if edge is proven on free Whale Alert/Etherscan first — Glassnode ($39+/mo) only after DSR proves the free signal survives. (4) DO NOT buy a sentiment API (LunarCrush/Santiment) before the free GDELT+LLM path is validated — it's the same signal at a price.

VERDICT for slice: REDIRECT needed — the ingestion scaffold is real but the brain (NLP/event extraction) and the edge-class (catalyst calendar, on-chain flow) are entirely missing, and what exists is unwired to sizing (same overlay pathology as the structural signals).
MISSING quant principle: Structured event extraction + catalyst-calendar regime overlay — the only news surfaces with retail-accessible, multi-hour crypto edge; a 20-word lexicon on crypto social is not a sentiment model.
```

13_MC_NEWS_INFO_EDGE_LAYER_REDIRECT_HOLDING