# YURI Mode Toggle (Build ⇄ Research) — Prepared Spec (2026-06-05)

> Marcel's idea, prepared: a user-facing toggle to switch YURI between **dev/build controls** (editing, full mutation) and **user/research controls** (normal use — read, research, safe tasks) — for YURI shipped as an extension to OpenClaw + Claude Code users. Grounded in the live levers (`energy-enforce.enabled` flag, `.claude/settings.json` `permissions.{allow,deny}`, `activeRole()`, the existing `YURI_CLAUDE_MODE` env). Advisory until built + owner-greenlit. **Shipping-safe** — neutral labels only (no private persona overlay).

## The honest thesis (read this first — it reframes the whole bash-guard saga)
A **security boundary** and a **self-toggle mode** are different animals, and conflating them is the trap:
- A **security role** (our `dev`/`coworker` split — `activeRole()`, credential-gated via `_SYSTEM/SELF/dev-credential.json`, **fail-closed**) protects you from a *less-trusted other party*. It must be unbypassable and the restricted party **cannot** lift it without the trust root. That is what `bash-security-guard.js` enforces — and exactly why 4 hardening rounds hit an unbounded obfuscation tail (`source payload.sh` is uncatchable at the string layer). A regex can't win an arms race against someone who *wants* to bypass it.
- A **convenience mode** (this feature) is the *same person* flipping their *own* capability based on intent ("I'm researching, don't mutate my repo without asking"). It has **no adversary**, so it does **not** need to be unbypassable. It's a **guardrail**, not a fortress: friction + intent-scope, fail-OPEN-on-toggle **by design**.

**Consequence:** for a single-user Claude Code / OpenClaw extension, the relevant feature is the *mode*, and it dissolves the bash-guard problem — the security-grade hardening only matters when there's a genuinely untrusted local operator (multi-tenant), and that boundary belongs at the OS/sandbox/harness-permission layer, not a command-string matcher. Two orthogonal axes; keep them separate.

## What it's the product surface of (the plumbing already exists)
A mode is a **named preset over levers we already built/hardened this session** — one switch flips all of them coherently:
| Lever | Mechanism (verified) | DEV / BUILD mode | RESEARCH / USER mode |
|---|---|---|---|
| **Energy conscience** | `energy-enforce.mjs` → `enforceEnabled()` reads `_SYSTEM/state/energy-enforce.enabled` (file-based, flips LIVE, default OFF) | advisory (METRICS_ONLY) | **armed** (block on catastrophic verdict) |
| **Permission plane** | `.claude/settings.json` `permissions.{allow,deny}` (Claude Code native — 71 deny / 13 allow) | full mutation allowed | writes scoped to safe dirs; protected surfaces hard-denied; destructive bash denied |
| **Mutation posture** | PreToolUse ask-vs-auto (Claude Code accept-edits / plan mode) | act (auto) | **confirm-before-mutate** (ask) |
| **Protected-surface lock** | PC-1 single-sourced `lane-kernel.PROTECTED_SURFACE_PREFIXES` + `ROLE_TRUST_SURFACES` | standard | read-only on `_SYSTEM/Scripts`, hooks, config |
| **Tooling** | tool gating | all tools | reads + web/research + safe writes; no force-push, no destructive |
| **Network / research** | — | full | full (research is the *point* of this mode) |

The shape is the unification of the energy gate + PC-1 + the settings posture: **the user picks intent; one switch sets the conscience, the permission plane, and the lock together.**

## The toggle mechanism (single source of truth)
- **One mode signal**, read by every PreToolUse hook: extend the existing `YURI_CLAUDE_MODE` env (canonical) + a live state file `_SYSTEM/state/yuri-mode` (so it flips mid-session without a restart, mirroring how `energy-enforce.enabled` already works).
- **A command:** `/yuri-mode <build|research>` (neutral) or `ai mode <…>` → (1) writes the mode signal; (2) touches/removes `_SYSTEM/state/energy-enforce.enabled`; (3) selects the settings permission preset (or the hooks read the mode and adjust); (4) confirms the new posture in one line.
- **Hooks read the mode, not a scatter of flags.** `energy-enforce.mjs`, the bash guard, and the write guard each consult the single mode signal and set their posture. No divergent per-hook config (the PC-1 single-sourcing discipline, applied to mode).
- **Default on install:** `research` (safe-by-default for a normal user); `build` is the deliberate opt-in for editing sessions.

## How the two axes compose (don't merge them)
- **Single-user extension (the common case):** mode only. No credential role needed — the user is the owner; they flip build⇄research for their own safety/intent.
- **Multi-trust (shared agents, OpenClaw with an untrusted operator):** the security **role** (credential-gated, fail-closed) is the boundary; **mode** is each user's per-session guardrail on top. Role gates *who can elevate*; mode gates *what this session intends*. A `coworker` can pick research-mode but cannot flip to build-mode's protected-surface unlock without the trust root — that's the boundary the role still owns.

## Build roadmap (leverage order, greenlight-gated)
1. **The mode signal + reader** — canonicalize `YURI_CLAUDE_MODE` + `_SYSTEM/state/yuri-mode` as the single source of truth; a tiny `readMode()` in `lane-kernel` (or a sibling) that every hook imports (single-source, like PC-1). *Small, foundational.*
2. **Two presets + the toggle command** — `/yuri-mode build|research` flips the energy flag + the permission preset + the lock, prints the posture. *Small/medium.*
3. **Hook posture wiring** — `energy-enforce.mjs` + the guards consult `readMode()`; research-mode = enforce armed + writes scoped + confirm-before-mutate. *Medium — touches live hooks, verify like PC-1.*
4. **Settings presets** — two `permissions` profiles (build vs research) the toggle swaps, or a hook-level overlay. Lean on Claude Code's native plane so it feels native to those users. *Medium.*
5. **(multi-trust, optional)** — bind mode to the credential role so a `coworker` is capped at research-mode capability. *Owner-gated.*

## Honest boundaries (keep it sober)
- **It's a guardrail, not a sandbox.** A user in research mode can flip to build mode — that's *intended*. Never market it as protection against a malicious local actor.
- **The hard boundary for genuine multi-trust** stays where we concluded it belongs: the credential **role** (fail-closed) + OS sandbox + the harness `settings.json` deny-list (which a session can't edit mid-flight). Mode rides *on top*; it does not replace them.
- **Don't conflate mode with the dev/coworker credential role.** Orthogonal axes — intent vs identity. Document the composition; don't let a mode toggle silently grant role-level trust.
- **Shipping-safe.** Neutral labels (`build`/`research`, not the private overlay); reuse Claude Code's native permission primitives (plan mode, accept-edits, allow/deny) so OpenClaw + Claude Code users feel it as native, not bolted-on.

## SEE
- `02_RESOURCES/RESEARCH/nemotron-framework-adapter-spec-2026-06-05.md` (same prepared-spec shape) · `[[bash-guard-role-matcher-lexical-bypass]]` (why the security wall is the wrong layer for a self-toggle) · `[[feedback-gate-hardening-fail-closed]]`
- Live levers: `.claude/hooks/energy-enforce.mjs` (`enforceEnabled`) · `.claude/hooks/bash-security-guard.js` (`activeRole`) · `.claude/settings.json` (`permissions`) · `_SYSTEM/Scripts/lane-kernel.mjs` (`PROTECTED_SURFACE_PREFIXES`, `ROLE_TRUST_SURFACES`)
