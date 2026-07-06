---
name: claude-cowork-and-remote-control-2026-06-06
description: TWO complementary Claude features for "phone-driven / continuous, many large projects" — (1) Claude COWORK (Desktop-app agentic file/folder work; June 5–Jul 5 2026 promo DOUBLES the 5h limit) and (2) REMOTE CONTROL (steer a local Claude Code session from phone/web, verified live on this CLI v2.1.158). Cowork SKIPS folders overlapping protected locations / home-root — which is why YURI-OS-MUSUBI was refused.
metadata: { node_type: reference, date: 2026-06-06, status: corrected, citation_trust: support-docs-fetched }
tags: cowork, remote_control, mobile, desktop_app, continuous, protected_paths, june_promo
---

> CORRECTION: an earlier draft wrongly said "it's Remote Control NOT cowork." Both are REAL + complementary. Sourced from support.claude.com (fetched) + verified vs the live CLI + Marcel's desktop-app screenshot.

## Claude COWORK (what Boris meant)
- Agentic feature in the **Claude Desktop app** (macOS/Windows), paid plans (Pro/Max/Team/legacy Enterprise; NOT Free / consumption-Enterprise). Claude works on your computer with access to files, browser, connected services, apps.
- **June 2026 usage promotion: Jun 5 → Jul 5 2026 (11:59pm PT), the 5-HOUR usage limit in Cowork is DOUBLED** (weekly limits unchanged), auto-applied, no action. → this is the limit increase Boris referenced for "manage many large projects at once."
- SAFETY (support article 13364135): Cowork SKIPS folders that **overlap a protected location or are the home/root directory**. Guidance: "create a **dedicated working folder** for Claude rather than granting broad access" + "avoid granting access to local files with sensitive information." (The doc does NOT enumerate the exact protected list.)

## Why YURI-OS-MUSUBI was SKIPPED by Cowork (Marcel hit this)
`/Users/marcelspatz/YURI-OS-MUSUBI` is a DIRECT CHILD of the home dir AND contains exactly the surfaces Cowork's guard protects — `.env`, `.claude/state`, `backend/data`, secrets, `node_modules`, OS-kernel DBs. So Cowork refused broad agentic access. This is CORRECT/safe behavior, not a bug (it mirrors YURI's own protected-path discipline).

### FIX OPTIONS (open it / work around the skip)
1. **Scope Cowork to a clean SUBFOLDER** (recommended for Cowork specifically) — point it at a specific working area that does NOT contain .env/.claude/state/backend/data/secrets, e.g. a docs/research/draft subfolder, or a fresh `~/yuri-cowork-workspace`. A scoped non-protected folder won't trip the skip.
2. **Use REMOTE CONTROL for the full-repo DEV work** (recommended for what Marcel does with the build) — `claude remote-control --name "YURI Control Plane"` opens the WHOLE repo as a normal Claude Code session (no Cowork folder-restriction; YURI's own settings.json protected-path deny still guards .env/state), steerable from the Claude mobile app. This is the phone-driven / MacBook-continuous path for the actual YURI build + the standing fleet.
3. **Don't fight the guard** — Cowork blocking a secrets-laden home-child repo is the safe default; granting broad agentic access to it would be the riskier move.

## REMOTE CONTROL (verified live, v2.1.158)
`claude remote-control --name "..."` / `claude --remote-control [name]` → "Control local sessions from claude.ai/code or the Claude mobile app." Work runs on the MacBook; phone steers. Quota POOLS across concurrent Claude sessions (the YURI Codex/DeepSeek fleet uses SEPARATE provider quotas, so it doesn't draw the Claude session budget).

## Recommendation for YURI
- **YURI build / fleet / git (what we do together): Remote Control** on the full repo, steered from the phone, MacBook always-on. First step: `claude remote-control --name "YURI Control Plane"` → connect from the Claude app.
- **Cowork**: use for lighter file/document/folder agentic tasks on a DEDICATED scoped folder (not the protected-laden repo root); during Jun 5–Jul 5 the doubled 5h limit makes it cheap to try.

## Sources
support.claude.com/en/articles/15400594 (June promo) · support.claude.com/en/articles/13364135 (use safely) · code.claude.com/docs/en/remote-control · live CLI `claude remote-control --help` (v2.1.158).
