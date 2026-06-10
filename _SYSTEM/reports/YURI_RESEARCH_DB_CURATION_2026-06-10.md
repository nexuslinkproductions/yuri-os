# YURI Research Database — Curation Manifest (W3, 2026-06-10)

The shipped research DB is the second half of the release ("exoskeleton + a curated
research database to work with it"). Rule (from the release spec): **general research
useful for operating / building-with YURI, genuinely useful, curated not dumped; NO
personal research, NO bug-bounty, NO business.**

## Verdict (content-grounded, read not guessed)

`02_RESOURCES/research/` holds **~260 files**, and the large majority is Marcel's
private **build journal** — session handoffs, build plans, design queues, internal
architecture maps, model evals, moat audits, business positioning, a 76-file
third-party scrape, and design/Pinterest reference dumps. None of that ships.

Buried inside is a small, genuinely valuable **ship-core**: the math/science substrate
and the defensive-coding Code Bible. That core is real, proven, well-written, and is
exactly the "dock-on" reference a stranger operating YURI needs. The DB we ship is that
core, scrubbed of internal build-process noise — not the journal around it.

---

## SHIP-CORE — the curated research DB (verified general-useful)

### Math / science substrate (the heart)
- `MATH-SCIENCE-MANUAL.md` — the dock-on guide: 10 deterministic methods (transfer-distance,
  matching engine, token-expand, π/φ/Fibonacci, adapters, health, registries, energy-trace),
  each with math + code pointers + proofs. **The keystone doc.**
- `math-theory-transfer-catalog-2026-06-03.md` — mechanism-transfer catalog (theory → organ,
  each adversarially verified).
- `math-primitive-candidates-parking.md` — the candidate math lineup.
- `pi-phi-fibonacci-primitives-2026-06-06.md` — applied π/φ/Fibonacci primitive findings.
- `cross-domain-transfer-distance-prior-art-2026-06-06.md` — prior-art survey + structural-distance method.
- `sources/science-source-ledger.md` — the cited-paper ledger (86 sources the methods stand on).
- `02_RESOURCES/CODE-BIBLE/` (README + `mechanisms/`, 13 files) — defensive coding patterns ("the Code Bible").

### Method / operating reference
- `04-BRAIN-DUMP-DECODER.md` — the brain-dump decoding method (referenced by the persona spine).
- `05-TERMINOLOGY-INDEX.md` — the operating vocabulary.
- `yuri-hardening-canon-2026-06-09.md` — defensive patterns distilled from the red-team (Code-Bible-adjacent).

These ship after scrub. Estimated curated DB: **~25 docs + the 13-file Code Bible ≈ 40 files.**

---

## BORDERLINE — owner decides (general knowledge vs your strategy)

These are well-written and arguably useful context, but they edge into competitive
strategy / moat thinking that may be better kept private. Marcel's call per file:
- `nemo-guardrails-opa-competitive-profile-2026-06-03.md` — competitor recon (NeMo/OPA vs YURI).
- `yuri-competitive-landscape-code-level-2026-06-03.md` — code-level competitive map.
- `yuri-governance-architecture-GVF-2026-06-06.md` — the Governed Verdict Functional (architecture; could read as internal).
- `yuri-positioning-and-landscape-2026-06-09.md` — the positioning research (contains the moat thesis + AVOID list; likely KEEP PRIVATE).

Recommendation: **ship the competitive *profiles* of others** (useful field knowledge),
**keep the YURI-moat/positioning docs private** (they are your go-to-market, not a user's
operating reference).

---

## STRIP — never ships (private build journal / business / 3rd-party / design)

By cluster (counts):
- **Session/handoff/launch-prompt journal:** SESSION-HANDOFF-*, NEXT-SESSION-LAUNCH-PROMPT,
  `_START-HERE-yuri-openclaw-session`, YURI-NEXUS-ROADMAP, *-build-plan, *-design-queue,
  *-backlog, full-system-sweep, wave-synthesis, mainspring/keystone notes (~30 top-level .md).
- **Internal build proposals:** nexus-guard-* (proposals/reports/json), regenerative-nexus-guard,
  circuitry-autoregen-queue, transfer-distance-engine-v2-build-plan, yuri-master-build-plan,
  yuri-math-engine-roadmap, yuri-mechanism-spectrum, enhancement-architecture (~20).
- **Business / Nexus Link:** 07-NEXUS-LINK-AUDIT, BACKEND_SECURITY_ANALYSIS_ORACLE,
  agent-economy-shift-and-positioning, oss-release-moat-audit, oss-watermark, dflash-viability.
- **Model evals (internal):** nemotron-3-ultra-eval, nemotron-framework-adapter-spec,
  external-reasoning-lane-dispatch-guide.
- **Website / design work:** 01-WEBSITE-PIPELINE, 02-PLANNER-PROMPT, 03-FINDING-INSPIRATION,
  06-ANALYZED-WEBSITES, 08-SPATIAL-UI, MASTER-PROMPT-GPT5, DESIGN-IMPLEMENTATION,
  `DESIGN-RADAR/` (35), `pinterest-refs/` (19).
- **Third-party scrape:** `jake-van-klief/` (76) — copyright/data-use risk, never ships.
- **Retired subsystems:** `RAG-MLM-HANDOVER/` (8, RAG retired).
- **Mixed internal:** `circuitry/` (20), `nav-proposals/` (11) — REVIEW; most is internal build, a
  little circuitry *theory* may be promotable (e.g. circuitry-layout-theory) — default STRIP.

Also strip-by-location (release spec law): `_SYSTEM/research-archive/` (52), `_SYSTEM/SELF-IMPROVEMENT/`
(58), `03_NEXUS-LINK/` (bug-bounty corpus, 1.6G), all `_SYSTEM/reports/`, `00_COMMAND-CENTER/`.

---

## Scrub required before a ship-core doc ships

Per-doc light edit (the content is good; the wrapper leaks internal process):
1. **Dated build changelogs** (e.g. the MATH-SCIENCE-MANUAL "Changelog" + the "red-team
   8-attacker fleet" session lines) → drop. Ship the methods, not the build diary.
2. **Internal lane headers** ("Lane E1 Codex xhigh", "DeepSeek DS1+DS2 synthesis",
   "Arbiter Synthesis") → drop.
3. **Naming scrub** (release law): any `openclaw` / `hermes` / `obliteratus` / `nudimmud` → remove/rename.
4. **`[[wikilink]]` memory refs** to private memories → strip or convert to plain text.
5. **Absolute `/Users/marcelspatz` paths** in examples → `<YURI_ROOT>` (consistent with W1).

## Assemble + index plan (mechanical, after ship-core ratified)

1. Copy ship-core (NON-destructive) into a clean staging dir, e.g. `research-db/`, preserving
   the math-manual ↔ catalog ↔ source-ledger ↔ Code-Bible structure the manual indexes.
2. Run the per-doc scrub above.
3. Build the shipped FTS5 index over `research-db/` only (a fresh small DB — NOT the 410MB
   private `search-index.db`, which indexes the whole journal). So `ai search` works
   out-of-the-box on the clean DB.
4. Verify: leak-scan the staged DB for personal/bugbounty/business terms + the four old names +
   absolute paths; confirm zero. Confirm `ai search "transfer distance"` / `"energy gate"`
   returns the right ship-core docs.

## Next

The math/science core + Code Bible are an unambiguous **ship**. The 4 BORDERLINE docs need
your call (my rec: ship competitor-profiles, keep YURI-moat/positioning private). Ratify the
ship-core and I assemble + scrub + index it into the clean shippable DB.
