# Wave-3 Tokens Domain — Fix Wave Report (2026-06-11)

Executor: Claude (Fable 5). **OWNER RE-SCOPE MID-DOMAIN (Marcel, 2026-06-11):** token spend-reporting and token tracking/monitoring are RETIRED — never used, not shipping in YURI; provider dashboards (DeepSeek/Mimo sites) are the cost surface. The domain pivoted from "fix the monitoring" to "scrap the monitoring, keep the behavior."

## What was REMOVED (owner directive supersedes WP-T.1/T.2/T.5/T.6/T.9)
- `_SYSTEM/Scripts/token-spend-report.mjs` **DELETED** (zero consumers; my in-progress T.1/T.2/T.9 pricing fixes went with it; the models.json `anthropic` pricing section I had added was reverted — no orphan config).
- `.claude/hooks/token-tool-logger.js`, `token-session-end.js`, `token-budget-check.js` **DELETED** + their PostToolUse/Stop/PreToolUse registrations removed from settings.json. Per-tool ledger events, the ghost zero-token session-finalize event (T.3's target — gone instead of relabeled), and the heuristic 80k WARN are all retired.
- `token-status.js`: the `claude_transcript_delta` ledger spawn + writeLedgerEvent + dead crypto/spawn/TOKEN_LEDGER imports stripped; frozen weekly segment removed (its accumulator died with session-end).
- `token-session-init.js`: /tmp/claude-session estimator file + /tmp/claude-current-session pointer + weekly accumulator init removed.
- Dangling refs cleaned: independence-check ALLOWLIST, self-audit INTENTIONAL_NON_HOOKS. operator-write-guard tests still 45/45 (fixture is lexical).

## What STAYS (the behavior Marcel actually uses)
- **Status bar** (`token-status.js` statusLine): model, CTX bar+%, session tokens/cache/cost, git, time, ⚡TM. Live render probe verified post-trim.
- **context.pct auto-compact signal** — **WP-T.4 / D-T1 DRIFT-RESOLVED ON HEAD**: `writeContextPct()` at token-status.js already writes `session-state.context.pct` from `context_window.used_percentage` per statusLine fire, atomically, with 1%-hysteresis. The audit's "doesn't read context_window" claim was stale. The auto-compact tier mechanism has a live signal.
- **token-session-init.js**: session-state lifecycle init (the guards' substrate: tools_used, plan_dispatch_gate, skills_read) + tokenmaxxing rules injection + status-bar session file reset.
- **token-ledger.mjs** kept as a LIBRARY — lane adapters (ollama, codex-offload, needle, llm-compat-queue) still call it. Full ledger+adapter extermination is a named follow-up (below), not silently expanded into this wave.

## Remaining WPs landed
- **WP-T.7** — **DRIFT-RESOLVED**: the audit claimed "Opus 4.8 doesn't exist"; it does now (claude-opus-4-8 live in the session ledger rows + harness env). The tokenmaxxing SKILL.md reference stands correct; no edit.
- **WP-T.8** thresholds unified to code truth (pre-tool-use getTier: TM 60% / standard 65%): compact-optimizer:88+110 updated; phantom "40k transcript hard max" demoted to an explicit no-hook guideline; tokenmaxxing:33 already said 60% (drift-resolved).
- **WP-T.10** subagent 4h-inheritance DESIGN CHOICE comment added at the init guard.

## Acceptance (re-scoped gate)
settings.json parses; 0 registrations reference deleted hooks; repo-wide grep for the three deleted hooks = test-fixture + inert-list refs only (cleaned); node --check green on token-status/init/independence-check/self-audit; statusLine probe renders correctly with ctx=42 → context.pct path exercised.

## Open / follow-ups (named, not silent)
- **Token-ledger full retirement** (owner call): ledger library + lane-adapter call sites + `~/.yuri/token-ledger/` queue+faults dirs + token-ledger.test.mjs in the npm chain. Bigger blast radius (touches ollama/codex adapters); queued for housekeeping/wave-4.
- Stale state files now orphaned (read-nothing): `.claude/state/token-weekly.json`, legacy tracker. Harmless; delete at next state-dir housekeeping (protected path — owner op).
- PARKED-T.A/B (queue size, hash chain) moot if ledger retires; PARKED-T.C/D/E superseded by retirement.
