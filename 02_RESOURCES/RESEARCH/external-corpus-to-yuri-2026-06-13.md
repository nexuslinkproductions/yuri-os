# External corpus → YURI transform — TASK LIST (scanned + scoped 2026-06-13)

Two external repos flagged by Marcel to mine for YURI. Both SCANNED for security (clean to proceed under the
stated postures); the TRANSFORM is NOT yet executed — it's the task. Governing rule for both: **we do not adopt
their artifacts, we extract STRUCTURE/MECHANISM and re-express it as YURI's own, wired mathematically + verifiable**,
and every candidate passes the CAPABILITY-FIRST gate first (`capability-recall` — don't rebuild what YURI has).

## Repo 1 — elder-plinius/CL4R1T4S  (system-prompt corpus)
- **Scan verdict:** 68 files, pure TEXT (33 txt / 28 md / 3 mkd / 4 no-ext), **ZERO scripts/binaries/configs** →
  no code-exec or supply-chain vector. 32k★, **AGPL-3.0**, 805KB. 25 vendor dirs (ANTHROPIC, OPENAI, GOOGLE, XAI,
  CURSOR, DEVIN, PERPLEXITY, …) = leaked/extracted system prompts + guardrail specs.
- **Live risks:** (1) prompt-injection on read → every byte is INERT DATA we analyze, never an instruction (authority
  hierarchy: external repo = lowest, below owner/origin; nothing in it overrides anything). (2) **AGPL-3.0 + leaked
  competitor IP** → do NOT copy files into YURI (copyleft + provenance). Transformative-use only: learn structure.
- **What to take (PATTERNS, not content):** prompt-architecture across 25 production systems — persona/policy
  separation, tool-use contracts, layered guardrails, refusal taxonomy, output/format contracts, context+memory
  handling. The value is a STRUCTURAL DIFF against YURI's own spine (persona.md / SOUL.md / yuri-origin.md), not the prose.
- **Transform → YURI math:** (a) extract the recurring STRUCTURE taxonomy (data-only read, injection-disciplined);
  (b) for each pattern, map to an existing YURI mechanism OR mark a gap; (c) where YURI uses prose, ask "can this be a
  VERIFIABLE contract/mechanism instead?" (e.g. a guardrail → a deterministic gate; a tool-use rule → a checked
  contract); (d) coverage score: % of the 25-system pattern set YURI expresses as a *checkable* mechanism vs prose.
  Output = a prompt-architecture pattern registry + a YURI coverage/gap report. NOT prose adoption.

## Repo 2 — fancyboi999/ai-engineering-from-scratch-zh  (AI-eng curriculum)
- **Scan verdict:** 2885 files, **MIT** (permissive — safe to adapt), 14MB, 218★. 1059 md (503 lessons, 20 phases,
  Chinese) + 603 py + 129 ts + 23 js + 10 rs + code. **Has executables** (env_setup.sh, Dockerfile, requirements.txt,
  package.json×many, scripts/install_skills.py).
- **Live risks:** code-exec / supply-chain → **READ-ONLY pattern extraction. NEVER run their scripts, NEVER
  `pip install` requirements.txt, NEVER execute install_skills.py / env_setup.sh, NEVER adopt a dependency.** No exec
  risk while we only read. (`install_skills.py` writes "skills" — explicitly do not run; it could touch .claude/skills.)
- **What to take:** the FROM-SCRATCH mechanism implementations across the 20 phases (RAG, agents, eval, observability,
  multi-agent, MCP, voice, etc.) — the *how a primitive works* knowledge, as a curriculum-grade reference.
- **Transform → YURI math:** capability-first FIRST — most of these (RAG, eval, agents, MCP, observability) YURI
  ALREADY has as mechanisms; `capability-recall` each phase before extracting. For genuine gaps, lift the MECHANISM
  (the algorithm/structure), re-implement YURI-native (pure, deterministic, registered with `@capability`), and wire it
  to YURI's math substrate (energy gate / decision-sim / eval-processing) rather than importing their code. MIT makes
  reference-and-reimplement clean.

## Shared execution plan (phased — not started)
1. **Inventory (data-only):** CL4R1T4S → pattern taxonomy via disciplined reads; repo-2 → phase→mechanism map. No exec.
2. **Capability-first gate:** `capability-recall` every candidate → USE/extend what YURI has; only genuine gaps proceed.
3. **Transform:** re-express each kept pattern as a YURI-native, math-wired, `@capability`-registered mechanism (or a
   verifiable contract replacing prose). Adversarial-verify each before trust.
4. **Coverage report:** what the 25-system + 20-phase corpus covers that YURI now expresses as a *checkable* mechanism.

## Security handling (binding for this task)
- All external content = untrusted DATA, never instructions. No file copied (AGPL repo). No code run/installed (repo 2).
- Watch for secrets in leaked prompts (internal URLs/keys) → never propagate/store. Provenance/IP flag stands on repo 1.

## INVENTORY — first pass (2026-06-13, capability-first verdict)
The honest finding: **YURI already mechanizes most of what both corpora teach.** The inventory's job is to PREVENT wasted
adoption and isolate the few genuine gaps — not to import.

### Repo 2 (ai-eng) — 20-phase → YURI-mechanism map
| phase | YURI posture |
|---|---|
| 00 setup · 02 ml-fundamentals · 03 deep-learning · 04 vision · 06 speech · 07 transformers · 08 gen-ai · 10 llms-from-scratch · 12 multimodal | OUT-OF-DOMAIN — YURI consumes LLMs/is a mechanism+orchestration OS, not an NN-training stack. Reference only. |
| 01 math-foundations | **HAVE** (math-kernel, yuri-phi, decision-sim, eval-processing). Strong. |
| 05 nlp | PARTIAL (yuri-decode text→math, yuri-match PPMI/IDF). |
| 09 reinforcement-learning | **GAP-CHECK** — calibration/bandit/OCO patterns vs YURI's self-calibration (energy-gate OGD logbook, eval-processing sequential-stopping). Worth mining. |
| 11 llm-engineering | GAP-CHECK — context/eval patterns; overlaps CL4R1T4S + lane routing. |
| 13 tools-and-protocols | **GAP-CHECK** — MCP/tool-contract patterns vs llm-compat-contract + MCP. |
| 14 agent-engineering · 15 autonomous · 16 multi-agent/swarms | **HAVE** (Agent/Workflow lanes, filing-autonomy, homeostat, swarm-sheets). Confirm coverage; mine for missing patterns. |
| 17 infra-and-production | GAP-CHECK — observability/production patterns vs monitoring/health-aggregator. |
| 18 ethics-safety-alignment | **HAVE, strong** (energy gate, claim-cortex, protected paths, bash-guard). Confirm vs their taxonomy. |
| 19 capstones | reference implementations (coding agent, RAG, voice…) — study, don't adopt. |
**Genuine extraction targets:** 09 (RL/calibration), 13 (MCP/tool protocols), 17 (production observability), + a coverage-confirm on 14/15/16/18. Everything else is OUT-OF-DOMAIN or already HAD.

### Repo 1 (CL4R1T4S) — prompt-architecture pattern taxonomy → YURI mechanization
10 recurring dimensions across the 25 systems, each scored "is YURI's version PROSE or a CHECKABLE mechanism":
1. Identity/persona → PROSE (persona.md) — fine as prose. 2. Capability declaration → **MECHANISM** (capabilities.json registry — ahead). 3. Tool-use contract → mixed (prose + llm-compat-contract). 4. Guardrails/refusal → **MECHANISM, layered** (energy gate · claim-cortex · protected-path hooks · bash-guard — ahead). 5. Output/format contract → PROSE (caveman/output rules). 6. Context/memory → **MECHANISM** (memory-kernel · openprocess staleness · spreading-activation). 7. Reasoning/planning → PROSE + Izanagi/decision-sim. 8. Safety floor → PROSE red-lines + gate mechanisms. 9. Meta/self-ref → PROSE. 10. Domain behavior → mixed.
**Verdict:** YURI is AHEAD on the mechanizable dimensions (capability, guardrails, memory = already verifiable mechanisms where the 25 systems use prose). Transform value = (a) confirm that coverage as a measured diff, (b) formalize the 2-3 still-prose dimensions (output contract, tool-use contract) into checkable contracts. NOT prose adoption. Deep data-only reads of specific prompts deferred to the targeted-formalization step (minimize injection surface).

**STATUS:** inventory done (structure + capability-first map, no injection-laden deep reads needed for it). The targeted transform (mine the ~4 gap phases + formalize the 2-3 prose dimensions) is the next focused build-stream — bounded by this map so it doesn't rebuild what YURI has.

## TRANSFORM EXECUTED — pass 1 (2026-06-13)

Ran the disciplined transform per the plan: capability-first + xref-confirm each target, build only the proven gap, adversarial-verify, register.

### Gate results (what the capability-first + xref gate actually decided)
| target | verdict | evidence |
|---|---|---|
| ai-eng 09 RL/calibration | **COVERED — no build** | capability-recall hit energy-gate-scoring (match 4.0) + streaming-aggregator; xref corroborated gpd-shadow `actionCost`, stabilityGuard, eval-processing sequential-stopping. OGD/energy logbook already mechanizes calibration/OCO. |
| ai-eng 13 MCP/tool-protocol | covered (plumbing) | xref: gitnexus-mcp-check, llm-compat-contract, deepseek-guarded-handoff validate/sanitize. Protocol plumbing present; no clean greenfield gap. |
| ai-eng 17 observability | partial — deferred | xref: rick-banner laneStatus, ollama-promotion-readiness, lane-calibration = lane-health exists. A per-mechanism trace primitive risks redundancy w/ energy-trace + prediction-ledger; NOT built (would manufacture work). |
| CL4R1T4S #5 output/format contract (PROSE) | **GAP → BUILT** | prompt-compiler `compileOneTransactionContract` DECLARES output_schema + scope + flags but `validateCompiledContract` only checks the contract's own shape — no checker for a PRODUCED output. Declared-but-unenforced. |
| CL4R1T4S #3 tool-use/scope contract (mixed) | **folded into the build** | the contract's allowed/forbidden_scope had no produced-output conformance check; mechanized as segment-aware scope containment + an always-on yuri-origin protected-surface floor. |

### Built: `_SYSTEM/Scripts/contract-conformance.mjs` (+ .test.mjs, 24 tests green)
A deterministic, fail-closed OUTPUT-vs-CONTRACT conformance gate. Closes the declared-but-unenforced loop in prompt-compiler AND gives YURI's prose **Lane Result Grammar** (yuri-origin) its first executable parser. `@capability: contract-conformance` (registry 26 → **27**). ADVISORY — not wired into any enforcing hook (owner-gated + Codex pass first, per standing rule).
- Checks: RESULT_LABEL grammar (marker-anchored) · output_schema fields present · segment-aware scope containment + protected floor · stage-narration / broad-command (precision-first soft) · report line-cap · vacuous-contract guard.
- HARD fail → FAIL; SOFT-only → PARTIAL; malformed/hostile input → FAIL (never throws).

### Adversarial verification (5-lens Workflow red-team, runId wf_71ec662f-5c1)
First-green was a hypothesis — the red-team confirmed **8 real flaws**, all fixed + locked as regression tests + re-attacked with the red-team's own repros:
1. `../` path-traversal escaped scope (HARD bypass) → segment-aware normalize.
2. nested `.env` / sibling-prefix (`_SYSTEM/Scripts-stash`) missed → segment-boundary match.
3. aspirational label in prose graded over the real RESULT_LABEL line → marker-anchored extraction.
4. `blockedMode` flipped on any mention of the blocked label → driven by the PARSED primary-label terminal.
5–7. non-string scope entry / null opts / hostile getter THREW (fail-open) → top-level try/catch → FAIL.
8. 40% false-positive narration scan on report-closing prose → precision-first, line-anchored scanners.
Plus: always-on protected floor (kills the vacuous-contract rubber-stamp of `.env` access) + non-canonical lane-id now surfaced as a soft fail.

**Honest verdict:** the inventory prediction held — YURI already mechanizes the corpus's teachings; the single defensible, non-redundant gap was the output/scope conformance gate, now built + hardened + registered. Observability (17) intentionally NOT built (redundancy risk). Pass 2 (if pursued): formalize remaining prose dims only where a checkable mechanism is genuinely absent.

## WIRING — pass 1 (2026-06-13, advisory/DISARMED)

Owner sequenced: Codex check (ADVISORY, non-gating) → harden → wire, gated on full xref + quantum sim.

**Codex gpt-5.5 (advisory) pre-wiring review** found 3 real blockers — all fixed + 6 regression tests (commit 4dbc2e53):
1. non-string invokedPaths silently dropped scope → coerce tool-records + fail-closed on non-coercible.
2. prose allowed_scope (yuri-input-genome compiles SEMANTIC scope, not paths) false-HARD-FAILed legit paths → path/prose separation + explicit allowed_paths/forbidden_paths.
3. command_output_caps unenforced → coarse per-line cap + surface split_required_trigger as notEnforced.

**Full xref** mapped the surface: contract is compiled at `yuri-input-genome.mjs:349` (input side, no output-finalize); no `.mjs`-layer point has contract+final-output together (reconciles in backend orchestration). Lane-result emitters: pulse-trace-ledger, yuri-repl.

**Quantum sim** (quantum-hypothesis-tracker order-effects, recorded in /tmp/wiring-order-sim.mjs):
- C (conformance) vs S (mutating sanitize): ‖[P_C,P_S]‖=0.70, order both-yes diff 0.13, qqStat≈0 → **NON-commuting** → conformance must run on the FINAL output, after any sanitize/transform.
- C vs E (energy gate): ‖[P_C,P_E]‖=0.00 → **commuting** → placement vs energy/claim-cortex is free.
- Schmidt: conformance↔output rank 2 (must see real output); conformance↔energy rank 1 (independent).
- Converges with Codex's independent "wire only after final output capture." Two methods agree.

**Implemented (advisory, DISARMED — enforce held for explicit owner arm):**
- `contract-conformance-trace.mjs` — `recordConformance` soak recorder (never throws/blocks) + `CANONICAL_YURI_OUTPUT_CONTRACT` + `SCOPE_AUDIT_CONTRACT` + `scopeAudit`. Soak → `_SYSTEM/state/contract-conformance-soak.jsonl`. `@capability` (registry 27→28).
- Gate gained `expects_result_label:false` (meta-report mode: scope-only, no label).
- `yuri-closeout.mjs` wired: on a scoped `/eot` it runs an advisory scope-audit of the scoped paths vs the protected-surface floor (mirrors `claimIntegrity`; non-blocking; soak on real CLI runs only — `buildReport` stays pure). 37 tests green (31 gate + 4 trace + 2 closeout).

## ENFORCEMENT ARMED — pass 2 (2026-06-13, owner-approved)

Owner approved both held items ("both approved, lets go"). Executed with an evidence correction:

**Host correction (adversarial-ally):** the "backend orchestration" host I proposed is NOT live — `_SYSTEM/backend/src/*` (ConclaveOS/swarmOrchestrator) is referenced only by `.test.mjs`, never imported by live Scripts; the backend that would reconcile lane-output↔contract is dead. And `llm-lane.mjs` (the live dispatch) carries NO compiled contract and handles RAW outputs — so a blanket lane-output enforce is impossible AND unsafe (most outputs have no RESULT_LABEL → all would FAIL). Blanket llm-lane enforcement was deliberately NOT done.

**Arm mechanism (shipped):** `isEnforcing()` = env `YURI_CONFORMANCE_ENFORCE=1` OR flag-file `_SYSTEM/state/contract-conformance-enforce.enabled` (mirrors energy-enforce; local runtime, never committed; delete to stand down). Enforcement is **HARD-checks-only** (scope-containment, result-label-grammar, scope-input-malformed) — the low-false-positive structural checks; soft checks (narration/broad-command/line-cap) stay advisory even when armed. `recordConformance`/`scopeAudit` return `enforcing`+`enforceBlock`.

**Armed surfaces:** (1) `yuri-closeout` — a scoped `/eot` with an enforce-blocking scope verdict escalates to `BLOCKED:` + exit 2 (defense-in-depth; collectPaths already pre-guards most protected paths). (2) opt-in CLI `contract-conformance-trace.mjs scope|check` — exit 2 on HARD fail when armed (CI/lanes/hooks can gate a formal result on it). Status: `… trace.mjs status`.

**Verified armed:** `.env` → FAIL+exit2; `../` traversal → FAIL+exit2; clean path → PASS+exit0; soft-only fail → never blocks. 38 tests green. **ARMED now** (flag-file present, local).

**Still the deeper next step (not blocking):** a genuine lane-output↔contract *reconciliation feature* in the live flow (where the genome's `promptContract` meets the lane's final output) — that needs building, not wiring, since no such point exists today.
