# YURI · "MUSUBI ONE" — Full-Spectrum Inventory + OpenClaw Adaptation Map

**Captured:** 2026-06-03 · **Method:** 7-domain read-only forensic audit of live code (maturity graded against real implementations, not docs) + verified OpenClaw/competitor research (see [agent-economy](agent-economy-shift-and-positioning-2026-06-02.md) + OpenClaw research). Product = **YURI**; this version ships as **"MUSUBI ONE"** (named versions, never numbers).

---

## Verdict (honest, up front)

Marcel's confidence is **largely justified — with one caveat that is actually good news for the adapter.**

**The triumph:** YURI has *built and tested* the exact three things the competitor stack (MXC / OpenShell / NemoClaw + ResonantOS / AGT / MemU / Invariant / ClawBands) only claims or punts on:
1. a **live mathematical work-dynamics instrument** (energy / Lyapunov ΔU),
2. **deterministic, fail-closed governance at the tool boundary**,
3. **science-grounded reversible memory + a subconscious**,
plus a **cognition/persona layer** none of them have at all, and a **verification spine** (~40 tests, release gate, attack-driven hardening) that proves it.

**The caveat (and why it helps):** several flagship mechanisms are **built-and-tested but dormant or observability-only** — the energy gate *logs* but never *blocks*; the subconscious is wired but has never fired; skill stage-gating is designed but not enforced; the anime-DNA auto-fire was retired (now manual/model-invoked). This is **not a weakness for the OpenClaw play — it is the play.** The hard part (the math, the science, the tested code) is done. The remaining part (wiring observability → enforcement) is *exactly* what OpenClaw's plugin hooks hand you. Shipping as a plugin forces the last mile.

---

## The competitor split (why "far ahead" is true)

- **Security/guardrail camp** (MXC, OpenShell, NemoClaw, AGT, Invariant, NeMo Guardrails, ClawBands): sandbox + policy. **No memory, no cognition, no work-dynamics.**
- **Memory camp** (MemU): memory graph. **No governance, no cognition.**
- **The hybrid *claimant*** (ResonantOS, augmentedmind): proposes Shield + Logician + R-Awareness + 4-layer memory — but it is a **substack proposal**, not 5,000+ tested transitions of shipped code.

**YURI is the only one that has built AND tested all four layers** — guardrails + memory + cognition + a quantitative work-dynamics instrument — as one locally-running, no-SaaS organism with a test matrix proving it. That is the moat.

---

## Inventory, graded (7 domains)

Legend: **TRIUMPH** = built + genuinely ahead · **PARITY** = others have it · **GAP** = aspirational / dormant / unwired.

### 1. Retrieval & Search — FTS5/BM25 (`yuri-search-index.mjs`, `search-index.db`, `ai search`)
| Capability | Maturity | Grade | OpenClaw hook |
|---|---|---|---|
| FTS5/BM25 over ~39k docs, embedding-free, deterministic, injection-hardened query builder | shipped-wired | **TRIUMPH** (vs OpenClaw's lossy-markdown memory; "FTS5-first, hybrid-ready" beats naive RAG on latency/cost/determinism/exact-recall) | `before_prompt_build` (inject), `after_tool_call` |
| Memory/search architectural separation (39k noise vs 156 curated truths, one-way promote gate) | shipped-wired | **TRIUMPH** (most RAG corrupts memory with corpus) | session bootstrap |
| Cross-domain mechanism-transfer engine (12-tag taxonomy) | partial | **GAP** — built, corpus ~empty, never fired at scale | — |

### 2. Memory + Subconscious (`memory-kernel.mjs`, `claude-memory-write.mjs`, `memory-relocator.mjs`, `yuri-fsrs.mjs`)
| Capability | Maturity | Grade | OpenClaw hook |
|---|---|---|---|
| Two-track separation (Track A canonical, 4,324 rows + Track B behavioral, 116 memories) — real, two storage paths/gates | shipped-wired | **TRIUMPH** (cleaner than MemU/ResonantOS unified store) | session bootstrap, `agent_turn_prepare` |
| FSRS power-law decay against a real **use-signal** ledger (not mtime); reversible demote → cold FTS5 store; operator-gated re-promotion; crosslink spreading-activation recall | shipped-wired but **DORMANT** (0 cold rows, never ran `--execute`) | **TRIUMPH-in-waiting** (only system applying Bjork/FSRS memory science to agent context) | `agent_turn_prepare`, session end |
| Off-disk backup / memory-sharing / dead RAG tables | unbuilt | **GAP** — gitignored single-disk fragility; sharing scaffolded-not-wired | — |

### 3. Governance / Guardrails (`.claude/hooks/*`, `yuri-operator.cjs`, settings deny-list)
| Capability | Maturity | Grade | OpenClaw hook |
|---|---|---|---|
| Deterministic hook-level enforcement: download-execute block, `.env`/credential read-block, catastrophic-op hard-block (`yuri-risk-lite`), **role fail-closed** (scrypt; coworker can't escalate by deleting the cred — gets *more* restricted), symlink-resolution defense, **audit log w/ 14 real blocks** | shipped-wired | **TRIUMPH** (genuinely ahead of soft guardrails; asymmetric/defense-in-depth; attack-driven hardening with documented threat models) | `before_tool_call` + `registerTrustedToolPolicy` |
| Protocol gate (control packets, route-plan evidence) | shipped-wired but advisory on non-CRITICAL | **PARITY/GAP** | `before_tool_call` |
| Evidence-contract grammar; infinity-guard skill | doc-only / declared-not-enforced | **GAP** | — |

> ClawBands (the OpenClaw security precedent) hooks `before_tool_call` for **one** thing — human approval. YURI's governance is the *whole stack*, already production, fail-closed, test-matrixed.

### 4. Energy / Work-Dynamics Instrument — **THE HEADLINE** (`math/yuri-energy.mjs`, `energy-tick-core.mjs`)
| Capability | Maturity | Grade | OpenClaw hook |
|---|---|---|---|
| `computeU` (9 weighted terms) + `computeDeltaU` (Lyapunov ΔU) + `gateProposal` (hard veto + structural floor + soft threshold) + `tickAndTrace` (PostToolUse), **5,000+ real transitions/day live**, Privacy-Gated trace, surprise detection (Layer C, median+K·MAD), attack-hardened, fail-closed config | shipped-wired (28+63+39+35+32+14 tests) | **TRIUMPH** — *"the only live, mathematically-grounded work-dynamics instrument in the wild."* Directly fills the **#1 named competitor gap** (multi-turn behavioral drift / Repello-ARGUS territory) with **math, not heuristics** | `before_tool_call` (enforce), `agent_turn_prepare` (inject U-state), `PostToolUse` (trace) |
| Enforcement | **observability-only** (`advisory_only=true`, never blocks); only 3/9 terms fire in real traffic; 0 real rejections yet; hand-tuned weights | **GAP = the adapter's killer feature** — flip to ACTION mode via `before_tool_call` | — |

> This is the wedge. **Nobody else has a Lyapunov descent function gating agent actions.** The non-offsettable hard vetoes (eta=100 protected-path, theta=10 ladder-inversion) survive even if weights are tuned permissive.

### 5. Cognition / Prompting — the "brain dump" (`SOUL.md`, `persona.md`, `brain-inject.js`, anime-DNA skills)
| Capability | Maturity | Grade | OpenClaw hook |
|---|---|---|---|
| Anime-DNA gates as **cognitive protocols**: Haki (intent pre-cog), Izanagi (counterfactual sim), Nen (phase), Bankai (externalize), Geass (constraint lock), PDC (probabilistic decision/EV), Shura (7-vector adversarial), pattern-mirror, failure-evolution; SOUL five-state thought-router; symbiotic pulse | shipped-wired **as context protocols** (model is executor — NOT daemons) | **TRIUMPH** — *"the only production-wired system fusing ML decision doctrine + adversarial protocol before action."* **No competitor has a cognition/persona layer at all** | `before_prompt_build` / `agent_turn_prepare` (inject the brain) |
| Cache-aware brain (`brain-inject` Zone-A stable / Zone-C volatile → prompt-cache reuse) | shipped-wired | **TRIUMPH** (token-aware) | `before_prompt_build` |
| **Honest clarification:** "wired" = *loaded into context*, not an automated backend. Auto-fire of Izanagi/Bankai/Nen/Shura on CRITICAL tier is **specced but retired/unwired** — currently **manual/model-invoked** | — | **GAP** (positioning honesty) | `before_agent_run` (could auto-fire) |

> This is the differentiator nobody else ships: agents get **judgment**, not just a sandbox.

### 6. Skills / Capability Layer (`yuri-skill-loader.mjs`, `context-router.mjs`, `yuri-active-skill-registry.mjs`)
| Capability | Maturity | Grade | OpenClaw hook |
|---|---|---|---|
| 6-source SKILL.md discovery + **SHA-256 hash-manifest integrity** (Trojan-skill defense, drift detection, exit-1 gate) | shipped-wired | **TRIUMPH** (supply-chain security for skills) | **`before_install`** (hash gate) |
| Symbolic (BM25-like) context-router — deterministic, no embeddings | shipped-wired | **TRIUMPH** (faster/deterministic vs neural routing) | `before_prompt_build` |
| Capability×stage profiling (5 stages) | partial — **designed not enforced**; 35/107 skills profiled | **GAP** (the "few hours of hook wiring" lever) | `registerTrustedToolPolicy` |
| **YURI skills already use OpenClaw's SKILL.md convention** (and OpenClaw bootstraps AGENTS.md/SOUL.md — which YURI has) | — | **TRIUMPH** (near drop-in format compat) | SKILL.md workspace |

### 7. Self-Improvement / Continuity (`yuri-closeout.mjs`, neuron-loop, Kagami bus, calibration)
| Capability | Maturity | Grade | OpenClaw hook |
|---|---|---|---|
| Kagami append-only event bus; **neuron-loop** (nightly 9-phase autonomous learning → advisor priors / F1 / dream-processor rules → `global.md`); claim-integrity gate; deterministic closeout; per-advisor/per-lane calibration (F1, overconfidence gap); token ledger | shipped-wired | **TRIUMPH** (continuity-on-hardware, learns nightly, no external SaaS) | session end / `after_agent_run` (YURI-side loop) |
| Synthesis replay / rule retirement / loop auto-recovery / lane-overconfidence enforcement | partial | **GAP** — computed-not-enforced; `global.md` can accrue stale rules | — |

---

## The verification spine (a differentiator in itself)

~40 test files, the release gate, dual-layer hooks, **attack-driven hardening with documented threat models**, parity tests preventing drift, fail-closed everywhere, structured audit logs proving real blocks, "**privacy by structure not by culture**" (mechanical trace allow-list). Competitors ship guardrails; YURI ships guardrails **+ the test matrix that proves they hold + the audit trail of real denials.** This is the *trust/accountability* pillar made concrete — exactly the EU-AI-Act-era "accountable, provable oversight" premium.

---

## The adaptation: YURI · MUSUBI ONE as the OpenClaw plugin

The plugin is the **wiring layer** that turns YURI's tested-but-dormant mechanisms into live OpenClaw enforcement. Hook map:

| OpenClaw hook | YURI organ it carries |
|---|---|
| `before_tool_call` | deterministic governance guards + energy gate (flip to enforcement) + geass locks + protected-path veto |
| `registerTrustedToolPolicy` | role/credential fail-closed + non-offsettable hard-vetoes (privileged tier) |
| `before_prompt_build` / `agent_turn_prepare` | FTS5 memory injection + the cognition/persona brain + U-state + surprise flag + intent decode (Haki) |
| `after_tool_call` | **returned-content inspection** (the prompt-injection gap competitors miss) + energy trace + failure-evolution capture |
| `before_install` | skill hash-integrity gate (Trojan-skill defense) |
| session bootstrap / end | two-track memory load + subconscious recall + deterministic closeout (continuity OpenClaw lacks) |
| SKILL.md workspace | YURI skills are already OpenClaw-format |

## Ship-first scope for MUSUBI ONE (the minimum that proves the thesis)

The trio that demonstrates "**YURI gives OpenClaw a brain + a conscience + a measurable spine**" — none of which any competitor ships together:
1. **Governance guards → `before_tool_call`** (production-ready; just re-target the hook). Instant credible guardrail parity with ClawBands + far more.
2. **FTS5 memory → `before_prompt_build`** (the "agent gets a real brain" demo; reuse the shipped index).
3. **Energy gate → `before_tool_call` in observability mode** first (the unique differentiator, live trace), ACTION mode optional behind owner approval.

Phase 0 prerequisite (gated, needs owner ok): `npm i -g openclaw` locally + write a 10-line plugin that proves `before_tool_call` fires on the installed version (it was dead until Feb 2026).

## Honest "do this before you over-claim"
- Energy: say "live behavioral-drift **instrument**," not "it blocks" (it observes until ACTION mode is wired).
- Subconscious: "built + tested," not "running" (it hasn't fired).
- Anime-DNA gates: "model-invoked cognitive protocols," not "autonomous daemons."
- FTS5: "FTS5-first, hybrid-ready," not "beats RAG" flat.
- These are the exact lines a skeptic (or Codex) would puncture; stating them first is the credibility move.
