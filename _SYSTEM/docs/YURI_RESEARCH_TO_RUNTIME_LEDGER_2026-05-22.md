# YURI Research-To-Runtime Ledger

Date: 2026-05-22
Owner: Codex/main + Kagami
Purpose: make research ingestion auditable as runtime behavior, not vague inspiration.

## Rule

Every major research pack must have one of four statuses:

- **runtime-active**: code, tests, or gates call it directly.
- **control-plane-active**: YURI does not run the upstream project, but its pattern is encoded in gates, tests, prompts, schemas, or operating policy.
- **research-only**: archived for future implementation; not active behavior.
- **rejected**: useful to study, but intentionally not adopted.

## Current Ledger

### Weft / WeaveMind

Source:

- `_SYSTEM/research-archive/yuri-cybersecurity-pivot-2026-05/weft_audit_pack.md`

Status: **control-plane-active**

What it became:

- "Architecture should compile" became a YURI operating rule.
- Gate 0 requires evidence before dispatch instead of letting lanes improvise context.
- `lane-kernel.mjs` centralizes lane truth instead of scattering model/router definitions.
- `rails.mjs`, event-bus tests, and control-plane tests turn orchestration assumptions into checkable contracts.

What it did not become:

- YURI does not run the Weft language, compiler, dashboard, Restate services, or sidecar runtime.
- No Weft dependency is installed.

Next runtime upgrade:

- Add a YURI graph-manifest layer for agent workflows: typed nodes, explicit ports, compile-style validation, and graph visualization without adopting Weft wholesale.

### ASI-Evolve

Source:

- `_SYSTEM/research-archive/yuri-cybersecurity-pivot-2026-05/ASI-EVOLVE-FULL-PACK.md`

Status: **control-plane-active**

What it became:

- The sprint pattern changed to cognition base -> candidate proposal -> local eval/lab -> analyzer report -> persistent evidence.
- Cyber work uses this shape through the threat-intel matrix, `ThreatIntelKernel`, Security Lens, lab harness, guardrail proof, and pilot readiness artifacts.
- Shintai artifact supersession borrows the "learn from analyzer reports, not raw logs" idea.

What it did not become:

- YURI does not yet run a full autonomous evolutionary search database.
- There is no UCB1/MAP-Elites sampler over YURI experiments yet.
- There is no automated mutation engine that proposes and evaluates new YURI architecture variants end to end.

Next runtime upgrade:

- Add an experiment ledger for controlled YURI improvements: hypothesis, candidate patch, evaluator, metrics, analyzer report, score, supersession link.

### EverMind-AI MSA

Source:

- `_SYSTEM/tools/MSA`
- `_SYSTEM/docs/YURI_MEMORY_RAG_SKILL_RESEARCH_2026-05-21.md`

Status: **control-plane-active with research-only scorer**

What it became:

- YURI memory architecture separates large background memory from active prompt context.
- `memory-kernel.mjs` exposes memory surfaces, evidence inventory, recall, write proposal, promotion, audit, and protected-surface denial.
- Gate 0 loads MSA evidence for memory/RAG/self-improvement work.
- `memory-kernel.mjs` exposes an `msa` scorer mode as a research marker.

What it did not become:

- The actual MSA sparse-attention runtime is not wired into Rick, Shintai, or Kagami.
- The current `msa` scorer falls back to local lexical scoring.
- No GPU-backed sparse memory index is active.

Next runtime upgrade:

- Build a YURI-owned sparse memory router: offline encode, online route, context assembly, provenance display, and multi-hop fallback.

### YURI AI Cybersecurity Capability Audit

Source:

- `_SYSTEM/session-outputs/YURI-AI-CYBERSECURITY-CAPABILITY-AUDIT.md`
- `_SYSTEM/session-outputs/YURI-AI-CYBERSECURITY-CAPABILITY-AUDIT.route-plan.json`

Status: **runtime-active**

What it became:

- Required cyber evidence in `evidence-contract.mjs` and `yuri-control-plane.mjs`.
- Strategic input for `_SYSTEM/docs/YURI_OS_CYBERSECURITY_COMPANY_SUPERCHARGE_GOAL_2026-05-22.md`.
- A driver for Security Lens, Cyber Lab Harness, Guardrail Proof, and Upgreat pilot readiness.

What it did not become:

- It is not a finished product claim.
- It does not make YURI a SOC, MDR, XDR, SIEM, or offensive security provider yet.

Next runtime upgrade:

- Convert audit claims into client-facing proof cards backed by lab evidence, scanner output, and release-gate verification.

## Current Gap

Research is now captured, but not every research pack is fully executable. The next system upgrade is to make this ledger machine-readable so Gate 0 can say:

- what is active;
- what is research-only;
- which runtime modules consume it;
- what proof exists;
- what implementation gap remains.

