# Direct continuation master prompt — copy-paste into a fresh session

Paste everything in the fenced block below into a new session running in `~/YURI-OS-MUSUBI`.

---

```
Continue the YURI Architecture-Refinement project. This is a resumed workstream — read the handoff FIRST, then execute.

## Read first (in order)
1. `02_RESOURCES/RESEARCH/yuri-architecture-refinement-2026-07-07/09-HANDOFF.md` — full state, locked decisions (Q1–Q10), phase status, gotchas.
2. `02_RESOURCES/RESEARCH/yuri-architecture-refinement-2026-07-07/02-DECISION.md` — the 9-phase plan + per-phase acceptance.

## Verify state before doing anything
cd ~/YURI-OS-MUSUBI && git branch --show-current   # must be main
git log --oneline -8                                # newest should be 9a7b0a68 (barrel fix)
node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate
for b in memory nano lanes kagami energy claims filing llm tokens skills mcs workers fleet corpus; do node --input-type=module -e "import('./_SYSTEM/Scripts/$b/index.mjs').then(m=>console.log('$b',Object.keys(m).length)).catch(()=>console.log('$b FAIL'))"; done

## Immediate task: P5 — skill hybrid disclosure (kills context-window skill-bleed)
Target (Q6): Hybrid disclosure —
 (1) one-line ambient index of EVERY skill (name + one-line description) always present,
 (2) full SKILL.md body retrieval-injected ONLY on match (reuse skill-recall.mjs + <skill-recall-hint>),
 (3) `invocation: workflow` skills (46) go in a command-map, OUT of the ambient pool,
 (4) a pre-registered top-K usage cut-threshold.
The P3 2-axis tags are the enabler: `invocation: ability` (72) → ambient+retrieval; `invocation: workflow` (46) → command-map; `scope: instance` (9) don't ship.

>>> BEFORE editing injection, get Marcel's read on the disclosure MECHANISM (how the ambient index builds/injects, where the retrieval hook fires, the cut-threshold value). This is his core concern; a wrong change silently stops skills from surfacing. Ask ONE sharp question, then execute. Verify against LIVE injection, not comments/happy-path.

Look at: `_SYSTEM/Scripts/xref-query.mjs` (ccr-compress runtime), skill-recall.mjs + skill-recall-hint, `skills/skill-index.json`, `_SYSTEM/skill-hash-registry.json`, `skills/*/SKILL.md` frontmatter (carries scope+invocation).

## After P5 (self-governable): P8
P8 — adapters generated-thin + `package.json` `exports`/`bin` (thin adapters, no restated policy, Tier-aware).

## Owner-gated / owner-decision — surface, do NOT execute without explicit Marcel sign-off
- P1: 12G of WIP worktrees hold UNCOMMITTED code (5× nexus-rs Rust, vault-restructure, 5× sentinel). NEVER delete uncommitted work without his word. Ask which are dead.
- P2 security fix: RED test (fa657041) proved 11 PreToolUse hooks don't call the yuri-safety-core SEC-1 denylist + governance denies are silent. Wire them (real hole).
- P6 relocate instance (HIGH), P7.5 yuri-mcp + host-compat (HIGH) — explicit confirm each.
- deepseek is 402 (needs top-up); GLM weekly cap resets 2026-07-10.
- 3 parallel-session skills (cgs-mold, nexus-security-hardening, pilot-feedback) still need the 2-axis tags.

## Hard rules
- DO NOT touch `pitch-lueddemann.html` — Marcel evolves it in a parallel session.
- Commit+push is granted, but EXPLICIT PATHSPEC ONLY: `git add <paths>` + `git commit -- <paths>`. NEVER `git add .` / `git add -A` / bare commit — parallel sessions have staged work. Verify staged scope before each commit. ~15 dirty files in the tree are parallel-session work; leave them.
- Delegation routing is degraded: `task()` role defaults hit capped/broken providers. Use `eval` → `agent(prompt, model="anthropic/claude-sonnet-4-6")` for lanes. Anthropic + Cursor composer are the healthy roster.
- Never trust a "0-consumer / clean-move" claim — grep/import-test before ANY relocation (P7's plan was wrong: corpus-match had 10 consumers).
- Any new barrel must be IMPORT-tested (`import('./x/index.mjs')`), not just `node --check`.
- Session guard: pwd = repo root, branch = main before any mutation.

Start now: read the two docs, run the verify block, report state, then ask Marcel the one P5 disclosure-mechanism question.
```

---

**Why the guardrails are in the prompt, not left to inference:** the degraded delegation routing, the "verify-before-move" lesson, and the import-test requirement were all learned the hard way this session (P7's corpus plan was factually wrong; the P4 barrels were decorative). A fresh session without them would repeat the mistakes.
