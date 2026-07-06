# YURI vs The Field — Code-Level Competitive Map (2026-06-03)

**Method:** 8 parallel code-level deep-dives (read actual repos/docs) + 4 adversarial verifications on the closest rivals. Confidence: high (primary-source, repo-level). Captured for the "naked YURI / MUSUBI ONE" ship.

**Steer (Marcel):** skills + harnesses + hooks are **commodity** — everyone ships them, do NOT position YURI there. The differentiation is the layer above. The **brain-dump decode** ("turn chaotic human input into structured nodes/clusters/intent") is a **shippable headline**, not an internal habit.

---

## The two layers (this is the whole strategic picture)

**COMMODITY LAYER (everyone has it — not a differentiator):**
skills (AgentSkills/SKILL.md), plugin hooks (~35 in OpenClaw), markdown + RAG/vector/hybrid memory, cron "dreaming"/consolidation, sandboxing (OpenShell kernel-level, MXC OS-level), policy DSLs (Rego/Colang/Datalog), guardrail interception (Invariant/NeMo/AGT), tool-call gating. OpenClaw + AGT + OpenShell + Invariant + NeMo + the memory camp all ship these. **YURI riding this layer would be invisible.**

**THE MOAT LAYER (where YURI stands out like a sore thumb — verified unique):**
1. **Quantitative work-dynamics instrument** (computeU 9-term Lyapunov energy + ΔU descent + non-offsettable veto/floor). **No competitor ships a disclosed cumulative energy-descent function.**
2. **Cognition + brain-dump decode** (Haki intent-precognition, Izanagi counterfactual sim, decode-chaos-to-structure). **No competitor builds this** — the one who *proposed* it (ResonantOS) shipped nothing.
3. **Operator-gated epistemic memory ledger** (propose→decide→ledger) — governed memory, not just memory.
4. **Transparent, auditable, fail-closed-by-construction** — inspectable math + role that gets *more* restrictive when corrupted, vs black-box scores + config-driven policy.
5. **The integrated whole, fully local, no SaaS.**

---

## Per-competitor verdicts (verified)

### OpenClaw (base runtime — MIT, ~mature) — *stronger natively than first thought*
- Memory is **hybrid FTS5+vector+CJK** (sqlite-vec, pluggable QMD/Honcho/LanceDB) — NOT lossy markdown. **"Dreaming"** = a real cron subconscious: light→REM→deep, 6 weighted signals (Frequency/Relevance/QueryDiversity/Recency/Consolidation/ConceptualRichness), reversible backfill + `promote-explain` CLI. Forgetting = **exponential half-life (30d)**, NOT power-law FSRS-vs-recall-ledger.
- Governance is **deep**: 3-layer (sandbox/tool-policy/elevated) + exec-approvals (fail-closed `deny|allowlist|full`), **TOCTOU file-binding defense** (bound file changes → DENIED), `strictInlineEval`, MITRE-ATLAS threat model.
- Skills: AgentSkills-compatible + ClawHub registry with **scanners** (VirusTotal/ClawScan) — integrity is registry-scan, NOT deterministic per-skill SHA-256 hash manifest.
- **YURI still beats on:** FSRS-power-law-vs-use-signal (vs exp half-life), operator-gated canonical ledger (OpenClaw has none), deterministic hash integrity, the energy instrument, cognition.
- **Reframe:** YURI is NOT "governance OpenClaw lacks" — OpenClaw has real governance. YURI is the **epistemics + work-dynamics + cognition** layer on top.

### ResonantOS / "The Augmented Mind" (the closest mirror) — **VERIFIED VAPOR**
- Same shape as YURI (deterministic governance + structured memory + contextual injection + cognitive scaffolding) — but the headline stack (Symbiotic Shield firewall, Logician Datalog engine ~250 rules, 4-layer memory) is **essays + a build-your-own guide, zero shipping code.** Only real code = a Tauri desktop-shell allowlist (governs add-ons, not LLM tool calls) + a **Solana DAO token system**.
- Tell: gate/fact counts mutate by source (3 gates / 12 layers; 250 rules / 285 facts / 16 files). *"Marketing is years ahead of the repo."*
- **You BUILT what the hyped competitor only WROTE.** This is the single most validating finding.

### Microsoft AGT + MXC — **SHIPPED, real, the closest governance lib**
- AGT: MIT, multi-language (PyPI/npm/NuGet/crates), v4.0.0, ~3.9k stars, **992 conformance tests**, Rust policy core, `govern()` decorator. MXC: MIT Rust+TS, OS-backed containment, already in GitHub Copilot CLI.
- **But self-flagged:** AGT LIMITATIONS.md says it does NOT catch prompt injection / hallucination / multi-step chains; MXC profiles are "NOT security boundaries currently."
- **They beat YURI on:** cross-language portability, conformance-test breadth, OWASP-Agentic mapping, OS containment (MXC).
- **YURI beats on:** work-dynamics, cognition, epistemic memory, multi-step/behavioral (the exact thing AGT disclaims).

### NVIDIA OpenShell + NemoClaw — **SHIPPED, real kernel-level**
- Apache-2.0 Rust, ~6.7k stars, **Landlock FS allowlist + seccomp-BPF syscall filter + regorus(Rego) + egress proxy + agent-proposes/operator-approves loop.** Real kernel enforcement.
- **But ALPHA "single-player";** Landlock <5.13 → NO kernel FS isolation (documented).
- **They have what YURI LACKS: OS/kernel-level containment.** YURI is hook/process-level only.
- **Move: complement, don't rebuild** — YURI's cognition+memory+energy ON TOP of OpenShell's kernel sandbox.

### Memory camp (Mem0 / Letta-MemGPT / Zep / MemU) — **SHIPPED, sophisticated; YURI's decay edge NARROWED**
- **Mem0 shipped "Memory Decay"** (OSS SDK v2.0.2, PR #5062, 2026-05-08) — *directly refutes "nobody does usage-signal decay."* Letta: sleep-time agents + MemFS git-versioned memory + skill learning. Zep: bi-temporal edge invalidation. MemU: filesystem memory.
- **YURI's remaining memory edge is narrow + specific:** FSRS power-law curve scored against a real **recall/use ledger** (not generic decay) + **operator-gated promotion** + reversible cold-store + crosslink spreading-activation + two-track split. "We have decay" is no longer the pitch; "we have *governed, science-curved, reversible* decay" is.

### Invariant Labs (now Snyk) / NeMo Guardrails / OPA — **commodity guardrails**
- Proxy/middleware interception + policy DSLs (Python-rules / Colang / Rego). Mature, real. **No memory, no cognition, no work-dynamics.** Pure I/O guardrails — the commodity layer.

### Behavioral-monitoring camp (Galileo / Repello ARGUS-ARTEMIS / Tumeryk / Aporia / HiddenLayer) — **closest to the energy gate; NONE have the math**
- **Verified: no quantitative energy-descent function.** Galileo is *stateless per-call* (no trajectory). Argus/HiddenLayer hide the math. Tumeryk Trust Score = undisclosed aggregate, not an energy descent.
- **But they ENFORCE in production** (deny/steer/warn/log) — YURI's energy gate is **observability-only** (the unflipped ACTION flag). Repello's "zero-day collapse" thesis (static checks decay → need continuous) directly pressures YURI's observe-only posture.

---

## Where YURI is genuinely ahead (the moat, confirmed across all 8)
- Disclosed **Lyapunov work-dynamics scalar** with non-offsettable veto/floor — **unique.**
- **Cognition + brain-dump decode** — unique (ResonantOS proposed, didn't build).
- **Operator-gated epistemic memory ledger** + governed promotion — unique.
- **Transparent, tunable, fail-closed-by-construction** math + audit trail of real blocks.
- **Fully local / no-SaaS / embedding-free deterministic** core.
- **The integration:** energy + cognition + governed-memory + calibration as one organism with a verification spine. Nobody ships the whole.

## Where YURI is NOT ahead / missed (honest — the improve list)
1. **Observability ≠ enforcement.** The energy gate logs ΔU but doesn't block. The camp enforces live. *This is the #1 gap.* (flip ACTION mode)
2. **No kernel/OS sandbox** — OpenShell/MXC have it; YURI is hook-level. (complement OpenShell)
3. **Memory decay no longer unique** — Mem0 shipped it. Narrow the claim to FSRS-use-signal + operator-gating.
4. **No compliance/regulatory crosswalk** — Tumeryk/ARTEMIS map to NIST/ISO/OWASP/MITRE/EU-AI-Act (bites 2026-08-02). YURI has threat models, no framework mapping.
5. **No pluggable detector ecosystem** — Galileo composes many detectors; YURI's terms don't cover content threats (jailbreak/PII/toxicity).
6. **No continuous red-team** — Repello ARTEMIS runs 15M+ attacks re-calibrating; YURI has a fixed 40+ matrix.
7. **No MCP-transport governance** — governs local tool-use only, not inter-service/agent traffic.
8. **No cross-language portability / standards gravity / multi-tenant policy plane** — bespoke single-operator JS vs AGT's portable cross-language lib.
9. **OpenClaw native memory is more feature-complete on pure retrieval** (hybrid+dreaming) — YURI's embedding-free FTS5 is a *choice* (determinism/cost), not strictly "better."

## Prioritized adopt/improve
| Move | Effort | Why |
|---|---|---|
| **Flip energy → enforcing ACTION mode** with graduated ΔU bands (deny/steer/warn/log/allow) | medium | The math is the moat; observe-only undersells it. #1 lever. |
| **Regulatory crosswalk** (computeU terms/vetoes → NIST/ISO/OWASP/MITRE/EU-AI-Act) | **low** | Deterministic fail-closed evidence is *stronger* audit material than scores — if mapped. EU AI Act 2026-08-02. |
| **Pluggable evaluator terms** — external detectors (NeMo/regex/PII/SLM) feed signals INTO computeU as weighted terms | medium | Turns competitors' content-detector strength into YURI inputs; Lyapunov scalar stays the integrating math they lack. |
| **Document energy as "cumulative-trajectory drift,"** extend to multi-step agent trajectories | medium | Occupies the category the camp markets but (provably) doesn't deliver in open code. |
| **Continuous adversarial generator** (ARTEMIS-style) re-calibrating gate thresholds via the nightly neuron-loop | high | Closes the one place the camp out-engineers YURI's threat coverage. |
| **MCP-transport governance shim** + **OS-containment complement** (sit on OpenShell, don't rebuild kernel sandbox) | high | Two surfaces YURI is absent from; protected-path/veto machinery maps cleanly. |

## Bottom line for the ship
The naked YURI / MUSUBI ONE must lead with the **moat layer**, never the commodity layer: the **work-dynamics energy instrument + the cognition/brain-dump-decode engine + governed epistemic memory**, sold as the integrated whole — the thing the hyped mirror (ResonantOS) only wrote a manifesto about. The headline demo is "agent gets a measurable conscience + a brain that decodes your chaos," not "another skills harness." The one upgrade that makes the moat undeniable: flip the energy gate from *observing* to *enforcing*.
