---
name: feedback-usage-governor-more-sonnet
description: "STANDING (Marcel 2026-06-23): use MORE Sonnet agents (weekly headroom confirmed); track actual weekly Claude usage per tier + pace it across 7 days via the usage-governor"
metadata: 
  node_type: memory
  type: feedback
  tier: binding
  scope: global
  trig: 
    - more sonnet
    - usage governor
    - weekly usage
    - token budget
    - throttle
    - how much usage left
    - pace the week
  refs: 
    - feedback-opus-orchestrates-sonnet-haiku-agents
    - feedback-sonnet-separate-weekly-quota
    - feedback-fleet-parallelism-breadth-depth
  originSessionId: 204ff7df-f0b6-49d3-9d27-c26c2bacfbf1
---

RULE: Scale Sonnet-agent fan-out UP — Marcel checked the weekly usage and there is real headroom; don't ration Sonnet. WHEN: any substantive build/research/review fan-out (the opus-fleet model). DO: spawn MORE parallel Sonnet `Agent`s (model:"sonnet", max reasoning) — breadth over timidity; delegate legwork off the Opus/main pool aggressively. DONT: under-spawn; don't burn Opus on work a Sonnet lane can do. WHY: Sonnet is the ONLY model on its OWN separate weekly pool, and the usage-governor quantified the gap — a marathon week ran the MAIN pool ≈1.78B usage tok vs SONNET ≈52M (main ≈34× Sonnet's). Burn the Sonnet pool; it doesn't touch the main weekly. Use the cheap separate pool.

THE GOVERNOR (Marcel's idea, BUILT + corrected 2026-06-23, commits c423a57a→a4127e09): `_SYSTEM/Scripts/usage-governor.mjs` (@capability usage-governor) — scans `~/.claude/projects/**/*.jsonl` READ-ONLY, aggregates real per-message TOKEN USAGE per quota POOL over BOTH a rolling 7-day AND a rolling 5-hour window, emits a `paceSignal` (throttle up/hold/down vs a configured budget). CLI: `node usage-governor.mjs [--json]`. 9/9 tests; SELF-CONTAINED (decoupled from token-ledger). **USAGE-NOT-COST**: MAX is flat usage, NOT pay-per-token — NO dollar figure; token usage IS the quota signal (owner: "get away from actual pricing"). **THE MAX 20× POOL MODEL (owner-corrected — local [[feedback-sonnet-separate-weekly-quota]] had it RIGHT; a research lane got it wrong):** ALL Anthropic models EXCEPT Sonnet share ONE 'main' pool (a weekly limit + a 5-hour limit); SONNET is the ONLY excluded model → its OWN separate weekly; 'other'=GLM/non-Anthropic (not quota). Anthropic's exact weekly % is NOT locally readable → calibrate `_SYSTEM/config/usage-budget.json` (`{mainWeeklyTokens, main5hTokens, sonnetWeeklyTokens, sonnet5hTokens}`) to arm pacing. **EXACT-NUMBERS DIG (2026-06-23, primary sources — don't re-dig):** Anthropic NO LONGER publishes concrete Max 20× token/hour/message ceilings — official docs give ONLY "20× Pro/session" + dual-weekly + 5h-rolling. Stale July-2025 estimates: Max 20× ≈ 240–480 Sonnet hrs + 24–40 Opus hrs/wk, ~900 msg/5h; May-6-2026 DOUBLED the 5h window (weekly unchanged, peak-throttle removed). SNAP-TO-EXACT: owner runs `/usage`, reads the % per bucket → `true_ceiling = governor-measured-tokens / that%` (the % isn't in transcripts or cached under ~/.claude — only his screen has it). Budget seeded PROVISIONAL from heaviest observed week (MAIN ~1.78B wk; SONNET ~52M). Full capture: `02_RESOURCES/RESEARCH/anthropic-max20x-usage-limits-2026-06-23.md`. ARMED 2026-06-23: live read = MAIN wk 93.4% (DOWN), SONNET wk 2.5% (UP) → quantifies "use more Sonnet." NEXT: tag usage per completed task + dashboard surface + company self-throttle. SEE [[feedback-opus-orchestrates-sonnet-haiku-agents]] [[feedback-sonnet-separate-weekly-quota]].
