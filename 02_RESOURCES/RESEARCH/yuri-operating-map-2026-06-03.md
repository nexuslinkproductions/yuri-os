# YURI Operating Map — Agent Quick-Reference (2026-06-03)

Compact always-loadable circuit reference. Full detail: [Architecture Codex](yuri-architecture-codex-2026-06-03.md). Recall: `ai search "<topic>"`.

## Heartbeat (fire-order)
- **SessionStart:** token-init → **brain-inject** (`<yuri-brain>`) → musubi-ingest → async{startup-offload, scout, eot-bg}
- **UserPromptSubmit:** user-prompt-submit → spawn **yuri-recall** (prior-turn-lag) → consume brain:stale → skill triggers → emit `<brain-update>`
- **SubagentStart:** soul-persona-inject (`<soul-persona>`, 9 rules) → sentinel-start  *(every subagent gets the persona)*
- **PreToolUse (11):** pre-tool-gate → **bash-security-guard**(+role) → **operator-write-guard**(protected+symlink) → tirith-url → protocol-guard → pre-tool-use(ctx→compact) → musubi-enforce → **yuri-risk-lite**(hard-block) → token-budget → gitnexus → agent-spawn-guard
- **PostToolUse:** post-tool-use(state) → scout → token-logger → checkpoint → **energy-tick**(ΔU) → gitnexus
- **Stop:** sentinel-stop → token-end(weekly) → memory-session-write(MEMORY.md) → token-status → **yuri-dream**(dream-queue)

## Four organs
- **Spine = Symbiotic Pulse** (fires every visible input: source→intent→authority→risk→claims/evidence→act). The substrate.
- **Brain = brain-inject** (Zone-A stable cacheable + Zone-C volatile).
- **Conscience = Energy** (computeU 9-term + ΔU + gateProposal veto/floor/threshold). **Observability-only.**
- **Memory = two-track + FSRS subconscious** (Track A ledger memory.db + Track B ~/.claude memory/ + cold store **empty/dormant**).

## Where things live (key files)
- Energy: `_SYSTEM/Scripts/math/yuri-energy.mjs` (computeU/gateProposal), `energy-tick-core.mjs`, hook `.claude/hooks/energy-tick.mjs`, trace `_SYSTEM/state/energy-trace/*.jsonl`, weights `_SYSTEM/SELF/energy-weights.json`
- Memory: `memory-kernel.mjs` (A), `claude-memory-write.mjs` (B), `memory-relocator.mjs`+`kagami-memory-consolidator.mjs` (subconscious), `yuri-recall.mjs`, `yuri-fsrs.mjs`; DBs `OS_KERNEL/{memory.db, memory-cold.db}`
- Search: `yuri-search.mjs`/`yuri-search-index.mjs`, `OS_KERNEL/search-index.db`, CLI `_SYSTEM/Scripts/ai` (`ai search|reindex`)
- Governance: `.claude/hooks/{bash-security-guard,operator-write-guard,yuri-risk-lite,claude-protocol-guard,tirith-url-guard}.js`, role `yuri-operator.cjs`, deny-list `.claude/settings.json`
- Brain/spine: `.claude/hooks/{brain-inject,user-prompt-submit,soul-persona-inject}.js`; `SOUL.md`/`_SYSTEM/persona.md`/`yuri-origin.md`
- Skills: `yuri-skill-loader.mjs`(hash integrity), `yuri-active-skill-registry.mjs`, `context-router.mjs`, `skills/skill-index.json`, `_SYSTEM/skill-hash-registry.json`, `.agents/agent-index.json`
- Learning: `neuron-loop.mjs`(9-phase, **never ran**), `yuri-dream.js`/dream-processor, `lane-calibration.mjs`, `yuri-closeout.mjs`, `_SYSTEM/learning/global.md`(**empty**)

## DORMANT (built-not-wired) — quick ref
LOW: subconscious(`YURI_SUBCONSCIOUS_EXECUTE=1`) · global.md write-side · trajectory metrics+halfLife · checkpoint/scout-log readers. MED: neuron-loop plist debug · anime-DNA triggers · lane-calib feedback · pluggable evaluator terms · red-team→neuron-loop · MCP shim. HIGH: energy ACTION mode (#1 lever) · semantic FTS5+vec · regulatory crosswalk (EU-AI-Act 2026-08-02).

## BUGS
- `session-reflect.js:93-98` unanchored replace → SKILL.md spam (root cause of the uncommitted spam). Fix: anchored `lines.splice()`. + clean 22 files.
- 26/31 hooks untested. · `.codex` churn + `settings.json.bak-cwdfix` orphan uncommitted.

## State at 2026-06-03
Purge committed+pushed `ce0cfdb0`. Strategy: ship naked YURI as OpenClaw plugin "**MUSUBI ONE**" (product=YURI, named versions). Moat = 267 mechanisms + energy + cognition + spine; competitors = commodity skills/sandbox, no work-dynamics/cognition (ResonantOS=vapor). Next: naked-repo spec + corpus curation + OpenClaw Phase 0 (install + prove `before_tool_call`).
