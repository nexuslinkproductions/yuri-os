---
name: claude-remote-control-2026-06-06
description: The feature for phone-driven / MacBook-continuous Claude Code is REMOTE CONTROL (not "cowork"). Verified LIVE on this CLI (v2.1.158): `claude remote-control` / `--remote-control [name]`. Steer an always-on local MacBook session from claude.ai/code or the Claude mobile app.
metadata: { node_type: reference, date: 2026-06-06, status: verified-actionable, citation_trust: docs-cited }
tags: remote_control, cowork, mobile, claude_code, continuous, multi-project
---

> Researched by the claude-code-guide agent + VERIFIED against the live CLI (v2.1.158 — `claude remote-control --help` confirms it). Advisory on the rate-limit/preview specifics (verify on Marcel's plan); the command itself is confirmed present.

## The disambiguation (key)
Boris Cherny's "manage many large projects from your phone" feature is **REMOTE CONTROL**, NOT a product called "cowork." ("Claude Cowork" is a SEPARATE non-developer file-management agent — unrelated.) Remote Control = steer an always-on Claude Code session running LOCALLY on the MacBook, from the phone (claude.ai/code or the Claude mobile app) or any browser. Work executes on the MacBook; the phone is a remote window + steering surface. Exactly Marcel's "phone-driven, MacBook-continuous" goal.

## Verified on this machine
- `claude --version` → 2.1.158 (well past the ~2.1.51+ the feature needs).
- `claude remote-control --help` → "Control local sessions from claude.ai/code or the Claude mobile app". `--name <name>` flag.
- Also `claude --remote-control [name]` flag on a normal interactive session.

## Limit increase (Boris's point)
2026-05-06 Anthropic ~DOUBLED Claude Code's 5-hour rate limits (Pro/Max/Team/Enterprise) — ~2× inference budget/session. Remote Control INHERITS the session limit. Concurrent sessions POOL the quota (3 parallel ≈ quota ÷ 3, NO per-session cost multiplier). Requires a Claude SUBSCRIPTION (not API key). Research-preview status (can change).

## Exact first steps (phone-driven, MacBook-continuous)
```bash
# MacBook (always-on terminal)
cd ~/YURI-OS-MUSUBI
claude remote-control --name "YURI Control Plane"     # (--capacity N for many parallel sessions; server mode)
# Phone: install Claude app → sign in (same account) → Code → tap "YURI Control Plane" → steer
# Notifications: /config → enable "push when Claude needs input / task done"
# Many parallel large-project tasks: use git worktrees per session for filesystem isolation
```

## Fit for YURI (multi-large-project) + the caveat
- `--capacity` lets Marcel run many remote sessions (e.g. one per branch/module) and drive them from the phone.
- ADVERSARIAL-ALLY CAVEAT: the Claude quota is POOLED across concurrent Remote Control sessions — heavy parallel work is quota-aggressive. (Note: the YURI standing FLEET — Codex/DeepSeek lanes — runs on SEPARATE provider quotas via codex-offload-runner/llm-lane, so it does NOT draw the Claude session quota; only parallel Claude sessions pool.) Tune capacity to the actual budget.
- If the MacBook sleeps, the session suspends + resumes on wake (tolerates ≤~10min network blips).

## Sources (cited, verify before formal use)
- code.claude.com/docs/en/remote-control · code.claude.com/docs/en/agent-teams · anthropic.com/news/higher-limits (2026-05-06) · simonwillison.net/2026/May/6/ (Code w/ Claude live blog).

## Recommendation
ADOPT Remote Control now (it's live on the CLI). It directly enables Marcel's phone-driven / MacBook-continuous workflow for steering the YURI build — the standing-fleet orchestration keeps running on the MacBook while Marcel steers from his phone. First experiment: `claude remote-control --name "YURI Control Plane"` on the MacBook, connect from the Claude mobile app, run one bounded task end-to-end from the phone.
