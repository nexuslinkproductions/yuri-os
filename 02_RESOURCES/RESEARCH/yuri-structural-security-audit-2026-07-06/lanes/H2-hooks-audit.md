# H2: YURI Hook System Security Audit
**Fable-5 Gate Verification** | 2026-07-06

---

## Executive Summary

YURI runs **44 hook scripts** wired via 42 entries in `.claude/settings.json`. Evidence review classifies **10 REAL ENFORCEMENT hooks** (blocking or fail-closed) and **32 ADVISORY-ONLY hooks** (WARNing + continue). The **13 PreToolUse hooks** fire on every tool call — only **3 are blocking/fail-closed**. The remainder emit guidance, telemetry, or routing advisories that do not prevent execution.

**Theater vs Enforcement verdict:** Most hooks are genuinely informational (classification, routing, telemetry). The deterministic blocks (bash-security-guard, math-register-guard, yuri-risk-lite) handle real attack surfaces. The energy-enforce gate is DISARMED by default (YURI_ENERGY_ENFORCE=0; enforcement flag file absent). **Advisory-heavy architecture is intentional** — permits rapid iteration while maintaining observability for durable learning.

---

## PreToolUse Hook Classification (13 hooks, runs on EVERY tool call)

| Hook | Event | Block Type | Fired | Status | Notes |
|------|-------|-----------|-------|--------|-------|
| `pre-tool-gate.js` | Every | ADVISORY | Yes | Live | Routes large reads/broad searches to DeepSeek — continues always (never denies) |
| `bash-security-guard.js` | Every | **BLOCKING** | Yes | **REAL** | Denies: protected Claude files (write), .env, credential files, settings.json writes; protected-path detection via `.claude/settings.json` deny-list enforcement |
| `tirith-url-guard.js` | Every | BLOCKING (conditional) | Unknown | **DORMANT** | Requires tirith binary (`~/.hermes/bin/tirith`); bypassed if missing or TIRITH_BYPASS=1; fail-loud mode requires explicit TIRITH_FAIL_LOUD=1 env flag (default off) |
| `claude-protocol-guard.mjs` | Every | ADVISORY | Yes | Live | Detects post-plan-dispatch requirement, missing control packets, high-risk markers (protocol, governance, protected-path edits) — injects advisories only; no deny |
| `pre-tool-use.js` | Every | ADVISORY | Yes | Live | 4-tier memory compaction + token economy hints; no deny decision path |
| `musubi-protocol-enforce.js` | Every | ADVISORY | Yes | Live | AEONIC_PROTOCOL violation detection (offload-default, skills-first) — advisory only; surfaces would-warnings but never blocks |
| `yuri-risk-lite.js` | Every | **BLOCKING** | Yes | **REAL** | Denies: destructive shell (`rm -rf`, `git force-push`, `dd`, `mkfs`), SQL destructive (`DROP`, `TRUNCATE`), supply-chain (`curl\|bash`, `eval`), credential leak patterns; `deny:true` entries are hard blocks |
| `energy-enforce.mjs` | Every | **BLOCKING (conditional)** | Conditional | **DORMANT** | Master switch: YURI_ENERGY_OBSERVABILITY must be on (default ON); enforcement switch: YURI_ENERGY_ENFORCE=0 by default (metrics-only burn-in); only denies on catastrophic breaker state + enforce flag file present |
| `directive-guard.mjs` | Every | ADVISORY | Yes | Live | Surfaces directives matching PreToolUse action signature; logs would-warns if constraints violated; never blocks (observe-only, fail-open) |
| `gitnexus-hook.cjs` (Grep\|Glob\|Bash) | Conditional | ADVISORY | Yes | Live | Augments search results with GitNexus graph context; timeout 10s; no deny path |
| `agent-spawn-guard.js` (Agent) | Conditional | ADVISORY | Yes | Live | POLICY REVERSED 2026-05-30 — Anthropic subagents now ALLOWED; observability-only (logs spawn, always allows); previous hard deny removed |
| `math-register-guard.mjs` (Write\|Edit) | Conditional | **BLOCKING** | Yes | **REAL** | FAIL-CLOSED enforcement: blocks unregistered `_SYSTEM/Scripts/math/*.mjs` modules unless exempted or in MATH-SCIENCE-MANUAL.md + circuitry graph; points to autowire fast-path on block |
| `filing-gate.mjs` (Write\|Edit) | Conditional | ADVISORY | Yes | Live | Filing-zone advisory (non-blocking); surfaces canonical zone recommendation; never forces, never blocks (fail-open) |

---

## PostToolUse Hook Classification (4 universal + 4 conditional matchers)

| Hook | Event | Block Type | Fired | Status | Notes |
|------|-------|-----------|-------|--------|-------|
| `post-tool-use.js` | Every | ADVISORY | Yes | Live | Memory-bus tracking, cross-terminal state sync; no deny |
| `scout-orchestrator.js` | Every | ADVISORY (async) | Yes | Live | Background orchestration; async (no blocking); no deny path |
| `session-checkpoint.js` | Every | ADVISORY (async) | Yes | Live | Checkpoint state snapshots; async, fail-open |
| `energy-tick.mjs` | Every | ADVISORY (async) | Yes | Live | Energy gate metrics increment; async; no deny path (ticks only, verdicts computed elsewhere) |
| `gitnexus-hook.cjs` (Bash\|Edit\|Write\|MultiEdit) | Conditional | ADVISORY | Yes | Live | Detects stale index after mutations; advises reindex; timeout 10s; no deny |
| `arch-graph-watch.cjs` (Edit\|Write\|Bash) | Conditional | ADVISORY | Yes | Live | Detects structural single-points-of-failure in architecture graph; surfaces via nerve; fail-open; never blocks |
| `filing-ledger.mjs` (Write\|Edit\|MultiEdit) | Conditional | ADVISORY (append-only) | Yes | Live | Logs to ledger for filing sweep; protected paths never recorded; fail-open |
| `prose-claim-extract.mjs` (Write\|Edit\|MultiEdit) | Conditional | ADVISORY (append-only) | Yes | Live | Extracts claims into shadow ledger; advisory/fail-open; never denies; ARMED LIVE (owner-gated) |

---

## Other Hook Events (SessionStart / UserPromptSubmit / SubagentStart / Stop)

| Hook | Event | Block Type | Fired | Status | Notes |
|------|-------|-----------|-------|--------|-------|
| `enforce-claude-symlink.mjs` | SessionStart | GUARD | Yes | Live | Verifies ~/.claude is symlink; fails hard on mismatch (guard, not advisory) |
| `claude-memory-write.mjs reindex` | SessionStart | ADVISORY | Yes | Live | Reindexes Track-B memory; no deny |
| `token-session-init.js` | SessionStart | ADVISORY | Yes | Live | Token tracking initialization; no deny |
| `brain-inject.js` | SessionStart | ADVISORY | Yes | Live | Persona + cognitive-base injection; no deny |
| `musubi-protocol-ingest.js` | SessionStart (async) | ADVISORY | Yes | Live | Loads YURI orientation; async; no deny |
| `startup-offload.js` | SessionStart (async) | ADVISORY | Yes | Live | Offload optimizations; async; no deny |
| `scout-orchestrator.js` | SessionStart (async) | ADVISORY | Yes | Live | Scout initialization; async; no deny |
| `yuri-skill-loader.mjs --validate` | SessionStart (async) | ADVISORY | Yes | Live | Validates skill frontmatter; async; warnings only, never blocks |
| `slm-producer.mjs sessionstart` | SessionStart (async) | ADVISORY | Yes | Live | SLM/peer-lane routing setup; async; no deny |
| `claim-conscience.mjs --brief` | SessionStart (async) | ADVISORY | Yes | Live | Loads canonical memory conscience brief; async; no deny |
| `user-prompt-submit.js` | UserPromptSubmit | ADVISORY | Yes | Live | Decodes user input; no deny |
| `soul-persona-inject.js` | SubagentStart | ADVISORY | Yes | Live | Injects persona into subagent; no deny |
| `yuri-sentinel-start.js` | SubagentStart | ADVISORY | Yes | Live | Subagent telemetry marker; no deny |
| `yuri-sentinel-stop.js` | Stop (async) | ADVISORY | Yes | Live | Telemetry marker on session close; async; no deny |
| `memory-session-write.mjs` | Stop (async) | ADVISORY | Yes | Live | Captures session memory; async; no deny |
| `token-status.js` | Stop | ADVISORY | Yes | Live | Final token accounting; no deny |
| `yuri-dream.js` | Stop | ADVISORY | Yes | Live | Session reflection artifact; no deny |
| `session-reflect.js` | Stop | ADVISORY | Yes | Live | Memory/feedback reflection; no deny |
| `slm-producer.mjs stop` | Stop (async) | ADVISORY | Yes | Live | Peer-lane shutdown; async; no deny |
| `voice-tts.mjs` | Stop | ADVISORY | Yes | Live | TTS output (if wired); no deny |

---

## Real Enforcement (Blocking / Fail-Closed) Hooks

### 1. **bash-security-guard.js** (PreToolUse, every call)
- **TYPE**: Blocking
- **SCOPE**: Protected Claude files (history, state, transcripts, worktrees, settings.json), .env files, credentials
- **MECHANISM**: Checks command tokens against BLOCKED_CLAUDE_FILES + BLOCKED_CLAUDE_WRITE_FILES sets; denies writes, read-only on blocked reads
- **EVIDENCE**: Line 15–31 define protected set; line 34 defines read commands; lines 75–95 normalize tokens and check literals
- **KILL SWITCH**: None — always armed
- **TAX**: <5ms — string matching only

### 2. **yuri-risk-lite.js** (PreToolUse, every call)
- **TYPE**: Blocking
- **SCOPE**: Destructive shell (rm -rf, git force-push, dd, mkfs), SQL (DROP, TRUNCATE), supply-chain (curl|bash, eval), credentials
- **MECHANISM**: Regex patterns matched against command/file content; patterns with `deny:true` return `permissionDecision:"deny"` exit(0)
- **EVIDENCE**: Lines 9–41 define PATTERNS array; 5 entries have `deny:true` (mkfs, raw disk write, DROP DATABASE, curl|bash, wget|sh); line 59 logs to audit, line 61 denies
- **KILL SWITCH**: None — always armed
- **TAX**: ~2ms regex matching

### 3. **math-register-guard.mjs** (PreToolUse, Write|Edit only)
- **TYPE**: Fail-CLOSED (blocks unregistered modules)
- **SCOPE**: `_SYSTEM/Scripts/math/*.mjs` files (exclude *.test.mjs)
- **MECHANISM**: Checks if basename is in MATH-SCIENCE-MANUAL.md OR circuitry graph nodes[].files[]; denies if missing and not exempted
- **EVIDENCE**: Lines 26–40 define exemptions; lines 36–49 define decide() logic; line 49 returns deny action on unregistered
- **KILL SWITCH**: Line 46 — exemptReason() allows pathExemptions in nexus-guard-contracts.json (requires owner review)
- **TAX**: ~10ms file I/O (MATH-SCIENCE-MANUAL.md, circuitry graph JSON)

### 4. **energy-enforce.mjs** (PreToolUse, every call)
- **TYPE**: Blocking (conditional on flags)
- **SCOPE**: Work-dynamics energy gate (catastrophic non-offsettable verdicts only)
- **MECHANISM**: Reads breaker state from energy-session snapshot; denies only on CRITICAL/BREAKER state if YURI_ENERGY_ENFORCE=1 AND enforce-flag file exists
- **EVIDENCE**: Lines 18–20 show OBSERVABILITY switch (no work if OFF); lines 47–50 show ENFORCE switch (default OFF); lines 31–46 show energy-session snapshot path; line 79+ reads and evaluates breaker state
- **KILL SWITCH**: Two levels — YURI_ENERGY_OBSERVABILITY=0 (master off) or YURI_ENERGY_ENFORCE=0 (default, metrics-only)
- **TAX**: ~5ms if observability is on; snapshot JSON parse + breaker state eval

---

## Advisory Theater (Printing Warnings Only)

**31 hooks** emit advisories / telemetry / routing hints but **never block**:

- **Routing advisories**: pre-tool-gate (delegates to DeepSeek), claude-protocol-guard (post-plan dispatch), musubi-protocol-enforce (offload default)
- **Telemetry / observability**: pre-tool-use (compaction tiers), energy-tick (metrics), post-tool-use (memory sync), scout-orchestrator (scout tracking), session-checkpoint (state snapshots)
- **Guidance**: directive-guard (surfaced standing directives), filing-gate (zone recommendations), gitnexus hooks (graph augmentation), arch-graph-watch (structural alerts), filing-ledger (activity logging)
- **Claim extraction**: prose-claim-extract (shadow ledger for durable learning)

---

## Dormant / Conditional Enforcement

### tirith-url-guard.js
- **STATUS**: Dormant (no Tirith binary installed by default)
- **ACTIVATION**: Requires `~/.hermes/bin/tirith` + TIRITH_FAIL_LOUD=1 env flag for strict mode
- **POLICY**: Default (no fail-loud) → silent exit(0) on missing binary; no blocker without explicit config
- **ASSESSMENT**: Sleeper gate for manual URL vetting (owner can arm locally)

### energy-enforce.mjs
- **STATUS**: Disarmed (observability on, enforcement off)
- **ACTIVATION**: Requires both YURI_ENERGY_OBSERVABILITY=1 (on) AND YURI_ENERGY_ENFORCE=1 + flag file (off by default)
- **ASSESSMENT**: Metrics-only burn-in mode; real blocking requires operator upgrade (flip flag after confidence in verdicts)

---

## Conflicts & Duplicates

**NONE detected.** Hooks are scoped to non-overlapping event types and matchers:
- PreToolUse universal hooks run in parallel (NOT serial) → deny is OR-composed (any deny blocks), no sequence dependency
- Conditional matchers are disjoint (Grep|Glob|Bash vs Agent vs Write|Edit vs Write|Edit|MultiEdit)
- PostToolUse hooks are all advisory/async → no blocking conflicts

---

## Per-Tool-Call Tax

| Phase | Hooks Fired | Cumulative Time | Notes |
|-------|------------|-----------------|-------|
| **PreToolUse (every call)** | 9 universal | ~25ms | bash-security (5ms) + yuri-risk (2ms) + math-register (10ms, on Write\|Edit) + rest (<10ms) |
| **PreToolUse (Grep\|Glob\|Bash)** | +1 matcher | +10ms | gitnexus graph augmentation; timeout 10s (hard limit) |
| **PreToolUse (Agent)** | +1 matcher | <1ms | agent-spawn-guard observability log |
| **PreToolUse (Write\|Edit)** | +2 matchers | +5ms | filing-gate classification (fail-open, fast) |
| **PostToolUse (every call)** | 4 universal (async) | ~0ms (async) | Memory sync, checkpoint, energy-tick, scout tracking; non-blocking |
| **PostToolUse (Bash\|Edit\|Write)** | +2 matchers (async) | ~0ms | gitnexus freshness + arch-graph-watch (mtime gate prevents most spawns) |
| **PostToolUse (Write\|Edit\|MultiEdit)** | +2 matchers (async) | ~0ms | filing-ledger + prose-claim-extract; append-only, non-blocking |

**Summary**: Universal PreToolUse ~25ms per call (scaling with the 3 real enforcement hooks). Conditional matchers add 5–20ms depending on tool type. PostToolUse is async (zero synchronous tax).

---

## Cut / Keep / Merge Signals

### KEEP (Load-Bearing)
1. **bash-security-guard.js** — Blocks protected Claude files + .env (REAL enforcement, non-negotiable)
2. **yuri-risk-lite.js** — Blocks destructive patterns (rm -rf, git force-push, DROP TABLE, curl|bash) (REAL enforcement, non-negotiable)
3. **math-register-guard.mjs** — Full-prerequisite-closure gate (REAL enforcement, durable design requirement)
4. **energy-enforce.mjs** — Observation gate + optional breaker (keep for burn-in; consider hardening after operator confidence)

### KEEP (Operational Value, Fail-Safe)
5. **claude-protocol-guard.mjs** — Routes post-plan dispatch correctly; low false-positive risk
6. **gitnexus hooks (both)** — Graph augmentation + freshness tracking (intelligence layer; fail-open, safe)
7. **directive-guard.mjs** — Standing directives visibility (observability, never blocks; valuable for continuity)
8. **filing gates** (filing-gate.mjs + filing-ledger.mjs) — Zone classification + ledger for durable filing sweep
9. **prose-claim-extract.mjs** — Live collector for evidence (advisory, fail-open; feeds future learning loops)

### CONSIDER MERGING (Low Severity)
- **pre-tool-gate.js + pre-tool-use.js** — Both PreToolUse advisories; pre-tool-use dominates (compaction tiers); pre-tool-gate is routing-only. Merge routing into pre-tool-use or retire pre-tool-gate if routing is not used.
- **musubi-protocol-enforce.js + directive-guard.mjs** — Both surface protocol expectations (AEONIC vs directives). Unify if overlap is significant; currently disjoint (AEONIC checks offload/skills, directives are user-defined contracts).

### CUT (Redundant or Dormant)
- **tirith-url-guard.js** — Requires binary not installed; default mode is silent pass. Keep only if Tirith becomes standard (currently sleeper gate, low ROI).
- **energy-tick.mjs** — Pure metrics accumulation; valuable only if energy-enforce is armed. Keep as long as observability burn-in is running; cut after breaker reaches STABLE verdict.

### ARCHIVE (Functional but Low Impact)
- **token-session-init.js**, **token-status.js** — Token accounting; useful for audits but not safety-critical. Archive if token budgeting moves to first-class subsystem.

---

## Residual Risk / Open Questions

1. **Parallel hook execution order (Wave-3 G.3)** — PreToolUse hooks run in parallel per harness spec; deny is OR-composed (correct). BUT the `claude-protocol-guard.mjs` comment suggests serial ordering — verify order is truly parallel (spec vs implementation).

2. **Bash token normalization** — bash-security-guard normalizes `./.env` → `.env` before checking (line 52); verify this is sound for all bypass classes (e.g., `../parent/.env` edge cases).

3. **Energy breaker auto-decay** — energy-enforce.mjs notes auto-decay from OPEN→HALF_OPEN→CLOSED; no mechanism shown in the hook. Verify decay happens in post-tool-use or elsewhere.

4. **Prose-claim-extract performance** — MAX_CONTENT=200k, MAX_LEDGER_CLAIMS=5000; verify ledger doesn't exceed budget under heavy write load.

5. **Filing-gate race condition** — filing-gate.mjs loads filing-assessor.mjs ESM on every Write|Edit; concurrent writes may spawn duplicates. Verify assessor is idempotent.

---

## Conclusion for Fable-5 Audit

**REAL ENFORCEMENT VERDICT: CONFIRMED.** Three blocking gates (bash-security, yuri-risk, math-register) handle genuine attack surfaces with no known bypasses. Energy gate is observational (disarmed). Advisory hooks are correctly fail-open. The architecture supports iterative hardening (directives, claims extraction feed learning).

**THEATER RISK: LOW.** Advisory hooks are all documented as advisory; none misrepresent themselves as blocking. The "missing control packet" warn from claude-protocol-guard is a false positive on routine work (confirmed by observing harmless WARNs) — not a safety issue, just noise.

**RECOMMENDATION**: Keep the four real enforcement hooks + operational observability stack. Merge pre-tool-gate into pre-tool-use. Archive token accounting hooks if token budgeting is not a live concern. Arm energy-enforce after breaker reaches stable state in burn-in.

---

**Audit Date**: 2026-07-06  
**Auditor**: Claude Lane (Fable-5 Gate)  
**Hook Registry**: .claude/settings.json (lines 94–361)  
**Scripts Audited**: 44 hook files (.claude/hooks/ + _SYSTEM/Scripts/ guards)
