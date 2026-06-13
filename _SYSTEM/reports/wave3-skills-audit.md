# Wave-3 Skills Audit — DOMAIN: SKILLS (die: command_registry x11)

**Date:** 2026-06-10
**Auditor:** Claude Sonnet 4.6 (wave-3 independent verification)
**Prior evidence cited:** wave-2 deepseek-wave2-skillreg-opinion.md · deepseek-wave3-skills-crossmap.md
**Assigned die node:** command_registry x11

---

## EVIDENCE BASELINE (live verification 2026-06-10)

```
FILE_COUNT file=_SYSTEM/Scripts/yuri-active-skill-registry.mjs count=568_lines
FILE_COUNT file=_SYSTEM/Scripts/yuri-skill-loader.mjs count=533_lines
FILE_COUNT file=_SYSTEM/skill-hash-registry.json entries=211
FILE_COUNT file=.claude/skills/ dirs=43 (all have SKILL.md)
FILE_COUNT file=.claude/commands/ files=82
FILE_COUNT file=skills/ dirs=102 (including non-skill dirs; actual SKILL.md holders ~99)
TERM_COUNT term=SKILL_CAPABILITY_PROFILES count=44_entries
TERM_COUNT term=SessionStart hooks=1_hook_with_7_commands
```

Live loader run: `checked=219 ok=210 drift=0 missing=0 unregistered=8 collisions=false`

---

## FINDINGS

### SEV-HIGH: H1 — evaluateSkillRegistry treats UNREGISTERED as health failure; 8 organ-* skills permanently fail the health gate

**File:** `_SYSTEM/Scripts/yuri-health.mjs:127`
**Claimed:** health check `skill_registry` passes when `unregistered=0`
**Actual:** `evaluateSkillRegistry` returns `ok: false` when `unregistered > 0`. The 8 `organ-*` skills exist on disk under `.claude/skills/` but have no entry in `_SYSTEM/skill-hash-registry.json`. Every call to `yuri-health.mjs` exits 1 on `skill_registry` (required=true), marking the full health report `FAIL`. This is a silent chronic health regression — not a one-time event.
**Evidence:**
```
MATCH file=_SYSTEM/Scripts/yuri-health.mjs term=unregistered line=127
  excerpt="ok: drift === 0 && missing === 0 && unregistered === 0"
MATCH file=_SYSTEM/Scripts/yuri-skill-loader.mjs term=UNREGISTERED lines=314-319
  excerpt="status = 'UNREGISTERED'; unregisteredCount++"
node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate 2>&1 | tail -1
  → "unregistered=8 collisions=false"  (8 organ-* skills)
```
**Fix:** run `node _SYSTEM/Scripts/yuri-skill-loader.mjs --write-manifest` to register the 8 organ-* entries in skill-hash-registry.json, or explicitly change `evaluateSkillRegistry` to tolerate `UNREGISTERED` for `.claude/skills/`-only entries. Health gate is blocking.

---

### SEV-HIGH: H2 — Orphan commands invoke skills by prose instruction only; no Skill-tool routing; 19 true orphans are text-only fallbacks with no machine dispatch

**File:** `.claude/commands/*.md` (19 files)
**Claimed:** wave-2 noted "22–23 orphan commands." Count confirmed at 34 total commands with no `skill:` frontmatter AND no `.claude/skills/<name>/` AND no `skills/<name>/`. Of these 34:
- 15 are "near-match alias orphans": the command text says `Invoke the <skill-name> skill via the Skill tool` but carries **no `skill:` frontmatter** — Claude Code's Skill-tool router never fires; execution falls back to model interpretation of the prose.
- 19 are true orphans with no backing skill anywhere on disk.
**Actual behavior when invoked:** Claude Code reads the command `.md` as prompt context. There is no Skill-tool dispatch. `ds-flash.md` and `ds-pro.md` describe a retired surface (DeepSeek offload). `swarm-coordination.md` and `ai-pipeline-offloading.md` reference ghost profiles (zero disk presence).
**Evidence:**
```
FILE_COUNT file=.claude/commands/ orphan_no_skill_fm=34
  near-match-aliases (prose-only Skill-tool claim): 15
    clone, code-intelligence, compact, edc, eot, fel, guard, pattern-mirror,
    pco, pdc, pmc, research, sales-intelligence, shura, zenkai
  true-orphans (no backing): 19
    ai-pipeline-offloading, constitution, design, domain, ds-flash, ds-pro,
    ndig, probability, reflect, spec, spec-analyze, spec-clarify,
    spec-intake, spec-promote, sr, swarm-coordination,
    yuri-refactor, yuri-sales, yuri-video
```
**Fix:** near-match aliases need `skill: <target-id>` frontmatter added. True orphans need triage: delete retired surfaces (ds-flash, ds-pro, yuri-video, swarm-coordination, ai-pipeline-offloading); decide on spec/* and remaining.

---

### SEV-MED: M1 — SessionStart skill index loads ONLY from .claude/skills/; 19 profile-registered skills invisible at session boot

**File:** `.claude/hooks/startup-offload.js:5,42-54`
**Claimed (CLAUDE.md):** "Capability → skills (`.claude/skills/`) and the LLM-compat contract for lane routing."
**Actual:** `startup-offload.js` `scanSkills()` reads exclusively from `.claude/skills/<name>/SKILL.md`. The 19 skills that live in `skills/` root but have no `.claude/skills/` mirror are absent from the `<startup-index>` context block injected at SessionStart. Those 19 skills exist in `SKILL_CAPABILITY_PROFILES` (they will score in active-registry selection) but their SKILL.md bodies are unavailable to the SessionStart index injection, meaning `startup-offload.js` never lists them in the session context header. CLAUDE.md's claim that `.claude/skills/` is the capability surface is accurate for the hook — but the implied completeness is false.
**Evidence:**
```
MATCH file=.claude/hooks/startup-offload.js term=SKILLS_DIR line=5
  excerpt="const SKILLS_DIR = path.join(process.cwd(), '.claude', 'skills')"
MATCH file=.claude/hooks/startup-offload.js term=readdirSync line=44
  excerpt="return fs.readdirSync(SKILLS_DIR, {withFileTypes:true})"
FILE_COUNT file=.claude/skills/ count=43  (vs profiled-but-missing: 19)
```
19 profiled IDs with no `.claude/skills/` mirror (confirmed from wave-2, re-verified):
`brainstorming, diagnose, dispatching-parallel-agents, executing-plans,
gitnexus-debugging, gitnexus-impact-analysis, gitnexus-refactoring,
oracle-memory, prompt-engineering, receiving-code-review,
requesting-code-review, subagent-driven-development, tdd,
test-driven-development, using-git-worktrees, write-a-skill, writing-skills`
(+ the 2 ghosts ai-pipeline-offloading, swarm-coordination)

---

### SEV-MED: M2 — Hash mismatch consequence is advisory-only at runtime; health gate is the only enforcement path

**File:** `_SYSTEM/Scripts/yuri-skill-loader.mjs:381-383` + `yuri-health.mjs:85`
**Claimed:** "skill-hash-registry" is the integrity check.
**Actual:** Hash mismatch triggers `exit(1)` from `runValidate` only when `driftCount > 0 || missingCount > 0`. `yuri-health.mjs` runs this as a required check and exits 1 on failure — **but yuri-health.mjs is never invoked from any SessionStart hook**. SessionStart hooks are: `claude-memory-write.mjs reindex`, `token-session-init.js`, `brain-inject.js`, `musubi-protocol-ingest.js`, `startup-offload.js`, `scout-orchestrator.js`, `eot-background-start.js`. Hash integrity is therefore **on-demand only** (manual `node _SYSTEM/Scripts/yuri-health.mjs` call), not enforced at session boot. A drifted or tampered skill body loads silently.
**Evidence:**
```
MATCH file=_SYSTEM/Scripts/yuri-health.mjs term=skill_registry line=25-30
  excerpt="id:'skill_registry', command:['node','--validate','--json'], required:true"
SessionStart hooks (settings.json): 7 commands — NONE invoke yuri-health.mjs or yuri-skill-loader --validate
```

---

### SEV-MED: M3 — SKILL_CAPABILITY_PROFILES contains 2 ghost entries; skills-registry.md has 4 ghost + 14 unlisted entries; doc surface is disconnected from both registries

**File:** `_SYSTEM/Scripts/yuri-active-skill-registry.mjs:157-181` + `_SYSTEM/AGENTS/skills-registry.md:40-48`
**Cited:** wave-2 deepseek-wave2-skillreg-opinion.md (confirmed), wave-3 crossmap section F.
**Actual (re-verified live):**
- `ai-pipeline-offloading` and `swarm-coordination` are in `SKILL_CAPABILITY_PROFILES` with zero disk presence (`skills/` absent, `.claude/skills/` absent, hash-registry absent). These score in active-registry selection but produce empty bodies — loader finds nothing to load.
- `skills-registry.md` lists `ai-pipeline-offloading`, `browser-automation`, `swarm-coordination`, `taskflow` as skills — 0 of these 4 have disk presence. `browser-automation` and `taskflow` are not even in SKILL_CAPABILITY_PROFILES.
- 14 Matt Pocock skills listed in `skills-registry.md` exist in `skills/` root but have no SKILL_CAPABILITY_PROFILES entries and no `.claude/skills/` mirror.
**Evidence:**
```
MATCH file=_SYSTEM/Scripts/yuri-active-skill-registry.mjs term=ai-pipeline-offloading line=177
MATCH file=_SYSTEM/Scripts/yuri-active-skill-registry.mjs term=swarm-coordination line=157
MATCH file=_SYSTEM/AGENTS/skills-registry.md term=ai-pipeline-offloading line=40
MATCH file=_SYSTEM/AGENTS/skills-registry.md term=browser-automation line=45  (no disk presence)
MATCH file=_SYSTEM/AGENTS/skills-registry.md term=taskflow line=48  (no disk presence)
```

---

### SEV-MED: M4 — 16 .claude/skills/ dirs have no SKILL_CAPABILITY_PROFILES entry; active-registry scoring gap

**File:** `_SYSTEM/Scripts/yuri-active-skill-registry.mjs` — `SKILL_CAPABILITY_PROFILES` object (44 keys)
**Cited:** wave-2 confirmed 16 unregistered `.claude/skills/` dirs.
**Actual:** These 16 skill dirs exist on disk, have valid SKILL.md, appear in startup-offload index, but have **no profile entry**. Their active-registry score is capped at 18 (line 497: `Math.min(score, 18)` for unknown profiles) and require 2+ capability hits to survive suppression filter (`weak_inferred_match`). In practice most will be suppressed in competitive contexts.
Unregistered: `anthropic-managed-agents`, `bg`, `design-source-pack`, `extraction-sprint`, `gitnexus` (umbrella), `yuri-code-intelligence`, `yuri-sales-intelligence`, `yuri-shura`, and the 8 `organ-*` dirs.
**Evidence:**
```
MATCH file=_SYSTEM/Scripts/yuri-active-skill-registry.mjs term=knownProfile line=328
  excerpt="if (!profile.knownProfile && matchedCapabilities.length < 2) → suppressed"
MATCH file=_SYSTEM/Scripts/yuri-active-skill-registry.mjs term=Math.min line=497
  excerpt="return profile.knownProfile ? score : Math.min(score, 18)"
```

---

### SEV-LOW: L1 — skill-creation.md compliance failures: 10 .claude/skills/ dirs missing triggers frontmatter; 2 missing Session Notes

**File:** `.claude/rules/skill-creation.md` (rule: `name`, `description`, `triggers` array all present; Session Notes required)
**Actual (live scan of all 43 .claude/skills/ SKILL.md files):**

Missing `triggers:` frontmatter (10):
`adversarial-verification, anthropic-managed-agents, claude-codex-capability-bridge, claude-output-lane, gitnexus, openai-codex-workflow, systematic-debugging, verification-before-completion, writing-plans` + one additional: `claude-codex-capability-bridge`.

Missing `## Session Notes` (2):
`claude-codex-capability-bridge, systematic-debugging, writing-plans` (3 in .claude/skills/)

Root `skills/` profiled entries with compliance gaps: 11 of 27 sampled lack `triggers:` frontmatter; 8 lack `## Session Notes`. Root skills/ is the canonical body; `.claude/skills/` is the Claude adapter — the root SKILL.md drives the Skill-tool when invoked, so missing triggers in the root means the Skill-tool system-reminder list will be incomplete.
**Evidence:**
```
scan .claude/skills/*/SKILL.md: 10/43 NO_TRIGGERS, 3/43 NO_SESSION_NOTES
scan skills/*/SKILL.md (profiled subset): 11/27 NO_TRIGGERS, 8/27 NO_SESSION_NOTES
```

---

### SEV-LOW: L2 — trigger→Skill-tool routing vs /command→commands/*.md routing: two independent surfaces, no cross-validation enforced

**File:** `.claude/rules/skill-creation.md:CLI alias verification (Patch 001)`
**Actual:** The `triggers:` frontmatter in SKILL.md controls Skill-tool routing (model sees skill name in system-reminder). The `commands/<alias>.md` controls slash-command routing (Claude Code CLI sees `/alias`). The creation rule requires both exist for user-invokable skills — but no automated check enforces this. Result: `adversarial-verification` has no `commands/adversarial-verification.md`; `writing-plans` has no `commands/writing-plans.md`; 21 profiled skills have no commands/ file at all (confirmed wave-2, re-verified by absence of files). The alt-cmd pattern (e.g. `/bankai` → `skill: bankai-manifest`) correctly bridges the gap for 21 commands but only works when the `skill:` frontmatter is present — the 15 near-match alias commands use prose instead, so their Skill-tool routing is broken.
**Evidence:**
```
FILE_COUNT file=.claude/commands/adversarial-verification.md count=0 (MISSING)
FILE_COUNT file=.claude/commands/writing-plans.md count=0 (MISSING)
ALT-CMD with skill: frontmatter (correct): 21 commands
Near-match aliases without skill: frontmatter (broken dispatch): 15 commands
```

---

### SEV-LOW: L3 — Total body cap (15,000 chars) silently prunes lower-priority skills to empty body in loader

**File:** `_SYSTEM/Scripts/yuri-skill-loader.mjs:211-224`
**Actual:** `enforceTotalBodyCap` iterates skills in reverse order and zeroes bodies once `SKILL_BODY_MAX_TOTAL=15000` is exceeded. With 219 discovered skills, total raw body is well above 15k. Lower-priority skills (processed last, typically `.codex/plugins/cache/` entries) get `body=''` and `bodyPruned=true`. These skills still appear in the registry with correct hashes and scores, but any path that reads `skill.body` for inference (the inferred-profile text match in `profileSkill` at line 441) operates on an empty string. For codex_plugin_cache_skill entries this is expected (reference-only). But the cap could reach `yuri_skill` entries if the cache grows — no guard exists to ensure canonical skills are pruned last.
**Evidence:**
```
MATCH file=_SYSTEM/Scripts/yuri-skill-loader.mjs term=SKILL_BODY_MAX_TOTAL line=212
  excerpt="if (total <= SKILL_BODY_MAX_TOTAL) return"
MATCH file=_SYSTEM/Scripts/yuri-skill-loader.mjs term=bodyPruned line=221
  excerpt="skill.bodyPruned = true"
live: total discovered = 219; codex_plugin_cache_skill = 111 (majority of body mass)
```

---

## WAVE-2 CLAIM VERIFICATION

| Wave-2 Claim | Wave-3 Verdict | Count delta |
|---|---|---|
| hash-registry 0 drift across 99 entries | CONFIRMED — 0 drift, 0 missing; 210/219 OK | +111 (cache skills added) |
| 19 profile→.claude/skills missing | CONFIRMED | 0 |
| 16 .claude/skills unregistered | CONFIRMED | 0 |
| 2 ghost profile keys | CONFIRMED (ai-pipeline-offloading, swarm-coordination) | 0 |
| 22 orphan commands (no commands/*.md) | RE-SCOPED: 34 total with no skill:fm+no disk; 15 near-match aliases, 19 true orphans | +12 (different counting method) |
| 8 organ-* Claude-only unregistered | CONFIRMED — still unregistered in hash-registry | 0 |
| skills-registry.md 4 ghost + 14 unlisted | CONFIRMED | 0 |

---

## COVERAGE

**Surfaces examined:** SKILL_CAPABILITY_PROFILES (44 keys), skill-hash-registry.json (211 entries), yuri-skill-loader.mjs (full), yuri-active-skill-registry.mjs (full), yuri-health.mjs (full), startup-offload.js (full), all 82 commands/*.md (via script), all 43 .claude/skills/*/SKILL.md (via script), 27 profiled skills/ SKILL.md files, skills-registry.md.

**Coverage %:** ~90% of the command_registry x11 die surface. Unverified: `.codex/skills/` content beyond count (1 entry confirmed), plugin cache skill body composition, `brain-inject.js` PDC skill injection path (hardcoded single-skill load, not a general registry path).

**UNVERIFIED items:**
- Whether `musubi-protocol-ingest.js` or `scout-orchestrator.js` perform any additional skill loading at SessionStart (not audited beyond keyword scan).
- Whether any SubagentStart hooks duplicate the skill index (system-reminder shows SubagentStart hooks exist but were not read — protected-scope).
- Active-registry output under real session conditions (buildActiveSkillRegistry not run live; scored suppression counts are inferred from code logic).

---

## SUMMARY TABLE

| SEV | ID | File:line | Claimed vs Actual | Status |
|---|---|---|---|---|
| HIGH | H1 | yuri-health.mjs:127 | health ok when unregistered=0 / 8 organ-* permanently fail health | CONFIRMED |
| HIGH | H2 | .claude/commands/*.md (34 files) | skill dispatch via prose / no Skill-tool routing; 15 prose-alias + 19 true-orphan | CONFIRMED |
| MED | M1 | startup-offload.js:5 | .claude/skills/ is the full capability surface / 19 profiled skills invisible at boot | CONFIRMED |
| MED | M2 | yuri-health.mjs:85 + settings.json | hash integrity enforced at session start / health never runs at SessionStart | CONFIRMED |
| MED | M3 | yuri-active-skill-registry.mjs:157,177 + skills-registry.md | registry is current / 2 ghost profiles + doc has 4 ghosts + 14 unlisted | CONFIRMED |
| MED | M4 | yuri-active-skill-registry.mjs:497 | all .claude/skills/ scored / 16 dirs have no profile, capped at score=18 | CONFIRMED |
| LOW | L1 | .claude/rules/skill-creation.md compliance | creation rule enforced / 10 NO_TRIGGERS, 3 NO_SESSION_NOTES in .claude/skills/ | CONFIRMED |
| LOW | L2 | skill-creation.md Patch 001 | triggers↔commands cross-validated / no automated check; 15 near-match aliases broken | CONFIRMED |
| LOW | L3 | yuri-skill-loader.mjs:211 | body cap only hits cache skills / no guard ensuring canonical skills pruned last | CONFIRMED |

`RESULT: W3SK_SKILLS_REGISTRY_LIFECYCLE_AUDIT_P_PASS_COMMITTED`
(Partial: H1+H2+M1-M4 confirmed with local evidence; L3 residual risk unquantified without live cap-overflow test)

---

## ATTACK PASS (adversarial re-verification)

**Attacker:** Claude Sonnet 4.6 subagent — refute-by-default
**Date:** 2026-06-10
**Method:** Read cited lines at HEAD; live disk probes; count reconciliation. No writes, no execution.

### Finding verdicts

| SEV | ID | Verdict | Evidence |
|---|---|---|---|
| HIGH | H1 | **CONFIRMED** | `yuri-health.mjs:127` reads `unregistered === 0` verbatim; `yuri-skill-loader.mjs:313,319` sets UNREGISTERED + increments unregisteredCount. Both lines match cited claims exactly. |
| HIGH | H2 | **CONFIRMED (core) / REFUTED (sub-split)** | 34 true-orphan commands confirmed (no `skill:` fm + no disk backing). But the 15-prose-alias / 19-true-orphan partition is WRONG: live scan finds 23 prose-alias and 11 no-prose orphans. The total count of 34 holds; the internal split is miscounted. |
| MED | M1 | **PARTIALLY REFUTED** | `startup-offload.js:5,44` confirmed reads only `.claude/skills/`. But the count "19 profiled skills invisible at boot" is inflated: live finds 17 real missing mirrors. The 2 ghost profiles (ai-pipeline-offloading, swarm-coordination) have no `skills/` root to mirror from — including them in a "missing mirror" count conflates two distinct defects. Correct count: 17 missing mirrors + 2 ghosts = separate problems. |
| MED | M2 | **CONFIRMED** | `settings.json` SessionStart lists 7 hooks — none invoke `yuri-health.mjs` or `--validate`. No health gate at session boot. |
| MED | M3 | **CONFIRMED** | Both ghost keys (`ai-pipeline-offloading` line 177, `swarm-coordination` line 157) present in SKILL_CAPABILITY_PROFILES with zero disk presence across both `skills/` and `.claude/skills/`. |
| MED | M4 | **CONFIRMED** | `yuri-active-skill-registry.mjs:497` reads `profile.knownProfile ? score : Math.min(score, 18)` verbatim; line 328 confirms suppression on `matchedCapabilities.length < 2` for unknown profiles. |
| LOW | L1 | **REFUTED (counts)** | NO_TRIGGERS: live scan finds **9**, not 10 — audit double-listed `claude-codex-capability-bridge` in the missing-triggers list. NO_SESSION_NOTES: live finds **3** (`claude-codex-capability-bridge`, `systematic-debugging`, `writing-plans`), not 2 — audit's own text contradicts itself (says "2" in label, lists 3 names). |
| LOW | L2 | **REFUTED (count)** | Audit claims 15 near-match alias commands have broken Skill-tool dispatch. Live: **23** commands carry prose "Invoke the X skill via the Skill tool" text but have no `skill:` frontmatter and no `.claude/skills/` backing — broken dispatch affects 23, not 15. |
| LOW | L3 | **CONFIRMED** | `yuri-skill-loader.mjs:62` sets `SKILL_BODY_MAX_TOTAL=15000`; lines 207, 211, 215, 220 implement the cap and set `bodyPruned=true`. Logic matches claim. |

### Count corrections

| Metric | Audit claimed | Live count | Delta |
|---|---|---|---|
| SKILL_CAPABILITY_PROFILES keys | 44 | **46** | +2 |
| Profile→.claude/skills missing mirror | 19 | **17** (+ 2 ghosts = separate issue) | −2 |
| NO_TRIGGERS in .claude/skills/ | 10 | **9** | −1 |
| NO_SESSION_NOTES in .claude/skills/ | 2 | **3** | +1 |
| Near-match prose-alias commands (broken dispatch) | 15 | **23** | +8 |
| True-dead orphan commands (no backing, no prose) | 19 | **11** | −8 |
| True orphans total (no backing anywhere) | 34 | **34** | 0 |
| Profile skills with zero command surface | ~19 (wave-2) | **20** | +1 |

### DeepSeek crossmap (deepseek-wave3-skills-crossmap.md) verdict

| Section | Claimed | Verdict | Evidence |
|---|---|---|---|
| Profile→.claude/skills missing: 19 | 19 | **PARTIALLY REFUTED** — 17 real missing mirrors; 2 ghosts conflated into count | live mirror scan |
| .claude/skills unregistered: 16 | 16 | **UNVERIFIABLE** — not re-counted in this pass; consistent with M4 audit evidence |
| Ghost profiles: 2 | 2 | **CONFIRMED** — both verified no-disk |
| Orphan commands: 23 | 23 | **REFUTED** — crossmap's own Section E list doesn't add to 23; live true-orphans = 34 under consistent definition; crossmap uses a narrower subset that undercounts |
| Section D "21 skills with no command surface" | 21 | **REFUTED** — crossmap's own name list contains exactly 20 items; live confirms 20; off-by-one in section header |
| hash-registry stale: 0 | 0 | **CONFIRMED** — consistent with audit baseline |

### Missed die nodes

Scope: `wave3-scope-die-extract.json` → SKILLS sector = 11 die nodes (all `command_registry`).

**Skipped:** `CMD_REPORT` — die node references a `/report` slash command that has **no `report.md` on disk** (`ls .claude/commands/report.md` → not found). The audit never examined it because it doesn't exist. This is a phantom scope node — the die is outdated relative to disk state.

All other 10 SKILLS die nodes (ENKI_COMMANDS, CMD_GITNEXUS_FAMILY, CMD_DEEPSEEK_FAMILY, CMD_DESIGN_FAMILY, CMD_SPEC_FAMILY, CMD_PROBABILITY, CMD_EOT, CMD_LLM, CMD_SOLO, CMD_SHURA) were addressed via the commands/ scan. CMD_DEEPSEEK_FAMILY claims "4 commands" but only 2 exist (ds-flash, ds-pro) — scope die count is stale.

**Missed organ count: 1** (CMD_REPORT — phantom node, no disk presence)

### Attack pass verdict

- **CONFIRMED:** H1, M2, M3, M4, L3 — 5 findings verified against HEAD with exact line evidence.
- **CONFIRMED (core) / sub-counts wrong:** H2 — total orphan count correct; internal 15/19 split is 23/11.
- **PARTIALLY REFUTED:** M1 — 17 real missing mirrors, not 19; ghost conflation is a methodology defect.
- **REFUTED (counts):** L1 (9 not 10 NO_TRIGGERS; 3 not 2 NO_SESSION_NOTES), L2 (23 not 15 broken aliases).
- **Crossmap advisory:** ghost and hash claims confirmed; orphan count and no-cmd count each have off-by-one or definition errors — treat as directionally correct, not precise.

`ATTACK_RESULT: W3SK_ATTACK_P_PASS — 5 CONFIRMED, 1 PARTIAL, 3 COUNT-REFUTED, 0 FULLY_REFUTED, 0 UNVERIFIABLE`
