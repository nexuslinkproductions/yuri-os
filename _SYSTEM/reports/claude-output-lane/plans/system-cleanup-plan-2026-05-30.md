# _SYSTEM Cleanup Plan — Loose-File Classification (2026-05-30)

**Mode:** READ-ONLY classification pass. NOTHING was moved, deleted, or edited. This file is the only write.
**Authority:** PLAN ONLY. Every `git mv` below is a *proposal* for Marcel to eyeball. No mutation without explicit owner approval.
**Method:** `find` inventory (maxdepth 1, files only) + scoped reference greps across `_SYSTEM/Scripts`, `_SYSTEM/config`, `_SYSTEM/context`, `.claude/{hooks,skills,commands,rules,agents,tasks}`, `CLAUDE.md`, `AGENTS.md`, `_SYSTEM/INDEX.md`, `_SYSTEM/yuri-origin.md`, `_SYSTEM/STRUCTURE.md`, `SOUL.md`, and the Claude auto-memory dir. Both bare basename and `_SYSTEM/<basename>` path forms checked.

> **Core safety finding:** the single biggest wiring surface is `_SYSTEM/context/context-registry.json`. Every "codex"/"log"/"protocol"/"state" file that looked like clutter is in fact a **registered context-packet anchor** that `_SYSTEM/Scripts/context-router.mjs` resolves on every task. Those are LOAD-BEARING and stay put. Default was KEEP-on-any-reference; only verified zero-ref files are proposed for movement.

---

## 1. Summary Table — counts per bucket

| Location | Total loose (excl. `.DS_Store`) | KEEP-AT-ROOT | ARCHIVE | FILE-INTO |
|---|---|---|---|---|
| `_SYSTEM/` root | 89 | 41 | 48 | 0 |
| `_SYSTEM/reports/` root | 35 | 1 (flagged KEEP-for-safety) | 21 | 13 |
| **TOTAL** | **124** | **42** | **69** | **13** |

- KEEP-for-safety flags (any reference OR active-resume ambiguity → kept): **1** in reports (`RESUME_backend-removal`), plus all 41 `_SYSTEM` KEEPs are reference-proven (no guesswork).
- Highest-confidence ARCHIVE candidates: 48 `_SYSTEM`-root zero-ref files + 21 reports zero-ref proofs/audits.
- **Late reclassification (post-deep-grep):** `memory-layer-spec.md`, `token-tracker.md` moved ARCHIVE→KEEP — each has a verified live script referencer (see 2a). They are NOT in the `git mv` block.

---

## 2. DO NOT MOVE — wired-in (reference proof)

### 2a. Hard code/script references (strongest — imported by live `.mjs`/`.sh`)

| File | Referencer (proof) |
|---|---|
| `INDEX.md` | `context-router.mjs`, `+7 surfaces` (REFS=8) |
| `yuri-origin.md` | `context-router.mjs` (REFS=4) |
| `README.md` | `context-router.mjs` (REFS=4) |
| `STRUCTURE.md` | `context-router.mjs` (REFS=4) |
| `YURI.md` | `yuri-loadup.mjs` (REFS=4) |
| `yuri-graph-state.json` | `graph-query.mjs` (REFS=4) |
| `DESIGN.md` | `design-suite.mjs` (REFS=3) |
| `OPERATOR_PROTOCOL.md` | `yuri-closeout.mjs` (REFS=3) |
| `persona.md` | `Scripts/*` (REFS=3) |
| `CODEX_PROTOCOL.md` | `ai-codex.mjs` (REFS=2) |
| `LOCAL_EXECUTION_POLICY.md` | `ai-codex.mjs` (REFS=2) |
| `MUSUBI_PROTOCOL.md` | `yuri-loadup.mjs` (REFS=2) |
| `TOOLS.md` | `yuri-loadup.mjs` (REFS=2) |
| `USER.md` | `yuri-loadup.mjs` (REFS=2) |
| `SPEC_KIT_INDEX.md` | `yuri-loadup.mjs` (REFS=1) |
| `skill-hash-registry.json` | `skill-integrity.mjs`, `skill-hash-verify.mjs` (REFS=2) |
| `yuri-boot.zsh` | `yuri-boot-doctor.sh` (REFS=2) |
| `token-orchestrator.sh` | `token-guardian.sh` (REFS=1) |
| `design-memory.json` | `design-suite.mjs` (REFS=1) |
| `yuri-cognitive-persona-rationale.md` | `_SYSTEM/SELF/marcel-operating-brain.md` (REFS=2) |
| `memory-layer-spec.md` | `memory-evict.mjs` (deep-grep) |
| `token-tracker.md` | `self-hypothesis.mjs` (deep-grep) |

### 2b. context-registry.json packet anchors (resolved by context-router on every task)

`AGENT_BLUEPRINTS.md`, `AUTONOMOUS-SYSTEM-LIVE.md`, `HEARTBEAT.md`, `INTEGRATION-MAP.md`, `RUNBOOK.md`, `YURI-COGNITION.md`, `creative_codex.md`, `enki_state.md`, `esoteric_codex.md`, `geopolitical_log.md`, `language_codex.md`, `model-registry.md`, `yuri-content-governance.md`, `yuri-council-log.md`, `yuri-evidence-pack-schema.md`, `yuri-forge.md`, `yuri-incident-log.md`, `yuri-pulse.md`, `yuri-skill-loader.md`, `yuri-token-ops.md`.

> Proof: each appears in `context-registry.json` either as `_SYSTEM/<name>` packet path or inside a packet `"anchors": [...]` array (verified at registry lines incl. 88, 132, 140, 142).

**Total KEEP-AT-ROOT (`_SYSTEM`): 41 files. Zero are guesses — all have a verified live referencer.**

---

## 3. Full per-file classification — `_SYSTEM/` root

`file | bucket | proposed target | ref_count | top referencer | reason`

| file | bucket | proposed target | refs | top referencer | reason |
|---|---|---|---|---|---|
| INDEX.md | KEEP | (root) | 8 | context-router.mjs | canonical map |
| yuri-origin.md | KEEP | (root) | 4 | context-router.mjs | canonical contract |
| README.md | KEEP | (root) | 4 | context-router.mjs | root orientation |
| STRUCTURE.md | KEEP | (root) | 4 | context-router.mjs | structure map |
| YURI.md | KEEP | (root) | 4 | yuri-loadup.mjs | load-up doc |
| yuri-graph-state.json | KEEP | (root) | 4 | graph-query.mjs | graph state |
| DESIGN.md | KEEP | (root) | 3 | design-suite.mjs | design contract |
| OPERATOR_PROTOCOL.md | KEEP | (root) | 3 | yuri-closeout.mjs | protocol |
| persona.md | KEEP | (root) | 3 | Scripts/* | persona config |
| CODEX_PROTOCOL.md | KEEP | (root) | 2 | ai-codex.mjs | protocol |
| LOCAL_EXECUTION_POLICY.md | KEEP | (root) | 2 | ai-codex.mjs | policy |
| MUSUBI_PROTOCOL.md | KEEP | (root) | 2 | yuri-loadup.mjs | protocol |
| TOOLS.md | KEEP | (root) | 2 | yuri-loadup.mjs | load-up doc |
| USER.md | KEEP | (root) | 2 | yuri-loadup.mjs | load-up doc |
| skill-hash-registry.json | KEEP | (root) | 2 | skill-integrity.mjs | integrity registry |
| yuri-boot.zsh | KEEP | (root) | 2 | yuri-boot-doctor.sh | boot script |
| yuri-cognitive-persona-rationale.md | KEEP | (root) | 2 | marcel-operating-brain.md | INDEX/brain ref |
| SPEC_KIT_INDEX.md | KEEP | (root) | 1 | yuri-loadup.mjs | spec index |
| token-orchestrator.sh | KEEP | (root) | 1 | token-guardian.sh | token script |
| design-memory.json | KEEP | (root) | 1 | design-suite.mjs | design state |
| AGENT_BLUEPRINTS.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| AUTONOMOUS-SYSTEM-LIVE.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| HEARTBEAT.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| INTEGRATION-MAP.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| RUNBOOK.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| YURI-COGNITION.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| creative_codex.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| enki_state.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| esoteric_codex.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| geopolitical_log.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| language_codex.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| model-registry.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| yuri-content-governance.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| yuri-council-log.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| yuri-evidence-pack-schema.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| yuri-forge.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| yuri-incident-log.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| yuri-pulse.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| yuri-skill-loader.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| yuri-token-ops.md | KEEP | (root) | 1 | context-registry.json | packet anchor |
| ADVERSARIAL_STABILITY_AUDIT_2026-04-22.md | ARCHIVE | archive/loose-cleanup-2026-05/audits/ | 0 | — | dated audit, superseded by v2 |
| ADVERSARIAL_STABILITY_AUDIT_2026-04-22_v2.md | ARCHIVE | archive/loose-cleanup-2026-05/audits/ | 0 | — | dated audit |
| SWARM_ARCHITECTURE_AUDIT_2026.md | ARCHIVE | archive/loose-cleanup-2026-05/audits/ | 0 | — | dated audit |
| STRUCTURE_REFACTOR_REPORT.md | ARCHIVE | archive/loose-cleanup-2026-05/refactor-prompts/ | 0 | — | refactor report, no refs |
| MASTER_STRUCTURE_REFACTOR_PROMPT.md | ARCHIVE | archive/loose-cleanup-2026-05/refactor-prompts/ | 0 | — | superseded prompt |
| MASTER_STRUCTURE_REFACTOR_PROMPT_v2.md | ARCHIVE | archive/loose-cleanup-2026-05/refactor-prompts/ | 0 | — | superseded prompt |
| MASTER_STRUCTURE_REFACTOR_v3.md | ARCHIVE | archive/loose-cleanup-2026-05/refactor-prompts/ | 0 | — | superseded prompt |
| MIGRATION-MAP.md | ARCHIVE | archive/loose-cleanup-2026-05/refactor-prompts/ | 0 | — | one-time migration doc |
| HANDOFF-2026-05-17-symbiosis-restructure-purge.md | ARCHIVE | archive/loose-cleanup-2026-05/handoffs/ | 0 | — | dated handoff |
| HANDOFF-2026-05-18-enforcement-schema-codex-live.md | ARCHIVE | archive/loose-cleanup-2026-05/handoffs/ | 0 | — | dated handoff |
| HANDOFF-brain-launchagents-sprint.md | ARCHIVE | archive/loose-cleanup-2026-05/handoffs/ | 0 | — | sprint handoff |
| HANDOFF-memory-sovereignty-sprint.md | ARCHIVE | archive/loose-cleanup-2026-05/handoffs/ | 0 | — | sprint handoff |
| HANDOFF-musubi-hyperintelligence-v2-eot.md | ARCHIVE | archive/loose-cleanup-2026-05/handoffs/ | 0 | — | sprint handoff |
| HANDOFF-musubi-intelligence-sprint-v2.md | ARCHIVE | archive/loose-cleanup-2026-05/handoffs/ | 0 | — | sprint handoff |
| HANDOFF-musubi-intelligence-sprint.md | ARCHIVE | archive/loose-cleanup-2026-05/handoffs/ | 0 | — | sprint handoff |
| HANDOFF-post-plan-dispatch-gate.md | ARCHIVE | archive/loose-cleanup-2026-05/handoffs/ | 0 | — | sprint handoff |
| HANDOFF-spring-clean-naming-sprint-2026-05-17.md | ARCHIVE | archive/loose-cleanup-2026-05/handoffs/ | 0 | — | sprint handoff |
| HANDOFF-v15-post-sprint.md | ARCHIVE | archive/loose-cleanup-2026-05/handoffs/ | 0 | — | sprint handoff |
| HANDOFF-v15.md | ARCHIVE | archive/loose-cleanup-2026-05/handoffs/ | 0 | — | sprint handoff |
| handoff-2026-05-13.md | ARCHIVE | archive/loose-cleanup-2026-05/handoffs/ | 0 | — | dated handoff |
| dashboard-graph-spec.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | superseded dashboard spec |
| dashboard-v5-premium.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | superseded dashboard spec |
| dashboard-v5-spec.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | superseded dashboard spec |
| dashboard-v7-spec.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | superseded dashboard spec |
| dashboard-v8-spec.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | superseded dashboard spec |
| dashboard-v9-spec.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | superseded dashboard spec |
| dashboard-v10-spec.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | superseded dashboard spec |
| dashboard-v11-spec.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | superseded dashboard spec |
| dashboard-v12-spec.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | superseded dashboard spec |
| dashboard-v13-spec.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | superseded dashboard spec |
| dashboard-v14-spec.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | superseded dashboard spec |
| dashboard-v15-spec.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | latest spec, but zero-ref + snapshot tracked elsewhere |
| dashboard-v15-hotfix.md | ARCHIVE | archive/loose-cleanup-2026-05/dashboards/ | 0 | — | hotfix note |
| APRIL-2026-TOKEN-ACTION-PLAN.md | ARCHIVE | archive/loose-cleanup-2026-05/token-ops/ | 0 | — | dated token plan |
| TOKEN-SMART-CHECKLIST.md | ARCHIVE | archive/loose-cleanup-2026-05/token-ops/ | 0 | — | token checklist, no refs |
| token-audit.md | ARCHIVE | archive/loose-cleanup-2026-05/token-ops/ | 0 | — | token audit, no refs |
| token-tracking-quick-start.md | ARCHIVE | archive/loose-cleanup-2026-05/token-ops/ | 0 | — | token doc, no refs |
| token-regulation-policy.md | ARCHIVE | archive/loose-cleanup-2026-05/token-ops/ | 0 | — | token policy, no refs |
| monthly-token-summary-template.md | ARCHIVE | archive/loose-cleanup-2026-05/token-ops/ | 0 | — | template, no refs |
| cost-trends.md | ARCHIVE | archive/loose-cleanup-2026-05/token-ops/ | 0 | — | cost log, no refs |
| amp-usage-log.md | ARCHIVE | archive/loose-cleanup-2026-05/token-ops/ | 0 | — | usage log, no refs |
| apr-18-19-burn-analysis.md | ARCHIVE | archive/loose-cleanup-2026-05/token-ops/ | 0 | — | dated burn analysis |
| campaign-2026-05-13-yuri-optimization.md | ARCHIVE | archive/loose-cleanup-2026-05/token-ops/ | 0 | — | dated campaign log |
| codex-design-suite-task.md | ARCHIVE | archive/loose-cleanup-2026-05/codex-tasks/ | 0 | — | one-time codex task |
| codex-mem-new-scripts.md | ARCHIVE | archive/loose-cleanup-2026-05/codex-tasks/ | 0 | — | one-time codex task |
| deepseek-tool-prompt-template.md | ARCHIVE | archive/loose-cleanup-2026-05/codex-tasks/ | 0 | — | prompt template, no refs |
| sandbox-improvement-test-run.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | test run note |
| scout-errors-2026-05-13-triage.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | dated triage |
| security-2026-05-13-remediation.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | dated remediation |
| lane-verification-2026-05-13.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | dated verification |
| claudemd-alignment-report.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | one-time alignment report |
| claude-ai-instructions.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | stale instructions, no refs |
| session_prompt.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | loose prompt, no refs |
| model-registry-2026-04-24.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | dated, superseded by model-registry.md (KEEP) |
| neural-forge-guide.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | guide, no refs |
| NEURAL-NETWORK-THESIS.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | thesis doc, no refs (NEURAL-NETWORK root was retired per registry) |
| spec-kit-workflow-bridge.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | bridge doc, no refs (SPEC_KIT_INDEX is the KEEP one) |
| EVONEXUS_INTEGRATION_MAP.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | evonexus map, no refs |
| IMAGE-VIDEO-GEN-PROTOCOL.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | protocol, no refs |
| CLI-WORKFLOW.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | workflow doc, no refs |
| CODEX-RUNBOOK.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | runbook, no refs (RUNBOOK.md is the KEEP anchor) |
| DESIGN-v2-draft.md | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | draft, superseded by DESIGN.md (KEEP) |
| YURI_AUDIT_README.md | ARCHIVE | archive/loose-cleanup-2026-05/audits/ | 0 | — | audit readme, no refs |
| SymbiOS-Trademark-Audit.html | ARCHIVE | archive/loose-cleanup-2026-05/audits/ | 0 | — | dated TM audit, no refs |
| SymbiOS-Trademark-Graph.html | ARCHIVE | archive/loose-cleanup-2026-05/audits/ | 0 | — | dated TM graph, no refs |
| audit-2026-05-17.html | ARCHIVE | archive/loose-cleanup-2026-05/audits/ | 0 | — | dated audit |
| audit-2026-05-18.html | ARCHIVE | archive/loose-cleanup-2026-05/audits/ | 0 | — | dated audit |
| musubi-intelligence-v2-audit.html | ARCHIVE | archive/loose-cleanup-2026-05/audits/ | 0 | — | dated audit |
| musubi-intelligence-v2-audit-v2.html | ARCHIVE | archive/loose-cleanup-2026-05/audits/ | 0 | — | dated audit |
| musubi-brand-identity.html | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | brand asset, no refs |
| yuri-os-launch-readiness.html | ARCHIVE | archive/loose-cleanup-2026-05/misc/ | 0 | — | readiness page, no refs |

> Note: `.DS_Store` at `_SYSTEM/` is macOS metadata (registry: "Never source truth") — excluded from counts; do not commit, optionally delete.

---

## 4. Full per-file classification — `_SYSTEM/reports/` root

| file | bucket | proposed target | refs | top referencer | reason |
|---|---|---|---|---|---|
| RESUME_backend-removal_2026-05-29.md | KEEP (safety) | (reports root) | 2 | .claude/tasks/<id> | ACTIVE resume; tracked by memory PROJ:BACKEND-REMOVAL-RESUME — do not move without owner ok |
| CODEX_FINAL_PASS_comet-retire-gate-fixes_2026-05-29.md | FILE-INTO | reports/codex-final-pass/ | 0 | — | active codex final-pass record |
| CODEX_FINAL_PASS_control-plane-rework-2_2026-05-29.md | FILE-INTO | reports/codex-final-pass/ | 0* | self only | *self-match only; active codex final-pass record |
| SESSION_CLOSEOUT_2026-05-30_energy-user-data.md | FILE-INTO | reports/closeouts/ | 0 | — | recent closeout |
| SESSION_CLOSEOUT_2026-05-30_hardening-attack.md | FILE-INTO | reports/closeouts/ | 0 | — | recent closeout |
| DEITY_CUTOVER_RUNBOOK_2026-05-29.md | FILE-INTO | reports/runbooks/ | 0 | — | active runbook |
| MEMORY_VS_SEARCH_DESIGN_2026-05-29.md | FILE-INTO | reports/design-notes/ | 0 | — | active design note |
| RAG_MEMORY_TRUTH_REPORT_2026-05-29.md | FILE-INTO | reports/memory-rag/ | 0 | — | active memory/RAG report |
| YURI_CONTROL_PLANE_AUDIT_2026-05-29.md | FILE-INTO | reports/audits-2026-05/ | 0 | — | recent audit |
| YURI_GROUND_TRUTH_AUDIT_2026-05-28.md | FILE-INTO | reports/audits-2026-05/ | 0 | — | recent audit |
| YURI_ACTUAL_CAPABILITY_AUDIT_2026-05-25.md | FILE-INTO | reports/audits-2026-05/ | 0 | — | recent audit |
| NEXUS_LINK_REVENUE_PLAN_2026-05-30.html | FILE-INTO | reports/business/ | 0 | — | active business plan |
| energy-hardening-attack-2026-05-30.md | FILE-INTO | reports/security/ | 0 | — | recent hardening report |
| math-operational-simulation-2026-05-25.json | FILE-INTO | reports/math/ | 0 | — | recent math sim artifact |
| YURI_AUTHORIZED_REPLAY_SCOPE_2026-05-24.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-proofs/ | 0 | — | dated proof |
| YURI_BROWSER_REPLAY_PROOF_2026-05-24.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-proofs/ | 0 | — | dated proof |
| YURI_CYBER_PROOF_CARDS_2026-05-23.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-proofs/ | 0 | — | dated proof |
| YURI_CYBER_RETEST_PROOF_2026-05-24.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-proofs/ | 0 | — | dated proof |
| YURI_GUARDRAIL_PROOF_MATRIX_2026-05-22.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-proofs/ | 0 | — | dated proof |
| YURI_MEMORY_ROLLBACK_PROOF_2026-05-24.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-proofs/ | 0 | — | dated proof |
| YURI_PROVENANCE_SCORE_MATRIX_2026-05-24.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-proofs/ | 0 | — | dated proof |
| YURI_RAG_CONFLICT_PROOF_2026-05-24.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-proofs/ | 0 | — | dated proof |
| YURI_NIM_LANE_CALIBRATION_2026-05-21.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-proofs/ | 0 | — | dated calibration |
| YURI_PROMOTION_LEDGER_RESEARCH_2026-05-25.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-research/ | 0 | — | dated research |
| YURI_REGIONAL_INTELLIGENCE_PACKS_2026-05-22.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-research/ | 0 | — | dated research |
| YURI_SECURITY_LENS_V0_2026-05-22.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-research/ | 0 | — | v0 superseded |
| YURI_SECURITY_STRUCTURE_SPRINT_2026-05-24.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-research/ | 0 | — | dated sprint |
| YURI_TRUTH_PROMOTION_NEXT_SESSION_2026-05-25.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-research/ | 0 | — | dated next-session note |
| YURI_TRUTH_PROMOTION_PROVING_PATH_REWORK_2026-05-25.md | ARCHIVE | archive/loose-cleanup-2026-05/reports-research/ | 0 | — | dated rework |
| YURI_UPGREAT_DEMO_TRANSCRIPT_2026-05-23.md | ARCHIVE | archive/loose-cleanup-2026-05/upgreat/ | 0 | — | dated UpGreat material |
| YURI_UPGREAT_MEETING_PACKET_2026-05-23.md | ARCHIVE | archive/loose-cleanup-2026-05/upgreat/ | 0 | — | dated UpGreat material |
| YURI_UPGREAT_MEETING_RELEASE_2026-05-23.md | ARCHIVE | archive/loose-cleanup-2026-05/upgreat/ | 0 | — | dated UpGreat material |
| YURI_UPGREAT_PILOT_READINESS_2026-05-22.md | ARCHIVE | archive/loose-cleanup-2026-05/upgreat/ | 0 | — | dated UpGreat material |
| YURI_OS_SUPERCHARGE_LOGBOOK_PRESENTATION_2026-05-21.html | ARCHIVE | archive/loose-cleanup-2026-05/presentations/ | 0 | — | dated presentation |
| kagami-sprint-audit-2026-05-19.html | ARCHIVE | archive/loose-cleanup-2026-05/presentations/ | 0 | — | dated; note memory PROJ:KAGAMI-AUDIT-TEMPLATE treats it as a reusable template — confirm with owner before archiving |

> `.DS_Store` at `_SYSTEM/reports/` excluded (macOS metadata).

---

## 5. Proposed target folder structure (concise)

```
_SYSTEM/archive/loose-cleanup-2026-05/
  handoffs/          # all HANDOFF-* + handoff-2026-05-13
  dashboards/        # dashboard-v*, dashboard-graph-spec, hotfix
  audits/            # *_AUDIT*, SymbiOS-Trademark-*, musubi-*-audit, audit-2026-*, YURI_AUDIT_README
  refactor-prompts/  # MASTER_STRUCTURE_REFACTOR*, STRUCTURE_REFACTOR_REPORT, MIGRATION-MAP
  token-ops/         # token-*, *TOKEN*, cost-trends, amp-usage-log, burn-analysis, campaign
  codex-tasks/       # codex-*-task, deepseek-tool-prompt-template
  misc/              # evonexus, neural-forge, thesis, drafts, stale instructions, brand/readiness html
  reports-proofs/    # YURI_*_PROOF_*, *_MATRIX_*, NIM calibration
  reports-research/  # YURI_*_RESEARCH/SECURITY/TRUTH_PROMOTION/REGIONAL
  upgreat/           # YURI_UPGREAT_*
  presentations/     # *_PRESENTATION*, kagami-sprint-audit (pending owner confirm)

_SYSTEM/reports/        # FILE-INTO active docs grouped by topic
  codex-final-pass/   closeouts/   runbooks/   design-notes/
  memory-rag/   audits-2026-05/   business/   security/   math/
```

---

## 6. Ready-to-review `git mv` list (NOT executed)

```bash
# === PRE-FLIGHT (Marcel runs manually) ===
# cd /Users/marcelspatz/YURI-OS-MUSUBI
# git branch --show-current   # must be main
# mkdir -p _SYSTEM/archive/loose-cleanup-2026-05/{handoffs,dashboards,audits,refactor-prompts,token-ops,codex-tasks,misc,reports-proofs,reports-research,upgreat,presentations}
# mkdir -p _SYSTEM/reports/{codex-final-pass,closeouts,runbooks,design-notes,memory-rag,audits-2026-05,business,security,math}

# --- _SYSTEM ROOT -> archive/handoffs ---
git mv _SYSTEM/HANDOFF-2026-05-17-symbiosis-restructure-purge.md      _SYSTEM/archive/loose-cleanup-2026-05/handoffs/
git mv _SYSTEM/HANDOFF-2026-05-18-enforcement-schema-codex-live.md    _SYSTEM/archive/loose-cleanup-2026-05/handoffs/
git mv _SYSTEM/HANDOFF-brain-launchagents-sprint.md                   _SYSTEM/archive/loose-cleanup-2026-05/handoffs/
git mv _SYSTEM/HANDOFF-memory-sovereignty-sprint.md                   _SYSTEM/archive/loose-cleanup-2026-05/handoffs/
git mv _SYSTEM/HANDOFF-musubi-hyperintelligence-v2-eot.md             _SYSTEM/archive/loose-cleanup-2026-05/handoffs/
git mv _SYSTEM/HANDOFF-musubi-intelligence-sprint-v2.md               _SYSTEM/archive/loose-cleanup-2026-05/handoffs/
git mv _SYSTEM/HANDOFF-musubi-intelligence-sprint.md                  _SYSTEM/archive/loose-cleanup-2026-05/handoffs/
git mv _SYSTEM/HANDOFF-post-plan-dispatch-gate.md                     _SYSTEM/archive/loose-cleanup-2026-05/handoffs/
git mv _SYSTEM/HANDOFF-spring-clean-naming-sprint-2026-05-17.md       _SYSTEM/archive/loose-cleanup-2026-05/handoffs/
git mv _SYSTEM/HANDOFF-v15-post-sprint.md                             _SYSTEM/archive/loose-cleanup-2026-05/handoffs/
git mv _SYSTEM/HANDOFF-v15.md                                         _SYSTEM/archive/loose-cleanup-2026-05/handoffs/
git mv _SYSTEM/handoff-2026-05-13.md                                  _SYSTEM/archive/loose-cleanup-2026-05/handoffs/

# --- _SYSTEM ROOT -> archive/dashboards ---
git mv _SYSTEM/dashboard-graph-spec.md   _SYSTEM/archive/loose-cleanup-2026-05/dashboards/
git mv _SYSTEM/dashboard-v5-premium.md   _SYSTEM/archive/loose-cleanup-2026-05/dashboards/
git mv _SYSTEM/dashboard-v5-spec.md      _SYSTEM/archive/loose-cleanup-2026-05/dashboards/
git mv _SYSTEM/dashboard-v7-spec.md      _SYSTEM/archive/loose-cleanup-2026-05/dashboards/
git mv _SYSTEM/dashboard-v8-spec.md      _SYSTEM/archive/loose-cleanup-2026-05/dashboards/
git mv _SYSTEM/dashboard-v9-spec.md      _SYSTEM/archive/loose-cleanup-2026-05/dashboards/
git mv _SYSTEM/dashboard-v10-spec.md     _SYSTEM/archive/loose-cleanup-2026-05/dashboards/
git mv _SYSTEM/dashboard-v11-spec.md     _SYSTEM/archive/loose-cleanup-2026-05/dashboards/
git mv _SYSTEM/dashboard-v12-spec.md     _SYSTEM/archive/loose-cleanup-2026-05/dashboards/
git mv _SYSTEM/dashboard-v13-spec.md     _SYSTEM/archive/loose-cleanup-2026-05/dashboards/
git mv _SYSTEM/dashboard-v14-spec.md     _SYSTEM/archive/loose-cleanup-2026-05/dashboards/
git mv _SYSTEM/dashboard-v15-spec.md     _SYSTEM/archive/loose-cleanup-2026-05/dashboards/
git mv _SYSTEM/dashboard-v15-hotfix.md   _SYSTEM/archive/loose-cleanup-2026-05/dashboards/

# --- _SYSTEM ROOT -> archive/audits ---
git mv _SYSTEM/ADVERSARIAL_STABILITY_AUDIT_2026-04-22.md     _SYSTEM/archive/loose-cleanup-2026-05/audits/
git mv _SYSTEM/ADVERSARIAL_STABILITY_AUDIT_2026-04-22_v2.md  _SYSTEM/archive/loose-cleanup-2026-05/audits/
git mv _SYSTEM/SWARM_ARCHITECTURE_AUDIT_2026.md              _SYSTEM/archive/loose-cleanup-2026-05/audits/
git mv _SYSTEM/YURI_AUDIT_README.md                          _SYSTEM/archive/loose-cleanup-2026-05/audits/
git mv _SYSTEM/SymbiOS-Trademark-Audit.html                  _SYSTEM/archive/loose-cleanup-2026-05/audits/
git mv _SYSTEM/SymbiOS-Trademark-Graph.html                  _SYSTEM/archive/loose-cleanup-2026-05/audits/
git mv _SYSTEM/audit-2026-05-17.html                         _SYSTEM/archive/loose-cleanup-2026-05/audits/
git mv _SYSTEM/audit-2026-05-18.html                         _SYSTEM/archive/loose-cleanup-2026-05/audits/
git mv _SYSTEM/musubi-intelligence-v2-audit.html            _SYSTEM/archive/loose-cleanup-2026-05/audits/
git mv _SYSTEM/musubi-intelligence-v2-audit-v2.html         _SYSTEM/archive/loose-cleanup-2026-05/audits/

# --- _SYSTEM ROOT -> archive/refactor-prompts ---
git mv _SYSTEM/MASTER_STRUCTURE_REFACTOR_PROMPT.md     _SYSTEM/archive/loose-cleanup-2026-05/refactor-prompts/
git mv _SYSTEM/MASTER_STRUCTURE_REFACTOR_PROMPT_v2.md  _SYSTEM/archive/loose-cleanup-2026-05/refactor-prompts/
git mv _SYSTEM/MASTER_STRUCTURE_REFACTOR_v3.md         _SYSTEM/archive/loose-cleanup-2026-05/refactor-prompts/
git mv _SYSTEM/STRUCTURE_REFACTOR_REPORT.md            _SYSTEM/archive/loose-cleanup-2026-05/refactor-prompts/
git mv _SYSTEM/MIGRATION-MAP.md                        _SYSTEM/archive/loose-cleanup-2026-05/refactor-prompts/

# --- _SYSTEM ROOT -> archive/token-ops ---
git mv _SYSTEM/APRIL-2026-TOKEN-ACTION-PLAN.md      _SYSTEM/archive/loose-cleanup-2026-05/token-ops/
git mv _SYSTEM/TOKEN-SMART-CHECKLIST.md             _SYSTEM/archive/loose-cleanup-2026-05/token-ops/
git mv _SYSTEM/token-audit.md                       _SYSTEM/archive/loose-cleanup-2026-05/token-ops/
git mv _SYSTEM/token-tracking-quick-start.md        _SYSTEM/archive/loose-cleanup-2026-05/token-ops/
git mv _SYSTEM/token-regulation-policy.md           _SYSTEM/archive/loose-cleanup-2026-05/token-ops/
git mv _SYSTEM/monthly-token-summary-template.md    _SYSTEM/archive/loose-cleanup-2026-05/token-ops/
git mv _SYSTEM/cost-trends.md                       _SYSTEM/archive/loose-cleanup-2026-05/token-ops/
git mv _SYSTEM/amp-usage-log.md                     _SYSTEM/archive/loose-cleanup-2026-05/token-ops/
git mv _SYSTEM/apr-18-19-burn-analysis.md           _SYSTEM/archive/loose-cleanup-2026-05/token-ops/
git mv _SYSTEM/campaign-2026-05-13-yuri-optimization.md _SYSTEM/archive/loose-cleanup-2026-05/token-ops/

# --- _SYSTEM ROOT -> archive/codex-tasks ---
git mv _SYSTEM/codex-design-suite-task.md        _SYSTEM/archive/loose-cleanup-2026-05/codex-tasks/
git mv _SYSTEM/codex-mem-new-scripts.md          _SYSTEM/archive/loose-cleanup-2026-05/codex-tasks/
git mv _SYSTEM/deepseek-tool-prompt-template.md  _SYSTEM/archive/loose-cleanup-2026-05/codex-tasks/

# --- _SYSTEM ROOT -> archive/misc ---
git mv _SYSTEM/sandbox-improvement-test-run.md   _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/scout-errors-2026-05-13-triage.md _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/security-2026-05-13-remediation.md _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/lane-verification-2026-05-13.md   _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/claudemd-alignment-report.md      _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/claude-ai-instructions.md         _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/session_prompt.md                 _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/model-registry-2026-04-24.md      _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/neural-forge-guide.md             _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/NEURAL-NETWORK-THESIS.md          _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/spec-kit-workflow-bridge.md       _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/EVONEXUS_INTEGRATION_MAP.md       _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/IMAGE-VIDEO-GEN-PROTOCOL.md       _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/CLI-WORKFLOW.md                   _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/CODEX-RUNBOOK.md                  _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/DESIGN-v2-draft.md                _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/musubi-brand-identity.html        _SYSTEM/archive/loose-cleanup-2026-05/misc/
git mv _SYSTEM/yuri-os-launch-readiness.html     _SYSTEM/archive/loose-cleanup-2026-05/misc/

# === REPORTS ROOT -> archive (dated proofs/research/upgreat/presentations) ===
git mv _SYSTEM/reports/YURI_AUTHORIZED_REPLAY_SCOPE_2026-05-24.md   _SYSTEM/archive/loose-cleanup-2026-05/reports-proofs/
git mv _SYSTEM/reports/YURI_BROWSER_REPLAY_PROOF_2026-05-24.md      _SYSTEM/archive/loose-cleanup-2026-05/reports-proofs/
git mv _SYSTEM/reports/YURI_CYBER_PROOF_CARDS_2026-05-23.md         _SYSTEM/archive/loose-cleanup-2026-05/reports-proofs/
git mv _SYSTEM/reports/YURI_CYBER_RETEST_PROOF_2026-05-24.md        _SYSTEM/archive/loose-cleanup-2026-05/reports-proofs/
git mv _SYSTEM/reports/YURI_GUARDRAIL_PROOF_MATRIX_2026-05-22.md    _SYSTEM/archive/loose-cleanup-2026-05/reports-proofs/
git mv _SYSTEM/reports/YURI_MEMORY_ROLLBACK_PROOF_2026-05-24.md     _SYSTEM/archive/loose-cleanup-2026-05/reports-proofs/
git mv _SYSTEM/reports/YURI_PROVENANCE_SCORE_MATRIX_2026-05-24.md   _SYSTEM/archive/loose-cleanup-2026-05/reports-proofs/
git mv _SYSTEM/reports/YURI_RAG_CONFLICT_PROOF_2026-05-24.md        _SYSTEM/archive/loose-cleanup-2026-05/reports-proofs/
git mv _SYSTEM/reports/YURI_NIM_LANE_CALIBRATION_2026-05-21.md      _SYSTEM/archive/loose-cleanup-2026-05/reports-proofs/
git mv _SYSTEM/reports/YURI_PROMOTION_LEDGER_RESEARCH_2026-05-25.md          _SYSTEM/archive/loose-cleanup-2026-05/reports-research/
git mv _SYSTEM/reports/YURI_REGIONAL_INTELLIGENCE_PACKS_2026-05-22.md        _SYSTEM/archive/loose-cleanup-2026-05/reports-research/
git mv _SYSTEM/reports/YURI_SECURITY_LENS_V0_2026-05-22.md                   _SYSTEM/archive/loose-cleanup-2026-05/reports-research/
git mv _SYSTEM/reports/YURI_SECURITY_STRUCTURE_SPRINT_2026-05-24.md          _SYSTEM/archive/loose-cleanup-2026-05/reports-research/
git mv _SYSTEM/reports/YURI_TRUTH_PROMOTION_NEXT_SESSION_2026-05-25.md       _SYSTEM/archive/loose-cleanup-2026-05/reports-research/
git mv _SYSTEM/reports/YURI_TRUTH_PROMOTION_PROVING_PATH_REWORK_2026-05-25.md _SYSTEM/archive/loose-cleanup-2026-05/reports-research/
git mv _SYSTEM/reports/YURI_UPGREAT_DEMO_TRANSCRIPT_2026-05-23.md    _SYSTEM/archive/loose-cleanup-2026-05/upgreat/
git mv _SYSTEM/reports/YURI_UPGREAT_MEETING_PACKET_2026-05-23.md     _SYSTEM/archive/loose-cleanup-2026-05/upgreat/
git mv _SYSTEM/reports/YURI_UPGREAT_MEETING_RELEASE_2026-05-23.md    _SYSTEM/archive/loose-cleanup-2026-05/upgreat/
git mv _SYSTEM/reports/YURI_UPGREAT_PILOT_READINESS_2026-05-22.md    _SYSTEM/archive/loose-cleanup-2026-05/upgreat/
git mv _SYSTEM/reports/YURI_OS_SUPERCHARGE_LOGBOOK_PRESENTATION_2026-05-21.html _SYSTEM/archive/loose-cleanup-2026-05/presentations/
# kagami-sprint-audit-2026-05-19.html -> HOLD: memory PROJ:KAGAMI-AUDIT-TEMPLATE marks it a reusable template. Confirm before:
# git mv _SYSTEM/reports/kagami-sprint-audit-2026-05-19.html        _SYSTEM/archive/loose-cleanup-2026-05/presentations/

# === REPORTS ROOT -> FILE-INTO (active, kept in reports under topic) ===
git mv _SYSTEM/reports/CODEX_FINAL_PASS_comet-retire-gate-fixes_2026-05-29.md   _SYSTEM/reports/codex-final-pass/
git mv _SYSTEM/reports/CODEX_FINAL_PASS_control-plane-rework-2_2026-05-29.md    _SYSTEM/reports/codex-final-pass/
git mv _SYSTEM/reports/SESSION_CLOSEOUT_2026-05-30_energy-user-data.md          _SYSTEM/reports/closeouts/
git mv _SYSTEM/reports/SESSION_CLOSEOUT_2026-05-30_hardening-attack.md          _SYSTEM/reports/closeouts/
git mv _SYSTEM/reports/DEITY_CUTOVER_RUNBOOK_2026-05-29.md                      _SYSTEM/reports/runbooks/
git mv _SYSTEM/reports/MEMORY_VS_SEARCH_DESIGN_2026-05-29.md                    _SYSTEM/reports/design-notes/
git mv _SYSTEM/reports/RAG_MEMORY_TRUTH_REPORT_2026-05-29.md                    _SYSTEM/reports/memory-rag/
git mv _SYSTEM/reports/YURI_CONTROL_PLANE_AUDIT_2026-05-29.md                   _SYSTEM/reports/audits-2026-05/
git mv _SYSTEM/reports/YURI_GROUND_TRUTH_AUDIT_2026-05-28.md                    _SYSTEM/reports/audits-2026-05/
git mv _SYSTEM/reports/YURI_ACTUAL_CAPABILITY_AUDIT_2026-05-25.md               _SYSTEM/reports/audits-2026-05/
git mv _SYSTEM/reports/NEXUS_LINK_REVENUE_PLAN_2026-05-30.html                  _SYSTEM/reports/business/
git mv _SYSTEM/reports/energy-hardening-attack-2026-05-30.md                    _SYSTEM/reports/security/
git mv _SYSTEM/reports/math-operational-simulation-2026-05-25.json             _SYSTEM/reports/math/
```

---

## 7. Residual risks + unsure-flagged-KEEP

**Flagged KEEP for safety (ambiguous → not moved):**
1. `RESUME_backend-removal_2026-05-29.md` — referenced by `.claude/tasks/<id>` (transient) AND tracked by Claude-memory `PROJ:BACKEND-REMOVAL-RESUME`. It's an active resume anchor. Kept in `reports/` root. Could FILE-INTO `reports/resume/` once owner confirms backend removal is done.
2. `kagami-sprint-audit-2026-05-19.html` — zero hard refs, but memory `PROJ:KAGAMI-AUDIT-TEMPLATE` calls it a *reusable template for future presentations*. **HOLD** in `git mv` block (commented out). Owner decides: keep as living template vs archive.

**Residual risks:**
- **Reference detection is grep-based, scoped.** A file could be loaded dynamically by a path computed at runtime (string-concatenated) and not appear in a literal-basename grep. Mitigation: scope already covers all `_SYSTEM/Scripts` + hooks; the registry pattern caught the non-obvious wiring. Low residual risk for the 51 zero-ref `_SYSTEM` files, very low for dated handoffs/dashboards/audits.
- **`yuri-os-dashboard.html` (repo root, NOT in scope here)** is the tracked dashboard snapshot per folder-registry. The archived `dashboard-v*-spec.md` files are the *specs* that produced it, not the snapshot — safe to archive, snapshot stays.
- **External readers (Obsidian/wiki).** `.obsidian` may index these by path; moving won't break YURI runtime but could shift Obsidian links. Cosmetic only.
- **`.codex` / `.agents` surfaces** were not in the primary grep scope. Quick spot-check recommended before executing the `git mv` block if any archived file name looks codex-adjacter (the `codex-*-task.md` files are one-shot task notes, very low risk).
- **No `git mv` runs automatically.** Folders must be `mkdir -p`'d first (pre-flight block included). All moves preserve history via `git mv`.

**Verification recommendation before executing:** run `node _SYSTEM/Scripts/context-router.mjs "<any task>"` after the moves on a test branch to confirm no packet anchor resolution breaks (none should — all anchors are KEEP).
