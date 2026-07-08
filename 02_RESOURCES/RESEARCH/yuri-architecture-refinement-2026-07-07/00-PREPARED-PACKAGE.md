# YURI ARCHITECTURE REFINEMENT — PREPARED PACKAGE (for Fable-5 take + owner sign-off)

**Date:** 2026-07-07 · **Owner:** Marcel · **Method:** grill-me (10 branches) → opus-fleet reconciliation of 3 prior 48h audits + fresh Wave-A/B lanes (explore/mure-artificer/mure-architect/mure-adjudicator) → adversarial verify → this synthesis.
**Repo:** `~/YURI-OS-MUSUBI` @ main. **Status:** DIAGNOSTIC + PLAN. Zero mutations executed. This is the package Fable rules on and Marcel signs off BEFORE any delete/relocate/modularize runs.

**CORE RULE (governs everything):** Yuri's own self-descriptions are ADVISORY, not truth — verified against live code. Proof: the "Neural Empire / ENKI-NABU-NISABA-NOESIS pantheon" overview describes subsystems already in `04_ARCHIVE`.

---

## PART 1 — WHAT YURI ACTUALLY IS (verified) vs WHAT IT CLAIMS

### The settled definition (grill Q1/Q8, owner-locked)
Yuri is a **portable, model- AND client-agnostic governance / continuity / memory EXTENSION** you `install` into ANY AI workspace — Claude Code, Claude Desktop, VSCode, Cursor, Codex, OMP, Hermes, OpenClaw. It rides on the host launcher (where the user's subscriptions/keys already live); it does NOT own models or keys. Architecture = **CORE + SHELLS**: a headless embeddable engine, wrapped in per-environment adapter/MCP + CLI + library shells. North star (out of scope): a standalone harness with its own terminal/OAuth/BYOK.

### The one spine defect (Fable, verified, matches Marcel's own instinct)
**"Prose outruns wiring" → sharpened: the defect is UNMARKED NON-DETERMINISM.** Docs/personas/skills assert present-tense capability the code doesn't deliver, with no `[WIRED]/[PROSE]/[PLANNED]` tag. This is why Marcel "lost track of what's real." The cure is not to wire everything — it's to make the system HONEST about its own state (tag the gap; make safety/state-honesty deterministic; let the rest legitimately live as prose).

### Verified scale (corrects every stale self-count)
| Thing | Self-claimed | VERIFIED live | Note |
|---|---|---|---|
| `_SYSTEM/Scripts/` .mjs | "~250" | **620** (408 flat root + 212 in subdirs) | 2.5× bigger than assumed |
| Skills | 100 (skill-index) / 108 / 120 | **121 unique dirs** | 3 registries disagree; index misses 17 + all 3 `.claude`-unique incl `cgs-mold` |
| Biggest subsystems | — | `math/` 100, `alpha-factor-library/` 97 | trading (instance) is the 2nd-biggest thing in "core" |
| Skill usage | — | **6.6%** (7/106 in 14d), honoring-rate UNMEASURABLE | no recall-fire telemetry exists |

### Current honesty/wiring state (freshness re-check 2026-07-07)
- **STILL OPEN:** `yuri-homeostat.mjs` (cited, nonexistent), `symbiotic-pulse.mjs` (doctrine-mandated, zero callers), backend `:3004` (wedged, curl exit 28), `_SYSTEM/DESIGN.md` (deleted, still cited by design-master:57), `.claude/worktrees` (13G/12 dirs, poisons repo-wide greps), `global.md` (63d stale), dream-queue (**grew to 1606** pending), `/clone` `/pco` (route to a retired skill).
- **FIXED SINCE 07-06:** GATE staleness guard (Fable F3 landed, brain-inject.js:126), pre-tool-gate→pre-tool-use merge (Fable Phase 3).
- **SECURITY: largely HARDENED** (recent). SEC-1 single denylist (`yuri-safety-core.mjs` is THE list), SEC-3 `.git/hooks`+`.git/config` protection, SEC-4 credential stores (`~/.aws`/`~/.ssh`/keychain/etc), Phase-6 residual stores — all landed in code.

**Net current state:** SECURITY ≈ handled · HONESTY/WIRING ≈ mostly still broken · PRODUCT/BOUNDARY/PACKAGE/MODULARIZATION ≈ not started (this project). Fable's prior usability verdict: *"usable by Marcel-with-a-model, and by little else — acceptable for a solo cognitive prosthetic."* **That is the gap this project closes: solo prosthetic → installable universal extension.**

---

## PART 2 — THE 10 DECISIONS, MADE CONCRETE (adversarial corrections baked in)

### Q3 Harness/Instance boundary — VERIFIED CLEAN (the big de-risk)
The boundary move is **safe** because the entanglement runs in the safe direction: instance imports core, core never imports instance. Adversarially confirmed CONFIRMED-CLEAN at import level for all 5:
| Subsystem | Class | Relocation | Carry-along (adjudicator caught) |
|---|---|---|---|
| `alpha-factor-library/` +observatory/+adapters (97 files, trading) | INSTANCE | CLEAN | 5 launchd plists + `overseer-sonnet-tmux.sh:30` exec in — relocate WITH it |
| `voice/` (yuri-z-brain etc.) | INSTANCE | CLEAN | Stop hook `settings.json:353`→voice-tts→voice-speak.sh (disarmed) — drop hook + carry `.sh` |
| `whatsapp-query.mjs` | INSTANCE | CLEAN | zero edges |
| `nexus-company.mjs` +nexus/cold-acquisition | INSTANCE | CLEAN | has a launchd plist (waveA missed) + `job-pool.test.mjs:11` imports it — sever test |
| `cyber-*` | INSTANCE(pack) | CLEAN | relocate-set MUST include `security-lens.mjs` + `threat-intel-kernel.mjs` (+tests) |

**CRITICAL CORRECTION — `math/` is NOT split, it is ALL CORE.** The `nexus-*` files in `math/` are **NEXUS CORE** (Yuri's own math substrate), NOT Nexus Link the company — a prefix false-friend. `nexus-numerology` feeds 7 core matchers (`yuri-token-expand.mjs:32`); `nexus-distrib` feeds `computeU` (the energy gate). **Relocating them as "instance" would break the energy gate.** transfer-distance = dormant-core (@capability, feeds izanagi). yuri-phi/formula-foundry = core. Math instance-half is effectively empty.

**ONE OPEN OWNER QUESTION (effectiveness/theater, not wiring):** are `yuri-decode` + `yuri-originator` (numerology/gematria/harmonic-signature cognition instruments) real harness capability or Marcel-personal esoterica that shouldn't ship? Resolving their scope resolves formula-foundry's placement. → decide in the Fable take + owner call.

### Q7 Restructure — BARREL-FIRST, not risky moves (reconciles with coupling reality)
620 files, but the core prefixes (yuri- 108, memory- 21, nano- 34, claim- 16, kagami-, energy-, lanes-, llm-) are deeply cross-coupled transit hubs (nano-lease → 22 importers; memory-canonical-store top-3 transit; skill-recall/filing-assessor/lane-kernel/memory-kernel are DYNAMIC-import anchors). Three-zone strategy:
- **BARREL** (add `<dir>/index.mjs` namespace re-export, files stay flat, zero consumer change): memory/, nano/, lanes/, kagami/, energy/, claims/, filing/, llm/, tokens/, skills/, mcs/, workers/. Modularizes the *namespace* + seeds the package `exports` map without a dangerous move. Use `export * as X` (namespace), never bare `export *` (silent collisions).
- **MOVE** (physical, cleanly separable): corpus/ (8 modules, 0 external static consumers), fleet/ (ollama-*/fleet-*/glm-*/train-* ~40 — HIGH-cost: sync 6 package.json scripts + launchd + npm test chain).
- **STAY-FLAT / already-clean dirs:** math/, yuri/, _lib/, policy/, security/, self-improvement/, schemas/.
- **RELOCATE-OUT:** the instance subsystems above.
Barrel-first honors Fable's "extend never rework the healthy core" and keeps every batch reversible.

### Q4 Dead-code — the honest cut list is TINY (Fable's liveness lesson holds)
Naive liveness analysis is dangerous: `.mjs`-only greps miss `.sh`/`await import()`/hooks/launchd callers. Code-verified: **1 confirmed-dead file** (`lane-dispatcher.mjs`, already archived). DORMANT (keep, labeled): `spreading-activation-gate.mjs` (experiment). DEDUP (not cut): `tdd` vs `test-driven-development`. The "dozens of dead files" intuition is FALSE — most apparent orphans are live via non-.mjs callers or are correct skill-tier entities.

### Q5/Q6 Skills — 2-axis tag + hybrid disclosure (the bleed is real & measurable)
121 skills, 6.6% used. The disclosure is broken at the root: **58 skills declare `triggers:` frontmatter that runtime NEVER reads** (skill-recall.mjs indexes name+description only, ~80 chars); ~50 fully orphaned; 5/121 hardcoded auto-triggers. Fix = (a) tag every skill scope[harness|instance]×invocation[ability|workflow]; (b) hybrid disclosure: one-line ambient ability index + command-map for workflows + retrieval-injected full bodies + nothing-ambient for instance; (c) reconcile the two surfacing layers (omp injection vs Yuri skill-recall) — they currently don't share a source of truth.

### Q8/Q9 Package + adapters — the machinery MOSTLY EXISTS (extend, don't build)
Capability-first win: `yuri-export.mjs` (scrubs paths to `${YURI_ROOT}/${HOME}`), `export-manifest.json` (postExportChecks array), `packaging-check.mjs` (the no-restated-policy test plugs in HERE), `yuri-merge-settings.mjs` (already absolutizes paths — the portability fix extends it), `yuri-init.sh` (already portable, `YURI_ROOT` from `BASH_SOURCE`), `gitnexus-mcp.mjs` (MCP pattern to replicate). The portability landmine (`settings.local.json` hardcoded `/Users/marcelspatz` + `autoMemoryDirectory`) is a DEV-instance artifact; the package path already derives at runtime. Adapters → generated thin from `yuri-origin.md`, enforced by a no-restated-policy test in packaging-check; Fable's CLAUDE.md good parts (fleet clarity, persona overlay, Rick roster) preserved, its restated-policy stripped.

---

## PART 3 — RECONCILED EXECUTION PLAN (honesty-first, then boundary, then structure)

Each phase gates the next; every step reversible + green-verified before advancing. HIGH-blast steps (relocations, fleet move, arming) produce a finished ruling and HOLD for owner confirm per the Self-Governance Charter.

| Phase | Work | Blast | Gate |
|---|---|---|---|
| **0. Honesty patch-set** (Fable's Day-1, still unapplied) | make dead loud/true: `symbiotic-pulse` demote-or-wire, kill/label backend `:3004`, repoint/delete `_SYSTEM/DESIGN.md` + `yuri-homeostat` refs, `/clone`/`/pco` retirement, self-improvement alarm-on-dead | LOW | tree green; state-honesty test |
| **1. Worktree reap + freshness** | delete 13G stale worktrees (poisons audits), stale-index sweep | LOW | greps clean, 13G back |
| **2. Skill 2-axis tag + registry heal** | tag all 121, reconcile 3 registries→1 truth, dedup tdd | LOW | one registry, count matches |
| **3. Skill hybrid disclosure** | ambient one-liner index + command-map + retrieval bodies; wire the unused `triggers:` OR drop it | MED | bleed measured down; recall telemetry added |
| **4. Boundary — barrel core** | add `index.mjs` barrels to the 12 coupled clusters (no file moves) | LOW | imports green, structure test |
| **5. Boundary — relocate instance** (OWNER-GATED) | move trading/voice/whatsapp/nexus-company/cyber + carry-alongs out of core → `instance/`; exclude from export | HIGH | packaging-check clean generic core; extension smoke |
| **6. Move clean clusters** | corpus/ then fleet/ (fleet syncs launchd+scripts) | MED | per-batch green; launchd verified |
| **7. Adapters generated-thin** | generator from canonical + no-restated-policy test; slim CLAUDE.md | MED | test green across all adapter surfaces |
| **8. Package-shape** | `exports` map + `bin` + core/shell layout on top of the barrels | MED | `import from 'yuri'` works; CLI runs |

**Sequencing rationale:** honesty-first because a prosthetic that misreports itself is worse than a smaller honest one, and because every later cut lands on a system that's already truthful. Barrels (P4) before relocation (P5) and package-shape (P8) because the namespace front-door de-risks every move after it. Security is already done, so it drops out of the critical path.

---

## PART 4 — OPEN QUESTIONS FOR THE FABLE TAKE + OWNER

1. **Esoteric-cognition scope (the one unsettled wiring-adjacent call):** ship `yuri-decode`/`yuri-originator`/numerology as harness, or relocate as instance? Effectiveness/theater judgment.
2. **Solo→universal gap:** Fable previously said Yuri is a solo prosthetic. Is the honesty patch-set (P0) a hard prerequisite before ANY universal-extension packaging, or can they proceed in parallel?
3. **Relocation aggressiveness:** relocate ALL 5 instance subsystems now (P5), or start with the cleanest (whatsapp/cyber) and stage trading/voice (which carry launchd/hooks)?
4. **Barrel vs move for `fleet/`:** it's the one MOVE with high launchd/script sync cost — barrel it instead?
5. **What did we get WRONG?** (Fable's blind-spot audit — completeness critic.)
