---
name: Shintai team — name and roster sizing
description: SEAL team in Yuri is called Shintai (神隊 — divine unit). Roster is task-sized, not fixed at 5; favor minimum-viable composition.
type: feedback
originSessionId: e9dae089-cf56-4153-825f-7ce30d88e1d1
---
The heterogeneous multi-LLM team in Yuri (Codex + DeepSeek + Kimi + Nemotron + Claude) is called **Shintai (神隊)** — "divine unit." Pairs with the kami-coded vocabulary (Musubi, Kagami).

**Roster sizing rule** (favored composition by task type):

- **1 member** — very basic quick things (single-shot lookups, file reads, trivial fixes). Even the full SEAL framing is overkill; just dispatch to one lane.
- **2 members** (minimum favored for regular things) — typical workflow. Usually one specialist + one reviewer. Example: DeepSeek (impl) + Claude (review), or Codex (impl) + DeepSeek (verify).
- **3–5 members** — complex / critical-tier work only. Full Shintai roster (Codex Architect + DeepSeek Reasoner + Kimi Context-Keeper + Nemotron Long-Horizon + Claude Reviewer) reserved for rare cases.

**Why:** Pre-assigned skills + MCP tools per lane already cut overhead, but invoking 5 lanes when 1 would do is still waste. Match team size to task complexity tier.

**Why:** Marcel said this explicitly after K4 — "there can also only be one shintai needed, it doesnt always have to be all of them, favored is minimum 2 for regular things, 1 for very basic quick things."

**How to apply:** Before dispatching, ask: complexity tier? → trivial=1, standard=2, complex=3, critical=4-5. Don't auto-build the full roster.
