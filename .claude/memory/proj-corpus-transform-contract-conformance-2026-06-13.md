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

NEXT: commit pending owner approval. Pass 2 (optional): only formalize a remaining prose dim where a checkable mechanism is genuinely absent — do NOT build observability/MCP redundantly.

SEE: the honest finding holds — YURI already mechanizes most of what both corpora teach; capability-first prevented ~5 redundant builds. Reinforces [[feedback-gate-hardening-fail-closed]] (lexical→segment-aware, fail-closed never-throw) and the [[ref-capability-first-wiring]] mandate. First-run green is a hypothesis — the adversarial fan-out earned its keep.
