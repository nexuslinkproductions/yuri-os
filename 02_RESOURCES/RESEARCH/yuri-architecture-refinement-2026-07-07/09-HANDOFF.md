# YURI Architecture-Refinement — Session Handoff

**Date:** 2026-07-08 · **Branch:** `main` (synced, 0/0) · **Repo:** `~/YURI-OS-MUSUBI`

## The project (why this exists)
Marcel's goal: stop treating YURI as "an advanced folder architecture" and make it **real software** — legible, navigable, editable, importable — so it's viable for users to set up their infrastructure once released. Skills split into two axes (model-invoked abilities vs deliberately-invoked workflows) while killing context-window skill-bleed. A `/grill-me` interview (Q1–Q10) locked the definition; a 9-phase plan (`02-DECISION.md`) executes it. **Do NOT touch `pitch-lueddemann.html`** — Marcel evolves that in a parallel session.

## Locked architecture definition (grill Q1–Q10)
- **Q1** YURI = a **model-agnostic agent governance/memory/continuity/orchestration layer** — a shippable product, not a folder tree.
- **Q2** THIS project delivers a **legible, audited, cleanly-bounded harness**; packaging is the next project.
- **Q3** Harness/instance boundary: **quarantine + relocate** instance subsystems (trading/AFL, voice, whatsapp, nexus-company, personal skills) out of `_SYSTEM/Scripts/` core → `instance/`, excluded from export. Core becomes generic.
- **Q4** Dead-code disposition = **Moderate + evidence-tiered** (LIVE / DORMANT / DEAD).
- **Q5** Skills = **2-axis taxonomy**: `scope: harness|instance` × `invocation: ability|workflow`. ✅ APPLIED to all 118.
- **Q6** Disclosure model (= **P5**): **Hybrid** — one-line ambient index of every skill + retrieval-injected full bodies on match + command-map for workflow skills. Kills the bleed.
- **Q7** Restructure = **prefix-guided domain modularization, incremental + import-safe** (barrels, not big-bang moves).
- **Q8** Delivery = **clean embeddable core + adapters (MCP/CLI/library)**, installable as a governance-extension into OMP-style launchers. North star (deferred): standalone harness.
- **Q9** Fold adapter docs (CLAUDE/AGENTS/GEMINI) into thin surface-only adapters, no restated policy. (SOUL→persona merge done this session.)
- **Q10** Done = concrete per-phase acceptance checklist.

## Phase status
| Phase | Blast | Gate | Status |
|---|---|---|---|
| P0 · Day-1 truth batch (exporter fix, stop self-lying) | — | self | ✅ done (prior session) |
| P1 · Worktree reap | LOW | self→**owner** | ⚠️ **partial** — 1.7G zombie reaped; **12G WIP owner-gated** |
| P2 · Golden-path RED test | MED | self | ✅ done (`fa657041`) — found a real security hole |
| P3 · Skill 2-axis tags + registry heal | MED | self | ✅ done (`95b06ca7`, `ff3f2a4c`) |
| P4 · Boundary barrels | LOW | self | ✅ done (`a04ca512`) **+ fixed** (`9a7b0a68`) |
| **P5 · Skill hybrid disclosure** | MED | self | 🔲 **NOT STARTED — continuation focus** |
| P6 · Relocate instance → `instance/` | **HIGH** | **OWNER** | 🔲 flagged, needs sign-off |
| P7 · Move clean clusters | MED | self | ✅ done — **corrected to barreled-only** (`fe811c83`) |
| P7.5 · yuri-mcp + host-compat matrix | HIGH | **OWNER** | 🔲 flagged, needs sign-off |
| P8 · Adapters generated-thin + package-shape (`exports`/`bin`) | MED | self | 🔲 NOT STARTED (self-gov, next after P5) |

## Shipped this session (8 commits, all pushed to `main`)
```
9a7b0a68 fix(barrels): all 13 P4 barrels importable (API-only, not decorative)
f7f5fa07 docs(P7): corpus barreled-only correction + P4 barrel import-safety audit
fe811c83 refactor(P7): corpus barreled-only (load-bearing, not moved) + import-safety guards
ff3f2a4c refactor(P3): retire test-driven-development -> tdd + reconcile registries
95b06ca7 refactor(P3): uniform 2-axis skill tags (scope x invocation) on 118 skills
a04ca512 refactor(P4): boundary barrels on 12+1 clusters (additive, no moves)
fa657041 test(P2): golden-path RED e2e spec (install->govern->remember->recall)
f97fd99c feat(delegation): continuous-delegation protocol - main session as input layer
```

## CONTINUATION FOCUS — P5 (skill hybrid disclosure)
**Goal:** kill context-window skill-bleed. Today every skill's full trigger description is injected into the system prompt regardless of relevance. Q6 target = **Hybrid**:
1. **One-line ambient index** — every skill contributes ONE line (name + one-line `description`) always-present so the model knows what exists.
2. **Retrieval-injected full bodies** — the full SKILL.md body injects ONLY on match (there's existing infra: `skill-recall.mjs` + `<skill-recall-hint>` per-prompt).
3. **Command-map for workflow skills** — `invocation: workflow` skills (grill-me, /eot, opus-fleet, etc.) are triggered by explicit command, so they belong in a command map, NOT the ambient pool.
4. **Pre-registered usage cut-threshold** — a top-K relevance cut so retrieval injects only the most relevant bodies.

**The 2-axis tags (P3) are the enabler:** `invocation: ability` (72 skills) = model-invoked, belong in ambient index + retrieval. `invocation: workflow` (46 skills) = command-invoked, belong in the command-map, OUT of the ambient pool. `scope: instance` (9) don't ship.

**⚠️ OWNER DESIGN INPUT NEEDED before touching injection:** the exact disclosure mechanism (how the ambient index is built + injected, where the retrieval hook fires, the cut-threshold value) is a design decision on Marcel's core concern. Get his read on the model FIRST — a wrong change silently stops skills from surfacing. Verify against live injection, not comments.

**Where to look:** `_SYSTEM/Scripts/xref-query.mjs` (has `ccr-compress` runtime), the `skill-recall.mjs` + `skill-recall-hint` mechanism, `_SYSTEM/skill-hash-registry.json`, `skills/skill-index.json`, `skills/*/SKILL.md` frontmatter (now carries `scope`+`invocation`).

## Open owner-decisions (nothing else executable without Marcel)
1. **P5 disclosure model** — run as specced, or adjust first? (design call)
2. **P1 · 12G WIP worktrees** — 5× nexus-rs Rust (`lib.rs/round.rs/ppmi.rs/stats.rs`, June), `vault-restructure` docs, 5× sentinel — all hold **uncommitted** code. Which are dead → reap? (`git worktree list`; plan in local refactor-P1ReapPlan). One orphan (`goofy-yalow-f0eef2`, NUDIMMUD) already confirmed gone + reaped.
3. **P2 security fix** — the RED test proved 11 PreToolUse hooks DON'T call the `yuri-safety-core` SEC-1 denylist + governance denies are silent (no audit trail). Wire them. (real hole)
4. **P6 relocate instance** + **P7.5 yuri-mcp host-compat** — HIGH-blast, explicit sign-off each.
5. **P8** — adapters generated-thin + `package.json` `exports`/`bin` (self-gov, do after P5).
6. **deepseek top-up** (402 balance) to restore cheap fleet lanes; **GLM** weekly cap resets **2026-07-10**.
7. **3 parallel-session skills** (cgs-mold, nexus-security-hardening, pilot-feedback) appeared untracked mid-session — they need the 2-axis tags once that session lands.

## Hard-won gotchas (READ before executing)
- **Never trust a "0-consumer / clean-move" plan claim — verify first.** P7 claimed corpus had 0 consumers; `corpus-match.mjs` had **10** (circuitry, memory-match, gpd, yuri-match-*, nexus-rs conformance). Verify-first aborted the move. `grep`/import-test before ANY relocation.
- **Barrels must be IMPORT-tested, not just `node --check`.** P4's 13 barrels passed syntax but crashed/ran-tests/ran-CLIs on actual import (they re-exported `.test.mjs` + export-less CLIs). Fixed to API-only. Any new barrel: `node --input-type=module -e "import('./x/index.mjs')..."`.
- **Delegation routing is degraded.** `task()` role defaults point at capped/broken providers (GLM weekly-capped until 07-10; deepseek/Tester = 402). **Working path: `eval` → `agent(prompt, model="anthropic/claude-sonnet-4-6")`** (bypasses broken role bindings). Config fix (`f97fd99c`) repointed `modelRoles.task`→deepseek-v4-pro w/ fallback chains, but takes effect on OMP restart + deepseek is out of balance. Roster: Anthropic (opus/sonnet/haiku) + Cursor (composer-2.5-fast) are healthy.
- **Git discipline:** direct commit+push granted (owner upgrade 2026-06-14), but **explicit pathspec ONLY** (`git commit -- <paths>`), NEVER `git add .` / bare commit — parallel sessions have staged work. Verify staged scope before every commit. ~15 dirty files in the tree are parallel-session work — leave them.
- **Session guard:** `pwd` = repo root, branch = `main` before any mutation.

## Verify current state
```bash
cd ~/YURI-OS-MUSUBI && git log --oneline -8 && git status --short
node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate   # skills registry green
for b in memory nano lanes kagami energy claims filing llm tokens skills mcs workers fleet corpus; do node --input-type=module -e "import('./_SYSTEM/Scripts/$b/index.mjs').then(m=>console.log('$b CLEAN',Object.keys(m).length)).catch(e=>console.log('$b FAIL'))"; done
```
