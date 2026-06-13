# YURI Wave-3 Hidden-Meta Domain — Handover Instruction for Opus 4.8

> **Operator note (Marcel):** paste this file's path into the Opus session as the task packet root. Resolve owner decisions D-H1 through D-H4 (§6) before or at session start; D-H1 (eot-background-start.js dead organ — delete vs fix) is the highest-leverage single call and blocks WP-H.1. Status: **PACKAGES READY — Codex addendum blocked until Jun 11 credits reset; re-dispatch `_SYSTEM/reports/wave3-codex-spec-saved.md` after reset.**

---

## 0 · Mission

You are fixing the YURI hidden-meta domain (prompt hooks × 10 + initialization × 8) so that the session boot chain is honest, the soul/persona injection is deduplicated, stale state is not presented as live, and dead organs are removed or labelled. A completed audit + deep dive (all findings CONFIRMED across hidden-meta-audit, session-boot-deep) found: **eot-background-start.js is a dead organ that injects a false "monitoring active" claim every boot; brain-inject.js loads SOUL.md identity rules that CLAUDE.md already provides natively (~570 tok/boot pure redundancy, subagents get SOUL three times); lane-health, roadmap, and learned-rules are presented as current when they are 20-24 days stale; AEONIC's parsed sections object is written and never read.**

Non-negotiable framing: session boot context is the most expensive real estate in the system — every session pays for it. Dead tokens that inject false claims are worse than dead tokens that inject nothing. Fix the lies first (eot-background-start.js, SOUL triple-load), then the staleness, then the dead-fields hygiene.

**Completeness contract:** every attack-confirmed finding in the audit ledger appears exactly once below as a workpackage or an explicit PARKED entry.

**Document map:**
- `_SYSTEM/reports/wave3-hidden-meta-audit.md` — primary audit (13 findings). Attack-confirmed.
- `_SYSTEM/reports/wave3-session-boot-deep.md` — boot-chain deep dive (6 findings, CRIT-1/CRIT-2/HIGH-1/HIGH-2/MED-1 through MED-3/LOW-1/LOW-2). Attack-confirmed.
- `_SYSTEM/lane-output/deepseek-wave3-hooks-wiring.md` — DS advisory (36/36 wiring CLEAN, 2 factual errors corrected in hidden-meta-audit §8). [DS-verified with corrections]
- `_SYSTEM/lane-output/deepseek-wave3-sessionstate-schema.md` — DS advisory (1 factual error: `errors[]` has 3 live readers, not 0). [DS-verified with correction]
- This file — the work program.

---

## 1 · Context loadout

1. `CLAUDE.md` (repo root)
2. `_SYSTEM/reports/wave3-hidden-meta-audit.md` — read FINDINGS + DS Advisory Corrections (§8) fully
3. `_SYSTEM/reports/wave3-session-boot-deep.md` — read FINDINGS + TOP-3 FIXES fully
4. This file, fully
5. Per phase: target files listed in each phase's workpackages — read each fully before editing

Run `node _SYSTEM/Scripts/xref-query.mjs "session boot brain inject soul persona eot"` once at session start.

**Boot chain token-weight reference (from deep-dive):**
- brain-inject: ~3,485 tok (~570 tok IDENTITY duplication with native @-include)
- startup-offload: ~2,929 tok (possible full overlap with harness skill registry — verify before deleting)
- token-init: ~352 tok
- musubi-ingest: ~179 tok (full overlap — pointers to natively-loaded files)
- eot-background-start: ~6 tok (phantom — a lie)

---

## 2 · Hard rules

- **No commit, no push.** Marcel holds commit authority.
- **Protected paths untouchable**: `backend/data/`, `.claude/state/`, `.claude/history/`, `.env`, `node_modules/`, `.amp/`.
- **No dependency installs. No destructive commands. Never `claude -p`/`--print`/SDK.**
- **Scope discipline:** edit ONLY files named in the workpackage you are executing.
- **Evidence discipline:** every fix ends with its acceptance command run and output captured.
- **Owner-decision boxes** (marked `🔶 OWNER`): implement recommended default ONLY if Marcel pre-approved in the packet.
- **Brain-inject is a SYNC SessionStart hook** — edits to brain-inject.js affect every session boot. Test your edit path carefully. Verify the JSON shape of the `hookSpecificOutput` object is preserved after any change.
- **settings.json hook registration:** WP-H.1 requires removing `eot-background-start.js` from the SessionStart array in `.claude/settings.json`. Confirm the exact array position and file name before editing. A typo here breaks a SessionStart hook slot.
- **SOUL.md is native load + hook overlap:** CLAUDE.md @-includes SOUL.md natively. After WP-H.2, SOUL.md reaches the model exactly once (native). The brain-inject IDENTITY block (the redundant copy) will be removed. Do NOT remove SOUL.md itself or the @-include.

---

## 3 · Working agreement

- **One phase per work block.**
- **DS advisory corrections in force:** `deepseek-wave3-hooks-wiring.md` claimed gitnexus and agent-spawn-guard have settings-level matchers — FALSE (all matchers are `""`, gating is internal). This does not affect any fix here. `deepseek-wave3-sessionstate-schema.md` claimed `errors[]` has no runtime reader — FALSE (3 readers confirmed). The `errors[]` field is ALIVE; do not treat it as dead.
- **startup-offload.js redundancy (MED-2 in boot-deep):** VERIFY before touching. Deep-dive noted: startup-offload's ~2,929 tok skill index may fully overlap with the harness skill registry. It IS verified that the harness delivers a skill list to subagents. But for a main interactive session, this was not verified. Run `node .claude/hooks/startup-offload.js` (or observe a fresh session's turn-1 context) to confirm overlap before removing. If the harness skill list is NOT always present for interactive sessions, startup-offload is NOT redundant. WP-H.6 is gated on this verification.
- **End of session report:** changed files, every command run with pass/fail, owner-decision items left open.

---

## 4 · Fix phases

### Phase 0 — Baseline freeze

```bash
# Confirm boot chain
grep -A2 '"SessionStart"' .claude/settings.json | head -30
# Confirm SOUL.md native load
grep "@SOUL\|SOUL.md" CLAUDE.md | head -5
# Confirm IDENTITY block in brain-inject
grep -n "IDENTITY\|extractPersonaRules\|REQUIRED_HEADINGS" .claude/hooks/brain-inject.js | head -10
# Confirm eot-background-start
grep -n "eot-background-start\|EOT monitoring" .claude/settings.json .claude/hooks/eot-background-start.js | head -10
```
Any unexpected failure before you start → stop, report, wait.

---

### Phase 1 — Delete dead organ: eot-background-start.js

**WP-H.1** [CRITICAL] [CONFIRMED: boot-deep CRIT-2] 🔶 D-H1 `eot-background-start.js` — dead organ writes a never-read marker file, injects a false "monitoring active" claim into every turn 1

- **Files:** `.claude/settings.json` (SessionStart array), `.claude/hooks/eot-background-start.js` (the file itself — do NOT delete unless Marcel approves)
- **Evidence:** [boot-deep CRIT-2, CONFIRMED]. Hook writes `/tmp/claude-eot-${sessionId}.marker` with `{monitoring:true}` and emits `additionalContext: '🔄 EOT monitoring active'`. Spawns NOTHING. No monitor process. The marker file is never read anywhere. `CLAUDE_SESSION_ID` is unset → every session writes the same path `/tmp/claude-eot-unknown.marker` (key collision). Real EOT detection lives entirely in `user-prompt-submit.js:101-115,239-251` and `yuri-closeout.mjs`.
- **Two branches (owner resolves via D-H1):**
  - **Option A (recommended — delete from SessionStart):** Remove the `eot-background-start.js` entry from the `settings.json` SessionStart array. The hook file itself can remain on disk with a `// RETIRED 2026-06-10 — see wave3-session-boot-deep.md CRIT-2` header comment but NOT registered. This removes the false "monitoring active" claim from every turn-1 context immediately. Zero functional loss — real EOT runs through `user-prompt-submit.js` + `yuri-closeout.mjs`.
  - **Option B (fix and keep):** Implement actual background EOT monitoring: spawn a background process from `eot-background-start.js` that watches for session-end and triggers `yuri-closeout.mjs`. Requires: a `CLAUDE_SESSION_ID` fix (use `process.env.CLAUDE_SESSION_ID || uuidv4()` to avoid key collision), a real spawn that writes the marker and is consumed by something. Higher cost; justified only if Marcel wants background closeout monitoring that does not depend on user-prompt-submit's keyword detection.
- **Acceptance (Option A):** `grep "eot-background-start" .claude/settings.json | wc -l` returns 0. `grep "EOT monitoring active" .claude/hooks/eot-background-start.js` returns the line (file still on disk, just unregistered). Session boot no longer injects the false claim.
- **Regression:** zero functional regression — real EOT is not affected. Confirm `user-prompt-submit.js` handoff-keyword detection still fires (it does not depend on eot-background-start.js).

---

### Phase 2 — SOUL identity deduplication in brain-inject.js

**WP-H.2** [CRITICAL] [CONFIRMED: boot-deep CRIT-1, hidden-meta LOW + DOUBLE-SOUL-INJECTION] 🔶 D-H2 brain-inject.js emits SOUL.md IDENTITY block that CLAUDE.md already @-includes natively — ~570 tok/boot redundancy; CLAUDE.md documentation wrong

- **Files:** `.claude/hooks/brain-inject.js:107-129, 468-481` (`extractPersonaRules`, ZONE-A stableCore IDENTITY block)
- **Evidence:** [boot-deep CRIT-1, CONFIRMED]. `extractPersonaRules()` (line 121) pulls 9 SOUL.md paragraphs and emits them as `### IDENTITY — Yuri persona active (SOUL.md)` in ZONE-A. CLAUDE.md already @-includes the full SOUL.md natively. Subagents get SOUL three times (native + brain IDENTITY + soul-persona-inject). CLAUDE.md says "brain-inject only enriches with volatile live state — never the stable identity" — this is false.
- **Two branches (owner resolves via D-H2):**
  - **Option A (recommended — remove duplication, fix doc):** Remove the `extractPersonaRules()` call and the `### IDENTITY — Yuri persona active (SOUL.md)` block from brain-inject.js ZONE-A. Save ~570 tok/boot. Update the comment at brain-inject.js header lines 2-13 to match reality: "brain-inject injects volatile live state (lane health, roadmap, fingerprint, neuron log, learned rules, memory) + optional IDENTITY reinforcement if configured." ALSO update CLAUDE.md "Brain & Body" section to say "brain-inject provides volatile live state; stable identity is loaded natively via @-includes."
  - **Option B (keep reinforcement, fix doc):** Keep the IDENTITY block (intentional per-boot reinforcement has value for long sessions). ONLY fix the CLAUDE.md documentation to accurately describe what brain-inject actually injects. Add a comment to brain-inject.js ZONE-A: `// INTENTIONAL REINFORCEMENT: 9 SOUL.md Core Truths re-emitted here for structured <yuri-brain> weight, even though CLAUDE.md @-includes SOUL.md natively. The doc is wrong; this behavior is correct.`
- **Acceptance (Option A):** `grep "extractPersonaRules\|IDENTITY.*Yuri persona" .claude/hooks/brain-inject.js | wc -l` returns 0. `grep "volatile live state\|stable identity.*natively" CLAUDE.md` returns the updated framing.
- **Acceptance (Option B):** `grep "INTENTIONAL REINFORCEMENT\|doc is wrong" .claude/hooks/brain-inject.js` returns the comment. `grep "never the stable identity" CLAUDE.md | wc -l` returns 0.
- **Regression (Option A):** identity is still native via @SOUL.md. The model does NOT lose access to SOUL.md — it just doesn't get it twice. soul-persona-inject.js still fires for subagents (subagents get soul via SubagentStart hook regardless).

---

### Phase 3 — Staleness guards for injected state

**WP-H.3** [HIGH] [CONFIRMED: boot-deep HIGH-1] brain-inject injects 20-24-day-old lane-health, roadmap, and learned-rules as "active"/"current" state

- **Files:** `.claude/hooks/brain-inject.js:83-93, 98-104, 230-251, 360-378` (`loadLaneHealth`, `loadRoadmapState`, `loadLearnedRules`)
- **Evidence:** [boot-deep HIGH-1, CONFIRMED]. `lane-health-status.json` 21d stale rendered as `LANE_HEALTH … as-of: 30154m ago`. `roadmap-state.json` 23d stale rendered as "Active sprint state" with no age guard. `global.md` 20d stale loaded as ZONE-A learned-rules with no age check.
- **Direction:** Add a staleness guard to each of `loadLaneHealth`, `loadRoadmapState`, and `loadLearnedRules`:
  1. Read the source file's `mtime` (or the JSON's own `lastUpdated` / `timestamp` field if present).
  2. Compute `ageMs = Date.now() - mtime`.
  3. If `ageMs > 48 * 3600 * 1000` (>48h), render as `⚠ STALE (${Math.floor(ageMs/86400000)}d old — may not reflect current state)` instead of the full block.
  4. If `ageMs > 7 * 24 * 3600 * 1000` (>7d), suppress the section entirely and emit a one-line `[LANE_HEALTH stale > 7d — suppressed]` marker.
  5. Convert age display: if >1d, show `Nd old` not `NNNNm ago`.
- **Acceptance:** `grep "STALE\|ageMs\|staleness" .claude/hooks/brain-inject.js | head -5` returns the guard. Run `node .claude/hooks/brain-inject.js` (if it supports a dry-run mode) or read the file to confirm the guard logic is applied to all three load functions.
- **Regression:** if the source files are freshly updated (age < 48h), behavior is identical to before. The guard only changes output when data is genuinely stale.

---

### Phase 4 — brain-inject ZONE-A cache-boundary honesty

**WP-H.4** [HIGH] [CONFIRMED: boot-deep HIGH-2] ZONE-A "cacheable stable prefix" claim is false — contains MEMORY.md and learned-rules that mutate; volatile git-log+hour in the "stable" zone

- **Files:** `.claude/hooks/brain-inject.js:465-481` (ZONE-A stableCore block and comment)
- **Evidence:** [boot-deep HIGH-2, CONFIRMED]. ZONE-A stableCore ends with `### MEMORY — curated truths (MEMORY.md)` + `${memoryLines}` and includes `${learnedRules}`. MEMORY.md changes on every memory write. ZONE-C volatile footer embeds `git log --oneline -n 3` + `new Date().getHours()+'h'` — changes every commit and every hour. The "cacheable prefix" claim in the comment is false.
- **Direction:** Two options: (a) Move MEMORY.md and learned-rules OUT of ZONE-A and into ZONE-C (volatile). Update the ZONE-A comment to say "ZONE A: STATIC IDENTITY ONLY — persona rules (if kept from D-H2 Option B) + stable system identity. MEMORY and learned-rules are volatile and belong in ZONE-C." (b) Drop the "cacheable prefix" framing entirely. Update the comment to: "NOTE: brain-inject output is NOT cacheable as a stable prefix — MEMORY.md, learned-rules, git-log, and hour-string are all mutable. Token cache behavior depends on the harness, not this block." Option B is a documentation fix; Option A also improves actual cacheability by isolating mutable content.
- **Acceptance:** `grep "cacheable.*stable\|stable.*cacheable" .claude/hooks/brain-inject.js | wc -l` returns 0 (or the claim is replaced by the honest version). `grep "NOT cacheable\|volatile.*ZONE-C" .claude/hooks/brain-inject.js` returns the corrected framing.
- **Regression:** documentation only for Option B. Option A reorganizes the block structure — verify the emitted JSON shape is unchanged (ZONE-A + ZONE-C both end up in `additionalContext`).

---

### Phase 5 — AEONIC dead-field cleanup

**WP-H.5** [MEDIUM] [CONFIRMED: hidden-meta AEONIC-SECTIONS-DEAD] `state.aeonic.sections` written by musubi-protocol-ingest.js; never read by any hook

- **Files:** `.claude/hooks/musubi-protocol-ingest.js:84`, `.claude/hooks/musubi-protocol-enforce.js`
- **Evidence:** [hidden-meta AEONIC-SECTIONS-DEAD, CONFIRMED]. `musubi-protocol-ingest` writes `state.aeonic.sections` (parsed protocol sections). `musubi-protocol-enforce` reads ONLY `state.aeonic.lastEnforceAt`, `state.tools_used`, and `state.skills_read` — sections never consumed.
- **Direction:** Option A (wire the sections): update `musubi-protocol-enforce.js` to read `state.aeonic.sections` and use the ROLE_MATRIX / GLOBAL_LLM_COMPAT / CORE_DIRECTIVES content when building its advisory output. This makes the injection useful. Option B (stop the dead write): remove the `state.aeonic.sections` and `state.aeonic.loadedAt` writes from `musubi-protocol-ingest.js` (or leave the writes but add a comment: `// DEAD WRITE: sections are parsed but no consumer reads state.aeonic.sections. Kept for potential future use.`). Option B is the minimum fix. Recommended: Option B as a documentation fix now; Option A if Marcel wants the sections to feed enforce logic.
- **Acceptance:** `grep "aeonic.sections.*dead\|DEAD WRITE" .claude/hooks/musubi-protocol-ingest.js` returns the comment (Option B). OR `grep "state.aeonic.sections" .claude/hooks/musubi-protocol-enforce.js` returns a live read (Option A).
- **Regression:** the sections object is currently unused. Commenting it as dead adds no functional change.

---

### Phase 6 — startup-offload.js redundancy verification and optional optimization

**WP-H.6** [MEDIUM, contingent] [CONFIRMED: boot-deep MED-2] startup-offload injects ~2,929 tok of skill descriptions — possible full overlap with harness skill registry

- **Files:** `.claude/hooks/startup-offload.js:14-15`
- **Evidence:** [boot-deep MED-2, CONFIRMED for subagents]. startup-offload's `<startup-index>` (~2,929 tok, 43 dirs) may fully overlap with the harness native available-skills system-reminder. Verified present in subagent boot. NOT verified for main interactive sessions.
- **Direction:** **VERIFY FIRST.** Before any edit: examine a fresh main interactive session's turn-1 context to confirm whether the harness skill-registry system-reminder is always present. If it IS always present: update `startup-offload.js:15` to inject only a count + pointer: `"<startup-index>43 skills available via Skill tool. Load individual SKILL.md on first use; do not re-read from disk.</startup-index>"` — saves ~2,850 tok/boot. If it is NOT always present for interactive sessions: do NOT change startup-offload.js; add a comment noting the verification result and deferring the optimization.
- **Acceptance (if optimization applied):** `grep "skills available via Skill tool" .claude/hooks/startup-offload.js` returns the pointer line. Boot injection drops from ~2,929 tok to ~20 tok for the skill section.
- **Acceptance (if deferred):** comment added to startup-offload.js documenting the verification result and the deferral reason.
- **Regression:** if the harness skill-registry is always present, removing the duplicate injection has zero functional impact on skill routing. If NOT always present, skipping the optimization preserves correct skill discovery.

---

### Phase 7 — Session-state dead-fields documentation

**WP-H.7** [LOW] [CONFIRMED: hidden-meta STATE-DEAD-FIELDS + AVERSIONS-EMPTY-ALWAYS + STATE_FILE-DEAD-CODE] Multiple session-state dead fields and orphan const

- **Files:** `.claude/hooks/brain-inject.js:28` (STATE_FILE orphan const), `.claude/hooks/token-session-init.js` (schema_version, start_time, git.cwd, context.last_updated, skills_written, aeonic.sections comments), `.claude/hooks/token-session-init.js:65` (aversions[] init)
- **Evidence:** [hidden-meta STATE-DEAD-FIELDS, AVERSIONS-EMPTY-ALWAYS, STATE_FILE-DEAD-CODE, CONFIRMED]. Dead writes: `schema_version`, `start_time`, `git.cwd`, `context.last_updated`, `skills_written`, `aeonic.sections`, `aeonic.loadedAt`. `aversions[]` initialized but no hook ever writes values. `STATE_FILE` const in brain-inject.js defined at module scope but used nowhere (orphan const).
- **Direction:** (1) Remove the `STATE_FILE` orphan const from `brain-inject.js:28` (it references a state path but the function that uses the path declares its own local variable — confirmed). (2) Add `// DEAD WRITE — no runtime reader` comments to `schema_version`, `start_time`, `git.cwd`, `context.last_updated`, `skills_written` writes in `token-session-init.js`. (3) Add `// DEAD — initialized but no hook ever writes values; readers always get []` comment to `aversions[]` init in `token-session-init.js:65`. Do NOT remove the writes or the field init — these are documentation-only changes to avoid accidentally breaking consumers that might check for field existence.
- **Acceptance:** `grep "STATE_FILE" .claude/hooks/brain-inject.js | wc -l` returns 0 (orphan const removed). `grep "DEAD WRITE\|no runtime reader" .claude/hooks/token-session-init.js | wc -l` returns ≥5.
- **Regression:** removing an orphan const cannot affect runtime behavior. Comments on dead writes add no runtime change.

---

### Phase 8 — Minor hook correctness: SOUL headings shared constant, musubi stale comment

**WP-H.8** [LOW] [CONFIRMED: hidden-meta SOUL-HEADINGS-UNSHARED + MUSUBI-STALE-COMMENT] Two maintenance traps

- **Files:** `.claude/hooks/brain-inject.js:109-119` (`REQUIRED_HEADINGS`), `.claude/hooks/soul-persona-inject.js:9-19` (`REQUIRED_HEADINGS`), `.claude/hooks/musubi-protocol-ingest.js:3-4,16,68`
- **Evidence:** [hidden-meta, CONFIRMED]. Two independent REQUIRED_HEADINGS arrays with identical content. SOUL.md heading rename would require dual update with no reminder. Musubi ingest comment says "AEONIC_PROTOCOL.md" but code reads "MUSUBI_PROTOCOL.md" — stale comment.
- **Direction:** (1) Extract `REQUIRED_HEADINGS` to a shared constant. Options: (a) Create a minimal shared module `.claude/hooks/soul-headings.mjs` that exports `REQUIRED_HEADINGS` and import it in both brain-inject.js and soul-persona-inject.js. (b) If creating a new file is too complex (esm interop between the two hooks), at minimum add a comment to both files: `// MAINTENANCE: keep REQUIRED_HEADINGS in sync with soul-persona-inject.js (or brain-inject.js). Consider extracting to a shared constant.` (2) Update musubi-protocol-ingest.js comments lines 3-4, 16, 68 to say "MUSUBI_PROTOCOL.md" not "AEONIC_PROTOCOL.md".
- **Acceptance:** `grep "AEONIC_PROTOCOL.md" .claude/hooks/musubi-protocol-ingest.js | wc -l` returns 0. Either the shared module exists OR the sync-reminder comments are in both brain-inject.js and soul-persona-inject.js.
- **Regression:** REQUIRED_HEADINGS shared constant — verify both brain-inject.js and soul-persona-inject.js import correctly (ESM vs CJS compatibility). If shared module creates import complexity, use the comment approach.

---

## 5 · PARKED entries

| ID | Finding | Reason parked |
|---|---|---|
| PARKED-H.A | Ghost die entries PALACE, MNEMOSYNE, PALACE_IDX (retired 2026-05-29) | Three retired die nodes. Archive confirmed at `_SYSTEM/archive/legacy-purge-2026-05/palace/`. No active code references them. Prune from `wave3-scope-die-extract.json` in the next die housekeeping pass. No functional fix needed. |
| PARKED-H.B | SCOUT_HERMES / HERMES_FC ghost die — no live file, no retirement note | Not spawned anywhere. No `agents/hermes*.md`. Tirith binary at `~/.hermes/` is a naming collision, not related. Either build HERMES_FC (add to scout-orchestrator spawn + create agents/hermes-fc.md) or prune from die. Parked pending Marcel's intent. No active guard missing. |
| PARKED-H.C | musubi-protocol-ingest redundancy — ~179 tok block of pointers to natively-loaded files | boot-deep MED-1 confirmed. The musubi shim is a "legacy compatibility shim" (file header L1) whose only non-duplicated content is the `ai route-plan/auto` command hints. Fix: either retire the hook (low impact) or shrink the shim to unique content only. Low priority; deferred. |
| PARKED-H.D | MATCHER-OVERFIRING — gitnexus-hook and agent-spawn-guard pay boot cost on every tool | All PreToolUse hook matchers are `""` (fires on all tools). gitnexus and agent-spawn-guard gate internally. Neither can be moved to matcher-scoped without changing `settings.json` and verifying internal gate logic. Estimated ~2ms startup cost per unnecessary fire. Deferred as low-impact; addressable in a hook performance pass. |
| PARKED-H.E | SESSION_ID-WEAK — session_id written to state but only used in log header | ALIVE-but-log-only confirmed. Not a functional defect. Parked. |
| PARKED-H.F | TIRITH-BYPASS-UNDOCUMENTED — TIRITH_BYPASS=1 silently disables URL screening | Documented in hidden-meta §2.5. Fix: add a comment to `tirith-url-guard.js:12-15` noting the bypass env is ungated by role. URL screening is advisory defense-in-depth; bypass is acceptable but should be documented. Deferred as LOW impact for a hook-comments pass. |
| PARKED-H.G | boot latency worst-case (~5s nerve timeout in brain-inject loadOrganState) | `loadOrganState` (brain-inject.js:406) does `spawnSync` with 5s timeout on the sync boot path. Fine when healthy. Not load-tested under a slow nerve. Parked as LOW impact for a boot-performance audit. |
| PARKED-H.H | LOW-1: token-session-init "Reasoning: MAX effort active" hardcoded claim | Static string asserting a runtime state the hook doesn't verify. Cosmetic; deferred. |

---

## 6 · Owner decisions

| ID | Decision | Recommendation | Tradeoffs | Phase gated |
|---|---|---|---|---|
| **D-H1** | eot-background-start.js dead organ: delete from SessionStart (Option A) vs fix with real background monitor (Option B) | **Option A** — unregister from SessionStart, leave file on disk with RETIRED comment. Zero loss: real EOT runs through user-prompt-submit.js + yuri-closeout.mjs. Option B builds real background monitoring — justified only if Marcel wants daemon-mode session surveillance that doesn't depend on keyword detection. | Option A: trivial, immediate, ~6 tok/boot saved, false claim removed. Option B: ~50+ lines of new daemon code, requires CLAUDE_SESSION_ID fix. | Phase 1 (blocking WP-H.1) |
| **D-H2** | Brain-inject SOUL IDENTITY duplication: remove deduplication (Option A, save ~570 tok/boot, fix doc) vs keep reinforcement, fix doc only (Option B) | **Option A** if token efficiency matters; **Option B** if Marcel values the structured `<yuri-brain>` reinforcement weight for long sessions. The identity is always delivered by the native @SOUL.md @-include. The hook adds a structured XML-tagged copy for emphasis — whether that emphasis is worth 570 tok is Marcel's call. | Option A: saves ~570 tok/boot, CLAUDE.md doc accurate. Option B: no token saving, but structured reinforcement is intentional. Either way, doc must be fixed. | Phase 2 (blocking WP-H.2) |
| **D-H3** | AEONIC sections: wire `state.aeonic.sections` to enforce logic (Option A) vs document as dead write (Option B) | **Option B** for now — the musubi-protocol-enforce advisory is currently noise anyway (session-accumulator stale state, fixed by governance WP-G.4). Wiring the sections to enforce logic makes sense only AFTER the enforce logic is reliable. Document as dead write now; revisit post-WP-G.4. | Option A: makes AEONIC data flow complete. Option B: honest, deferred. | Phase 5 (WP-H.5) |
| **D-H4** | startup-offload.js optimization: drop to count+pointer (save ~2,850 tok/boot) vs verify-first-then-decide | **Verify first** (as described in WP-H.6). The optimization is only correct if the harness skill-registry system-reminder is always present in interactive sessions. Verify before applying. If verified: do the optimization. If not verified: defer. | Token savings: ~2,850 tok/boot if applicable. Risk: none if harness always delivers skill list; broken skill discovery if it doesn't. | Phase 6 (gated on verification) |

---

## 7 · Coverage gaps — follow-up AUDIT workpackages

**WP-H.AUDIT-1** — `yuri-sentinel-start.js` SubagentStart hook: not deep-read. Confirm it does not load skills or inject additional soul/identity content beyond what soul-persona-inject.js provides. If it does, it adds a 4th soul-load path for subagents.

**WP-H.AUDIT-2** — `neuron-loop.mjs` phase 7c fingerprint-baseline.mjs trigger: the audit noted `neuron-loop.mjs` runs fingerprint-baseline in phase 7c. Confirm whether this is on the hot path (every neuron-loop run) or demand-triggered. If hot, fingerprint.json freshness depends on neuron-loop's LaunchAgent schedule.

**WP-H.AUDIT-3** — startup-offload.js vs harness skill-registry redundancy verification: the session boot deep-dive deferred this (MED-2). Run it: observe a fresh main interactive session turn-1 context (not a subagent) and confirm whether the native skill-registry system-reminder is present. Document the result for WP-H.6.

---

## 8 · Final acceptance gate

Ordered; each step gates the next.

1. **Baseline stable:** `grep "eot-background-start" .claude/settings.json` returns the pre-fix registration (confirms baseline).
2. **Dead organ removed (D-H1 Option A):** `grep "eot-background-start" .claude/settings.json | wc -l` returns 0 post-fix. `grep "RETIRED\|eot-background-start" .claude/hooks/eot-background-start.js | head -1` returns the RETIRED comment.
3. **SOUL dedup resolved (D-H2):** depending on option — either `grep "extractPersonaRules\|IDENTITY.*Yuri persona" .claude/hooks/brain-inject.js | wc -l` returns 0 (Option A) or `grep "INTENTIONAL REINFORCEMENT" .claude/hooks/brain-inject.js` returns comment (Option B). In both cases: `grep "never the stable identity" CLAUDE.md | wc -l` returns 0 (doc fixed).
4. **Staleness guards in brain-inject:** `grep "STALE\|ageMs" .claude/hooks/brain-inject.js | wc -l` returns ≥3 (one per staleness-guarded load function).
5. **ZONE-A cache claim corrected:** `grep "NOT cacheable\|volatile.*ZONE-C\|cacheable.*stable\|stable.*cacheable" .claude/hooks/brain-inject.js` returns the corrected framing.
6. **AEONIC dead-field documented:** `grep "DEAD WRITE\|aeonic.sections.*dead" .claude/hooks/musubi-protocol-ingest.js | wc -l` returns ≥1.
7. **Orphan STATE_FILE const removed:** `grep "^const STATE_FILE" .claude/hooks/brain-inject.js | wc -l` returns 0.
8. **Dead-field comments added:** `grep "DEAD WRITE\|no runtime reader\|DEAD.*initialized" .claude/hooks/token-session-init.js | wc -l` returns ≥5.
9. **Owner decisions D-H1 through D-H4 recorded** in session report with Marcel's choice for each.

Wave is DONE when all 9 are green AND §5's completeness contract holds. Write the wave report as `wave3-hidden-meta-fix-wave-report-<date>.md` next to this file.
