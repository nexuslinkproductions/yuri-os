# YURI ARCHITECTURE REFINEMENT — DECISION DOC (owner-facing, post-Fable)

**Date:** 2026-07-07 · **Owner:** Marcel · **Inputs:** grill (10 locked decisions) + prepared package (`00-PREPARED-PACKAGE.md`) + Fable-5 strategic take (`01-FABLE-TAKE.md`) + owner-verified spot-checks.
**State:** PLAN LOCKED, EXECUTION OWNER-GATED. Nothing mutated. This is the sign-off checkpoint.

---

## THE HONEST BOTTOM LINE (Fable, owner-verified)
This project delivers an **honest, bounded, package-SHAPED core on Marcel's machine** — the necessary substrate, achievable at Marcel's skill level. It does **NOT** by itself deliver an installable universal extension. That gap closes only when a **second user installs on a non-Marcel machine and survives a week** — the *next* project's acceptance test. The one risk that derails it: **phase-green ≠ product-true.** Countermeasure: a golden-path test Marcel can run and read himself, built RED early as the standing definition-of-done.

## THE MAKE-OR-BREAK (the strategic reframe Fable surfaced)
The universal-extension thesis is **CONDITIONALLY SOUND** — but only the **memory/continuity pillar is genuinely portable**. Yuri's flagship **governance is Claude-Code-hook-bound** and silently degrades to advisory prose on ~6 of 8 target clients (Claude Desktop, Cursor, VSCode, OMP, Hermes have different or no hook contracts). Ship it naively and **Yuri recreates its own spine defect — unmarked non-determinism — at product scale.** The make-or-break deliverable is an explicit **per-host enforcement contract with honest degradation tiers**:
- **Tier-1 (deterministic):** hosts with a real PreToolUse/gate hook (Claude Code) → full governance enforcement.
- **Tier-2 (advisory + MCP memory):** hosts without → memory/continuity via a `yuri-mcp` server, governance as *labeled advisory*, never claimed as enforced.
Honest tiering is the difference between a real product and prose cosplay.

## VERIFIED PLAN-BREAKING DEFECT (fix the ruler first)
`yuri-export.mjs` is **broken** — owner-verified: exports **107 of 620** `_SYSTEM/Scripts` modules (math/ only), exclude globs match nothing. The export/packaging tool the boundary plan depends on would ship an incomplete harness and call it done. **Fixing it is P0, before any boundary/packaging work.**

---

## RULINGS ON THE 5 OPEN QUESTIONS (Fable)
1. **Esoteric cognition (yuri-decode/originator/numerology):** KEEP CORE, do not relocate (nexus-numerology is wired into 7 core matchers; yuri-originator is core-dormant). Scrub esoteric *naming* at the export surface (scrubber already exists). Telemetry decides promotion later. → resolves the one open wiring-adjacent question.
2. **Honesty prereq:** P0 is a hard-prereq for generation/republication phases (P3/P7/P8) ONLY — those *inherit the lies*. It runs PARALLEL with P1/P2/P4, not strictly before everything.
3. **Relocation:** STAGE by **side-effect class, not cleanliness.** Wave-1 (no live daemons): whatsapp, cyber, nexus-company. Wave-2 (live launchd/hooks): AFL + voice — stop the daemon first.
4. **Fleet:** BARREL, never move. Delete the fleet physical-move phase — zero package-shape gain over a barrel, textbook tidy-first anti-pattern, and fleet is what the universal story needs least.
5. **What the package got wrong:** the broken exporter (above); it packages *prose not enforcement* (no MCP surface exists yet); the no-restated-policy test would fail its own generator on Tier-2 hosts; 6.6% skill usage may be a *value* problem not a disclosure one (pre-register a "cut if <25% in 30d" threshold before building disclosure); dream-queue is named-open but unphased.

---

## REVISED EXECUTION PLAN (Fable-sequenced; every step reversible, green-gated; HIGH-blast = owner-confirm)

| Phase | Work | Blast | Owner-gate? |
|---|---|---|---|
| **P0 · Day-1 truth batch** | honesty patch-set (symbiotic-pulse demote, backend :3004 kill/label, DESIGN.md + homeostat refs, /clone /pco) **+ fix yuri-export globMatch + add export-census assertion** | LOW | self-gov |
| **P1 · Worktree reap** | delete 13G/12 stale worktrees (poison audits) | LOW | self-gov |
| **P2 · Golden-path test (RED)** | end-to-end "install→govern→remember→recall" test, built failing = definition-of-done | LOW | self-gov |
| **P3 · Skill registry heal + 2-axis tag** | reconcile 3 registries→1, tag all 121 (needs P0) | LOW | self-gov |
| **P4 · Boundary barrels** | `index.mjs` on 12 coupled clusters (no file moves) + barrel fleet | LOW | self-gov |
| **P5 · Skill hybrid disclosure** | ambient index + command-map + retrieval bodies; pre-registered usage cut-threshold | MED | self-gov |
| **P6 · Relocate instance** | Wave-1 (whatsapp/cyber/nexus-company) → Wave-2 (AFL/voice, stop daemons) → `instance/`, exclude from export | **HIGH** | **OWNER** |
| **P7 · Move clean clusters** | corpus/ (fleet stays barreled) | MED | self-gov |
| **P7.5 · yuri-mcp + HOST-COMPAT matrix** | the MCP governance/memory server + honest Tier-1/Tier-2 per-host contract — the make-or-break | HIGH | **OWNER** |
| **P8 · Adapters generated-thin + package-shape** | generator + no-restated-policy test (Tier-aware) + `exports`/`bin` (needs P0) | MED | self-gov |

**Highest-leverage FIRST move:** P0 Day-1 truth batch — fix the ruler (exporter) + stop the system lying about itself, in one pass. Everything downstream lands on a system that is already truthful and measurable.

## STILL-UNOWNED (Fable blind-spot audit — must be assigned, not skipped)
- **Mortality/backup story** — tested backup+restore for memory.db, ledgers, Track-B, brain state. Now product-grade (a user's data).
- **Harness-drift canary** — a Claude Code / client update can silently invalidate prose-load-bearing doctrine; multiplied by N clients.
- **Golden-path test** — owned by P2 above; it IS the product's definition-of-done.
- **Memory pillar multi-user** — curator/consent/backup story for a second user's memory.

---

## OWNER GO/NO-GO
- **Green-light P0–P5, P7 (self-governable, low/med blast, reversible)?** These make the core honest, measurable, bounded, and barrel-modularized without relocating anything.
- **P6 (relocate instance) + P7.5 (yuri-mcp + host tiers) are HIGH-blast → explicit owner confirm each.**
- **Decision needed:** accept Fable's tiered-governance reframe as the make-or-break, and the "solo-core-now / universal-acceptance-next-project" honest scope?
