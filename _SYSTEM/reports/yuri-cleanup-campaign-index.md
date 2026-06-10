# YURI Large-Scale Cleanup Campaign — Bundle Index

> The single entry point for the long-run executor (Opus 4.8 or a fresh Claude session). Waves are dependency-independent unless noted; execute in listed order. Each wave ships the same package shape: audit ledger (evidence) → attacked fix/handover guide (work program). Operator: Marcel holds commit authority and all 🔶 owner decisions.

## Wave 1 — Math base ✅ READY FOR EXECUTION
- Work program: `_SYSTEM/reports/math-base-fix-handover-opus-2026-06-10.md` (8 phases, 60+ workpackages, 12 owner decisions — **D1 blocks Phase 3, resolve first**)
- Evidence ledger: `_SYSTEM/reports/math-base-audit-2026-06-10-checkpoint.md`
- Attacked specs: `_SYSTEM/reports/math-fix-specs/` (INDEX.md + 6 cluster files)

## Wave 2 — Memory / Cognition / Retrieval organs ✅ PACKAGES READY (Codex addendum pending)
- Scope: `_SYSTEM/reports/wave2-scope-die-extract.json` (chip-die sectors: memory ×14, pulse_cortex+classification+self_improvement ×24, code_intelligence ×8 + operational recall/search stack)
- Audit reports (attack-pass complete):
  - `_SYSTEM/reports/wave2-memory-audit.md` + `_SYSTEM/reports/wave2-memory-kernel-deep.md`
  - `_SYSTEM/reports/wave2-cognition-audit.md`
  - `_SYSTEM/reports/wave2-retrieval-audit.md` + `_SYSTEM/reports/wave2-retrieval-pipeline-deep.md`
- Handover packages (ready for Opus 4.8 execution):
  - `_SYSTEM/reports/wave2-memory-handover.md` — 16 WPs (2 CRITICAL, 3 HIGH, 5 MED, 3 LOW, 3 P2) + 4 owner decisions + 8 PARKED + 3 follow-up audit WPs
  - `_SYSTEM/reports/wave2-cognition-handover.md` — 12 WPs (1 CRITICAL, 2 HIGH, 5 WARN, 3 DS-verified, 1 dead-organ) + 4 owner decisions + 10 PARKED + 4 follow-up audit WPs
  - `_SYSTEM/reports/wave2-retrieval-handover.md` — 19 WPs (2 CRITICAL, 6 HIGH, 5 MED, 3 LOW, 3 P2) + 4 owner decisions + 9 PARKED + 4 follow-up audit WPs
- Codex addendum slot per WP: `_SYSTEM/lane-output/codex/wave2-memory-audit/findings.md` (directory absent at audit time — fold in when present)
- External-lane evidence: `_SYSTEM/lane-output/deepseek-wave2-failure-checklist.md`, `deepseek-wave2-cognition-opinion.md`, `deepseek-wave2-retrieval-opinion.md`, `deepseek-wave2-skillreg-opinion.md`

## Wave 3 — Governance / Skills / Session-tokens / Hidden-meta / Self-improve+Learning ✅ PACKAGES READY (Codex addenda blocked until Jun 11)
- Scope: `_SYSTEM/reports/wave3-scope-die-extract.json` (GOVERNANCE ×36 incl. routing_lanes+advisors+codex_gate+control_plane; HIDDEN_META ×18 = prompt_hooks+initialization; SKILLS ×11 = command_registry; + non-die organs: token stack, SELF-IMPROVEMENT pipeline)
- Audit reports (attack pass complete): `wave3-{governance,skills,tokens,hidden-meta,learning}-audit.md` + Opus deeps `wave3-{enforcement-chain,session-boot,learning-loop}-deep.md`
- External lanes: 7 DeepSeek (`deepseek-wave3-*.md` in lane-output: hooks-wiring, skills-crossmap, token-stack, selfimprove-drift, protectedpath-matrix, sessionstate-schema, enforcement-chain)
- **Codex NOTE**: credits reset Jun 11 ~20:36; re-dispatch `_SYSTEM/reports/wave3-codex-spec-saved.md` (durable copy; also was at /tmp/wave3-codex-spec.md).
- Handover packages (ready for Opus 4.8 execution):
  - `_SYSTEM/reports/wave3-governance-handover.md` — 11 WPs (2 CRIT, 4 HIGH, 3 MED, 2 LOW) + 4 owner decisions + 7 PARKED + 3 follow-up audit WPs
  - `_SYSTEM/reports/wave3-skills-handover.md` — 10 WPs (2 HIGH, 5 MED, 3 LOW; attacker count corrections applied) + 1 owner decision + 6 PARKED + 3 follow-up audit WPs
  - `_SYSTEM/reports/wave3-tokens-handover.md` — 10 WPs (2 CRIT, 3 HIGH, 3 MED, 2 LOW) + 1 owner decision + 5 PARKED + 3 follow-up audit WPs
  - `_SYSTEM/reports/wave3-hidden-meta-handover.md` — 8 WPs (2 CRIT, 2 HIGH, 2 MED, 2 LOW) + 4 owner decisions + 8 PARKED + 3 follow-up audit WPs
  - `_SYSTEM/reports/wave3-learning-handover.md` — 9 WPs (4 HIGH, 2 MED, 2 LOW + 1 compound) + 3 owner decisions + 7 PARKED + 4 follow-up audit WPs

## EXPLICIT RESIDUE — not covered by waves 1-3 (named, not silent)
- ~~**llm-lane Anthropic protocol gap**~~ **DONE 2026-06-10** — `llm-lane.mjs` now has a full Anthropic Messages API adapter (`toAnthropicMessages`, `toAnthropicTools`, `postMessagesAnthropicHttps` SSE). Dispatch branches on `cfg.protocol === 'anthropic'`. Mimo lanes added to `models.json llm_compat_lanes`. `ai llm mimo` routes natively.

- Die `services` sector ×8 (SVC_SHELL/RUNTIME/RAG/HEALTH/EOT/DIGEST/OLLAMA + SERVICES) and `unassigned` ×6 (ENKI_PLAN/BUS/CTX, ED_SYNTH/ROUTE/FINAL) + `operator_io` ×3. Recommendation: fold into build-phase QA or a small wave-4 if the build touches them.
- `backend/data/` contents (protected by law — audited only at boundaries).
- arch-graph-engine.mjs mini-audit lives as wave-1 WP-7.1 (assigned, not yet run).

## Execution notes for the bundled run
- Method/discipline per wave: each handover's own §2/§3 hard rules + working agreement (wave 1's are the template).
- Fleet discipline (Marcel directive 2026-06-10): majority Sonnet at max reasoning; select few Opus xhigh; DeepSeek/Codex breadth via `./_SYSTEM/Scripts/ai llm deepseek` / `ai @codex` (CODEX TASK SPEC required).
- Token shape: agents write artifacts to disk, return pointers. Evidence files referenced, never inlined.
- After each wave's fix execution: update this index (✅), run that wave's acceptance gate, write the wave report alongside.
