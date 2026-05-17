# Design Command Boundaries
**Date:** 2026-05-16 · **Source:** v15 upgrade C5 audit

## Decision: No unified /design dispatcher

The three design skills have distinct, non-overlapping scopes. A `/design --mode` dispatcher would add routing complexity without improving usability.

## Scope Map

| Skill | When to use | Scope |
|-------|-------------|-------|
| `/design-source-pack` | New design reference to extract (docs, PDFs, Figma exports) | Upstream extraction into reusable pack |
| `/design` (design-master) | Any YURI UI/CSS/HUD/component work | YURI-specific, learns from history, writes to design-memory.json |
| `/frontend-design` | External products, web landing pages, non-YURI interfaces | General web UI, production aesthetics, AI-slop prevention |

## Trigger Overlap Resolution

Both `design-master` and `frontend-design` list "build a UI" / "build the UI" as triggers. Routing rule:
- YURI internal surface → `design-master`
- External product / client-facing web → `frontend-design`
- New design reference arriving → `design-source-pack` first, then either executor

## No Action Required

Existing routing_notes in SKILL.md files already encode this. No code changes needed.
