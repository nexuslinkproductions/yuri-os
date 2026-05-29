# Findings — three backlog items deferred from autonomous edit (owner-decision / careful-pass)

**Date:** 2026-05-29 · **Lane:** Claude/Opus · **Authority:** advisory_only=true

These three cartography backlog items were assessed and deliberately NOT edited autonomously while the owner was away. Each is either security-critical or behavior-adding with a placement decision. Evidence below; recommendation is a guided pass + Codex final-pass, not a quick fix.

---

## 1. Protected-path single-source ("5-way dedup") — SECURITY-CRITICAL, defer

**Actual state (more than "5 copies of one list"):**
- `_SYSTEM/Scripts/lane-kernel.mjs` — `PROTECTED_SURFACE_PREFIXES` (15 prefixes, frozen, exported, self-described canonical). **Strongest source.**
- `_SYSTEM/Scripts/artifact-registry.mjs` — its OWN `isProtectedPath` (imported by `claim-integrity-gate.mjs`). **Second live implementation.**
- `.claude/hooks/claude-protocol-guard.js` — the actual PreToolUse **enforcement** point. **CommonJS `.js`**, not ESM.
- `_SYSTEM/Scripts/folder-census.mjs` — own 5-entry `PROTECTED` Set; partially **vestigial** (multi-segment entries like `backend/data` can never match single-segment top-level names, so only `.env`/`node_modules` do anything).
- Prose: `_SYSTEM/yuri-origin.md` (canonical Protected Surfaces) + `CLAUDE.md` (Protected Paths restatement).

**Why deferred:**
- The enforcement file is **CommonJS**; the canonical export is **ESM (`.mjs`)**. A CJS→ESM consume needs async `import()`; hooks may run sync. Getting this wrong could **silently disable protected-path enforcement** — an asymmetric, severe regression that directly contradicts "don't destroy core principles."
- Two competing JS implementations (lane-kernel vs artifact-registry) must be **reconciled**, not deduped by copy — semantics may differ (prefix match vs normalized path).
- The session protocol-gate itself flags protected-path work as needing route-plan evidence + DeepSeek/symbioticPulse advisory + Codex.

**Recommended safe path (guided, with the owner):**
1. Make ESM consumers (`folder-census.mjs`, `artifact-registry.mjs`) import `PROTECTED_SURFACE_PREFIXES` from lane-kernel — lowest risk (advisory tools, same module system). Fix folder-census's vestigial set in the same pass (switch to prefix matching).
2. For the CJS enforcement hook: generate a small committed JSON (`_SYSTEM/config/protected-surfaces.json`) from lane-kernel, have BOTH the ESM kernel and the CJS hook read that one file. Single source, no cross-module-system import.
3. **Mandatory negative tests:** assert each protected path is STILL blocked after refactor (`backend/data/x`, `.claude/state/x`, `.env`, credentials, file-history, projects, lane-sessions, paste-cache). No green without these.

## 2. claim-integrity-gate wiring — BEHAVIOR-ADDING, needs placement decision

- `_SYSTEM/Scripts/claim-integrity-gate.mjs` exists, exports a v0 report schema + promotion-state machine, imports `isProtectedPath` from artifact-registry. **Wired nowhere** (only this-session cartography references it).
- "Wiring" = a decision about WHERE it fires: a PostToolUse hook? a step in the promotion/EOT ladder? a route-plan gate? Each placement has different blocking behavior and false-positive risk.
- Defer until the owner picks the integration point. Not a mechanical fix.

## 3. `.claude/skills` drifted shims — INVESTIGATE before touching

- Reported as ~22 drifted shim files. Not yet characterized (shim → real SKILL.md? stale trigger → missing `commands/<alias>.md` per skill-creation.md Patch 001/002?).
- Low blast radius individually, but 22 files is a sweep that should be characterized (one representative diff) and reconciled in a batch with the skill-creation checklist, then verified, not edited blind.

---

**Bottom line:** all three are real and worth doing, none is a safe autonomous one-shot with the owner away. #1 is the highest-value + highest-risk; do it guided with negative tests. The comet retire + census/registry gate fixes (separate packet) WERE safe and are verified green.
