---
name: constitution
description: Generate or display the YURI-OS-MUSUBI project constitution — anime DNA gates, hard rules, authority chain — auto-derived from _SYSTEM/yuri-origin.md + memory/feedback_*.md. Spec Kit equivalent of /constitution but YURI-OS-MUSUBI-native.
triggers:
  - "/constitution"
---

# /constitution — YURI-OS-MUSUBI Project Constitution

When invoked, generate or display the project constitution (read-only by default).

## Phase 1 — Read Authority Sources

```bash
cat _SYSTEM/yuri-origin.md     # canonical contract
cat SOUL.md                    # persona contract
ls memory/feedback_*.md        # all hard rules
cat .claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/MEMORY.md  # rule index (gitignored)
```

## Phase 2 — Constitution Output

Render to stdout (or `--write _SYSTEM/CONSTITUTION.md`):

```markdown
# YURI-OS-MUSUBI Constitution
Generated: <YYYY-MM-DD HH:MM>
Source authority: _SYSTEM/yuri-origin.md (canonical) + memory/feedback_*.md (rules)

## Authority Chain
1. Owner intent
2. Direct local evidence (git/tool/filesystem)
3. _SYSTEM/yuri-origin.md
4. SOUL.md (persona)
5. AGENTS.md, CLAUDE.md, _SYSTEM/spec-kit-workflow-bridge.md
6. Scripts/offload-contract.mjs (executable routing)
7. References / skills
8. Model inference (lowest)

## Anime DNA Gates (mandatory before mutation)
- non-destructive-infinity-guard: action boundary + mutation gate
- pattern-mirror-core (Sharingan): observe before construct
- parallel-clone-orchestrator (Shadow Clone): default dispatch shape
- execution-domain-core (Domain Expansion): scope-lock + exit criteria
- failure-evolution-loop (Zenkai): root-cause + regression on every break
- probabilistic-decision-core: calibrated EV-based decisions

## Hard Rules (loaded every session via MEMORY.md)
<auto-extracted from memory/feedback_*.md frontmatter + first paragraph>

## Universal Workflow
intake → route → delegate → verify → merge → learn

## Symbiotic Pulse (always-on)
Claude (control) + Codex (implementation, primary) + DeepSeek (analysis + parallel implementation when explicitly named) + llama3.2 (local utility)

## Protected Surfaces
- backend/data/, .claude/state/, .claude/history/
- .env, secrets, credentials
- Conclave (never modify)
- T7 paths (/Volumes/T7/YURI-OS-MUSUBI — sync mirror, never mass-rewrite)
- node_modules/

## What's Forbidden
- Anthropic model agents (Agent() with Claude/Haiku/Sonnet/Opus)
- WebSearch/WebFetch (Perplexity app via computer-control instead)
- Modifying offload-contract.mjs without route-plan evidence
- Skipping CLAUDE CONTROL PACKET on direct Edit/Write
- Skipping CODEX TASK SPEC on Codex dispatches
```

## Phase 3 — Optional Persistence

If `--write _SYSTEM/CONSTITUTION.md` is passed, write the rendered constitution to disk. Otherwise stdout-only.

## Authority Boundaries

- This command is READ-ONLY by default (just renders existing rules)
- `--write` flag does write to `_SYSTEM/CONSTITUTION.md` (CLAUDE CONTROL PACKET applies)
- Does NOT replace or override `_SYSTEM/yuri-origin.md` — derives from it
- Constitution is a CONVENIENCE rendering of rules already enforced via:
  - MEMORY.md index (loaded at SessionStart)
  - bash-security-guard.js (hard blocks)
  - tirith-url-guard.js (URL risk)
  - claude-protocol-guard.js (control packet checks)

## Spec Kit Equivalence

Spec Kit defines `/constitution` as a project-rules doc generated from team conventions. YURI-OS-MUSUBI's version derives instead from yuri-origin (authority) + anime DNA gates (technique) + memory/feedback (locked rules). Same purpose, different source authority.

## When to Use

- Onboarding doc for new collaborators / future sessions
- Cross-team handoff (sharing project constraints in one doc)
- Pre-EOT verification (does current state match constitution?)

## When to Skip

- Single-session bug fix
- Quick lookup (just read individual memory/feedback_*.md instead)
