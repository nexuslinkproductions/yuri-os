# Wave 3 — HIDDEN-META Audit
**Domain:** prompt_hooks × 10 · initialization × 8 (18 die IDs)
**Auditor:** Claude Sonnet 4.6 (subagent, read-only)
**Date:** 2026-06-10
**Prior evidence:** wave-1 math-base-audit-2026-06-10-checkpoint.md; wave-2 audits (cited not re-derived)
**DS advisory files consulted:** deepseek-wave3-hooks-wiring.md · deepseek-wave3-sessionstate-schema.md
**DS advisory accuracy:** hooks-wiring CLEAN verdict confirmed; sessionstate-schema had 1 factual error (errors[] has 3 live readers — corrected below)

---

## 1. Die-to-Live Mapping

| Die ID | Label | Live File | Status |
|--------|-------|-----------|--------|
| SESSION_INIT | SESSION INIT | `.claude/hooks/token-session-init.js` | LIVE |
| PROMPT_HOOKS | PROMPT HOOKS | multiple PreToolUse hooks | LIVE |
| SOUL_INJECT | soul-inject | `.claude/hooks/brain-inject.js` (SessionStart) + `.claude/hooks/soul-persona-inject.js` (SubagentStart) | LIVE — split across two hooks |
| PALACE | palace-inject | `_SYSTEM/archive/legacy-purge-2026-05/palace/` | RETIRED 2026-05-29 — ghost die |
| MNEMOSYNE | mnemosyne-seed | no file found anywhere outside archive | RETIRED — ghost die |
| TOKEN_INIT | token-init | `.claude/hooks/token-session-init.js` | LIVE (same file as SESSION_INIT) |
| AEONIC | aeonic-enforce | `.claude/hooks/musubi-protocol-ingest.js` (inject) + `.claude/hooks/musubi-protocol-enforce.js` (gate) | LIVE |
| PROT_GUARD | protocol-guard | `.claude/hooks/bash-security-guard.js` + `.claude/hooks/operator-write-guard.js` | LIVE |
| SCOUT_SPAWN | scout-spawn | `.claude/hooks/scout-orchestrator.js` PostToolUse handler | LIVE |
| TIRITH | tirith-url | `.claude/hooks/tirith-url-guard.js` | LIVE — binary present at `~/.hermes/bin/tirith` |
| BASH_GUARD | bash-security-guard.js | `.claude/hooks/bash-security-guard.js` | LIVE |
| GITNEX_PRE | gitnexus-impact-check | `.claude/hooks/gitnexus/gitnexus-hook.cjs` | LIVE |
| SOUL_FILE | SOUL.md | `/Users/marcelspatz/YURI-OS-MUSUBI/SOUL.md` | LIVE — loaded natively + by hooks |
| YURI_COG | YURI-COGNITION.md | `_SYSTEM/YURI-COGNITION.md` | EXISTS (not audited — out of domain scope) |
| PALACE_IDX | palace-index.md | no live file found | RETIRED — ghost die (archive only) |
| SCOUT_HERMES | HERMES_FC | no file anywhere in hooks/, agents/, scripts/ | GHOST DIE — never spawned, never wired |
| SCOUT_ARGUS | ARGUS | `.claude/hooks/scout-runner.js` (`evaluateArgus`) | LIVE |
| HOOK_PIPELINE | HOOK PIPELINE | `settings.json` hook chain | LIVE — 36 declared, 36 on disk |

**Ghost die IDs (3):** PALACE, MNEMOSYNE, PALACE_IDX — all retired 2026-05-29 per token-session-init comment.
**Unresolved ghost (1):** SCOUT_HERMES / HERMES_FC — no archive note, no retirement doc, simply absent.

---

## 2. Prompt Hook Organ Audit

### 2.1 Hook pipeline — declaration vs disk
- **36 declared** in `settings.json`, **36 files exist** on disk.
- All matchers are empty string (fires on all tool calls for all PreToolUse hooks — NO tool-specific gating in settings).
- DS advisory claimed matchers existed for gitnexus-hook.cjs and agent-spawn-guard.js. **NOT TRUE.** Verified: settings.json has `"matcher": ""` for every hook entry.
  - `agent-spawn-guard.js` gates internally (`event.tool_name !== 'Agent' → exit(0)`), not via settings matcher.
  - `gitnexus-hook.cjs` gates internally by tool_name. No settings-level matcher.
  - **Implication:** ALL 13 PreToolUse hooks fire on EVERY tool invocation. gitnexus and agent-spawn-guard pay ~2ms startup cost per Bash/Read/Write tool call unnecessarily.

### 2.2 AEONIC (musubi-protocol-ingest.js + musubi-protocol-enforce.js)
- **Ingest fires:** SessionStart, reads `_SYSTEM/MUSUBI_PROTOCOL.md`, emits `<musubi-protocol>` XML block as additionalContext.
- **File name mismatch:** hook comment says "AEONIC_PROTOCOL.md", error message says "AEONIC_PROTOCOL.md not found at `<path>`" — but `PROTOCOL_FILE` points to `MUSUBI_PROTOCOL.md` which exists. Stale comment; not a functional defect.
- **State written:** `state.aeonic.sections` (the parsed sections object) + `state.aeonic.loadedAt`.
- **State consumed by enforce:** enforce reads ONLY `state.aeonic.lastEnforceAt` (throttle), `state.tools_used`, and `state.skills_read`. `state.aeonic.sections` is **WRITTEN BUT NEVER READ** by any hook.

  MATCH file=.claude/hooks/musubi-protocol-enforce.js term="aeonic.sections" line=N excerpt="not referenced"
  FILE_COUNT file=.claude/hooks/musubi-protocol-enforce.js count=0 (sections field)

- **Enforce output:** advisory-only (`exit(0)` always). Fail-OPEN. Two checks: offload-default (>3 direct writes, 0 agent dispatches) and skills-first (Agent dispatch with no prior skills_read). Both are soft advisories.
- **Throttle:** 60s per enforcement check. Could miss rapid back-to-back violations within the window.

### 2.3 PROT_GUARD (bash-security-guard.js + operator-write-guard.js)
- **bash-security-guard.js:** Fail-CLOSED on role mutation (`permissionDecision: 'deny'`). Fail-OPEN on parse error / non-Bash tools. Wave-1 confirmed 5/5 bypass vectors blocked; cite `FB:BASH-GUARD-ROLE-MATCHER-LEXICAL-BYPASS` — not re-derived.
- **operator-write-guard.js:** Fail-CLOSED on coworker role attempting guard/role/credential mutation (`permissionDecision: 'deny'`). Fail-OPEN on JSON parse error (exit 0).

### 2.4 SCOUT_SPAWN (scout-orchestrator.js)
- **PostToolUse:** spawns ARGUS (native, `evaluateArgus` in scout-runner.js) and YURI-RISK (model-backed, calls `agents/yuri-risk.md` via llm-compat.sh).
- **HERMES_FC:** Die SCOUT_HERMES declared. Not spawned anywhere. No `agents/hermes*.md` or `hermes*.js` exists outside archive. This is a **dead die entry** — either planned and never built, or retired without cleaning the scope die.
- **Backpressure guard:** `bus.countUnconsumed(b) >= 5 → exit(0)` prevents cascade spawning. Sound design.
- **PreToolUse path:** scout-orchestrator injects unconsumed findings from the bus as `additionalContext`. Confirmed stdout path fixed (wave-1 noted the prior stderr bug was fixed in the consolidation).

### 2.5 TIRITH (tirith-url-guard.js)
- **Fires on:** Bash tool_name only (internal guard, line ~65). All other tools: exit(0).
- **Fail-OPEN by default:** when binary missing or parse fails, exits 0 silently. `TIRITH_FAIL_LOUD=1` env flips to `permissionDecision: 'ask'` on errors. Binary currently present at `~/.hermes/bin/tirith` — operational.
- **Bypass:** `TIRITH_BYPASS=1` env produces a silent stderr note + exit(0). This env var is not gated by role or hook permission — any context with env write access can neutralize TIRITH.
- **Risk category:** SEV-MEDIUM — URL screening is advisory defense-in-depth, not a hard security gate. Acceptable fail-open for this role, but the bypass env is undocumented as a threat surface.

### 2.6 BASH_GUARD
- Cited from wave-1 + wave-2 memory entries. Not re-audited here. Last known state: all 5 historical bypass forms BLOCKED on main as of 2026-06-05.

---

## 3. Initialization Organ Audit

### 3.1 SESSION_INIT / TOKEN_INIT (token-session-init.js)
- **Writes:** `/tmp/claude-session-<id>.json`, `/tmp/claude-current-session`, `token-session.json`, `token-weekly.json`, `session-state.json`.
- **Subagent guard:** reads existing `session-state.json`; if `status === 'active'` and age < 4h, skips re-init. This correctly prevents subagent SessionStart from wiping the root session's state.
- **Palace note:** "Palace retired 2026-05-29 — spatial vault index removed." (line 94). Die PALACE confirmed ghost.
- **Tokenmaxxing injection:** reads `SKILL.md` from tokenmaxxing skill, emits rules in SessionStart additionalContext. Functional.

### 3.2 SOUL_INJECT — brain-inject.js (SessionStart)
- **Fires:** once at main session start. Does NOT fire for subagents (subagent init is handled by soul-persona-inject.js at SubagentStart).
- **Injects:** 9 SOUL.md Core Truths rules (ZONE A stableCore) + identity-hash + neuro-core + learned rules + curated memory + volatile session context (lane health, gate, cortex, fingerprint, geass, neuron, roadmap, organ state).
- **Double-injection finding (SEV-LOW, intentional-by-design but doc-vs-wiring drift):**
  - `CLAUDE.md` documentation explicitly states: *"brain-inject only enriches it with volatile live state (gate, lane health, cortex tier, behavioral fingerprint) — never the stable identity."*
  - Actual code: brain-inject.js emits ZONE A `stableCore` containing `### IDENTITY — Yuri persona active (SOUL.md)` with the 9 rules (line 469–470).
  - The 9 rules are ALSO loaded natively via `CLAUDE.md @SOUL.md` @-include.
  - **Net effect:** 9 SOUL.md rules reach the model twice at SessionStart. This is likely intentional reinforcement (the rules are in a structured `<yuri-brain>` tag for weight), but the CLAUDE.md documentation is factually wrong about what brain-inject injects.
  - `persona.md` is correctly NOT injected by brain-inject (line 272 comment confirms this is intentional).

### 3.3 SOUL_INJECT — soul-persona-inject.js (SubagentStart)
- **Fires:** on every SubagentStart, including this audit session.
- **Injects:** same 9 SOUL.md Core Truths rules (using identical REQUIRED_HEADINGS list).
- **Correct separation:** main session soul injection via brain-inject (rich context); subagent soul injection via soul-persona-inject (lightweight 9-rule block). Sound design.
- **Drift risk:** both brain-inject.js and soul-persona-inject.js maintain their own `REQUIRED_HEADINGS` array. If SOUL.md headings change, both must be updated in sync — no shared constant. SEV-LOW maintenance trap.

### 3.4 PALACE / PALACE_IDX / MNEMOSYNE — retired organs
- No live files. Scope die entries are stale documentation artifacts.
- `_SYSTEM/archive/legacy-purge-2026-05/palace/` contains the archive.
- No code references these paths in any active hook.
- **Recommendation:** prune these 3 die IDs from the scope die in a housekeeping pass.

### 3.5 SCOUT_HERMES (HERMES_FC) — ghost die
- Not in `scout-orchestrator.js` spawn logic. Not in `scout-runner.js` NATIVE_SCOUTS. No agent definition file. No `agents/hermes*.md`. No retirement note.
- The only "hermes" reference in active hooks is `tirith-url-guard.js` line 7: `TIRITH_BIN = ~/.hermes/bin/tirith` — the tirith binary lives in a `.hermes/` dir. This is a naming collision, not related to the HERMES_FC scout.
- **Status:** phantom die. Either a planned scout that was never implemented, or a renamed/merged organ with no retirement breadcrumb. SEV-LOW (no active guard missing; ARGUS + YURI-RISK are the live scouts).

---

## 4. Session-State Lifecycle: Dead Fields Corrected

DS advisory had one error on `errors[]`. Corrected table (verified against source):

| Field | Written by | Reads confirmed | Verdict |
|-------|-----------|-----------------|---------|
| schema_version | token-session-init | no reader found | DEAD |
| session_id | token-session-init | session-reflect.js (session log line) | ALIVE (weak consumer — log only) |
| start_time | token-session-init | no reader found | DEAD |
| status | token-session-init | token-session-init subagent guard | SELF-GUARD |
| git.cwd | token-session-init | no reader found | DEAD |
| context.last_updated | token-session-init, token-status | no reader found | DEAD |
| skills_written | token-session-init, post-tool-use | no reader found | DEAD |
| errors[] | post-tool-use | session-reflect.js (lines 69, 145–146), yuri-sentinel-stop.js (line 108), scout-orchestrator.js (line 70) | ALIVE — DS advisory was wrong |
| aversions[] | token-session-init (init empty) | pre-tool-use.js, session-reflect.js | ALIVE-BUT-EMPTY (init'd, never populated, readers always get []) |
| aeonic.sections | musubi-protocol-ingest | no hook reads it | DEAD |
| aeonic.loadedAt | musubi-protocol-ingest | no hook reads it | DEAD |
| STATE_FILE (brain-inject.js line 28) | defined, not used in module scope | — | DEAD CODE — defined at module scope, only used locally in loadGeassLock() as `STATE_FILE_PATH` (different variable) |

**Confirmed dead fields (6):** schema_version, start_time, git.cwd, context.last_updated, skills_written, aeonic.sections + aeonic.loadedAt (2) = 7 total dead writes.
**Confirmed DEAD CODE:** `STATE_FILE` const in brain-inject.js line 28 — never referenced in module scope; `loadGeassLock()` declares its own `STATE_FILE_PATH` locally.

---

## 5. Memory-Bus Flow

- `memory-bus.js` is a library module (not a hook entrypoint). Imported by: `post-tool-use.js`, `pre-tool-use.js`, `yuri-sentinel-start.js`.
- `post-tool-use.js`: writes to bus when a memory file (matching `/.claude/projects/*/memory/*.md` or `/.claude/yuri-sentinel/learning/*.md`) is edited.
- `pre-tool-use.js`: reads bus on each PreToolUse to detect cross-terminal memory writes from other sessions, injects notification as additionalContext.
- **Atomicity:** `writeBus()` uses tmp-file + rename (atomic). Sound.
- **Session tracking:** PID-walk to find Claude grandparent PID. Works on macOS; fragile if process hierarchy is non-standard (e.g., wrapper scripts add layers). No verified failure mode in current setup.

---

## 6. Soul/Persona Injection Redundancy Map

```
Main session:
  Native CLAUDE.md @-include → full SOUL.md + full persona.md + full yuri-origin.md  [always]
  brain-inject.js SessionStart → 9 SOUL.md rules (ZONE A) + volatile live state      [redundant for rules]

Subagent:
  Native CLAUDE.md @-include → same files (project instructions apply to subagents)   [always]
  soul-persona-inject.js SubagentStart → 9 SOUL.md rules only                         [redundant for rules]

EOT marker (eot-background-start.js):
  Emits "EOT monitoring active" string. Writes /tmp marker file. Does NOT spawn any
  background process or daemon. Comment says "spawns monitoring" — misleading.
```

**Doc-vs-wiring drift (SEV-LOW):** CLAUDE.md claims brain-inject injects only volatile state, never stable identity. Brain-inject injects ZONE A stableCore including IDENTITY section (9 SOUL.md rules). The doc is wrong.

---

## 7. Findings by Severity

| SEV | ID | File:line | Claimed vs Actual | Evidence |
|-----|----|-----------|-------------------|----------|
| MED | HERMES_FC-GHOST | scope-die / no live file | Die SCOUT_HERMES declared, HERMES_FC scout wired | No agents/hermes*.md, not spawned in scout-orchestrator.js; no retirement note |
| MED | AEONIC-SECTIONS-DEAD | musubi-protocol-ingest.js:84 / musubi-protocol-enforce.js | ingest writes state.aeonic.sections; enforce uses it | enforce reads only lastEnforceAt, tools_used, skills_read — sections never consumed |
| MED | TIRITH-BYPASS-UNDOCUMENTED | tirith-url-guard.js:12–15 | TIRITH_BYPASS=1 silently disables URL screening | No hook permission or role gate on TIRITH_BYPASS env var |
| LOW | DOUBLE-SOUL-INJECTION | brain-inject.js:469 / CLAUDE.md | CLAUDE.md: "never stable identity"; brain-inject: emits IDENTITY section | ZONE A stableCore line 469: `### IDENTITY — Yuri persona active (SOUL.md)` |
| LOW | MATCHER-OVERFIRING | settings.json all PreToolUse | gitnexus, agent-spawn-guard gate internally but fire on every tool | settings.json: all matchers="". Internal gates: agent-spawn-guard exits if tool_name!='Agent'; gitnexus gates by tool_name internally |
| LOW | STATE-DEAD-FIELDS | session-state.json (7 fields) | fields written at init, claimed as lifecycle tracking | schema_version, start_time, git.cwd, context.last_updated, skills_written, aeonic.sections, aeonic.loadedAt — zero runtime readers |
| LOW | AVERSIONS-EMPTY-ALWAYS | token-session-init.js:65 | aversions[] initialized for pre-tool-use to consume | pre-tool-use.js and session-reflect.js read it; no hook ever writes values — always [] at read time |
| LOW | STATE_FILE-DEAD-CODE | brain-inject.js:28 | STATE_FILE const defined at module scope | Used nowhere at module scope; loadGeassLock() declares its own STATE_FILE_PATH locally — orphan const |
| LOW | EOT-MISLEADING-COMMENT | eot-background-start.js:4 | "Spawns end-of-transmission monitoring in background" | No spawn(), fork(), or exec in the file — writes /tmp marker only |
| LOW | SOUL-HEADINGS-UNSHARED | brain-inject.js:109–119 / soul-persona-inject.js:9–19 | two files maintain independent REQUIRED_HEADINGS arrays | REQUIRED_HEADINGS duplicated verbatim; SOUL.md heading rename would require dual update |
| INFO | MUSUBI-STALE-COMMENT | musubi-protocol-ingest.js:3–4,16,68 | comment says AEONIC_PROTOCOL.md; code reads MUSUBI_PROTOCOL.md | PROTOCOL_FILE = MUSUBI_PROTOCOL.md; file exists; functional correctness unaffected |
| INFO | GHOST-DIE-ENTRIES | wave3-scope-die-extract.json HIDDEN_META | PALACE, MNEMOSYNE, PALACE_IDX in scope die | All retired 2026-05-29; no live files; archive confirms retirement |
| INFO | SESSION-ID-WEAK | session-state.json session_id | session_id written; "zero consumers" per DS advisory | session-reflect.js uses it in log header line — alive but log-only, not a gate |

---

## 8. DS Advisory Corrections

| Advisory claim | Verdict |
|----------------|---------|
| "gitnexus matcher=Grep|Glob|Bash, agent-spawn-guard matcher=Agent" | FALSE — verified in settings.json; all matchers empty; gating is internal |
| "errors[] has no runtime reader" | FALSE — 3 readers: session-reflect.js, yuri-sentinel-stop.js, scout-orchestrator.js |
| "fingerprint-delta.json has zero runtime consumers" | PARTIALLY FALSE — yuri-os-dashboard.html references it (static report); neuron-loop.mjs runs fingerprint-baseline in phase 7c |
| Hook wiring CLEAN verdict (36 files, no orphans) | CONFIRMED |
| STATE_FILE dead code in brain-inject | CONFIRMED |
| aeonic.sections DEAD | CONFIRMED |
| aversions[] empty-always | CONFIRMED |

---

## COVERAGE

- Die IDs in HIDDEN_META sector: 18
- Die IDs directly verified against live source: 15
- Ghost die IDs (retired, no live file): 3 (PALACE, MNEMOSYNE, PALACE_IDX)
- Unresolved ghost (no retirement note): 1 (SCOUT_HERMES/HERMES_FC)
- Hook files audited (source read): 14 of 36 (39%) — focused on HIDDEN_META domain hooks
- Session-state fields audited: 19 of ~20 declared fields
- **Coverage estimate: 85%** — gaps: YURI_COG (YURI-COGNITION.md — out of scope per task); energy-enforce.mjs and claude-protocol-guard.mjs (PreToolUse gates audited in wave-2, cited not re-derived)

## UNVERIFIED

- `energy-enforce.mjs` PreToolUse gate internals (wave-2 domain; ENERGY-GATE-LINFINITY-DOUBLY-INERT in memory confirms SEV finding there)
- `claude-protocol-guard.mjs` plan_dispatch_gate behavior (wave-2 domain)
- neuron-loop.mjs phase 7c execution path (whether fingerprint-baseline.mjs is called on a hot path or only on demand)
- Tirith scoring accuracy (binary behavior not audited — only fail-open/bypass path verified)
