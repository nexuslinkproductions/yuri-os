---
name: yuri-mode-toggle-idea
description: "Marcel's product idea (2026-06-05): a user-facing build⇄research mode toggle for YURI-as-extension (OpenClaw/Claude Code). KEY INSIGHT: a self-toggle MODE (guardrail) is a different axis from the credential ROLE (security boundary) — conflating them is what made the bash-guard a 4-round arms race. Spec'd."
metadata: 
  node_type: memory
  type: project
  tier: working
  scope: main
  trig: 
    - mode
    - toggle
    - dev mode
    - research mode
    - user mode
    - coworker
    - role
    - openclaw
    - extension
    - permissions
  refs: 
    - "[[bash-guard-role-matcher-lexical-bypass]]"
    - "[[feedback-gate-hardening-fail-closed]]"
    - "[[nemotron-framework-adapter-idea]]"
  originSessionId: 2448e5f4-5e5f-4625-bfa9-db81dc67ab4c
---

GOAL: a user-facing toggle to switch YURI between DEV/BUILD controls (editing, full mutation) and USER/RESEARCH controls (read/research/safe tasks) — for YURI shipped as an extension to OpenClaw + Claude Code users. WHEN: idea 2026-06-05. WHERE: prepared spec `02_RESOURCES/RESEARCH/yuri-mode-toggle-spec-2026-06-05.md`.

KEY DESIGN INSIGHT (the adversarial-ally reframe): a self-toggle MODE (guardrail, no adversary, fail-OPEN-on-toggle by design) is a DIFFERENT AXIS from the credential ROLE (dev/coworker security boundary, fail-closed, unbypassable). Conflating them is exactly what turned the bash-security-guard coworker gate into an unbounded 4-round obfuscation arms race — a regex can't be an unbypassable wall, and for a SELF-toggle it never needed to be. For a single-user extension the MODE is the right feature (cheap); the security ROLE only matters for genuine multi-trust, and THAT boundary belongs at OS/sandbox/the harness settings deny-list, not a command-string matcher. This validates the round-4 "document the residual, stop chasing, the hard boundary is elsewhere" call.

MECHANISM (it's the product surface of plumbing we already built): one mode signal (extend existing YURI_CLAUDE_MODE + a live `_SYSTEM/state/yuri-mode` file) read by every PreToolUse hook, flipping THREE live levers coherently — energy-enforce flag (`_SYSTEM/state/energy-enforce.enabled`, file-based live flip), `.claude/settings.json` permissions.{allow,deny} (Claude Code native), and the PC-1 single-sourced protected-surface lock. DEV = enforce advisory + full mutation; RESEARCH = enforce armed + writes scoped + protected locked + confirm-before-mutate. Default install = research (safe-by-default).

STATE: spec'd (nemotron-style). NOT built. Shipping-safe (neutral build/research labels, reuse Claude Code permission primitives). NEXT (greenlight-gated): mode signal + reader (single-source like PC-1) → 2 presets + `/yuri-mode` command → hook posture wiring → settings presets → (optional) bind mode to the credential role for multi-trust.

SEE: spec doc · [[bash-guard-role-matcher-lexical-bypass]] (why the wall was the wrong layer)
