---
name: proj-corpus-transform-contract-conformance-2026-06-13
description: Corpus-transform pass-1 shipped contract-conformance gate (the one capability-first-proven gap); registry 27; red-team caught 8 flaws all fixed
metadata: 
  node_type: memory
  tier: 2
  scope: project
  trig: 
    - corpus transform
    - CL4R1T4S
    - ai-engineering-from-scratch
    - contract conformance
    - output contract
    - lane result grammar
    - scope gate
  refs: 
    - proj-external-corpus-to-yuri-2026-06-13
    - ref-capability-first-wiring
    - feedback-gate-hardening-fail-closed
    - ref-simulation-arsenal
  type: project
  originSessionId: 25204091-facb-496b-bb55-e478a843aca2
---

GOAL: transform the two external corpora (CL4R1T4S, ai-engineering-from-scratch-zh) into YURI by extracting STRUCTURE, capability-first-gating each candidate, building only genuine gaps math-wired + registered.

WHO: Marcel (build authorization "continue corpus full transform, full agentic work"). Both repos = untrusted DATA (CL4R1T4S no-copy/AGPL/injection-as-data; ai-eng never-exec/MIT/read-only).

WHEN: 2026-06-13.

WHERE: built `_SYSTEM/Scripts/contract-conformance.mjs` (+ .test.mjs, 24 tests). Doc `02_RESOURCES/RESEARCH/external-corpus-to-yuri-2026-06-13.md` → "TRANSFORM EXECUTED — pass 1".

STATE: pass-1 DONE. capability-first + xref gate verdicts: ai-eng 09 RL/calibration = COVERED (energy-gate-scoring + gpd-shadow + eval sequential-stopping, no build); 13 MCP = plumbing exists; 17 observability = NOT built (redundancy risk w/ energy-trace + prediction-ledger — refused to manufacture work). The ONE defensible gap = CL4R1T4S #5 output/format + #3 tool-use/scope contract: prompt-compiler `compileOneTransactionContract` DECLARES output_schema/scope/flags but nothing checked a PRODUCED output → built the conformance gate (also the first executable parser for yuri-origin's prose Lane Result Grammar). `@capability: contract-conformance`, registry 26→27, pre-commit --check clean. ADVISORY — NOT wired into any enforcing hook (owner-gated + Codex pass first). 5-lens Workflow red-team (runId wf_71ec662f-5c1) found 8 REAL flaws on my first-green build (../-traversal scope escape, nested/sibling-prefix miss, prose-label grading, blockedMode laundering, 3× fail-open throw, 40% narration false-positive) — ALL fixed + locked as regressions + re-attacked clean. Fixes: segment-aware normalized scope + always-on yuri-origin protected-surface floor + marker-anchored label + terminal-driven blockedMode + top-level fail-closed try/catch + precision-first soft scanners.

WIRING (2026-06-13, advisory/DISARMED): owner sequence = Codex(advisory,non-gating) → harden → wire, gated on full xref + quantum sim. Codex gpt-5.5 found 3 real pre-wiring blockers (non-string invokedPaths drop scope; prose allowed_scope false-fails paths; command_output_caps unenforced) — ALL fixed + 6 tests (commit 4dbc2e53). Full xref: no .mjs point has contract+final-output together (reconciles in backend orchestration). Quantum sim (quantum-hypothesis-tracker, /tmp/wiring-order-sim.mjs): C–S(mutating sanitize) NON-commuting ‖[]‖=0.70 → run on FINAL output post-sanitize; C–E(energy) commuting 0.00 → placement free; Schmidt conformance↔output rank2. CONVERGES with Codex "wire after final capture." Built `contract-conformance-trace.mjs` (recordConformance DISARMED soak + CANONICAL/SCOPE_AUDIT contracts, registry 27→28), gate gained `expects_result_label:false`, wired `yuri-closeout.mjs` advisory scope-audit on scoped /eot (mirrors claimIntegrity, non-blocking, soak→_SYSTEM/state/contract-conformance-soak.jsonl). 37 tests green. Commits 72076163 + 4dbc2e53 pushed; wiring commit pending.

ENFORCEMENT ARMED (2026-06-13, owner approved "both, lets go"): arm = env YURI_CONFORMANCE_ENFORCE=1 OR flag-file _SYSTEM/state/contract-conformance-enforce.enabled (mirrors energy-enforce; local runtime, NOT committed, delete to stand down). HARD-checks-only (scope-containment/label-grammar/scope-input-malformed) — soft checks stay advisory even armed. Armed surfaces: yuri-closeout scoped /eot → BLOCKED+exit2 on enforce-block (defense-in-depth; collectPaths pre-guards most), and opt-in CLI `contract-conformance-trace.mjs scope|check` exit2. HOST CORRECTION (evidence): backend (ConclaveOS/swarmOrchestrator) is DEAD (only .test.mjs refs, no live import); llm-lane carries NO contract + raw outputs → blanket lane enforce impossible+unsafe (label-less→all FAIL), deliberately NOT done. Flag ARMED now. 38 tests green. Verified: .env/traversal→exit2, clean→exit0, soft-only→never blocks.

NEXT: deeper step (build, not wire) = a real lane-output↔contract reconciliation point in the live flow (genome promptContract meets lane final output) — doesn't exist today. Pass-2 corpus (optional): formalize a remaining prose dim only where a checkable mechanism is genuinely absent. Codex-lane unauthorized scaffolding (receiving/requesting-code-review skills, .codex/agents, memory) — owner said DON'T REVERT, keep.

SEE: the honest finding holds — YURI already mechanizes most of what both corpora teach; capability-first prevented ~5 redundant builds. Reinforces [[feedback-gate-hardening-fail-closed]] (lexical→segment-aware, fail-closed never-throw) and the [[ref-capability-first-wiring]] mandate. First-run green is a hypothesis — the adversarial fan-out earned its keep.
