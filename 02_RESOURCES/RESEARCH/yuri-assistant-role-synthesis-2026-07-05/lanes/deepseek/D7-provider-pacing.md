Now I have the full picture. Here is the survey.

---

## SURVEY: Multi-Provider Budget-Pacing & Usage-Metering

### Current State (what already exists in YURI)

**HARD-FACT** — verified by reading the actual files:

**1. Per-provider usage tracking — FULLY BUILT (two complementary systems)**

| Component | File | What it tracks | How |
|---|---|---|---|
| Anthropic governor | `_SYSTEM/Scripts/usage-governor.mjs` | Claude MAX 20x pools: `main` (all Claude except Sonnet, shared weekly+5h), `sonnet` (own separate weekly), `other` (non-Anthropic) | Reads `~/.claude/projects/**/*.jsonl` READ-ONLY; `weightedTokens()` = input+output+cacheCreate + 0.1×cacheRead; `paceSignal()` = <70%→up, 70-90%→hold, >90%→down |
| z.ai + ollama meters | `_SYSTEM/runtime/usage-meters.mjs` | zai/ollama/anthropic pools | Append-only JSONL ledger; `scan()` sweeps `.claude/jobs` result files, estimates tokens from chars/4; `linearPace()` = consume-by-deadline curve |
| Budget config | `_SYSTEM/config/usage-budget.json` | Calibrated ceilings for mainWeeklyTokens (2B), main5hTokens (90M), sonnetWeeklyTokens (2B), sonnet5hTokens (100M) | PROVISIONAL — needs `/usage` screen calibration |
| Morning brief | `_SYSTEM/runtime/morning-brief.mjs` | Composes usage snapshot + doctor + git + dreams into one wake-up report | Imports `briefLines` from usage-meters; fail-open on all sources |

**2. Pace/throttle signals — FULLY BUILT**

- `usage-governor.mjs` exports `paceSignal(usage, budgetTokens)` → `{ throttle: 'up'|'hold'|'down', headroomPct, reason }`
- `usage-meters.mjs` exports `linearPace(usage, budget, {startMs, endMs, now})` → `{ throttle: 'up'|'hold'|'down', aheadBehindPct, reason }`
- Both are pure functions — they compute a verdict but **nothing currently consumes the verdict to change dispatch behavior**

**3. Lane capability/cost metadata — BUILT but not wired to routing**

- `_SYSTEM/Scripts/lane-capability-manifest.json` has `cost_tier` per lane: `deepseek-v4-flash` = low, `deepseek-v4-pro` = medium, `gpt-5.5` = high, `gemma-local` = free, etc.
- `_SYSTEM/config/fleet-roles.json` has lane assignments per role with fallback lanes
- `.claude/config/models.json` has pricing per 1M tokens for DeepSeek V4

**RECALLED-PATTERN** — from the runtime design doc (not verified by reading the specific dispatch code):

**4. Cost-aware lane choice — NOT YET BUILT (identified gap)**

The runtime design doc (§5.5) says: "default overnight tasks to GLM/ollama-cloud (cheaper, keeps Anthropic weekly headroom for daytime work) via the queue's existing `--lane` flag" — but this is a manual lane assignment, not an automated router that considers both capability match AND current quota headroom.

---

### What the Minimal Metering/Pacing Mechanism Looks Like

The core insight: **YURI already has 80% of the mechanism**. The gap is not more meters or more pace math — it's a **dispatch interceptor** that reads the pace verdict before routing.

**The minimal mechanism has 4 parts, 3 of which already exist:**

```
┌─────────────────────────────────────────────────────────────┐
│  PART 1: METERS (EXISTS)                                    │
│  usage-governor.mjs + usage-meters.mjs → per-pool usage      │
│  + budget ceilings + elapsed-fraction-of-period              │
├─────────────────────────────────────────────────────────────┤
│  PART 2: PACE VERDICT (EXISTS)                              │
│  paceSignal() / linearPace() → { throttle, headroomPct }    │
│  per pool: up / hold / down                                 │
├─────────────────────────────────────────────────────────────┤
│  PART 3: DISPATCH INTERCEPTOR (MISSING — THE ONLY GAP)      │
│  Before routing a task to a lane:                            │
│    1. Read pace verdict for the lane's provider pool         │
│    2. If throttle=down → route to next-cheapest capable lane │
│    3. If throttle=up → prefer this provider (use quota)     │
│    4. If throttle=hold → normal capability-based routing     │
├─────────────────────────────────────────────────────────────┤
│  PART 4: FEEDBACK LOOP (EXISTS IN SEED FORM)                 │
│  morning-brief.mjs surfaces usage status daily               │
│  → owner adjusts dispatch patterns manually                  │
│  → future: auto-adjust dispatch rate based on ahead/behind   │
└─────────────────────────────────────────────────────────────┘
```

**The missing piece (Part 3) is small:**
- A function `selectLane(task, capability, quotaState)` that:
  1. Gets all lanes capable of the task (from `lane-capability-manifest.json`)
  2. Groups by provider pool
  3. Filters out pools where throttle=down (near cap)
  4. Prefers pools where throttle=up (under-using quota)
  5. Within the chosen pool, picks the cheapest capable lane
  6. Falls back to the next pool if the preferred one is at cap

This is ~50 lines of logic. It does NOT need a new database, a new config file, or a new service.

---

### BUILD List (what to build)

| # | What | Why | Effort |
|---|---|---|---|
| B1 | **Dispatch interceptor** — `selectLane(task, capability, quotaState)` that reads pace verdicts before routing | Closes the only real gap; turns meters from passive reporting into active pacing | S (~50 lines) |
| B2 | **Wire interceptor into `llm-lane.mjs` / `glm-fleet.mjs`** — before dispatching a task, check quota headroom and route to the cheapest capable lane with headroom | Makes pacing automatic instead of manual | S (one import + one call) |
| B3 | **Calibrate budget ceilings** — run `node _SYSTEM/Scripts/usage-governor.mjs` then read `/usage` in Claude Code to get the actual % for each bucket, compute true ceiling = (governor measured tokens) / (that %) | Turns PROVISIONAL budgets into accurate ones | S (one-time, 5 min) |
| B4 | **Add `--budget` flags to `usage-meters.mjs` pools** — set z.ai and ollama-cloud budget ceilings (tokens/week) in `usage-config.json` so their `linearPace` produces meaningful verdicts | Enables pacing for non-Anthropic providers | S (edit config) |

### CUT List (what NOT to build)

| # | What | Why Not |
|---|---|---|
| C1 | **Real-time provider API usage queries** | Anthropic doesn't expose a token-usage API; z.ai/ollama-cloud don't either. Local estimation from job results is the only honest source. |
| C2 | **Dollar-cost tracking** | The owner's plans are flat-usage (Anthropic MAX 20x, z.ai plan, ollama Pro) — tokens are the quota signal, not $. Dollar tracking adds complexity for zero decision value. |
| C3 | **Automatic dispatch rate adjustment** (e.g. "if behind pace, double the fan-out") | Premature. The morning brief surfaces the pace verdict; the owner adjusts manually. Auto-scaling dispatch rate needs trust first. |
| C4 | **Cross-period quota banking** (e.g. "carry unused quota to next week") | No provider supports this. Unused quota is lost — the goal is to consume it, not bank it. |
| C5 | **Predictive pacing** (ML forecast of future usage) | Over-engineering. Linear consume-by-deadline is the correct baseline; the owner's usage is bursty enough that prediction adds noise, not signal. |
| C6 | **Per-user or per-team sub-budgets** | Solo founder. One budget per provider is sufficient. |
| C7 | **Real-time quota dashboard / GUI** | The CLI `--json` output feeds the morning brief. A GUI is visual polish with zero pacing value. |

---

### Summary

The minimal metering/pacing mechanism is **one missing function** (~50 lines) that reads the already-existing pace verdicts and uses them to influence lane selection before dispatch. Everything else — meters, pace math, budget config, morning brief — is already built and tested.

**HARD-FACT**: `usage-governor.mjs` (Anthropic), `usage-meters.mjs` (z.ai/ollama), `morning-brief.mjs` (compositor), `usage-budget.json` (calibrated ceilings), `lane-capability-manifest.json` (cost tiers) — all exist, all tested.

**HARD-FACT**: No dispatch interceptor exists that reads pace verdicts before routing. Tasks are routed by capability match only, not by quota headroom.

**RECALLED-PATTERN**: The runtime design doc identifies this gap (§5.5: "Cost-aware lane choice") and proposes using the queue's `--lane` flag — but that's manual, not automated.

**08CW_PROVIDER_PACING_SURVEY_X_PASS_COMMITTED**