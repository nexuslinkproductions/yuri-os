# YURI — Public Release Spec (locked 2026-06-09)

Owner-defined scope. The public release is **exactly two things**:

1. **The deterministic exoskeleton** — the governance + continuity layer.
2. **A curated research database** to work with it.

Nothing else. Tagline: **"The deterministic gateway for AI."** /
*Governance, safety, and continuity that hold on any model.*

The clean public repo is a **filtered EXPORT** of this private repo. The export
INCLUDES the two things above and EXCLUDES everything else. This is
non-destructive: the private working repo keeps its product layer and private
content; the export simply does not carry them. No `git rm` of Marcel's product.

## Export law: ALLOWLIST, not denylist (owner directive 2026-06-09)

The export ships ONLY files that are functionally relevant to operating YURI —
scripts, code, and the docs/skills that ARE the machinery. Everything that is
personal reference or working-history clutter is EXCLUDED by default. When in
doubt, a file does NOT ship. A file earns the ship only by being part of how
YURI functions for a stranger.

Clutter categories that NEVER ship (non-exhaustive, all excluded):
session journals / session-resume / handoff docs · audits & council audits ·
migration logs · mission reports · daily notes · refinement-patch notes ·
SELF-IMPROVEMENT / GAZE artifacts · research-archive of Marcel's pivots ·
dated status/closeout reports · anything under `_SYSTEM/reports/`,
`00_COMMAND-CENTER/`, `.claude/memory/`, `_SYSTEM/research-archive/`,
`_SYSTEM/SELF-IMPROVEMENT/`, `_SYSTEM/docs/*migration*`, `04_ARCHIVE/`,
`07_ARCHIVE/`. "For my own reference" = does not ship.

Naming scrub before ship: **every** mention of `nudimmud`, `openclaw`, `hermes`,
`obliteratus` removed or renamed in any shipped file (owner directive). These are
the old project names; the public surface is YURI only.

---

## INCLUDE — the deterministic exoskeleton

- `.claude/` — hooks, skills, commands (the governance/continuity machinery),
  minus anything private (see EXCLUDE).
- `_SYSTEM/Scripts/` — core governance scripts: xref/FTS5 search, propagation,
  energy gate (`energy-*`, `computeU`, circuit-breaker), memory kernel +
  claude-memory-write, circuitry self-model, lane-kernel role resolver,
  launch-readiness, nerve/openprocess pool, decode/recall. Minus product +
  connector + licensed-third-party scripts.
- `_SYSTEM/yuri-origin.md` (authority contract), `SOUL.md` (→ generic stub),
  `persona.template.md`, `_SYSTEM/context/`, `_SYSTEM/INDEX.md`.
- Adapters: `CLAUDE.md`, `AGENTS.md` (scrubbed of abs paths + operator refs).
- Root: `LICENSE` (MIT), `SECURITY.md`, `INSTALL.md`, `.env.example`,
  `yuri-init` docking contract.
- The energy/memory/circuitry math core + their tests.

## INCLUDE — the curated research database

A **genuinely useful, curated** corpus that ships with YURI so a user's AI has
grounded reference material to operate the exoskeleton well.

- **IS:** general deep research on what is useful *for operating / building with
  YURI* — e.g. governance patterns, deterministic-AI technique, energy/Lyapunov
  method, memory/continuity architecture, agent-control patterns, coding
  excellence, the math primitives the gates use.
- **IS NOT:** Marcel's personal research; the bug-bounty corpus (9,487 HackerOne
  reports); any business / acquisition / campaign / client work; anything
  operator-private.
- **Quality bar:** curated, not a raw dump. Every doc earns its place by being
  useful to a stranger operating YURI. FTS5-indexed so `ai search` works
  out-of-the-box on the shipped DB.
- Curation is its own wave: inventory candidate sources → score each for
  general-usefulness + ship-safety → assemble + index → verify no private/
  bugbounty/business leakage.

---

## EXCLUDE — never in the export (stays private here)

- **Product layer:** all of `_SYSTEM/backend/` (design studio, cold-acquisition
  CRM, notebook suite, control-plane, headless services).
- **External-service connectors (unused / not shippable):** Plane, Linear,
  Obsidian (`obsidianRestService`, `notebookObsidianSync`), Outlook (`outlookIcs`),
  Austrian registries (Firmafind / Wirtschaftskompass / Zefix), cold-acq feeds.
- **Licensed / non-shippable third-party:** Playwright + browser-harness,
  Whisper, any bundled local-model infra (MLX, Needle, Neural Forge, Ollama
  runtime) that carries a license Marcel cannot redistribute.
- **Private content:** `_SYSTEM/persona.md`, `_SYSTEM/state/user-profile/`,
  `.claude/memory/` (Track-B behavioral), `_SYSTEM/campaigns/`,
  `02_RESOURCES/RESEARCH/jake-van-klief/`, `01_PROJECTS/`, private `_SYSTEM/reports/`,
  `00_COMMAND-CENTER/SESSION-REPORTS/`, the bug-bounty corpus, all private DBs
  (memory.db, search-index.db, kagami.db, etc.).
- **Naming scrub:** any openclaw / hermes / obliteratus references in shippable
  surfaces (owner directive — rename or delete; bulk is doc-scrub).

---

## Build waves (post-decision)

- **W1 — de-hardcode (live, careful):** 56 `/Users/marcelspatz` sites →
  `YURI_ROOT`/`__dirname`/`$CLAUDE_PROJECT_DIR`. Inventory ready; verify each
  (the `~/.claude` symlink makes `__dirname` derivation need per-file checks).
- **W2 — docking crux:** `yuri-init` (detect root, merge into host `~/.claude`,
  npm install, plist template, persona init, refuse default keys) + `INSTALL.md`.
- **W3 — research DB curation:** inventory → score → assemble → FTS5 index →
  leakage check.
- **W4 — export tooling:** a script that materializes the clean public repo from
  this private one using INCLUDE/EXCLUDE above as the manifest.
- **W5 — launch:** README with the locked line, social rollout.

## Done already (2026-06-09 session)

Assessment (24 agents) · openMass/geass/launch-readiness fixes ·
independence-check retired (gate GREEN) · shellService dev-login key deleted +
daemon killed (dev role verified intact) · positioning line locked · LICENSE +
SECURITY.md + persona.template + .env.example · wiki-rag watcher scrapped ·
`.env*` guard narrowed to free templates.
