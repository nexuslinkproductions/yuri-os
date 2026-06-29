# Installing YURI

**The deterministic gateway for AI.**
Governance, safety, and continuity that hold on any model.

YURI is a governance + continuity *exoskeleton* for a coding AI. It is not an
agent and not a model. It wraps the AI you already use (Claude Code, and others)
with structured context, protected-path guards, a work-dynamics energy gate, a
self-model of your codebase, and durable memory — so the same discipline holds
across sessions and across models.

This guide docks YURI into your setup **without clobbering anything you already
have.** Every step is reversible.

---

## Requirements

- **Claude Code** (the host AI surface YURI docks into).
- **Node.js 18+** and **git** on your PATH.
- macOS or Linux. (Windows via WSL.)

YURI itself needs no third-party service or API key to run. The core is hooks,
skills, gates, memory, and local FTS5 search — all driven from the repo.

---

## Install

### Path A — clone and dock (works today, recommended)

Tell your AI, or run yourself:

```bash
git clone https://github.com/nexuslinkproductions/YURI.git ~/yuri
cd ~/yuri
./yuri-init.sh            # dry run: prints exactly what it will do, changes nothing
./yuri-init.sh --apply    # perform the install
```

`yuri-init` is **safe by default** — with no flag it only prints a plan. With
`--apply` it:

1. installs dependencies (`npm install`),
2. seeds a generic persona at `_SYSTEM/persona.md` from `persona.template.md` (yours to edit),
3. exports `YURI_ROOT` into your shell rc so every session can find the clone,
4. **backs up** your `~/.claude/settings.json`, then merges YURI's hooks into it —
   additively and tagged, so your own hooks are preserved and YURI's can be cleanly removed,
5. links YURI's skills and commands into `~/.claude/` **without overwriting** any
   same-named ones you already have.

Then open a new Claude Code session **in any project**. At SessionStart you should
see the YURI brain block appear. That is YURI, docked.

> The clone can live anywhere. `YURI_ROOT` (set in step 3) is what lets the hooks
> find the framework, so YURI governs whatever project you open — not just the
> clone directory.

### Path B — try it in-place (simplest)

Just work *inside* the clone:

```bash
git clone https://github.com/nexuslinkproductions/YURI.git
cd YURI
npm install
# open Claude Code here — YURI's .claude/ is this project's config, hooks fire immediately
```

No global changes at all. Good for evaluating YURI before docking it into your own
projects.

### Path C — as a Claude Code plugin (published-release install)

The cleanest docking, shipping with the tagged release:

```bash
claude plugin add https://github.com/nexuslinkproductions/YURI.git
```

Plugins install non-destructively, namespace YURI's skills (`/yuri:<skill>`), and
update with one command — no settings merge, no shell-rc edit. Prefer this once the
plugin-packaged release is published.

---

## After install

- **Set your persona.** Edit `_SYSTEM/persona.md` (seeded from the template). This is
  the voice and operating style YURI carries into every session. It never overrides
  the authority contract, protected paths, or your intent.
- **Optional `.env`.** Copy `.env.example` to `.env` for anything you want to tune
  (energy-gate observability, the dev-role key, persona overlay). Nothing is required.
- **Verify.** New session → the brain block at SessionStart, and `ai search "<query>"`
  returns results from the shipped research database.

## Updating

```bash
cd ~/yuri && git pull
./yuri-init.sh --apply    # re-merge cleanly (idempotent — never duplicates)
```

## Detaching

```bash
cd ~/yuri && ./yuri-init.sh --remove
```

This strips YURI's hooks (restoring your own), removes the skill/command links, and
keeps a timestamped settings backup. Your configuration returns to exactly what it
was.

---

## Fleet & MURE (optional, DISARMED by default)

YURI includes a 20-role governed company (MURE) for multi-lane work. **Nothing spends API quota until you arm.**

```bash
node _SYSTEM/mure/mure.mjs --validate
node _SYSTEM/mure/mure.mjs --demo
node _SYSTEM/Scripts/runFleet.mjs --task-file task.json --dry-run
```

**Arming ceremony (owner-only):**

```bash
touch _SYSTEM/state/mure.enabled
touch _SYSTEM/state/glm-fleet.enabled
touch _SYSTEM/state/swarm-convergence.enabled
# optional: touch _SYSTEM/state/ollama-fleet.enabled
```

Requires z.ai / Ollama / Cursor keys for live lanes. See [`02_RESOURCES/GUIDES/yuri-first-30-minutes.md`](02_RESOURCES/GUIDES/yuri-first-30-minutes.md) and [`02_RESOURCES/GUIDES/fleet-router-adopter-guide.md`](02_RESOURCES/GUIDES/fleet-router-adopter-guide.md).

**Disarm after use:** `rm _SYSTEM/state/*.enabled` (fleet flags only).

---

## What it does and does not touch

**Touches (reversibly):** `~/.claude/settings.json` (backed up, additively merged),
`~/.claude/skills/` and `~/.claude/commands/` (new symlinks only, never overwriting
yours), one `export YURI_ROOT` line in your shell rc.

**Never touches:** your project files, your git history, your secrets. YURI ships a
fail-closed guard layer that treats `.env`, credentials, and a defined set of
protected paths as off-limits — see [`SECURITY.md`](SECURITY.md).

**The author's own machine:** `yuri-init` detects the in-repo dev setup (where
`~/.claude` is symlinked into the repo) and refuses to run, so it can never merge the
repo into itself.
