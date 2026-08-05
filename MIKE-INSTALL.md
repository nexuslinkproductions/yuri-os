# MIKE-INSTALL — OMP execution contract for the `mike` branch

**Audience: OMP itself.** This file is meant to be fed straight to OMP as an
instruction set, not read by a human first:

```bash
omp --allow-home @MIKE-INSTALL.md      # before clone, running from $HOME
# — or, once you already have a checkout —
omp @MIKE-INSTALL.md                   # from inside the checkout
```

OMP is the installer executor for this runbook. Claude Code, or any other
terminal AI, is **not required** to run any step below — OMP alone is
sufficient. Every step is a shell command or an `omp` subcommand; run them in
order, top to bottom. Steps are idempotent — re-running this file after a
partial failure is safe and does not duplicate state.

**Owner of this checkout: MIKE.** Nothing in this file may read, copy, or
reference Marcel's machine-global OMP state. See "Global-auth exclusion"
below before step 1.

---

## 0. Preflight — verify prerequisites

Run each check. If any fails, stop and fix it before continuing (fix
instructions are inline).

```bash
git --version                          # any recent git; must print a version
node --version                         # must be v20.19.x or newer
npm --version                          # ships with Node; must print a version
omp --help >/dev/null && echo "omp: OK"
```

- `git --version` fails → install Git for your OS, re-run this section.
- `node --version` prints < v20.19 or command not found → install Node.js
  20.19+ (nvm, official installer, or your package manager), re-run this
  section.
- `npm --version` fails → npm ships with Node; reinstall Node.js.
- `omp --help` fails → you are not running this file the way it is meant to
  be run (it must already be inside an `omp` session to execute this
  contract) — install/launch OMP first, then re-invoke
  `omp --allow-home @MIKE-INSTALL.md`.

**Success evidence for this section:** all four commands print a version or
`omp: OK`, no non-zero exit.

---

## 1. Clone — `mike` branch only, single-branch, no other refs

```bash
test -d ~/yuri-mike/.git \
  && echo "checkout already present — skipping clone, continue at step 1a" \
  || git clone --single-branch --branch mike \
       https://github.com/nexuslinkproductions/yuri-os.git ~/yuri-mike
cd ~/yuri-mike
```

The guard above makes this step idempotent: a fresh machine clones; a
re-run against an existing checkout skips straight to verification instead
of erroring on a non-empty target directory.

**Repository identity.** This clones the canonical collaborator repo —
`nexuslinkproductions/yuri-os.git`, `mike` branch — which is separate from
the generic public distribution repo (`nexuslinkproductions/YURI.git`)
referenced by `INSTALL.md`'s Path A/B/C for non-collaborator installs. The
two are different repos for different audiences; nothing below reads from
or writes to the `YURI.git` path.

### 1a. Verify branch and repo root

```bash
cd ~/yuri-mike
git rev-parse --is-inside-work-tree                # must print "true"
git branch --show-current                           # must print "mike"
git remote get-url origin                            # must print the yuri-os.git URL above
git status --porcelain                                # must print nothing (clean tree)
```

**Failure recovery:** if `git branch --show-current` prints anything other
than `mike`, run `git fetch origin && git checkout mike` and re-verify. If
the tree is not clean immediately after clone, something external touched
the checkout — `git status` to see what, then `git checkout -- .` to
discard, or investigate before proceeding (never auto-discard changes you
did not make).

**Success evidence for this section:** `true` / `mike` / the yuri-os.git URL
/ empty status output, in that order.

---

## 2. Global-auth exclusion (read before step 3)

This checkout must never read or copy any of the following from Marcel's
machine — not the files, not their contents, not derived config built from
them:

- `~/.omp/agent/config.yml` (model roles, provider list, retry chains)
- `~/.omp/agent/.env` (provider API keys)
- `~/.omp/agent/agent.db` (OAuth tokens / API keys per provider)
- `~/.omp/agent/models.db`, `~/.omp/agent/history.db`
- `~/.omp/agent/sessions/`, `~/.omp/agent/memories/`
- `~/.omp/agent/agents-archived-mure-*/`
- `~/.omp/logs/`, `~/.omp/run/`

MIKE's OMP identity (auth, sessions, provider credentials) is separate and
MIKE-owned from first launch. If `~/.omp` already exists on this machine
from a different install, do **not** merge or symlink into it — use a fresh
profile instead:

```bash
omp --profile mike --allow-home @MIKE-INSTALL.md   # optional: isolate MIKE's OMP state explicitly
```

Using `--profile mike` from here on is recommended if this machine has ever
run OMP as anyone else. It is not required if this is a clean machine with
no prior `~/.omp`.

**Success evidence for this section:** none of the paths above are read,
copied, or referenced by any command that follows (verified by inspection —
grep this file for `~/.omp/agent` and confirm the only mentions are in this
exclusion list).

---

## 3. Bootstrap — `yuri-init.sh` dry-run, then apply

```bash
cd ~/yuri-mike
./yuri-init.sh                 # dry-run: prints the plan, changes nothing
```

Read the printed plan. It must show: dependency install, persona seed,
`YURI_ROOT` export, Claude-settings merge (if a `~/.claude` exists on this
machine), skill/command linking, and MURE/OMP projection sync + fleet
validate + fleet demo. Nothing in the dry-run output performs a write —
confirm the plan is what you expect, then apply:

```bash
./yuri-init.sh --apply
```

`--apply` is idempotent — re-running it re-merges cleanly and never
duplicates hooks, links, or state.

**Failure recovery:** if `--apply` exits non-zero, re-run the dry-run
(`./yuri-init.sh`) to see the plan again, fix the reported blocker (missing
`node`/`git` on PATH, a permissions issue on `~/.claude`), and re-run
`--apply` — safe to repeat.

**Success evidence for this section:** `--apply` exits 0 and prints
`✓ YURI docked.` (or the MURE/OMP sync+validate+demo lines it now runs as
part of apply, per the plan you reviewed) with no error lines above it.

---

## 4. Verification harness — the one command that proves the install

```bash
cd ~/yuri-mike
node _SYSTEM/Scripts/mike-handoff-verify.mjs
```

This is the authoritative MIKE handoff verification harness. It is the
final word on whether this checkout is correct — treat its exit code as the
gate: 0 = pass, non-zero = do not proceed to arming or provider auth until
it is fixed.

**Failure recovery:** re-run `./yuri-init.sh --apply` (step 3) if the
harness reports drift in the OMP projection or MURE fleet state, then
re-run the harness. If it still fails, the specific check it names is the
next thing to fix — do not skip ahead.

**Success evidence for this section:** the harness exits 0 and reports pass
on every check it runs (branch identity, clean git state, OMP projection
integrity, MURE fleet validation, Blender absence on disk + git index). The
harness's Blender-absence check does not cover skill-index manifests — see
the separate skill-index check in step 8.

---

## 5. List MURE/OMP agents and models (read-only, no spend)

```bash
node _SYSTEM/mure/mure.mjs --roster              # 20-role MURE company, role/substrate/governance
node _SYSTEM/mure/mure.mjs --status              # arming state: MURE / Cline / Evolver, each DISARMED or ARMED
node _SYSTEM/mure/omp-agent-inventory.mjs --list # every mure-* agent card projected into OMP
node _SYSTEM/mure/omp-agent-inventory.mjs --json           # full inventory JSON: agents, variant counts, model-ref count, generated timestamp (single-mode CLI — --list | --models | --json are mutually exclusive, only the first arg is read)
omp models                                        # every model OMP itself can see, grouped by provider
```

These are inspection commands only — none of them spend API quota or arm
anything. Run them any time to see what MIKE's checkout is carrying before
deciding what to authenticate.

**Success evidence for this section:** `--roster` prints 20 roles;
`--status` prints three DISARMED lines (see step 6); `--list` prints the
`mure-*` card names; `omp models` prints a provider-grouped list (may be
short or empty until step 7 authenticates providers).

---

## 6. MURE stays DISARMED until MIKE explicitly arms it

Do not touch this section unless you (MIKE) have decided to arm the fleet.
`yuri-init.sh --apply` in step 3 runs MURE's projection sync, fleet
validate, and fleet demo — none of those are the same as arming; they are
inspection/projection operations. Arming is a separate, explicit, owner-only
action:

```bash
node _SYSTEM/mure/mure.mjs --status   # confirm current state before any arming decision
```

Expected output right after install: `MURE: DISARMED`, `Cline: DISARMED`,
`Evolver: DISARMED`. This is correct and required — leave it this way until
you have a specific task that needs live fleet spend.

**When you (MIKE) are ready to arm**, there is no single universal
ceremony. `_SYSTEM/mure/README.md` §6.3 ("The four arm flags") is the
canonical reference: four core flags (master MURE arm, GLM fleet,
swarm-convergence, Ollama sidecar) plus role-specific additional arms
(evolver self-modification, Cline sidecar, z.ai tmux sidecar) — each gates
a different lane/provider, and which ones apply depends entirely on which
provider(s) MIKE authenticates in step 7. Read §6.3 before touching any of
them. The master flag is always required first:

```bash
touch _SYSTEM/state/mure.enabled      # master MURE arm — required for any live dispatch
```

Then add only the lane-specific flag(s) matching the provider(s) actually
authenticated, e.g.:

```bash
touch _SYSTEM/state/cline-fleet.enabled       # ClinePass sidecar — only if authenticating Cline
# touch _SYSTEM/state/glm-fleet.enabled       # z.ai GLM fleet — only if authenticating z.ai
# touch _SYSTEM/state/ollama-fleet.enabled    # Ollama Cloud sidecar — only if authenticating Ollama
# touch _SYSTEM/state/evolver.enabled         # owner-gated evolver role — only if you need it
```

**To disarm again**, `rm` whichever flags you set (see
`_SYSTEM/mure/README.md` §6.3 for the full list — all flags are gitignored
`_SYSTEM/state/*.enabled` files):

```bash
rm -f _SYSTEM/state/*.enabled
```

Arming spends API quota against whatever providers are authenticated (step
7). Do not arm before you have decided which providers MIKE is authorizing,
and never treat any specific flag combination above as "the" full-fleet
ceremony — arm only the lanes you actually need.

---

## 7. Human-only authentication — STOP, this step cannot run inside this script

**Everything below this line requires a human at a keyboard completing an
OAuth/login flow or pasting an API key. No command in this file, and no
prior step, can or should attempt this on MIKE's behalf. If you are an
automated agent executing this file unattended, stop here and hand control
back to MIKE.**

```bash
omp setup --check          # reports which optional OMP dependencies are already present
omp setup                  # interactive: walks through onboarding for anything missing
omp models                 # after auth, re-run to confirm new providers now list models
omp usage                  # shows live usage/limits for every currently authenticated provider
```

`omp setup` is where MIKE performs whatever provider logins are relevant
(Anthropic, OpenAI/Codex, GitHub-backed providers, or any other OMP-
supported provider). This is a human-interactive flow — there is no
non-interactive equivalent, by design, so that no credential ever touches
this file or this checkout's git history.

**Until MIKE completes this step:**

- `omp models` will list fewer providers/models than the full catalog — any
  provider not yet authenticated shows no models.
- `_SYSTEM/mure/mure.mjs --roster` still shows all 20 roles and their
  intended provider/model bindings, but roles bound to an unauthenticated
  provider cannot actually be dispatched — they are catalogued, not
  executable, until `omp usage` shows that provider as authenticated.
  (This mirrors the repo-wide provider-route-eligibility rule: catalog
  presence is not the same as dispatch eligibility.)
- Any MURE role marked `owner-gated` (helmsman, steward, evolver) additionally
  requires MIKE's explicit arming from step 6 — authentication alone does
  not make an owner-gated role dispatchable.
- GitHub-integration features (if any provider route depends on a GitHub
  App / OAuth token) remain unavailable until that specific login is
  completed — `omp setup` will name which one.

**Failure recovery:** if `omp setup` fails partway (network drop, wrong
code pasted), it is safe to re-run — it does not duplicate or corrupt
existing auth for providers already completed. `omp usage --provider
<name>` isolates a single provider's state if you need to debug just one.

**Success evidence for this section:** `omp usage` lists at least one
authenticated provider with live usage/limit data (not an empty table), and
`omp models` shows models under that provider's heading.

---

## 8. Blender exclusion — intentionally absent from `mike`

The `mike` branch deliberately excludes Blender-specific assets present on
other branches (e.g. `rene`). Verify absence on disk and in the git index:

```bash
test ! -e _SYSTEM/blender && echo "OK: _SYSTEM/blender absent"
test ! -e .claude/skills/cgs-mold && echo "OK: .claude/skills/cgs-mold absent"
test ! -e skills/cgs-mold && echo "OK: skills/cgs-mold absent"
test ! -e 01_PROJECTS/blender-department && echo "OK: 01_PROJECTS/blender-department absent"
test ! -e 01_PROJECTS/blender-hk45 && echo "OK: 01_PROJECTS/blender-hk45 absent"
```

The five checks above (and `mike-handoff-verify.mjs`'s own Blender-roots
check in step 4/9) prove disk + git-index absence only. They do **not**
catch a stale reference left behind in a skill *index* manifest — `cgs-mold`
can be fully removed from disk and the git index while
`skills/skill-index.json` or `_SYSTEM/skill-hash-registry.json` still lists
it. Check for that separately:

```bash
grep -l '"cgs-mold"' skills/skill-index.json _SYSTEM/skill-hash-registry.json 2>/dev/null \
  && echo "STALE: cgs-mold still referenced in a skill index — remove the entry" \
  || echo "OK: no skill-index reference to cgs-mold"
```

**Success evidence for this section:** all five `OK:` lines print, and the
skill-index check prints `OK: no skill-index reference to cgs-mold`. No
Blender addon, no Blender-MCP skill, no Blender-dependent project directory,
and no dangling skill-index entry for one exists on this branch — this is
by design, not an oversight.

## 9. Final success checklist

Run every command below in one pass. All must hold simultaneously for the
install to be considered complete:

```bash
# Branch identity
[ "$(git branch --show-current)" = "mike" ] && echo "PASS: on branch mike"

# Clean git state
[ -z "$(git status --porcelain)" ] && echo "PASS: clean git tree"

# OMP projection integrity
node _SYSTEM/Scripts/mure-omp-sync.mjs --check && echo "PASS: OMP projection matches catalog, no drift"

# MURE fleet validation + demo (inspection, zero spend)
node _SYSTEM/mure/mure.mjs --validate && echo "PASS: fleet validate ran"
node _SYSTEM/mure/mure.mjs --demo && echo "PASS: fleet demo ran (zero-spend plan)"

# The authoritative handoff harness
node _SYSTEM/Scripts/mike-handoff-verify.mjs && echo "PASS: mike-handoff-verify.mjs exits 0"

# Blender absence (all five, see section 8) + no dangling skill-index entry
test ! -e _SYSTEM/blender \
  && test ! -e .claude/skills/cgs-mold \
  && test ! -e skills/cgs-mold \
  && test ! -e 01_PROJECTS/blender-department \
  && test ! -e 01_PROJECTS/blender-hk45 \
  && ! grep -ql '"cgs-mold"' skills/skill-index.json _SYSTEM/skill-hash-registry.json 2>/dev/null \
  && echo "PASS: Blender assets absent (5/5 roots) and no skill-index reference"

# No copied global auth — no credential artifact is tracked in this checkout
# (note: .omp/config.yml IS legitimately tracked — it's the generated MURE
# projection, not a secret; only .env / *.db files would indicate a leak),
# and the only authenticated providers are the ones MIKE completed in step 7
! git ls-files | grep -qE '(^|/)\.env$|agent\.db$|history\.db$|models\.db$' \
  && echo "PASS: no credential artifact committed to this checkout"
omp usage --json   # inspect by hand: every listed account must be one MIKE
                    # personally authenticated in step 7 — none inherited
```

Install is complete when every `PASS:` line above prints and no command in
this checklist exits non-zero. At that point:

- The checkout is on `mike`, at a clean commit, with OMP's projection and
  MURE's catalog in agreement.
- MURE/Cline/Evolver are DISARMED — no spend has occurred.
- No Blender asset, and no dangling skill-index reference to one, exists on this branch.
- No credential, session, or config was copied from Marcel's machine — auth
  status reflects only what MIKE completed in step 7 (`omp usage` is the
  live source of truth for that, not this checklist).

If any check fails, do not consider the install done — return to the
numbered section above that owns that check (git state → step 1a; OMP
projection → step 3; MURE validate/demo/harness → step 3–4; Blender
absence → this branch is wrong, re-clone per step 1; skill-index reference
→ remove the stale `cgs-mold` entry from `skills/skill-index.json` /
`_SYSTEM/skill-hash-registry.json`, per step 8; auth → step 7) and resolve
it before re-running this checklist.
