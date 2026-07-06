# YURI — Release-Readiness & Current-State Assessment (2026-06-09)

Grand-architect assessment for the public open-source release. Fleet: 24 agents
(Sonnet/Haiku, xhigh), 1,043 tool calls, 90 unique findings, 22 confirmed /
4 refuted via adversarial verification, 64 medium-low. Read with the verdict
that the **hook spine is structurally sound** — 34/34 settings-referenced hooks
exist, zero phantoms — and the gaps are concentrated in (a) dormant-but-built
organs, (b) machine-coupling that breaks on a stranger's clone, and (c) private
content tracked in this (private) repo that must be filtered at the export
boundary, not gutted here.

This repo stays the **private source of truth**. The clean public repo is a
**filtered export** — strip/transform happen during export, never by deleting
Marcel's private working files in place.

---

## A. Landed this session (verified, non-destructive, in-place)

1. **openMass weight-poisoning guard** (`_SYSTEM/Scripts/openprocess-pool.mjs`) —
   red-team finding S-1 fix O-1 that never shipped. `opts.weights` now sanitized:
   a non-finite override (Infinity/NaN/non-number) falls back to the default
   weight instead of corrupting the whole OpenProcess ranking. Verified: poison
   rejected, legit override applied, 20/20 pool tests green.
2. **geass-lock phantom path** (`.claude/skills/geass-lock/SKILL.md`) — SKILL.md
   wrote to `nisaba/geass/active-lock.json`; brain-inject.js reads
   `.claude/yuri-sentinel/geass/active-lock.json`. Locks were silently swallowed,
   never surfaced in the brain block. SKILL.md realigned to the reader's path;
   `.claude/yuri-sentinel/geass/` created.
3. **launch-readiness false NOT_READY** (`_SYSTEM/Scripts/launch-readiness-check.mjs`) —
   the `spawn-guard-block` test demanded a `deny` from `agent-spawn-guard.js`,
   but that guard was made observability-only by owner directive 2026-05-30. The
   stale test sat in `hardFail[]`, pinning the nightly gate to NOT_READY forever
   and poisoning brain-inject every session. Test rewritten to assert the real
   contract (allow + observability log). Now passes.
4. **Skill-closure stubs** — created `/yuri-bankai`, `/yuri-geass`, `/yuri-haki`,
   `/yuri-izanagi`, `/yuri-nen` command files (skills declared the aliases; the
   command files were missing). `.claude/yuri-sentinel/izanagi/` created
   (idempotent; the script self-creates it too — that finding was a false positive).

Refuted by adversarial verification (NOT real, do not chase): claim-cortex
"UNWIRED" (it is on the live PostToolUse energy-tick path; only the graph LABEL
is stale), kagami-consolidator "dormant" (loaded in launchd, runs), memory-kernel
"no callers" (called by autopilot + kagami-consolidator + rails), L∞ cap
"the fix" (the cap is fine; the inert part is the field below it — see C).

---

## B. The true current state (what is wired vs dormant vs inert)

**Wired & healthy:** the full SessionStart/PreToolUse/PostToolUse/Stop hook
chain; brain-inject (synchronous, 10+ sources); xref-query / propagation-scan /
yuri-search (FTS5, 39k docs) / lane-persona-map / yuri-decode; the OpenProcess
pool (31 open + 3 closed, ranked, injected into the brain block); the energy
trace (ticks every tool call, ~1060 records/day) as an **observability** layer;
arch-graph drift reflex; five live launchd daemons (wiki-rag, health-aggregator,
shellservice, session-runtime).

**Dormant — built, no automatic trigger fires it (the "built but not wired"
set Marcel worried about):**
- `yuri-originator.mjs` — the native worker exoskeleton entry port. 24k lines of
  past telemetry, CLI main guard, but no hook/cron/`ai` command auto-invokes it.
  Operator-only. (If session-automatic dispatch is intended, this is the wire.)
- `circuitry-auto-register.mjs`, `xref-drift-scan.mjs`, `regenerative-nexus-guard.mjs`
  — the enforcement mechanisms for Marcel's own standing laws (auto-registration,
  change-propagation continuity). Built, have callers, but nothing schedules them.
- `yuri-total-recall.mjs` — fully built, zero live callers.
- `memory-kernel` propose→decide→ledger — has callers, but no SESSION path writes
  Track-A canonical memory during a session (by design: operator-approval pipeline).

**Inert — wired but switched off / empty:**
- **Energy enforcement** — `energy-enforce.mjs` is registered but permanently
  metrics-only: `YURI_ENERGY_ENFORCE=1` absent and `_SYSTEM/state/energy-enforce.enabled`
  does not exist. The layer-2 conscience never blocks. (Owner-gated burn-in.)
- **L∞ max-severity veto** — doubly inert: `maxLadderInversion` is hardcoded `0`
  at `energy-tick-core.mjs:230` and propagated `?? 0` at 252/286, so even arming
  the cap does nothing; the field feeding it is always 0. Tangled with the
  unbuilt claim-evidence-ledger v2.
- **kagami-consolidator** runs daily but in **dry-run** (no `--execute` in the
  plist) — the FSRS relocation engine never commits moves. (Cold store actually
  holds 9 rows, not 0 — a finder miscount.)
- `pre-tool-gate.js` is registered `async=true`, so its routing advice lands
  after the tool already executed — structurally too late to gate.
- GitNexus **vector search is permanently unavailable** (embeddings=0); the
  weekly re-index runs graph+FTS only. Any semantic-similarity call degrades silently.

---

## C. Owner-decision gates (flagged, NOT touched — your call)

These change behavior, semantics, or production state. I will not move on them
without your ratify.

1. **shellService local-exec surface** — `_SYSTEM/backend/shellService.js` runs
   an arbitrary-`/bin/sh` HTTP service on `127.0.0.1:3098` (localhost-bound, so
   NOT a remote RCE — the finder/critic missed that). All three sites
   (`shellService.js:9`, `api.ts:733`, `server.ts:733`) share the hardcoded
   a shared hardcoded default key (now DELETED 2026-06-09), and the plist set no override, so
   the live daemon runs on the published key. Any local process with that header
   can exec as you. **Release-critical**: must never ship with a default key +
   RunAtLoad. Fix (your trigger — it rekeys a running daemon + compiled callers):
   set a strong `SHELL_SERVICE_KEY` in env/plist, make all three sites require it
   (refuse to start on the default), rebuild backend, `launchctl kickstart` the
   service.
2. **`independence-check` is a retired-policy gate.** It enforces independence
   FROM Anthropic — flags `model=claude-fable-5`, the Sonnet/Haiku subagent
   configs, and `Agent({model:"haiku"})` as violations and tells you to replace
   them with `deepseek-v4-pro`/`qwen2.5:7b` (retired offload lanes). That is the
   inverse of ratified policy (agent-spawn-guard POLICY REVERSED 2026-05-30;
   offload retired; YURI-as-exoskeleton-on-Fable/Sonnet/Haiku). It permanently
   pins the launch gate to NOT_READY for the wrong reason. **Decision:** retire
   the Anthropic-independence axis, or repoint "independence" at the real release
   axis (independence from openclaw/hermes/obliteratus + hardcoded paths).
3. **Energy enforcement arming + L∞ field** — arm `YURI_ENERGY_ENFORCE` and fix
   `maxLadderInversion` only when you decide burn-in is done; L∞ also needs the
   claim-ledger v2 to produce non-zero severity.
4. **PM2/NUDIMMUD cross-repo** — the running PM2 fleet (`nudimmud-backend/frontend`)
   points at `/Users/marcelspatz/NUDIMMUD` (a different repo); `nudimmud-frontend`
   is crash-looping (488 restarts). This repo's `ecosystem.config.js` names
   different services. Not YURI's bug to fix, but it pollutes the health picture.
5. **GitNexus embeddings=0** — decide whether semantic search matters for the
   release; if yes, an embedding pass must be added to the weekly re-index.
6. **7 stale `.claude/worktrees/` + 1 `.codex-worktrees/prism-workbench`** — each
   carries divergent copies of hooks/scripts (a full vault copy with its own
   gitnexus index). Contamination + confusion risk; candidate for cleanup.

---

## D. The release blocker: docking on a stranger's machine

Today the repo is **undockable by anyone but Marcel**. The whole system assumes
`~/.claude` is a symlink into this repo. A stranger clones it and their `~/.claude`
is their own real dir — **zero YURI hooks fire**. There is no `INSTALL.md`,
`init.sh`, or `.env.example`. Machine-coupling inventory: ~11 Scripts, ~32
`.claude` files, 5 launchd plists, 2 `settings.json` hook commands hardcode
`/Users/marcelspatz`. The primary safety gate (`bash-security-guard.js`
`REPO_ROOT_PREFIX`) is hardcoded with no env fallback, so it misfires on any
other machine.

**Recommended docking architecture (the answer to "how does a user's AI install
YURI"):** ship a single `yuri init` contract — an idempotent script + a docking
guide the user's AI reads first (`AGENTS.md` / `CLAUDE.md` / `GEMINI.md` thin
adapters all point to it). `yuri init` must, in order: (1) detect the host repo
root and export `YURI_ROOT`; (2) back up any existing `~/.claude` and create the
symlink (or, safer default, **merge** YURI's hooks/skills into the user's existing
`.claude` rather than replacing it); (3) `npm install`; (4) sed-template the
launchd plists to the host path (opt-in, not auto-load); (5) initialize a
**generic** persona from `persona.template.md` (prompt for operator name; the
Rick overlay stays gated behind `YURI_PRIVATE_RICK_OVERLAY=1` and never ships).
Derive every root via `__dirname`/`YURI_ROOT`, kill all hardcoded
`/Users/marcelspatz`. The deliverable a user's AI needs is exactly this: a
file-by-file "edit these to fit your dirs" contract, made executable.

---

## E. Export strip/transform manifest (for the clean public repo)

STRIP (never ship; filter at export, keep private here): `_SYSTEM/persona.md`
(self-declared do-not-ship), `_SYSTEM/state/user-profile/marcel-cognitive-profile.md`,
`.claude/memory/` (194 Track-B behavioral files), `_SYSTEM/campaigns/` (~24 files,
private acquisition ops — finder's "173" was a 7x overcount),
`02_RESOURCES/RESEARCH/jake-van-klief/` (76 files, 3rd-party scraped content),
`01_PROJECTS/melanie-ad-management/` (client deliverable), private `_SYSTEM/reports/`
(revenue plan, this assessment), `00_COMMAND-CENTER/SESSION-REPORTS/`,
`_SYSTEM/training/data/`.

TRANSFORM (ship after scrub): `SOUL.md` → generic persona stub;
`CLAUDE.md`/`AGENTS.md` → strip abs paths + operator refs; ~30 Scripts → env-var
paths; `ecosystem.config.js` → relative/env; launchd plists → templated.

ADD at root: `LICENSE` (MIT — owner specified), `SECURITY.md`, `INSTALL.md`,
`GEMINI.md` adapter, `persona.template.md`, `.env.example`.

CONTAMINATION rename/delete in shippable surfaces: openclaw (322 refs / 61 files),
hermes (55 / 30), obliteratus (48 / 16) — almost all in research/archive docs,
no live call-site wiring; bulk is doc-scrub, low risk.

GITIGNORE hazards to close: `_SYSTEM/backend/data/*.db.corrupt.{ts}` pattern gap,
`yuri-os-dashboard.html` (251KB) bypassing the `yuri-os-*.html` rule, a tracked
`.pyc`, `_SYSTEM/symbios-graph-input/graphify-out/` (15 files),
`01_PROJECTS/**/*.html`. (These leak only at a PUBLIC remote; harmless on the
private remote, so not urgent for this repo.)

---

## F. Phased path to ship

- **P0 (done)** — verified in-place functional fixes (section A).
- **P1 (owner-ratify)** — decide section C gates: shellService rekey,
  independence-check repoint, energy-enforce timeline, worktree cleanup.
- **P2 (build, additive)** — `yuri init` contract + INSTALL.md + LICENSE/SECURITY
  + GEMINI.md + persona.template + `.env.example`; de-hardcode all paths to
  `YURI_ROOT`/`__dirname`. This is the real "make it dockable" wave.
- **P3 (export tooling)** — an export/scrub script that materializes the clean
  public repo from this private one using section E as the manifest. The export,
  not in-place deletion, is what produces the shippable tree.
- **P4 (wire the dormant spine)** — schedule circuitry-auto-register /
  xref-drift-scan / regenerative-nexus-guard; decide originator auto-dispatch.
- **P5 (positioning + launch)** — see the positioning research artifact; Marcel
  picks the line; Threads/IG rollout.
