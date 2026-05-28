# YURI Ground-Truth Audit

**Generated:** 2026-05-28
**Owner:** Marcel Spatz (operator), Claude (synthesis), advisory only
**Promotion state:** `research`
**Evidence boundary:** Local file/test evidence + curated test execution. No external production claim.
**Supersedes:** Nothing. Extends [_SYSTEM/reports/YURI_ACTUAL_CAPABILITY_AUDIT_2026-05-25.md](YURI_ACTUAL_CAPABILITY_AUDIT_2026-05-25.md).

---

## 1. Purpose & Scope

This audit is the second layer underneath the 2026-05-25 capability audit.

**The 2026-05-25 audit answered:** What is YURI's identity, what claims have we rejected, what are the domain ratings?

**This audit answers:** Where exactly does YURI's operating surface begin and end at the file level, what runs, what's noise that should be parked, what's vestigial, and what's the honest operating shape underneath the documentation?

**Why now:** A methodology paper is being prepared (target ship 2026-07-23) that cites YURI as a working reference implementation of energy-landscape gating for agent control planes. That citation has to be defensible. This audit is the foundation that lets the paper say "YURI does X" without inviting refutation by anyone who actually opens the repo.

**Scope boundary chosen for this pass:** **operating surface only**. Full-repo inventory deferred. The operating surface is: `_SYSTEM/` control plane, `skills/` library, root canonical anchors (`SOUL.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`), and runtime scripts in `_SYSTEM/Scripts/`. Human workspace (`00_–04_`), provider adapters (`.claude/`, `.codex/`), runtime caches, and external checkouts are out of scope for this pass.

**Evidence basis:** Curated test execution on 8 critical scripts (7 pass, 1 fail). Existence verification by directory listing and file read on the rest. Registry cross-reference against `_SYSTEM/config/artifact-registry.json` and `_SYSTEM/config/folder-registry.json`.

---

## 2. Accepted Identity (Carried Forward + Sharpened)

The 2026-05-25 audit established:

> *YURI is a governed local AI control plane for single-operator research, engineering, memory, audit, math, and creative operations.*

This audit **carries that statement forward unchanged** at the top-level identity layer. The sentence survived inventory verification.

**Operational addendum** (new this audit):

YURI is a **filesystem-as-architecture multi-lane orchestration substrate** with the following durable real surfaces:

1. A canonical authority layer (`yuri-origin.md` + `SOUL.md` + adapter inheritance)
2. A machine-readable context-routing layer (`context-registry.json` + `context-router.mjs`)
3. A folder and artifact classification layer (`folder-registry.json` + `artifact-registry.json`)
4. A multi-lane dispatch layer (Shintai dispatch, offload contract, lane sessions, claim-integrity gate)
5. A mathematical operating substrate (kernel + formula banks + proof gate + visual labs)
6. A 110-skill canonical library at `skills/` with provider adapter mirrors
7. A persistent CLI / tmux harness (Kagami / Rick interaction surface)

Everything else in the repository is either: parked-but-not-active, vestigial, runtime cache, generated artifact, external research checkout, or human-workspace material.

---

## 3. Rejected Identity Claims (Reaffirmed + Extended)

All 2026-05-25 rejections carry forward:

- Not an operating system in the literal sense
- Not a SOC, SIEM, XDR, MDR
- Not a cybersecurity company
- Not a production-ready managed service
- Not an autonomous pentest platform
- Not a runtime protection product
- Fixture proof is not production proof

**This audit adds:**

- Not an "AI agent framework" in the LangGraph / AutoGen / CrewAI sense. YURI does not provide a published API surface for third-party developers; it is a single-operator control plane with adapter doors.
- Not a memory/RAG platform. Memory and RAG surfaces exist but are flagged `research` with weak provenance authority; promoting them to `trusted` would be overclaim.
- Not a backend platform. The `backend/` runtime is `legacy_backend_runtime`, sealed, and not part of the operating surface.
- Not a self-improving autonomous system. Autonomy work routes through dry-run-first manifests and explicit operator approval gates. No L3+ autonomous action is current truth.
- Not a "trained model" or ML research artifact. YURI does not train or fine-tune models. It orchestrates calls to existing model lanes.

---

## 4. Capability Matrix

Six classification states applied to the operating surface:

| State | Definition | Action |
|---|---|---|
| **REAL & RUNNING** | Code exists, tests pass, executable evidence confirms behavior | Cite confidently in paper |
| **REAL UNVERIFIED** | Code exists, may run, no proof gate or test confirms | Cite with qualification |
| **DOCUMENTED NOT BUILT** | Referenced in docs/registries but no working implementation | Strip from paper claims |
| **VESTIGIAL** | Built once, no longer referenced by current work | Park, don't delete |
| **PARKED NOISE** | Real implementation but outside current operating identity | Park, document why |
| **TRASH** | Actively broken, duplicated, or misleading | Remove |

---

### 4.1 REAL & RUNNING (Signal — Cite Confidently)

These have **passing test evidence executed during this audit** and clear operating function.

| Capability | Path | Test Evidence | Notes |
|---|---|---|---|
| Math kernel (entropy, KL, log-loss, Brier, Bayes, vectors, graph search) | [_SYSTEM/Scripts/math/math-kernel.mjs](../Scripts/math/math-kernel.mjs) | 11/11 PASS | Core scalar primitives. Foundation for paper's U(state) composition. |
| Math proof gate | [_SYSTEM/Scripts/math/math-proof-gate.mjs](../Scripts/math/math-proof-gate.mjs) | 8/8 PASS | Executable example + counterexample verification for formula bank entries. |
| Lane session management | [_SYSTEM/Scripts/lane-session.mjs](../Scripts/lane-session.mjs) | 7/7 PASS | Per-lane session isolation. NIM model-instance isolation. |
| Shintai dispatch (multi-lane council) | [_SYSTEM/Scripts/shintai-dispatch.mjs](../Scripts/shintai-dispatch.mjs) | 17/17 PASS | Parallel multi-lane fan-out with persona anchor. |
| Context router | [_SYSTEM/Scripts/context-router.mjs](../Scripts/context-router.mjs) | 3/3 PASS | Selects context packet from registry per task. |
| **Claim integrity gate** | [_SYSTEM/Scripts/claim-integrity-gate.mjs](../Scripts/claim-integrity-gate.mjs) | 11/11 PASS | **Built after 2026-05-25 audit. Was scoped as missing; is now present and passing.** |
| Artifact registry validator | [_SYSTEM/Scripts/artifact-registry.mjs](../Scripts/artifact-registry.mjs) | 6/6 PASS | Validates durable artifacts and classifies future paths. |

### 4.2 REAL & RUNNING — Trusted by Existence (Not Re-Executed in this Pass)

Tested at some point, registered in `artifact-registry.json` as `active`, but not re-executed during this audit. Cite with qualifier "verified at registration."

- Formula banks: `_SYSTEM/data/math/formula-banks/{information-theory,graph-search,probability-calibration,vector-geometry,scoring-normalization,business-fixtures}.v0.json`
- Math adapters: `_SYSTEM/Scripts/math/math-adapters.mjs`
- Math health: `_SYSTEM/Scripts/math/math-health.mjs`
- Math operational simulation: `_SYSTEM/Scripts/math/math-operational-simulation.mjs`
- YURI harness primitives: `_SYSTEM/Scripts/yuri/{event-protocol,harness-state,prompt-compiler,run-recorder,status-line,symbiotic-pulse}.mjs`
- Kagami event bus: `_SYSTEM/Scripts/kagami-event-bus.mjs`
- Lane arbitration: `_SYSTEM/Scripts/lane-arbitration.mjs`
- Lane persona map: `_SYSTEM/Scripts/lane-persona-map.mjs`
- Offload contract + runner: `_SYSTEM/Scripts/offload-contract.mjs`, `_SYSTEM/Scripts/offload-runner.mjs`, `_SYSTEM/Scripts/offload.sh`
- Yuri closeout (lean EOT): `_SYSTEM/Scripts/yuri-closeout.mjs`
- Autonomy runner (dry-run-first): `_SYSTEM/Scripts/yuri-autonomy-runner.mjs`
- Workcell core + capture: `_SYSTEM/Scripts/yuri-workcell.mjs`, `_SYSTEM/Scripts/yuri-workcell-capture.mjs`

### 4.3 REAL UNVERIFIED (Cite with Qualification)

Code exists, may work, no test evidence in this audit. Avoid strong claims.

- Memory kernel: `_SYSTEM/Scripts/memory-kernel.mjs` (and ~10 memory-* scripts)
- Wiki tooling: `_SYSTEM/Scripts/wiki-*.mjs` (4 scripts)
- Skill loader: `_SYSTEM/Scripts/yuri-skill-loader.mjs`
- Capability census: `_SYSTEM/Scripts/yuri-capability-census.mjs`
- Persona check: `_SYSTEM/Scripts/yuri-persona-check.mjs`

### 4.4 KNOWN FAILING TEST

**`_SYSTEM/Scripts/root-architecture.test.mjs` — FAILS.**

This test is a regression guard that "active runners resolve the canonical repo root and do not override folder architecture with hardcoded roots" (per its artifact-registry note). The fact that it fails is a real issue and must be fixed before the paper ships. It is a blocker for the operational-validation claim, not the methodology claim. Logged here for follow-up.

### 4.5 PARKED NOISE — Cybersecurity Surface (Preserve, Don't Cite)

This is the largest parked-noise category. **Real implementations exist. All flagged in registry as `fixture_ready` or `generated_report`. None are runtime-protection-grade. Per the 2026-05-25 audit, these are local-fixture audit work only, not a cybersecurity product.**

**Scripts (14, all in `_SYSTEM/Scripts/`):**
- `threat-intel-kernel.mjs`
- `security-lens.mjs`
- `cyber-lab-harness.mjs`
- `cyber-guardrail-proof.mjs` (+ test)
- `cyber-retest-proof.mjs` (+ test)
- `cyber-browser-replay.mjs`
- `cyber-authorized-replay-scope.mjs`
- `cyber-provenance-score.mjs`
- `cyber-rag-conflict-proof.mjs` (+ test)
- `cyber-memory-rollback-proof.mjs` (+ test)
- `cyber-proof-cards.mjs` (+ test)
- `cyber-pilot-pack.mjs`
- `cyber-meeting-pack.mjs`
- `cyber-demo-runner.mjs`
- `cyber-meeting-release.mjs`

**Generated artifacts (12+ reports in `_SYSTEM/reports/`):**
- `YURI_GUARDRAIL_PROOF_MATRIX_2026-05-22.md`
- `YURI_CYBER_RETEST_PROOF_2026-05-24.md`
- `YURI_BROWSER_REPLAY_PROOF_2026-05-24.md`
- `YURI_AUTHORIZED_REPLAY_SCOPE_2026-05-24.md`
- `YURI_PROVENANCE_SCORE_MATRIX_2026-05-24.md`
- `YURI_RAG_CONFLICT_PROOF_2026-05-24.md`
- `YURI_MEMORY_ROLLBACK_PROOF_2026-05-24.md`
- `YURI_CYBER_PROOF_CARDS_2026-05-23.md`
- `YURI_UPGREAT_*` (5 reports — real client meeting work, separate context)
- `YURI_SECURITY_LENS_V0_2026-05-22.md`
- `YURI_REGIONAL_INTELLIGENCE_PACKS_2026-05-22.md`

**Docs (4 in `_SYSTEM/docs/`):**
- `YURI_OS_CYBERSECURITY_COMPANY_SUPERCHARGE_GOAL_2026-05-22.md`
- `YURI_CYBER_INTELLIGENCE_MATRIX_2026-05-22.md`
- `YURI_GLOBAL_CYBER_THREAT_INTEL_INGESTION_PROTOCOL_2026-05-22.md`
- `YURI_OS_NEMO_GUARDRAIL_MATRIX_2026-05-20.md`

**Decision:** Keep all parked. Do not delete. Do not cite in paper. The "cybersecurity company" framing has been formally rejected by the 2026-05-25 audit and is not part of the current operating identity.

### 4.6 PARKED NOISE — Backend Surface (Sealed)

**Real but sealed.** The `backend/` directory is `legacy_backend_runtime` with `backend/data/` as a `protected_surface`. 12 `backend-*` scripts exist in `_SYSTEM/Scripts/`:

- `backend-cors-hardening.test.mjs`
- `backend-db-check.mjs` (+ test)
- `backend-db-live-restore.mjs` (+ test)
- `backend-db-readiness-*.test.mjs` (2)
- `backend-db-recovery.mjs` (+ test)
- `backend-gitnexus-status-truth.test.mjs`
- `backend-observability-truth.test.mjs`
- `backend-release-gate.mjs` (+ test)
- `backend-route-auth-matrix.test.mjs`
- `backend-smoke-probe.mjs`
- `backend-telemetry-truth.test.mjs`

**Decision:** Park. Not part of operating identity. Backend is a separate concern from the agent control plane. Do not cite in paper.

### 4.7 PARKED NOISE — Cold Acquisition / Sales Surface

Real implementation, but a separate domain (sales tooling for c2moviez / Nexus Link, not core YURI control-plane):

- `cold-acquisition-crm-routes.test.mjs`
- `cold-acquisition-crm-ui.test.mjs`
- `cold-acquisition-real-feed.mjs`
- `cold-acquisition-routes.test.mjs`
- `cold-acquisition-ui.test.mjs`
- `cold-acquisition-wko-scraper.mjs`

**Decision:** Park. Outside paper scope.

### 4.8 PARKED NOISE — OS_KERNEL Python Subsystem

`_SYSTEM/OS_KERNEL/` contains a parallel Python+SQLite subsystem:

- `autonomous_research.py`
- `dashboard.py`
- `memory_governor.py` (+ test)
- `scheduler.py`
- `conclave_init.sh`
- `openclaw-bridge.sh`
- `swarm-handoff.sh`
- Databases: `kagami.db`, `memory.db`, `semantic-memory.db`, `site-builder-browser.db`
- `schema.sql`

**Status:** Not currently part of the JS/Node operating surface. Parallel exploration, possibly legacy or possibly future. Not classified in folder-registry or artifact-registry at file granularity. Unclear active vs vestigial.

**Decision:** Park with explicit "needs classification" flag. Do not cite in paper. Future audit should determine whether this is active, vestigial, or trash.

### 4.9 VESTIGIAL — Top-Level `_SYSTEM/*.md` Handoff Documents

The `_SYSTEM/` root contains ~20 handoff and protocol docs from May 17–23, most marked as completed sprint artifacts:

- `HANDOFF-*` series (10+ files)
- `AUTONOMOUS-SYSTEM-LIVE.md`
- `APRIL-2026-TOKEN-ACTION-PLAN.md`
- `ADVERSARIAL_STABILITY_AUDIT_2026-04-22.md` + v2
- `REMEDIATION_ACTION_PLAN_2026-04-22.md`
- `MASTER_STRUCTURE_REFACTOR_PROMPT*.md` (3 versions)
- `MIGRATION-MAP.md`
- `INTEGRATION-MAP.md`
- `EVONEXUS_*.md` (2 files)
- `NEURAL-NETWORK-THESIS.md`
- `MUSUBI_PROTOCOL.md`
- `OPERATOR_PROTOCOL.md`
- `LOCAL_EXECUTION_POLICY.md`

**Status:** Historical record of sprint work. Not actively read by the canonical model read path. `_SYSTEM/INDEX.md` is the active navigation source.

**Decision:** Park. They preserve sprint history and may have nuggets worth promoting. Cleanup sprint can move them to `04_ARCHIVE/` later. Do not cite in paper. Do not load by default.

### 4.10 OUT-OF-SCOPE FOR THIS PASS

- `00_COMMAND-CENTER/`, `01_PROJECTS/`, `02_RESOURCES/`, `03_NEXUS-LINK/`, `04_ARCHIVE/` — human workspace, not control plane
- `.claude/`, `.codex/`, `.codex-worktrees/`, `.obsidian/`, `.vscode/`, `.smart-env/`, `.tmp/` — provider adapters and runtime caches
- `node_modules/`, `backend/data/`, `.env` — protected surfaces
- `_SYSTEM/state/` — runtime state (Kagami ledger, memory ledger, Shintai advisory snapshots, workcell, etc.) — assumed working when referenced, not separately audited
- `_SYSTEM/tools/` — external tool checkouts (gitnexus, browser-harness, needle, MSA, nemo-guardrails)
- `_SYSTEM/data/models/needle` — local model runtime payload

---

## 5. Capability Domain Summary

| Domain | Real Surface (Cite-able) | Promotion State | Paper-Citable? |
|---|---|---|---|
| **Math substrate** | math-kernel + math-proof-gate + 6 formula banks + visual proof lab + adapters | `fixture_ready` to `runtime_tested` | **Yes** — strongest cite surface |
| **Lane orchestration** | shintai-dispatch + lane-session + offload-contract + offload-runner + persona map | `runtime_tested` | **Yes** — central to paper |
| **Claim integrity / truth promotion** | claim-integrity-gate (NEW, post 2026-05-25), 7-tier promotion ladder | `research` → `runtime_tested` | **Yes** — central novel claim |
| **Context routing** | context-router + context-registry (8 packets) | `runtime_tested` | **Yes** — supporting evidence |
| **Folder + artifact classification** | folder-registry + artifact-registry + validators | `runtime_tested` | **Yes** — governance evidence |
| **Math primitives composition into U(state)** | **NOT YET BUILT** (`yuri-energy.mjs` is paper deliverable) | `draft` | Paper must build this |
| **Persistent CLI harness** | yuri/ harness primitives, symbiotic pulse | `runtime_tested` | Yes — operator surface |
| **Skill library** | 110 root skills + skill-index + domain-index | mixed: `usable` to `research` | Mention only, not cite individually |
| **Provider adapters** | .claude, .codex, AGENTS.md, CLAUDE.md (root) | `active` | Mention as thin doors, not citing |
| **Autonomy / workcell** | autonomy-runner + workcell + capture + schemas | `research` (dry-run only) | Brief mention, not central |
| **Memory / RAG** | memory-kernel, memory-map, memory-proposal pipeline | `research` (weak provenance) | **No** — out of scope for paper |
| **Cybersecurity** | parked, fixture-only | `fixture_ready` | **No** — explicitly outside paper |
| **Backend** | sealed legacy | `legacy_backend_runtime` | **No** — outside operating identity |
| **Sales / Cold acquisition** | parked, separate domain | `usable` | **No** — outside paper |
| **OS_KERNEL Python subsystem** | parallel, unclassified | `unclear` | **No** — needs separate audit |

---

## 6. The Operating Identity, Sharpened

Combining the 2026-05-25 baseline with this audit's verification:

> **YURI is a filesystem-as-architecture, multi-lane orchestration substrate for a single operator (Marcel) running research, engineering, math-substrate, audit, and creative work via persistent CLI sessions. It composes existing model lanes (Claude/Codex/DeepSeek/NVIDIA NIM/Ollama) through a deterministic context-routing, dispatch, evidence-gating, and claim-promotion layer. It is governed by a canonical authority file (`yuri-origin.md`), a behavior layer (`SOUL.md`), thin provider adapters, and machine-readable registries. It is advisory until local evidence verifies output. It does not train models, expose third-party APIs, or run autonomously above dry-run.**

This is the sentence we cite in the paper. Everything else is parked surface, runtime support, or out of scope.

---

## 7. Implications for the Paper

### What we *can* claim about YURI:

- Filesystem-as-architecture (numbered roots + `_SYSTEM/` control plane + machine-readable registries)
- Multi-lane dispatch with provider-neutral routing (offload-contract + shintai-dispatch)
- Claim-integrity gate with 7-tier promotion ladder (claim-integrity-gate.mjs + truth-promotion ladder documented in 2026-05-25 audit)
- Math kernel composing entropy / KL / log-loss / Brier / etc. into measurable scalars (math-kernel.mjs, 11/11 passing)
- Proof-gated formula banks with executable example/counterexample verification (math-proof-gate.mjs, 8/8 passing)
- Persistent-CLI-first design with adversarial verification before commitment (skills/adversarial-verification, skills/verification-before-completion)
- Operator-validated truth boundary — model output is advisory until local evidence confirms

### What we *cannot* claim:

- That YURI runs autonomously above dry-run (it does not)
- That YURI is a cybersecurity product (explicitly rejected)
- That YURI's memory/RAG is trusted-grade (it's `research`, weak provenance)
- That YURI trains models or does ML research at the weight level (it does not)
- That `yuri-energy.mjs` exists and runs (it does not yet — building it is the paper's deliverable)
- That `root-architecture.test.mjs` passes (it does not — must be fixed before paper ships)

### What we *must* build for the paper to be honest:

1. `_SYSTEM/Scripts/math/yuri-energy.mjs` — the U(state) composition function
2. `_SYSTEM/Scripts/math/yuri-energy.test.mjs` — verification of energy composition
3. A worked example showing ΔU on a real dispatch trace
4. Documentation linking energy terms to specific formula-bank entries
5. Fix to `root-architecture.test.mjs` before publishing

---

## 8. Evidence Gaps Identified This Pass

These are gaps between what the documentation implies and what the operating surface actually delivers. They are not blockers but they are not yet closed:

1. **`root-architecture.test.mjs` fails.** Regression-guard for canonical root resolution. Must fix.
2. **OS_KERNEL Python subsystem unclassified.** Needs an audit pass to determine active/vestigial/trash.
3. **claim-integrity-gate built but not yet in artifact-registry.** The gate exists at `_SYSTEM/Scripts/claim-integrity-gate.mjs` with tests, but the registry was not updated when it was added. Should be registered.
4. **`yuri-energy.mjs` does not exist.** This is the paper's central deliverable.
5. **Memory/RAG provenance not enforced.** Promotion-ladder values exist but the gate is not wired into runtime memory writes.
6. **Energy-landscape framing not yet a context packet.** The 8-packet context registry does not have an `energy-landscape` or `truth-promotion-runtime` packet. Worth adding when the paper sprint begins.

---

## 9. Recommended Next Actions

In priority order:

1. **Fix `root-architecture.test.mjs`.** Single failing test in the curated subset. Must pass before paper ships.
2. **Register `claim-integrity-gate.mjs` in `artifact-registry.json`.** The gate exists but isn't registered.
3. **Build `_SYSTEM/Scripts/math/yuri-energy.mjs` + test.** Paper's central deliverable. Week 1 of the 8-week sprint.
4. **Audit OS_KERNEL Python subsystem.** Determine status. Out of scope for the paper but should be classified for future hygiene.
5. **Do NOT expand cyber/backend/SOC surfaces.** Parked is the correct state. Cleanup sprint after the paper, not before.
6. **Do NOT expand math substrate.** Per 2026-05-25 arbitration, math is paused except for governance integration. The paper *is* the governance integration.

---

## 10. Filtered-Out Noise (Preserved, Not Active)

A reminder list of what we are explicitly *not* citing or working with for the next 8 weeks:

- Cybersecurity / SOC / SIEM / XDR / pentest framing
- "YURI OS" as a literal operating system
- Backend platform / app-dev platform framing
- Autonomous agent / autonomous pentest claims
- Production-ready / runtime-protection language
- "Verified" or "proven" claims without `runtime_tested+` promotion evidence
- Memory/RAG as trusted-grade
- OS_KERNEL Python subsystem (parked pending classification)
- Cold acquisition / sales tooling (separate domain)
- Historical handoff documents at `_SYSTEM/*.md` root (vestigial)

These are not gone. They are parked. The paper does not need them. The next sprint after the paper can decide what to promote back into operating identity.

---

## 11. The Honest Single-Paragraph Description

For external use (paper, Substack, outreach to Jake Van Clief, etc.):

> *YURI is a single-operator AI control plane built around filesystem-as-architecture, machine-readable registries, and multi-lane model dispatch. It composes the operator's existing access to Claude, Codex, DeepSeek, NVIDIA NIM lanes, and local Ollama models into a deterministic pipeline with context routing, claim-integrity gating, a 7-tier promotion ladder, and a mathematical proof substrate. Output from any single lane is advisory until local evidence verifies it. Authority hierarchy puts operator intent and direct local evidence above any model claim. Built independently in Vienna over a sustained operator-research effort.*

That paragraph is defensible against any reader who opens the repo.

---

## 12. Audit Closure

This audit is a `research` artifact. It will become `runtime_tested` when:

- `yuri-energy.mjs` exists and tests pass
- `root-architecture.test.mjs` is fixed
- Paper has shipped (2026-07-23 target)
- Claim-integrity gate has been run against this audit's claims

Until then, treat as advisory ground truth for the paper sprint.

**Next operator action:** Marcel reviews. Disagreements get pushed back. Then the 8-week paper sprint begins with the energy function as Week 1.
