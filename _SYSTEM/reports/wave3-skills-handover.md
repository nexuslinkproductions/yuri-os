# YURI Wave-3 Skills Domain — Handover Instruction for Opus 4.8

> **Operator note (Marcel):** paste this file's path into the Opus session as the task packet root. No blocking owner decisions for Phase 1-4; D-S1 (orphan command triage) gates Phase 5. Status: **PACKAGES READY — Codex addendum blocked until Jun 11 credits reset; re-dispatch `_SYSTEM/reports/wave3-codex-spec-saved.md` after reset.**

> **COUNT RULE:** the attacker's count corrections override the audit numbers everywhere they differ. Use attacker numbers throughout.

---

## 0 · Mission

You are fixing the YURI skills domain so that the health gate passes, the command dispatch surface correctly routes through the Skill-tool, and the active-registry scores are accurate. A completed audit + attack pass found: **8 organ-* skills permanently fail the health gate; 23 near-match alias commands invoke skills via prose-only fallback (Skill-tool routing broken); 34 total orphan commands exist; 16 `.claude/skills/` dirs have no active-registry profile entry (capped at score=18).**

Non-negotiable framing: the health gate and the Skill-tool dispatch surface are the two live enforcement points for skill routing. A chronic health gate failure masks real drift. Broken Skill-tool routing means commands fall through to model interpretation, which is not equivalent to a structured skill invocation.

**Completeness contract:** every attack-confirmed finding in the audit ledger appears exactly once below as a workpackage or an explicit PARKED entry.

**Count corrections in force (attacker numbers):**
- Near-match prose-alias commands (broken Skill-tool dispatch): **23** (not 15)
- True-dead orphan commands (no backing, no prose): **11** (not 19); total orphans: **34**
- SKILL_CAPABILITY_PROFILES keys: **46** (not 44)
- Profile→.claude/skills missing mirror: **17** real missing mirrors + 2 ghosts = separate problems (not 19 conflated)
- NO_TRIGGERS in .claude/skills/: **9** (not 10)
- NO_SESSION_NOTES in .claude/skills/: **3** (not 2)
- Profile skills with zero command surface: **20** (not ~19)

**Document map:**
- `_SYSTEM/reports/wave3-skills-audit.md` — primary audit + ATTACK PASS (count corrections in ATTACK PASS override audit body)
- `_SYSTEM/lane-output/deepseek-wave3-skills-crossmap.md` — DS advisory; ghost/hash claims confirmed; orphan count and no-cmd count have off-by-one or definition errors — treat as directionally correct only. [DS-verified directional; counts superseded by attacker]
- This file — the work program.

---

## 1 · Context loadout

1. `CLAUDE.md` (repo root)
2. `_SYSTEM/reports/wave3-skills-audit.md` — read FINDINGS + ATTACK PASS fully; ATTACK PASS count corrections take precedence
3. This file, fully
4. Per phase: target files listed in each phase's workpackages — read each fully before editing

Run `node _SYSTEM/Scripts/xref-query.mjs "skill registry health dispatch command"` once at session start.

---

## 2 · Hard rules

- **No commit, no push.** Marcel holds commit authority.
- **Protected paths untouchable**: `backend/data/`, `.claude/state/`, `.claude/history/`, `.env`, `node_modules/`, `.amp/`.
- **No dependency installs. No destructive commands. Never `claude -p`/`--print`/SDK.**
- **Scope discipline:** edit ONLY files named in the workpackage you are executing. Flag unlisted-file dependencies before touching them.
- **Evidence discipline:** every fix ends with the acceptance command run and output captured.
- **Owner-decision boxes** (marked `🔶 OWNER`): implement recommended default ONLY if Marcel pre-approved it in the packet.
- **Hash registry:** when adding entries to `_SYSTEM/skill-hash-registry.json`, recompute the hash by reading the SKILL.md body and computing SHA-256. Do NOT copy hashes from memory — compute them from the current file contents via `node -e "const crypto=require('crypto'),fs=require('fs'); console.log(crypto.createHash('sha256').update(fs.readFileSync('.claude/skills/<name>/SKILL.md')).digest('hex'))"`.

---

## 3 · Working agreement

- **One phase per work block.** Finish a phase before opening the next. Phases are dependency-ordered.
- **Per fix:** read current code at the cited anchor → confirm the audit's "current behavior" still matches HEAD → apply the change → run the acceptance command → capture output.
- **Attacker count corrections are authoritative:** for any count-sensitive fix (number of files to add frontmatter to, number of entries to add to hash-registry), use the attacker's verified numbers, not the audit body.
- **CMD_REPORT phantom node:** the die entry `CMD_REPORT` references a `/report` slash command with no `report.md` on disk. Do not create it — flag it in your session report as a phantom scope node.
- **End of session report:** changed files, every command run with pass/fail, owner-decision items left open.

---

## 4 · Fix phases

### Phase 0 — Baseline freeze

```bash
node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate 2>&1 | tail -3
# Expected output: something like "checked=219 ok=210 drift=0 missing=0 unregistered=8 collisions=false"
ls .claude/skills/ | wc -l
ls .claude/commands/ | wc -l
grep -c "knownProfile" _SYSTEM/Scripts/yuri-active-skill-registry.mjs
```
Any unexpected failure before you start → stop, report, wait.

---

### Phase 1 — Health gate: register 8 organ-* skills (blocking chronic health failure)

**WP-S.1** [HIGH] [CONFIRMED] 8 `organ-*` skills permanently fail the `skill_registry` health gate

- **Files:** `_SYSTEM/skill-hash-registry.json`, (optional: `_SYSTEM/Scripts/yuri-health.mjs:127` if registration approach chosen)
- **Evidence:** [audit H1, CONFIRMED]. `evaluateSkillRegistry` returns `ok: false` when `unregistered > 0`. 8 `organ-*` skills exist on disk under `.claude/skills/` but have no entry in `_SYSTEM/skill-hash-registry.json`. Health gate exits 1 on `skill_registry` (required=true) chronically.
- **Direction:** Run `node _SYSTEM/Scripts/yuri-skill-loader.mjs --write-manifest` to register all 8 `organ-*` entries in `skill-hash-registry.json`. Verify the command completes successfully and the 8 entries appear. Alternative if `--write-manifest` does not produce the correct format: add entries manually by computing SHA-256 of each SKILL.md and appending the JSON object `{"id": "organ-<name>", "hash": "<sha256>", "path": ".claude/skills/organ-<name>/SKILL.md"}` to the registry array.
- **Organ-* list to register:** `organ-discovery-precision-gate`, `organ-filing-assessor`, `organ-formula-foundry`, `organ-formula-foundry-bakeoff`, `organ-lane-telemetry-cockpit`, `organ-openprocess-pool`, `organ-yuri-decode`, `organ-yuri-nerve` (confirm exact names via `ls .claude/skills/ | grep organ`).
- **Acceptance:** `node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate 2>&1 | grep unregistered` returns `unregistered=0`. `node _SYSTEM/Scripts/yuri-health.mjs 2>&1 | grep skill_registry` returns a PASS line.
- **Regression:** adding entries to hash-registry cannot cause drift failures (hash is freshly computed from current SKILL.md body). If `--write-manifest` changes an existing hash, stop — that indicates an existing registered skill was modified without a hash update, which is a pre-existing drift that must be flagged.

---

### Phase 2 — Command dispatch: add `skill:` frontmatter to 23 near-match prose-alias commands

**WP-S.2** [HIGH] [CONFIRMED — count corrected to 23] 23 near-match alias commands invoke skills via prose only; no Skill-tool routing fires

- **Files:** 23 files in `.claude/commands/*.md` (list below)
- **Evidence:** [audit H2, ATTACK PASS corrected 15→23, CONFIRMED]. Commands contain prose "Invoke the X skill via the Skill tool" but have no `skill:` frontmatter. Claude Code's Skill-tool router never fires; execution falls through to model interpretation.
- **Direction:** For each file, add a YAML frontmatter block at the top:
  ```
  ---
  skill: <target-skill-id>
  description: <one-line description matching the skill's own description>
  ---
  ```
  The `<target-skill-id>` must match the `name:` field in the corresponding `SKILL.md`. Do NOT invent skill IDs — verify the ID from the target `SKILL.md` frontmatter.
- **Command list (23 near-match aliases — verify each against its SKILL.md):**
  `clone, code-intelligence, compact, edc, eot, fel, guard, pattern-mirror, pco, pdc, pmc, research, sales-intelligence, shura, zenkai` (15 from audit) + 8 additional confirmed by attacker live scan. Run `ls .claude/commands/` and identify files with prose "Invoke the X skill via the Skill tool" but no `skill:` frontmatter line — these are the 23.
- **Process per file:** (1) Read the command `.md`. (2) Extract the skill name from the prose. (3) Find the SKILL.md: first try `.claude/skills/<name>/SKILL.md`, then `skills/<name>/SKILL.md`. (4) Read the `name:` field from that SKILL.md. (5) Add frontmatter. If no SKILL.md exists on disk → move to PARKED-S.B triage list (do not create a stub).
- **Acceptance:** `grep -l "^skill:" .claude/commands/*.md | wc -l` returns a count ≥ (baseline alt-cmd count + 23). `node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate` still green (no skill changes).
- **Regression:** adding frontmatter to command files does not affect skill body loading. Only command dispatch routing changes.
- **Codex addendum:** `_SYSTEM/reports/wave3-codex-spec-saved.md` — fold in after Jun 11 reset.

---

### Phase 3 — Active-registry: add SKILL_CAPABILITY_PROFILES entries for 16 unregistered `.claude/skills/` dirs

**WP-S.3** [MEDIUM] [CONFIRMED] 16 `.claude/skills/` dirs have no `SKILL_CAPABILITY_PROFILES` entry — capped at score=18, suppressed in competitive contexts

- **Files:** `_SYSTEM/Scripts/yuri-active-skill-registry.mjs` (`SKILL_CAPABILITY_PROFILES` object, lines 157-181 and surrounding)
- **Evidence:** [audit M4, CONFIRMED]. `profile.knownProfile ? score : Math.min(score, 18)` at line 497. `matchedCapabilities.length < 2` → suppressed for unknown profiles.
- **Unregistered dirs (16):** `anthropic-managed-agents`, `bg`, `design-source-pack`, `extraction-sprint`, `gitnexus` (umbrella), `yuri-code-intelligence`, `yuri-sales-intelligence`, `yuri-shura`, and the 8 `organ-*` dirs (the same 8 registered in WP-S.1).
- **Direction:** For each of the 16 dirs, read the SKILL.md to extract `name`, `description`, `triggers`. Add a profile entry to `SKILL_CAPABILITY_PROFILES`. Profile object schema (infer from existing entries in the object): `{ id: "<skill-id>", description: "...", knownProfile: true, capabilities: ["<cap1>", "<cap2>"], tier: "utility"|"expert"|"core", ... }`. Use the SKILL.md content to determine `capabilities` (match to the existing capability vocabulary in the file). Mark `knownProfile: true` to remove the score=18 cap.
- **Acceptance:** `grep -c "knownProfile: true" _SYSTEM/Scripts/yuri-active-skill-registry.mjs` increases by 16 from baseline. `node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate` still green.
- **Regression:** adding profiles cannot reduce scores for existing known skills. New entries start above score=18 for the first time.

---

### Phase 4 — Ghost profile cleanup and doc-sync

**WP-S.4** [MEDIUM] [CONFIRMED] 2 ghost profile entries in `SKILL_CAPABILITY_PROFILES`; `skills-registry.md` has 4 ghost + 14 unlisted entries

- **Files:** `_SYSTEM/Scripts/yuri-active-skill-registry.mjs:157,177`, `_SYSTEM/AGENTS/skills-registry.md:40-48`
- **Evidence:** [audit M3, CONFIRMED]. `ai-pipeline-offloading` (line 177) and `swarm-coordination` (line 157) are in SKILL_CAPABILITY_PROFILES with zero disk presence. `skills-registry.md` lists `ai-pipeline-offloading`, `browser-automation`, `swarm-coordination`, `taskflow` as skills — 0 have disk presence. 14 Matt Pocock skills in `skills-registry.md` have no SKILL_CAPABILITY_PROFILES entry.
- **Direction:** (1) Remove `ai-pipeline-offloading` and `swarm-coordination` entries from `SKILL_CAPABILITY_PROFILES` in `yuri-active-skill-registry.mjs`. (2) Update `skills-registry.md`: remove the 4 ghost entries (ai-pipeline-offloading, browser-automation, swarm-coordination, taskflow). (3) Add the 14 Matt Pocock skills from `skills-registry.md` to `SKILL_CAPABILITY_PROFILES` if their SKILL.md bodies exist on disk in `skills/`. For each, verify `ls skills/<name>/SKILL.md` before adding. Those without SKILL.md → add to `skills-registry.md` with a `(no SKILL.md — not loadable)` notation.
- **Acceptance:** `grep "ai-pipeline-offloading\|swarm-coordination" _SYSTEM/Scripts/yuri-active-skill-registry.mjs | wc -l` returns 0. `grep "browser-automation\|taskflow" _SYSTEM/AGENTS/skills-registry.md | wc -l` returns 0.
- **Regression:** removing ghost profiles cannot affect skill loading (they already return empty bodies). Verify `node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate` still green after removal.

**WP-S.5** [MEDIUM] [CONFIRMED] SessionStart skill index loads only from `.claude/skills/`; 17 profiled skills invisible at session boot

- **Files:** `.claude/hooks/startup-offload.js:5,42-54`
- **Evidence:** [audit M1, ATTACK PASS corrected 19→17 real missing mirrors, CONFIRMED]. `startup-offload.js` reads exclusively from `.claude/skills/<name>/SKILL.md`. 17 skills in SKILL_CAPABILITY_PROFILES with a `skills/` root SKILL.md but no `.claude/skills/` mirror are absent from the SessionStart index.
- **Direction:** Two options: (a) Create mirror symlinks: for each of the 17 skills, create `.claude/skills/<name>/SKILL.md` as a symlink to `skills/<name>/SKILL.md`. This is the minimum-touch fix and avoids duplicating content. (b) Update `startup-offload.js:5` to also scan `skills/` root. Option A is recommended (preserves startup-offload.js logic, no code change, mirrors will also fix WP-S.2 for skills that have no `.claude/skills/` dir at all). Before creating a symlink, verify the `skills/<name>/SKILL.md` exists on disk.
- **17 missing-mirror IDs to verify and create:**
  `brainstorming, diagnose, dispatching-parallel-agents, executing-plans, gitnexus-debugging, gitnexus-impact-analysis, gitnexus-refactoring, oracle-memory, prompt-engineering, receiving-code-review, requesting-code-review, subagent-driven-development, tdd, test-driven-development, using-git-worktrees, write-a-skill, writing-skills` — verify each against `ls skills/<name>/SKILL.md` before creating the mirror.
- **Acceptance:** `ls .claude/skills/ | wc -l` increases by 17 (or by the count of confirmed-present source SKILL.mds). `node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate` still green. The missing-mirror count in the next run of startup-offload should be 0.
- **Regression:** symlinks are transparent to the startup-offload.js `readdirSync`. No hash changes (hash-registry entries are keyed by path — confirm the new `.claude/skills/` paths are added to the registry or excluded from the hash check).

---

### Phase 5 — Hash integrity at session boot; orphan command triage

**WP-S.6** [MEDIUM] [CONFIRMED] Hash integrity is on-demand only — no SessionStart health check; drifted/tampered skill body loads silently

- **Files:** `.claude/settings.json` (SessionStart hooks array), `_SYSTEM/Scripts/yuri-health.mjs`
- **Evidence:** [audit M2, CONFIRMED]. `yuri-health.mjs` is never invoked from any SessionStart hook. Hash drift loads silently.
- **Direction:** Add a lightweight hash-check to the SessionStart chain. Options: (a) Add `node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate --json` as a SessionStart command in `settings.json`. If it exits non-zero (drift or missing), the harness will show the error. Keep it async (`"async": true`) so it does not block boot. (b) Add a wrapper script that runs `--validate --json` and emits a `process.stdout.write` with `additionalContext` warning on drift. Option A is simplest. Confirm the command is added after the existing 7 SessionStart entries.
- **Acceptance:** `grep "yuri-skill-loader\|--validate" .claude/settings.json` returns the new SessionStart entry.
- **Regression:** `--validate` is read-only. Adding an async SessionStart hook cannot block boot.

**WP-S.7** [HIGH → depends on D-S1] 🔶 D-S1 Orphan command triage — 11 true-dead orphans (no backing skill on disk anywhere)

- **Files:** 11 files in `.claude/commands/*.md` (true orphans — no `skills/` root, no `.claude/skills/`, no hash-registry entry)
- **Evidence:** [audit H2, ATTACK PASS corrected 19→11, CONFIRMED]. True-dead orphans (no backing anywhere): `ai-pipeline-offloading, constitution, design, domain, ds-flash, ds-pro, ndig, probability, reflect, spec, spec-analyze, spec-clarify, spec-intake, spec-promote, sr, swarm-coordination, yuri-refactor, yuri-sales, yuri-video` — but attacker's corrected split gives 11 true-dead and 23 prose-alias. Exact split by definition: true orphans are those where no SKILL.md exists on disk at all.
- **Triage categories (owner resolves via D-S1):**
  - **Delete (retired surfaces):** `ds-flash`, `ds-pro` (deprecated DeepSeek CLI), `yuri-video` (no backing), `ai-pipeline-offloading` (absorbed), `swarm-coordination` (absorbed). Recommended: delete these 5.
  - **Decide (might have backing or replacement):** `constitution`, `design`, `domain`, `ndig`, `probability`, `reflect`, `spec-*` family, `sr`, `yuri-refactor`, `yuri-sales`. For each: check if a skill with a different name covers the same function. If yes, add `skill: <matching-id>` frontmatter. If no match: delete the command file or keep as prose-only description. Marcel decides.
- **Acceptance (after D-S1 decision):** Count of files deleted. `ls .claude/commands/ | wc -l` reduced by the deleted count. All remaining commands either have `skill:` frontmatter or are explicitly marked as prose-only with a `deprecated: true` frontmatter field.

---

### Phase 6 — Skill-creation rule compliance: triggers frontmatter + Session Notes

**WP-S.8** [LOW] [CONFIRMED — counts corrected] 9 `.claude/skills/` dirs missing `triggers:` frontmatter; 3 missing `## Session Notes`

- **Files:** 9-12 files in `.claude/skills/*/SKILL.md` (exact list from live scan)
- **Evidence:** [audit L1, ATTACK PASS corrected 10→9 NO_TRIGGERS, 2→3 NO_SESSION_NOTES, CONFIRMED].
- **Direction:** For each skill missing `triggers:`, add a `triggers:` YAML frontmatter field whose values are the slash-command names and natural-language trigger phrases that should route to this skill. For each skill missing `## Session Notes`, add the section with an initial entry: `- 2026-06-10: wave-3 compliance pass — added missing frontmatter.`
- **Missing triggers (9 confirmed by attacker):** `adversarial-verification, anthropic-managed-agents, claude-codex-capability-bridge, claude-output-lane, gitnexus, openai-codex-workflow, systematic-debugging, verification-before-completion` + 1 additional from live scan. Run `grep -rL "^triggers:" .claude/skills/*/SKILL.md` to get the exact current list.
- **Missing Session Notes (3):** `claude-codex-capability-bridge, systematic-debugging, writing-plans`.
- **Acceptance:** `grep -rL "^triggers:" .claude/skills/*/SKILL.md | wc -l` returns 0. `grep -rL "## Session Notes" .claude/skills/*/SKILL.md | wc -l` returns 0.
- **Regression:** frontmatter addition only; no behavior change.

**WP-S.9** [LOW] [CONFIRMED — count corrected to 23] Trigger→Skill-tool routing vs /command routing: 23 near-match alias commands have broken dispatch (resolved by WP-S.2)

- **Files:** no additional files beyond WP-S.2
- **Evidence:** [audit L2, ATTACK PASS corrected 15→23, CONFIRMED]. WP-S.2 adds the `skill:` frontmatter that fixes the dispatch routing for all 23 near-match aliases. This workpackage is a documentation marker confirming the fix.
- **Direction:** After WP-S.2 completes, verify the cross-validation: for each of the 23 commands, confirm that the `skill:` frontmatter value matches a `name:` in a SKILL.md that has a `triggers:` array including the command's alias or a matching phrase. Log any mismatch.
- **Acceptance:** Covered by WP-S.2 acceptance gate. This WP is complete when WP-S.2 acceptance passes.

**WP-S.10** [LOW] [CONFIRMED] Body cap guard — canonical skill priority

- **Files:** `_SYSTEM/Scripts/yuri-skill-loader.mjs:211-224`
- **Evidence:** [audit L3, CONFIRMED]. `SKILL_BODY_MAX_TOTAL=15000`. Currently `codex_plugin_cache_skill` entries (111 of 219) absorb most body mass and are pruned last in reverse order. No guard ensures canonical `yuri_skill` entries are never pruned.
- **Direction:** In `enforceTotalBodyCap`, before iterating in reverse, sort the array so `type === 'yuri_skill'` entries appear first (protected, never pruned) and `type === 'codex_plugin_cache_skill'` entries appear last (prunable first). This ensures the 15k cap only ever prunes cache entries, not canonical skills.
- **Acceptance:** `grep "yuri_skill\|codex_plugin_cache" _SYSTEM/Scripts/yuri-skill-loader.mjs | grep -i "sort\|priority\|protect"` returns the ordering guard.
- **Regression:** cache skills already get `bodyPruned=true`. Canonical skills should never get pruned (they currently don't at 219 total; the guard future-proofs against cache growth).

---

## 5 · PARKED entries

| ID | Finding | Reason parked |
|---|---|---|
| PARKED-S.A | `CMD_REPORT` phantom die node — `/report` command has no `report.md` on disk | Phantom scope node. Die entry is outdated. No action needed for command surface fix. Add to die housekeeping pass. |
| PARKED-S.B | Orphan commands that require investigation before delete vs keep decision | The commands in the "decide" category from WP-S.7 (D-S1) that Marcel hasn't triaged. Parked pending D-S1 owner decision. |
| PARKED-S.C | `CMD_DEEPSEEK_FAMILY` die count stale — die claims "4 commands" but only 2 exist (`ds-flash`, `ds-pro`) | Die housekeeping fix. Both ds-flash and ds-pro are candidates for deletion in WP-S.7. Die count update deferred to die housekeeping pass after D-S1 decision. |
| PARKED-S.D | 11 of 27 profiled `skills/` root SKILL.md files missing `triggers:` frontmatter; 8 missing `## Session Notes` | Root `skills/` is large (99+ SKILL.md files). Compliance pass for root skills is a low-severity bulk task. WP-S.8 covers `.claude/skills/` only. Root `skills/` compliance deferred to a bulk cleanup pass. |
| PARKED-S.E | DS advisory: ghost profiles count (19 missing mirrors) vs attacker (17 + 2 ghosts) | DS crossmap conflated ghost profiles with missing mirrors — count superseded by attacker. DS directional findings (ghost+hash) are confirmed and resolved via WP-S.4. DS orphan count and no-cmd count are superseded. [DS-verified directional] |
| PARKED-S.F | Whether musubi-protocol-ingest.js or scout-orchestrator.js perform additional skill loading at SessionStart | Not audited beyond keyword scan. Low-risk — even if they do additional loading, WP-S.1/S.3 fix the registry and the profile for all known unregistered skills. Deferred to next boot-chain audit pass. |

---

## 6 · Owner decisions

| ID | Decision | Recommendation | Tradeoffs | Phase gated |
|---|---|---|---|---|
| **D-S1** | Orphan command triage: delete retired surfaces (5 confirmed dead: ds-flash, ds-pro, yuri-video, ai-pipeline-offloading, swarm-coordination) vs keep vs decide-per-command | **Delete the 5 confirmed-dead** (ds-flash, ds-pro, yuri-video, ai-pipeline-offloading, swarm-coordination). For remaining orphans (constitution, design, domain, ndig, probability, reflect, spec-family, sr, yuri-refactor, yuri-sales), Marcel decides: are these skills you want to build/route, or should they be deleted? Orphan commands add noise to the command surface and degrade routing signal-to-noise. | Delete: clean command surface, reduces noise. Keep: some may be placeholders for future skills. Per-command: most accurate but requires Marcel's time. | Phase 5 (blocking WP-S.7) |

---

## 7 · Coverage gaps — follow-up AUDIT workpackages

**WP-S.AUDIT-1** — `brain-inject.js` PDC skill injection path: hardcoded single-skill load not audited beyond keyword scan. If brain-inject loads a specific skill on every boot, it bypasses the hash-registry integrity check. Verify: read `brain-inject.js` for any SKILL.md read path and confirm it goes through `yuri-skill-loader.mjs` or is explicitly excepted.

**WP-S.AUDIT-2** — SubagentStart hooks skill index: system-reminder shows SubagentStart hooks exist but were not read (protected-scope). If a SubagentStart hook injects a skill index separately, it may have the same 19-missing-mirror gap as startup-offload.js. Verify: read the SubagentStart entries in `settings.json` and check for any skill-loading path.

**WP-S.AUDIT-3** — Active-registry output under real session conditions: `buildActiveSkillRegistry` was not run live. Suppression counts (score=18 cap + `weak_inferred_match` suppression) are inferred from code logic. A real session dry-run would confirm which of the 16 unregistered skills are actually suppressed in practice.

---

## 8 · Final acceptance gate

Ordered; each step gates the next.

1. **Health gate green:** `node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate 2>&1 | grep "unregistered=0"` returns match.
2. **Health check at SessionStart wired:** `grep "yuri-skill-loader\|--validate" .claude/settings.json` returns new entry.
3. **23 near-match alias commands have skill: frontmatter:** `grep -l "^skill:" .claude/commands/*.md | wc -l` ≥ (pre-fix alt-cmd count + 23).
4. **2 ghost profiles removed:** `grep "ai-pipeline-offloading\|swarm-coordination" _SYSTEM/Scripts/yuri-active-skill-registry.mjs | wc -l` returns 0.
5. **16 unregistered dirs have profile entries:** `node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate 2>&1 | grep unregistered` returns `unregistered=0` (combines with gate 1).
6. **Trigger frontmatter compliance:** `grep -rL "^triggers:" .claude/skills/*/SKILL.md | wc -l` returns 0 (or the pre-fix count minus 9).
7. **Session Notes compliance:** `grep -rL "## Session Notes" .claude/skills/*/SKILL.md | wc -l` returns 0 (or the pre-fix count minus 3).
8. **Body cap guard:** `grep "yuri_skill\|priority\|protect" _SYSTEM/Scripts/yuri-skill-loader.mjs | grep -i sort` returns the ordering guard.
9. **D-S1 decision recorded:** session report lists Marcel's orphan triage decisions.

Wave is DONE when all 9 are green AND §5's completeness contract holds. Write the wave report as `wave3-skills-fix-wave-report-<date>.md` next to this file.
