# MURE CF3 — Factual Fixes (Before/After Edit Specs)

**Date:** 2026-07-07  
**Source:** `prep-C-corpus-consistency.md` consolidated action list items 1–3  
**Targets:** `.claude/CLAUDE.md` (fixes 1–2), `_SYSTEM/yuri-origin.md` (fix 3)  
**Evidence:** YURI-BUSINESS direct-commit upgrade landed in-repo on 2026-06-14 (`d7af8926`); adapters differ only in Standing Operating Model dispatch prose (YURI-BUSINESS still on 2026-07-04 two-substrate; YURI-OS on 2026-07-06 opus-fleet v2). `.amp/` is gitignored (`.gitignore:185`) and listed in both `.claude/CLAUDE.md:57` and root `CLAUDE.md:162` but absent from canonical `yuri-origin.md`.

---

## Fix 1 — Correct false YURI-BUSINESS commit-posture claim (`.claude/CLAUDE.md`)

**Problem:** Lines 26–27 and 41–44 assert YURI-BUSINESS is a "stale pre-06-14 approval-gated fork" while simultaneously granting it the same direct-commit authority (owner upgrade 2026-06-14). Both claims cannot hold; the adapter's Execution Rules are byte-identical to YURI-OS-MUSUBI. The only real staleness is the missing 2026-07-06 opus-fleet v2 dispatch-substrate refresh in Standing Operating Model — not commit authority.

**File:** `.claude/CLAUDE.md`

### Edit 1a — Workspace map bullet (lines 26–27)

**BEFORE:**

```
- `~/YURI-BUSINESS` — business sibling on the direct-commit model (owner directive 2026-07-05); its
  adapter is a stale pre-06-14 fork pending refresh (see Authority).
```

**AFTER:**

```
- `~/YURI-BUSINESS` — business sibling on the same direct-commit model as YURI-OS-MUSUBI (owner upgrade
  2026-06-14, commit `d7af8926`). Its Standing Operating Model still carries the 2026-07-04 two-substrate
  dispatch prose — pending the 2026-07-06 opus-fleet v2 refresh (dispatch only, not commit authority).
```

### Edit 1b — Authority & mutation bullet (lines 41–44)

**BEFORE:**

```
- **YURI-OS-MUSUBI & YURI-BUSINESS:** commit AND push the session's own work directly — no per-task
  approval gate (owner upgrade 2026-06-14, extended to YURI-BUSINESS 2026-07-05; git is reversible +
  tracked). The YURI-BUSINESS adapter still reads as a stale approval-gated fork — owner intent here
  overrides it until that adapter is refreshed to match.
```

**AFTER:**

```
- **YURI-OS-MUSUBI & YURI-BUSINESS:** commit AND push the session's own work directly — no per-task
  approval gate (owner upgrade 2026-06-14 in both repos — YURI-BUSINESS: `d7af8926`; git is reversible +
  tracked). No approval-gated fork remains; the only live adapter gap is YURI-BUSINESS's Standing
  Operating Model — still on the 2026-07-04 two-substrate dispatch prose until the 2026-07-06 opus-fleet
  v2 refresh lands there (dispatch substrate only).
```

---

## Fix 2 — Scope-qualify Memory section Track A default (`.claude/CLAUDE.md`)

**Problem:** Lines 70–79 carry no `(YURI repos)` scope qualifier unlike Wayfinding (`## Finding your way through YURI (wayfinding — YURI repos)`) and GitNexus (body-scoped to indexed repos). The unqualified "Ambiguous → Track A" rule routes every session — Labs included — to `_SYSTEM/Scripts/memory-kernel.mjs`, a path that does not exist outside YURI-OS/YURI-BUSINESS per the file's own Workspace-map rule (line 29).

**File:** `.claude/CLAUDE.md` (lines 70–79)

**BEFORE:**

```
## Memory (two tracks — route by audience)

- **Track A (YURI canonical):** facts other lanes need — projects, collaborators, IP constraints,
  durable architecture decisions → `_SYSTEM/Scripts/memory-kernel.mjs` (propose→decide→ledger).
- **Track B (Claude auto-memory):** my behavioral self-development with Marcel — comms preferences,
  tool-routing habits, voice/style, low-stakes self-correction → native Write into
  `~/.claude/projects/*/memory/` with v3 frontmatter (owner directive 2026-06-02; the
  `claude-memory-write.mjs` wrapper is optional validation, not a gate).
- Ambiguous → Track A. Never duplicate across tracks; cross-link by handle. Write on learning
  (write-on-learn), not at session end. Full spec: `claude-memory-write.mjs surfaces`.
```

**AFTER:**

```
## Memory (two tracks — YURI repos)

- **Track A (YURI canonical):** facts other lanes need — projects, collaborators, IP constraints,
  durable architecture decisions → `_SYSTEM/Scripts/memory-kernel.mjs` (propose→decide→ledger).
- **Track B (Claude auto-memory — every project):** my behavioral self-development with Marcel — comms
  preferences, tool-routing habits, voice/style, low-stakes self-correction → native Write into
  `~/.claude/projects/*/memory/` with v3 frontmatter (owner directive 2026-06-02; the
  `claude-memory-write.mjs` wrapper is optional validation, not a gate).
- In YURI repos: ambiguous → Track A. Never duplicate across tracks; cross-link by handle. Write on
  learning (write-on-learn), not at session end. Full spec: `claude-memory-write.mjs surfaces`.
```

---

## Fix 3 — Add `.amp/` to canonical Protected Surfaces (`_SYSTEM/yuri-origin.md`)

**Problem:** `yuri-origin.md` Protected Surfaces list (12 entries, lines 46–61) omits `.amp/`, which both adapters independently protect (`.claude/CLAUDE.md:57`, root `CLAUDE.md:162`) and which is deliberately gitignored. Per yuri-origin's own Canonical Shape rule ("keep it in the narrowest correct home"), the canonical source is the one behind.

**File:** `_SYSTEM/yuri-origin.md` (lines 50–61)

**BEFORE:**

```
- `backend/data/`
- `.claude/state/`
- `.claude/history/`
- `.claude/file-history/`
- `.claude/projects/*/history/`
- `.claude/projects/*/state/`
- `.claude/projects/*/file-history/`
- `.claude/projects/*/worktrees/`
- `.claude/projects/*/transcripts/`
- `.env`
- `node_modules/`
- secrets, API keys, credentials
```

**AFTER:**

```
- `backend/data/`
- `.claude/state/`
- `.claude/history/`
- `.claude/file-history/`
- `.claude/projects/*/history/`
- `.claude/projects/*/state/`
- `.claude/projects/*/file-history/`
- `.claude/projects/*/worktrees/`
- `.claude/projects/*/transcripts/`
- `.env`
- `node_modules/`
- `.amp/`
- secrets, API keys, credentials
```

---

## Acceptance checklist

| # | Fix | File | Status |
|---|-----|------|--------|
| 1 | YURI-BUSINESS commit-posture corrected; staleness scoped to 07-06 dispatch-substrate only | `.claude/CLAUDE.md` (2 hunks) | Spec ready |
| 2 | Memory Track A / ambiguous default scoped to YURI repos | `.claude/CLAUDE.md` | Spec ready |
| 3 | `.amp/` added to canonical Protected Surfaces | `_SYSTEM/yuri-origin.md` | Spec ready |
