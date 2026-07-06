# Anthropic Claude MAX 20× — Exact Usage Limits (deep dig) — 2026-06-23

Owner asked for the EXACT Max 20× ceilings to calibrate the usage-governor. Dug primary Anthropic
sources. [P]=primary (anthropic.com / support.claude.com) · [S]=secondary corroboration · [L]=local evidence.

## VERDICT: Anthropic no longer publishes concrete Max 20× numbers

Every current **primary** Anthropic page gives only the *relative* multiplier + structure — no token, hour,
or message ceiling:

- **"What is the Max plan"** [P]: *"Max 20x provides 20 times more usage per session than the Pro plan"* and
  *"Max plans also have two weekly usage limits: one that applies across all models and another for Sonnet
  models only"* — **no concrete numbers**. Directs to Settings → Usage.
- **"Models, usage, and limits in Claude Code"** [P]: describes metering as *"a pool of usage… reset on a
  rolling window"*, says *"Opus costs several times more per turn than Sonnet"*, and explicitly
  *"Exact model names, versions, and availability change over time"* → run `/model` / `/usage`. **No fixed caps.**
- **"Understanding usage and length limits"** [P]: only *"different plans have different usage allowances"* +
  the 200K context window. **No Max weekly/5h numbers.**

This is deliberate: "hours" and "messages" don't map to a fixed token count (depends on context size, model,
and cache hits), so a precise published token ceiling cannot exist.

## The dual-weekly + 5-hour structure (the part that IS official) [P]

- **Two overlapping limits, both ROLLING** (not calendar-aligned): a **5-hour session window** (starts on
  first request, resets 5h later) + a **weekly window** (rolling 7 days from first prompt; *not* Monday reset).
- **Max plans carry two weekly caps**: one across the pool + one model-specific. Owner's own `/usage` screen
  (2026-06-23) [L, authoritative]: the pool combines all models in one weekly + 5h, and **Sonnet is the only
  excluded model with its OWN separate weekly** — so scaling Sonnet does not drain the main/Opus pool.
- **Shared pool**: Claude.ai chat + Claude Code + Desktop all bill the same limits.
- **Opus burns the pool fastest** → strategic model selection matters (the whole point of orchestrate-Opus /
  work-Sonnet).

## Best-available CONCRETE figures (historical — now STALE, flagged) [S, ≥2 sources]

The only concrete numbers that ever existed are the **July 28 2025** weekly-limit launch ESTIMATES:

| Plan | Sonnet hrs/wk | Opus hrs/wk | Msgs per 5h (old) |
|---|---|---|---|
| Pro | ~40–80 | — | ~10–45 |
| Max 5× | ~140–280 | ~15–35 | ~225 |
| **Max 20×** | **~240–480** | **~24–40** | **~900** |

**May 6 2026 change** [P, anthropic.com/news/higher-limits-spacex]: Claude Code **5-hour limits DOUBLED**
(Pro/Max/Team/seat-Enterprise); **peak-hour throttle REMOVED** for Pro/Max; Opus **API** rate limits raised.
Critically: **the WEEKLY caps did NOT change** — only the 5h spigot widened (≈2× → the old ~900 msg/5h ≈ ~1800
now). Treat any blog quoting an exact *current* weekly-hour figure as stale.

## The actual calibration (what to DO) [L]

The web's last mile is the owner's `/usage` screen; the governor supplies the matching token throughput.

1. **Snap-to-exact (10s, precise):** run `/usage` in Claude Code → read the % for each bucket (5h / weekly /
   Sonnet-weekly). `true_ceiling = (governor weighted tokens for that window) / (that %)`. One reading per
   bucket = exact ceiling for this account. The % is **not** locally readable (not in transcripts, not cached
   under `~/.claude` — verified), so only the owner's screen closes it.
2. **Provisional (armed now):** `_SYSTEM/config/usage-budget.json` seeded from the heaviest observed week
   (MAIN ~1.78B wk / ~76.8M 5h; SONNET ~52M wk) so the pace signal is live today; snaps exact on the first
   `/usage` reading.
3. **Plateau detection (passive):** when a real limit is hit, the 5h usage flattens; the governor's observed
   plateau back-calculates the ceiling with zero owner input.

## Sources
[P] support.claude.com/articles/11049741 (Max plan) · /14552983 (Claude Code models/usage/limits) ·
/11647753 (understanding usage and length limits) · anthropic.com/news/higher-limits-spacex (May 6 2026).
[S] truefoundry / morphllm / claudelog / inventivehq limits explainers (corroborate the July-2025 estimates +
May-2026 doubling). [L] owner `/usage` screen 2026-06-23; usage-governor measured throughput;
`feedback-sonnet-separate-weekly-quota`.
