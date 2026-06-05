# Next Session Boot Packet — 2026-06-05 (offload consolidation done; rename next)

> This file is the next-session context anchor. Kept synced to reality (model = reality). The prior 2026-05-20 version was stale — this session opened on it and had to rediscover state; that is the failure this packet exists to prevent.

## Current State (verified, 2026-06-05)
- **Active branch:** `feat/offload-consolidation` — NOT yet merged to `main`. Two commits: `f2ac55dc` (consolidation) + `529d8fd2` (red-team hardening). All pushed to origin.
- **main** is at `f6aa695d` — the xref/propagation engine V1 + PC-1 + circuitry wiring + reasoning-lane adapters, merged via PR #2 (squash).
- GitNexus index is **STALE** (last `4f71bb7`, pre-consolidation). Deliberately deferred — the rename pass (next) does ONE reindex covering consolidation + rename. Run `npx gitnexus analyze --skip-agents-md` as part of that.

## The 3 reasoning lanes (THE canonical set — for a heavy-context task)
The offload stack was consolidated to **exactly three** external LLM lanes. Single source of truth: `.claude/config/models.json` → `offload_lanes`.

| lane token | model | route | ctx | output cap |
|---|---|---|---|---|
| `deepseek` | `deepseek-v4-pro` | DIRECT `api.deepseek.com/v1` (`DEEPSEEK_API_KEY`) | 1,000,000 | xhigh=131072 |
| `nemotron` | `nvidia/nemotron-3-ultra-550b-a55b` | NVIDIA NIM `integrate.api.nvidia.com/v1` (`NVIDIA_API_KEY`) | 1,000,000 | xhigh=32768 (OPEN, conservative) |
| `kimi` | `moonshotai/kimi-k2.6` | NVIDIA NIM (NOT moonshot-direct) (`NVIDIA_API_KEY`) | 1,000,000 | xhigh=32768 (OPEN, conservative) |

- **All three have a 1M CONTEXT window** (input). The output `max_tokens` is a SEPARATE knob — don't conflate (see memory `[[reasoning-lanes-three-1m-context]]`). DeepSeek counts reasoning_tokens against output, so heavy prompts at max need the raised cap.
- **Dispatch (full-spectrum, disciplined):** `node _SYSTEM/Scripts/{deepseek,nemotron,kimi}-dispatch.mjs --task @<file> --files "<comma,list>" --briefing @<file> --handles @<file> --reasoning max --out <prompt-file>`. The adapter composes a discipline preamble + GitNexus symbol inventory + canonical handles + briefing; the model RESPONSE goes to stdout, the prompt artifact to `--out`. All 3 live-verified this session (kimi NIM revival proven on a 23KB red-team).
- **Loud-fail contract:** exit 0 ok · 1 transient (retry) · 2 rail-block · 3 permanent (unknown lane / missing key / bad endpoint — no retry). `OFFLOAD_FAIL code= lane= reason=` on stderr; truncated-but-non-empty answers emit `OFFLOAD_WARN code=0`. SSRF guard on the endpoint (https + no private/loopback).
- Legacy ~47 lanes are HARD-REMOVED. Only these 3 exist as offload reasoning lanes (Codex/gpt-5.5 is a separate collaborator lane, not in this set).

## NEXT-SESSION FIRST ACTION — the rename (atomic, lockstep)
Rename the track `offload` → **"LLM Compatibility lane"** (owner-confirmed). Command `ai llm`; files `llm-compat-*.mjs`; graph nodes/sector "LLM Compatibility". **Hard sweep ALL callers — NO `ai offload` alias.** Rename AFTER the rebuild (continuity law); carries the deferred propagation: graph → viz/manual → GitNexus reindex. Full plan + decisions: memory `[[offload-consolidation-and-rename]]`.

## Open owner decisions
- Merge `feat/offload-consolidation` → `main` before or as part of the rename? (PR via compare URL — `gh pr create` is perm-blocked, see `[[gh-pr-create-blocked-yuri-os]]`): https://github.com/nexuslinkproductions/yuri-os/compare/main...feat/offload-consolidation
- Nemotron + Kimi exact output ceilings (currently conservative 32768) — a dedicated max-output probe is optional; 32768 has headroom for normal tasks (none truncated this session).

## Do Not Repeat
- Don't conflate context-window (1M, input) with output `max_tokens` (the throttle). Two knobs.
- Don't `gh pr create` on this repo — perm-blocked; use the compare URL.
- Don't pre-rename `offload`→`llm` in docs before the code rename (doc-lie / continuity violation) — the rename pass does it lockstep.
- Read git/live state before trusting any plan doc; sync the doc if it lags (this packet + the master build plan).

## Artifacts to load first
- `02_RESOURCES/RESEARCH/yuri-master-build-plan-2026-06-04.md` — the build plan + live BUILD STATUS.
- `.claude/config/models.json` → `offload_lanes` — the 3-lane source of truth.
- memory: `[[offload-consolidation-and-rename]]`, `[[reasoning-lanes-three-1m-context]]`.
