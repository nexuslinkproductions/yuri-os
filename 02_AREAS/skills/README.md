---
tags:
  - skills
  - tools
  - drafts
status: active
---

# Skills Draft Queue

This folder holds generated skill and tool drafts that came out of research.

## Rule

Drafts are not active until reviewed. This is the quarantine layer between research and reusable automation.

## Draft Structure

- `drafts/<slug>/SKILL.md`
- `drafts/<slug>/manifest.json`
- `drafts/<slug>/scripts/<tool>.js`

## Promotion Path

1. Research matures.
2. An artifact candidate note is created.
3. The factory generates a draft skill/tool package here.
4. The draft is reviewed.
5. Only then is it copied into `.claude/skills/`.

## Factory

- Generator: `/_SYSTEM/research-skill-factory/generate.js`
- Candidate template: `02_AREAS/research-intake/ARTIFACT-CANDIDATE.md`

