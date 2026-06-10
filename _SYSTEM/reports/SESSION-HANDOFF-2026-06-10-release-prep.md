# Session Handoff — YURI Public-Release Prep (2026-06-09 → 2026-06-10)

Handoff from the release-prep lane to the parallel session, to bind the work together.
Everything below is committed to `origin` (`yuri-os`, the PRIVATE working repo). The
public OSS export to `nexuslinkproductions/YURI` is a separate, later step (W4).

## North star (locked)

**The public release = the deterministic exoskeleton + a curated research database. Nothing else.**
Full spec: `_SYSTEM/reports/YURI_RELEASE_SPEC_2026-06-09.md`. The clean repo is a
NON-destructive EXPORT (allowlist of functional files); the private repo keeps everything else.

- **Tagline (locked):** "The deterministic gateway for AI." / sub: "Governance, safety, and
  continuity that hold on any model."
- **Operating-basis framing (for copy/README):** YURI builds on **ICM / MWP** (Interpretable
  Context Methodology + Model Workspace Protocol, Jake Van Clief arXiv:2603.16021) which solve
  STATIC coherence (treat AI like code, not a colleague). YURI governs the DYNAMICS in motion
  with mechanisms borrowed from established math + science (information theory, graph theory,
  dynamical systems, probability, optimization) — turning progress/regress from a guess into a
  measured number. Do NOT name "Lyapunov" specifically in public copy (owner directive — it's
  one of many mechanisms). Positioning research: `02_RESOURCES/research/yuri-positioning-and-landscape-2026-06-09.md`.

## Done this session (verified)

**Assessment.** 24-agent state assessment → `_SYSTEM/reports/YURI_RELEASE_READINESS_ASSESSMENT_2026-06-09.md`.

**Functional fixes (verified, in-place):**
- openMass weight-poisoning guard (`openprocess-pool.mjs`) — 20/20 tests.
- geass-lock phantom path realigned (`skills/geass-lock/SKILL.md` + `.claude/yuri-sentinel/geass/`).
- launch-readiness false-NOT_READY test fixed (`launch-readiness-check.mjs`).
- 5 `/yuri-*` command stubs created (closure rule).

**Retirements / scrubs (daemons stopped + unwired, all verified):**
- `independence-check` retired (stale Anthropic-independence gate) → **launch gate now READY**.
- `shellService` dev-login key DELETED at all 4 sites + daemon disabled/booted; **dev role intact**
  (anchored in `_SYSTEM/SELF/dev-credential.json`, untouched).
- `wiki-rag` watcher scrapped (2 daemons + 2 plists + `package.json` wiki:rag block).
- `launch-readiness-wrapper.sh` scrapped + its failing nightly job booted/disabled.
- `nudimmud` scrubbed from `llm-compat.sh`; `.env*` guard narrowed to free `.env.example`.

**W1 — de-hardcode (DONE for the shipping surface).** Zero `/Users/marcelspatz` left in any
shipping file (15 files: all hooks, 5 shell scripts, energy core, settings.json gitnexus →
`$CLAUDE_PROJECT_DIR`, 2 hook tests, tokenmaxxing/sharingan skill examples). Roots now derive from
`YURI_ROOT`/`__dirname`/`$HOME`. Verified: brain-inject fires, guards load, derivation resolves
through the `~/.claude` symlink. INTENTIONALLY SKIPPED (excluded from ship): kagami-rag-curator,
playwright-visual-check, claude-plugin-parity-check, ecosystem.config.js.

**W2 — docking contract (DONE, verified):**
- `yuri-init.sh` — clone-and-dock installer; dry-run default, dev-author guard (refuses to
  self-merge), `--apply` / `--remove`. Verified: guard fires, syntax OK.
- `_SYSTEM/Scripts/yuri-merge-settings.mjs` — additive/tagged/reversible settings merge.
  Self-test 4/4 + proven on real 37-hook settings (idempotent, absolutized, user hooks preserved).
- `INSTALL.md` (operator guide), `.claude-plugin/plugin.json` (plugin seed), `LICENSE` (MIT),
  `SECURITY.md` (corrected for shipped exoskeleton), `.env.example` (core-only), `persona.template.md`.
- Mechanics confirmed via claude-code-guide: hooks ACCUMULATE across global+project;
  `$CLAUDE_PROJECT_DIR` = the USER's project (so YURI hooks use absolute `$YURI_ROOT`).

**W3 — research DB curation (MANIFEST done; assemble pending owner ratify):**
- `_SYSTEM/reports/YURI_RESEARCH_DB_CURATION_2026-06-10.md`. Finding: `02_RESOURCES/research`
  (~260 files) is ~80% private build-journal. Ship-core ≈ 40 files: the math/science substrate
  (MATH-SCIENCE-MANUAL + transfer catalog + π/φ/Fib primitives + cross-domain prior-art +
  science-source ledger) and `02_RESOURCES/CODE-BIBLE/` (13 files). Strip clusters enumerated.

## Next phases

- **W3-assemble (BLOCKED on owner decision):** ratify the ship-core + decide 4 BORDERLINE docs
  (rec: ship competitor *profiles*, keep YURI-moat/positioning private). Then copy ship-core →
  clean staging → scrub (changelog/lane-headers/old-names/abs-paths) → fresh small FTS5 index →
  leak-verify. Do NOT ship the 410MB private `search-index.db`.
- **W4 — export tooling:** materialize the clean public repo from this one via the allowlist
  manifest (release spec EXCLUDE/INCLUDE). Completes the plugin packaging (`hooks/hooks.json`
  var-swapped to `${CLAUDE_PLUGIN_ROOT}`, skills→plugin layout, live `claude plugin add` test).
  Runs the full naming scrub (nudimmud/openclaw/hermes/obliteratus) on the EXPORT, not the private repo.
- **W5 — launch:** README with the locked line, Threads/IG rollout.

## Open decisions for the owner

1. W3 ship-core ratify + the 4 borderline docs.
2. Energy-enforcement arming timeline (still observability-only by design) + the L∞
   `maxLadderInversion`-hardcoded-0 defect (tangled with the unbuilt claim-ledger v2).
3. GitNexus vector search is permanently unavailable (embeddings=0) — decide if it matters for ship.
4. 7 stale `.claude/worktrees/` + cross-repo PM2 (`nudimmud-*` → `/Users/marcelspatz/NUDIMMUD`,
   crash-looping) — cleanup, not YURI's bug but pollutes health.

## Hazards for the next lane (do not trip)

- **NEVER `git add -A`** here: a 609MB `_SYSTEM/monitoring/kagami-discipline.log`, the bug-bounty
  corpus, DB backups, telemetry, and `.agents`/`.codex`/`.cline` scratch are all untracked and
  (mostly) not gitignored. Stage explicit paths only. (This handoff adds the log to `.gitignore`.)
- `~/.claude` is a SYMLINK into the repo (the dev setup). `yuri-init` refuses to run here by design.
- Backend changes (`shellService.js`/`api.ts`/`server.ts`) committed to source; the compiled
  `backend/dist/` still holds the old default key until rebuilt — harmless (service is dead).
