# FABLE PASS 2 — CLAUDE.md Candidate Rationale

> What changed in `~/.claude/CLAUDE.md.fable-candidate` and why. Candidate only — the live
> `~/.claude/CLAUDE.md` is untouched; Marcel applies the swap on confirm. Corpus: 12 load-bearing
> files + catalog, all read; the 3 critical catalog findings re-verified against the actual
> filesystem, and one of them re-diagnosed.

---

## 1. The structural finding the catalog under-weighted

The current global (`~/.claude/CLAUDE.md`, 32 lines) opens with `@../CLAUDE.md` — which, through the
`~/.claude → YURI-OS-MUSUBI/.claude` symlink, pulls the **entire YURI-OS project spine into every
Claude session on the machine**: the 195-line YURI-OS adapter, which itself @-includes
`yuri-origin.md` (362) + `SOUL.md` (345) + `persona.md` (268). Consequences, verified:

- **A Labs/career-ops/impeccable session** is instructed to run `node _SYSTEM/Scripts/xref-query.mjs`
  (doesn't exist there), to run fleet-by-default dispatch, and to follow YURI-OS execution rules —
  broken instructions + behavior contamination in unrelated projects.
- **A YURI-BUSINESS session loads BOTH authority models at once:** "commit+push direct" (via the
  global's pull of the YURI-OS adapter) AND "do not commit or push" (its own adapter, line 298).
  The CRITICAL "authorization collision" is not primarily a two-file disagreement — it is the global
  *injecting one project's rules into the other project's sessions*.
- **In YURI-OS sessions the pull is redundant:** Claude Code loads the repo's own CLAUDE.md natively.

**Fix (the candidate's core move):** the global stops pulling any project adapter. It keeps only what
is genuinely machine-wide — identity/persona, safety floor, git discipline, memory routing, model
use, verification floor — and states that project spines load from project files. YURI-OS sessions
lose nothing (their adapter loads natively); every other session sheds ~900 lines of wrong-scope
context per session.

## 2. The three critical findings — verified rulings

**(1) Authorization collision — CONFIRMED, re-diagnosed.** `YURI-BUSINESS/CLAUDE.md` is a **stale
pre-2026-06-14 fork of the YURI-OS adapter** — its own header still says "Claude-facing adapter for
YURI OS / MUSUBI"; it carries the retired Codex-final-pass release-gate model, the superseded
"memory wrapper is the only write path" rule (overturned by owner directive 2026-06-02), and
`context-router.mjs` as primary navigation. Candidate resolution: **authority is per-project,
declared in the project adapter; the global default is propose-only.** YURI-OS keeps its explicit
direct-commit grant; YURI-BUSINESS is honored as approval-gated *as written* until Marcel refreshes
that adapter (recommendation below); commit rights never travel across repos. This removes the
contradiction without the owner having to pick one model for both repos — they legitimately differ.

**(2) ~200 lines redundancy — CONFIRMED.** Session guard verbatim ×3 (+1 partial), memory-v3
architecture ×2 densities, read-order ×2 divergent. Candidate: guard compressed to 4 lines and
scoped to YURI repos; memory routing compressed to the decision rule + a pointer to
`claude-memory-write.mjs surfaces` (the CLI already self-documents the v3 spec — a doc that prints
itself never goes stale); read-order dropped from global entirely (project concern).

**(3) Tool-name ambiguity — RESOLVED: they are two different tools, not a rename.** Verified on
disk: `xref-query.mjs` AND `context-router.mjs` both exist in YURI-OS `_SYSTEM/Scripts/` (xref =
fused FTS5+graph+GitNexus front-door; context-router = legacy packet router against
`context-registry.json`, explicitly retired from YURI-OS navigation); YURI-BUSINESS has its **own**
`context-router.mjs` + test and still wires it as primary. Candidate states the scoping in three
lines: per-repo front-doors, not interchangeable, use what the repo you're standing in declares.

## 3. Kept / dropped / merged

**KEPT (the catalog's 8 good practices, all preserved):**
@-include chains (now only SOUL.md + persona.md — truly global content) · mutation discipline
(pathspec-only, no bare commit, fetch+rebase never force, checks+`git show --stat` before push) ·
protected-path deny-list (union of both repos' lists, plus the explicit "memory/ IS writable"
carve-out) · Sonnet-default/Opus-escalation · GitNexus impact+detect gates (2-line global rule;
detail stays in per-repo GitNexus blocks) · `<skill-recall-hint>` honoring · two-track memory
routing · capability-first + research-local-first.

**KEPT (not in the catalog's list but load-bearing):** the no-headless launch rule
(`claude -p`/`--print`/SDK banned) — promoted to a global hard rule since it applies everywhere; the
identity/address rule (I am Claude/Yuri; operator is Marcel, never "Rick"); the verification floor
(first-run success is a hypothesis; changed files/checks/residual risk on every non-trivial task).

**DROPPED from global (live where they belong, not deleted from the world):** fleet-by-default
standing model, Read Order, EOT rule, Claude Output Lane, Codex bridges, Rick roster/overlay
mechanics, token-caching shape, brain-inject/body sections, full memory-v3 conventions, GitNexus
resource tables — all YURI-OS-project content, all still loading from the YURI-OS adapter in YURI-OS
sessions. Dropping them from *global* is the whole point: right rules, wrong scope.

**MERGED:** the 3–4 session-guard copies → one 4-line scoped guard; the two protected-path lists →
one union list; the two execution-rule blocks → one per-project authority section.

## 4. Before / after

| | BEFORE (live) | AFTER (candidate) |
|---|---|---|
| Global file | 32 lines, but pulls ~1,170 lines of YURI-OS spine into EVERY session | ~105 lines, self-contained; pulls only SOUL.md + persona.md |
| Non-YURI sessions | inherit fleet rules, broken script paths, commit rights, full origin doc | inherit identity + safety floor + git discipline only |
| YURI-BUSINESS sessions | live contradiction (commit-direct AND do-not-commit both loaded) | one model: its own adapter's gate, honored as written |
| Authority | implicit, colliding | explicit: per-project declaration, propose-only default |
| xref vs context-router | ambiguous across files | scoped per repo, retirement status stated |
| Session guard | ×3–4 copies, drift risk | ×1, scoped, 4 lines |
| Memory v3 detail | duplicated 5-line + 62-line versions | decision rule + self-printing CLI pointer |
| No-headless rule | buried in project adapters | global hard rule |

## 5. Recommended follow-ups (NOT executed — owner decisions)

1. **Refresh `YURI-BUSINESS/CLAUDE.md`** — it is a stale YURI-OS fork. Either (a) confirm
   approval-gated is intentional for the business repo and rewrite it as a thin ~30-line adapter
   saying so, or (b) upgrade it to the 2026-06-14 model. Fable's read: (a) — a more conservative
   gate on the operational/business repo is defensible and costs nothing. One-line decision.
2. **Satellite-rules refactor (worth doing, small):** extract exactly TWO shared files rather than
   the catalog's eight — `.claude/rules/session-guard.md` and `.claude/rules/protected-paths.md` —
   and @-include them from the YURI-repo adapters. The other six proposed satellites (research
   protocol, memory-v3, authorization, mutation, model-selection, gitnexus) are already canonical in
   `yuri-origin.md` / existing rules files or are now compact enough in the candidate that extra
   files would just add hop-count. Eight satellites is the catalog over-engineering its own fix.
3. **Labs stay standalone** — deliberate and correct (portable, self-contained). The candidate gives
   them identity + floor without YURI plumbing; add nothing.
4. **Swap procedure when Marcel approves:** `cp ~/.claude/CLAUDE.md ~/.claude/CLAUDE.md.pre-fable-backup
   && cp ~/.claude/CLAUDE.md.fable-candidate ~/.claude/CLAUDE.md`, open a fresh session in a Labs
   repo and in YURI-OS, sanity-check both load correctly. Rollback = restore the backup. (Note:
   through the symlink these files physically live in `YURI-OS-MUSUBI/.claude/` — commit the swap
   there with explicit pathspec if wanted.)

## 6. Residual risk

- If Claude Code ever resolves `@../` against the symlink path instead of the physical path, the two
  @-includes would dangle (`/Users/marcelspatz/SOUL.md` doesn't exist). Current behavior verified
  physical (this very session loaded them) — but re-verify after major Claude Code upgrades.
- persona.md (268 lines) is now the heaviest global item. Kept deliberately: Marcel wants the
  persona everywhere, and it was already loading everywhere via the old chain — no regression,
  but it is the next candidate if the global ever needs to slim further.
- The candidate asserts YURI-BUSINESS as approval-gated based on its own adapter text; if Marcel's
  live practice there has already moved to direct-commit, follow-up #1 flips it in one line.

— Fable-5, one-shot. `00FB_GLOBAL_CLAUDE_MD_CANDIDATE_X_PASS_COMMITTED`
