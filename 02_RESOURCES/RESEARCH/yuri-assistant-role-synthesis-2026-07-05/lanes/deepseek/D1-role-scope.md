Now I have the full picture. Here is the dense structured synthesis.

---

## YURI ASSISTANT ROLE & SCOPE — DENSE STRUCTURED FINDINGS

**Lane:** 08DS_YURI_ASSISTANT_ROLE_SCOPE_SURVEY
**Date:** 2026-07-05 | **Operator:** Marcel Spatz | **Backend:** deepseek-v4-flash:cloud

---

### 1. THE COO/CEO SPLIT — Operating Contract Patterns

**Pattern A: "Chief of Staff" as single front-end to everything**
- The assistant is the ONE surface the operator talks to. She does not expose the underlying complexity — fleet dispatch, memory tracks, trading engine, parallel sessions — all hidden behind her voice/text interface.
- **HARD-FACT:** This is the YURI design as documented in `S1-yuri-persona-DRAFT.md` §1: "Yuri is Marcel's digital co-worker and executive chief-of-staff — the single front-end to all of YURI-OS-MUSUBI." The persona draft is a package-lane artifact, not yet promoted to canonical, but the design intent is explicit and consistent across all 7 H-lane docs.
- **HARD-FACT:** The same pattern appears in the Jeffrey persona (René's CGS assistant) — one front-end, one operator, one operating contract. Both persona docs share the same COO/CEO spine structure.

**Pattern B: The six-gate autonomy test (Self-Governance Charter)**
- The cleanest pattern for the COO/CEO split is a deterministic gate: the assistant acts autonomously on anything that passes ALL of (reversible, evidence-decidable, in-doctrine, blast-radius ≤ MEDIUM, not outward-facing, not contended). ANY failure → owner-gated: produce a finished ruling + HOLD for one-token confirm.
- **HARD-FACT:** This is YURI's existing Self-Governance Charter (`_SYSTEM/yuri-origin.md` → Self-Governance Charter). The Yuri persona draft explicitly inherits it rather than creating a bespoke gate. The machine-readable confirm-gate spec (`S1-yuri-confirm-gate-DRAFT.json`) formalizes the same six gates.
- **RECALLED-PATTERN (unverified):** This six-gate pattern is structurally similar to the "reversibility-based gating" described in Anthropic's agent design guidelines and the OpenProse "Captain's Chair" pattern (persistent orchestrator dispatches subagents, holds on irreversible decisions). I have not verified these sources directly — the YURI corpus contains the OpenProse Captain's Chair example but does not cite Anthropic's guidelines.

**Pattern C: Yuri runs with MORE autonomy than Jeffrey (physical-shop assistant)**
- Because Yuri's domain (software, fleets, memory, trading) is more reversible and more instrumented than a physical Kydex shop, she does not wait for a nod on routine, reversible, evidence-decidable work. She acts, then reports.
- **HARD-FACT:** Explicit in `S1-yuri-persona-DRAFT.md` §1: "Yuri runs with more autonomy — because the work itself (software, fleets, memory, trading) is more reversible and more instrumented than a physical Kydex shop."
- **RECALLED-PATTERN (unverified):** This maps to the general principle that digital-domain assistants should have wider autonomy than physical-domain ones, since git revert / unset env / delete file are cheap corrections. I have not verified this as a named design pattern in external literature.

**Pattern D: The four highest-stakes classes that always gate**
1. Large-scale/irreversible dispatch (arming a gate, multi-process fan-out)
2. Trading actions (analysis OK, execution gated)
3. Outward-facing actions (draft OK, send/publish gated)
4. Downloads/installs
- **HARD-FACT:** From `S1-yuri-confirm-gate-DRAFT.json` → `always_confirm_before` array. These four classes appear consistently across the persona draft, the gap analysis (H2), and the confirm-gate spec.

---

### 2. FRONT-END TO EVERYTHING vs NARROW TOOL

**Pattern E: The "one surface, many substrates" model**
- The assistant is a thin, opinionated front-end. Behind it: a fleet dispatch system (MURE 20-role collective), a trading engine, a memory system (two tracks), parallel coding sessions (Claude/Codex/DeepSeek). The assistant does NOT need to understand every substrate's internals — she needs to know which substrate to route to and when to gate.
- **HARD-FACT:** This is the YURI architecture as documented in `H5-dispatch-reference.md` (the decision flowchart: bulk research → ollama-flash, heavy build → GLM, multi-role project → MURE, finalize → native Agent). The assistant is the conductor, not the engine.
- **RECALLED-PATTERN (unverified):** This mirrors the "Captain's Chair" pattern from OpenProse (a coordinating agent dispatches subagents for all work, with parallel research, critic review cycles, and checkpoint validation). The OpenProse examples in the YURI corpus describe this pattern at `examples/README.md` (29-captains-chair.prose) but I have not verified the external OpenProse documentation.

**Pattern F: The "front-end to everything" is NOT the same as "do everything"**
- The assistant's scope is: organize, propose, draft, dispatch, summarize. The operator's scope is: set intent, decide, veto. The assistant does NOT: make irreversible decisions, execute trades, send outward communications, install dependencies, or arm gates.
- **HARD-FACT:** This is the operating contract spine from `S1-yuri-persona-DRAFT.md` §1: "Yuri (chief of staff) organises, dispatches, executes, and reports. Marcel (CEO) sets intent and holds veto over anything large-scale, outward-facing, or irreversible."
- **RECALLED-PATTERN (unverified):** This maps to the general "CEO/COO" split in organizational design — the CEO sets vision and makes the few irreversible calls; the COO runs operations within that frame. I have not verified this as a named AI-assistant design pattern in external literature.

**Pattern G: Draft freely, send/publish never without confirm**
- The assistant may draft any outward-facing content (email, PR description, post) freely. The gate is on SEND/PUBLISH, not on DRAFT. This is a critical distinction — it prevents the assistant from being paralyzed by the fear of drafting something imperfect, while still protecting against accidental outward actions.
- **HARD-FACT:** Explicit in `S1-yuri-confirm-gate-DRAFT.json` → `allowed_without_confirm` includes "drafting outward-facing content (e.g. an email or PR description) — draft only, never triggering send/publish." Also in the `highest_stakes` array: "draft freely; send/publish always confirm-gated."

---

### 3. PARALLEL-SESSION CONDUCTOR PATTERNS

**Pattern H: Draft → Confirm → Send (the conductor loop)**
- The assistant stages a prompt into a session's pending draft (safe, no auto-send), shows it to the operator for confirmation, then dispatches it into the worker session. This is the core parallel-session conductor pattern.
- **HARD-FACT:** This is the YURI session conductor design as documented in `H1-capability-inventory.md` §5 (conductor_create, conductor_draft, conductor_send, conductor_peek) and `H2-gap-analysis.md` (Tier 3, item 7: "Parallel session conductor (draft→confirm→send)"). The conductor tools are LIVE in the voice brain (`yuri-z-brain.py` lines 463–508).
- **RECALLED-PATTERN (unverified):** This maps to the "draft→review→approve→dispatch" pattern used in enterprise workflow systems. I have not verified this as a named AI-assistant pattern.

**Pattern I: Fan-out-fan-in with substrate routing**
- Independent tasks fan out to parallel worker sessions (different substrates for different task shapes), then results fan back in for synthesis. The conductor does not need to understand every substrate's internals — it needs the routing table.
- **HARD-FACT:** The YURI dispatch substrate reference (`H5-dispatch-reference.md`) defines the decision flowchart: bulk research → ollama-flash, heavy build → GLM, multi-role project → MURE, finalize → native Agent. The conductor selects the right substrate per task shape.
- **HARD-FACT:** The OpenProse `parallel-independent-work` and `fan-out-fan-in` patterns are documented in `guidance/patterns.md` in the YURI corpus. These are structural patterns for orchestrating AI agents effectively.

**Pattern J: The conductor does NOT play an instrument**
- The conductor's job is to route, not to do the work. She does not need to be the best at any substrate's specialty — she needs to know which substrate to call and when to gate. This is the core insight from the conductor metaphor.
- **RECALLED-PATTERN (unverified):** This is a direct reference to the conductor metaphor from the Jake van Klief transcript in the YURI corpus: "The conductor does not play an instrument. The conductor doesn't make any sound." I have not verified the original source.

**Pattern K: Parallelism rule — independent substrates in parallel, same-substrate serial, file-mutation serial**
- Dispatch independent GLM + Ollama tasks in parallel (different substrates, different result dirs). Serial same-substrate lanes (prevents transport EPIPE). Serialize file-mutation lanes (prevents contention).
- **HARD-FACT:** From `H5-dispatch-reference.md` → "Parallelism rule" section. This is a verified operational rule in the YURI dispatch system.

---

### 4. WHERE SCOPE SHOULD STOP

**Pattern L: The "never build" list (explicit scope boundaries)**
- The assistant should NEVER: arm a gate, execute a trade, send outward communications, install dependencies, delete data outside session scope, or touch production/shared-external state without explicit confirm.
- **HARD-FACT:** From `S1-yuri-confirm-gate-DRAFT.json` → `always_confirm_before` array. These are the hard boundaries.

**Pattern M: The "defer" list (not now, maybe later)**
- From the gap analysis (H2) and the anti-over-engineering lane (D6):
  - Wakeword → hotkey is sufficient for MVP
  - Vision arm → text-only AX-reader is enough
  - Full MURE orchestration → Claude dispatch first; others later
  - Elaborate memory system → iterate after seeing what actually gets remembered
  - Multi-provider pacing → track one provider first
  - Perfect confirm-gate → one threshold is enough to start
- **HARD-FACT:** These are from `H2-gap-analysis.md` → "Over-Engineering Traps to AVOID" table and "Can defer without breaking the role" section. The D6 lane (anti-over-engineering) was explicitly tasked as "the most important lane."

**Pattern N: The "never build" for guest register**
- A guest-facing surface (for non-Marcel users) is explicitly flagged as "not built, flagged for later." The persona draft says: "Do not build ahead of an actual second-audience need."
- **HARD-FACT:** From `S1-yuri-persona-DRAFT.md` §3: "OPTIONAL — GUEST register (not built, flagged for later)." Also in `S1-yuri-confirm-gate-DRAFT.json` → `guest_optional_not_built`.

**Pattern O: The "never build" for elaborate memory decay engines**
- Power-law decay, homeostatic renormalization, automatic CTR-like scoring, vector embeddings for semantic dedup, and distributed memory sync are all explicitly deferred. The memory policy (H4) says: "Ship a tagged episodic store schema + minimal recall loop. Iterate decay curve + patterns after real use."
- **HARD-FACT:** From `H4-memory-policy.md` → "What to Defer (Not Yet)" and "Over-Engineering Traps (Explicit Non-Actions)."

---

### 5. BUILD LIST — Patterns Worth Adopting

| # | Pattern | Source | Evidence | Effort |
|---|---------|--------|----------|--------|
| B1 | **Six-gate autonomy test** (reversible, evidence-decidable, in-doctrine, blast-radius ≤ MEDIUM, not outward-facing, not contended) | YURI Self-Governance Charter + S1-yuri-persona-DRAFT.md | HARD-FACT | Already exists — inherit, don't rebuild |
| B2 | **Draft→confirm→send conductor loop** (stage prompt, show, confirm, dispatch) | H1-capability-inventory.md §5, H2-gap-analysis.md Tier 3 | HARD-FACT | Tools LIVE; wire into voice brain |
| B3 | **Substrate routing table** (task shape → cheapest capable lane) | H5-dispatch-reference.md decision flowchart | HARD-FACT | Already exists — wire into Yuri's dispatch |
| B4 | **Morning brief + absence report** (boot → greeting → what happened → suggested next moves → carryover) | S1-yuri-persona-DRAFT.md §4, H2-gap-analysis.md Tier 2 | HARD-FACT | PARTIAL today; wire `getAbsenceReport()` at boot |
| B5 | **Three-tier memory** (PERMANENT never expires, CONVERSATION 7-day advisory, TRANSIENT session-local) | H4-memory-policy.md | HARD-FACT | Schema designed; implement in jarvis_memory.py |
| B6 | **Draft freely, send/publish gated** (no paralysis on drafting) | S1-yuri-confirm-gate-DRAFT.json | HARD-FACT | Already in design; enforce in tool layer |
| B7 | **Parallel independent substrates, serial same-substrate, serial file-mutation** | H5-dispatch-reference.md | HARD-FACT | Already operational |
| B8 | **Persona config externalized** (name, greeting, dials, rules in JSON, brain reads at startup) | H2-gap-analysis.md Tier 1 | HARD-FACT | MISSING today; highest-leverage build |
| B9 | **Data routing: PII local, thinking→provider** (anonymize before cloud calls) | H2-gap-analysis.md Tier 1, S1-yuri-persona-DRAFT.md §7 | HARD-FACT | MISSING today; critical for trust |
| B10 | **Progress notes while working** ("I'll come back to you" + ETA + notify on completion) | S1-yuri-persona-DRAFT.md §4 | HARD-FACT | Already in design; wire into long-running tasks |
| B11 | **Interrupt discipline** (routine background work does not interrupt deep focus except for HOLD, critical failure, or time-boxed deadline) | S1-yuri-persona-DRAFT.md §4 | HARD-FACT | Already in design; enforce in proactivity loop |
| B12 | **Captain's Chair pattern** (persistent orchestrator dispatches subagents, holds on irreversible decisions) | OpenProse examples/README.md (29-captains-chair.prose) | RECALLED-PATTERN | YURI already has the substrate; formalize the conductor role |

---

### 6. CUT LIST — Over-Engineering Traps to Avoid

| # | Trap | Why It's Tempting Here | Minimal Alternative | Evidence |
|---|------|----------------------|---------------------|----------|
| C1 | **Elaborate memory system before daily habit** | YURI already has Track A/B memory, canonical store, episodic DB — easy to wire them all together | Ship three-tier episodic store + recall loop (3-4h). Iterate decay curve after 2 weeks of real use | HARD-FACT (H4-memory-policy.md) |
| C2 | **Orchestration for its own sake** | MURE has 20+ roles; easy to wire Yuri into all of them before testing one lane | Start with Claude dispatch only. Add lanes per evidence of value | HARD-FACT (H2-gap-analysis.md) |
| C3 | **Vision before text** | Computer-use vision is tempting; AX-reader works for text-based control | Disarm vision. Only arm when text-based control hits a hard wall | HARD-FACT (H2-gap-analysis.md) |
| C4 | **"Never forget" perfection** | Marcel's "never forget org/safety/security" could drive a bulletproof eternal-memory DB | Simple tagged entries + periodic recall. Iterate on what actually gets forgotten | HARD-FACT (H4-memory-policy.md) |
| C5 | **Multi-provider pacing before single-provider proves itself** | Three providers (Anthropic, z.ai, ollama) with quotas — easy to build a universal meter | Track one provider first. Add others when Marcel actually juggles budgets | HARD-FACT (H2-gap-analysis.md) |
| C6 | **Perfect confirm-gate before any confirm-gate** | The six-gate charter is elegant; easy to design a 50-rule gate matrix | Implement one threshold (e.g., "anything fleet-size gets confirm"). Refine from use | HARD-FACT (H2-gap-analysis.md) |
| C7 | **Wakeword + voice interface before voice works** | "Hey Yuri" is the dream; easy to wait for wakeword before testing voice loop | Voice loop is LIVE already. Hotkey activation (Cmd+Opt+Y) is sufficient for MVP | HARD-FACT (H3-tool-activation-map.md) |
| C8 | **Guest register before a guest exists** | Two operators (Marcel + René) could drive a multi-register system | Do not build a guest surface until a real second-audience scenario shows up | HARD-FACT (S1-yuri-persona-DRAFT.md §3) |
| C9 | **Power-law decay engine** | Elegant math; overkill for <500 episodes | Soft 7-day advisory cap. No background pruning daemon | HARD-FACT (H4-memory-policy.md) |
| C10 | **Automatic preference learning** | Tempting but requires behavioral data Yuri doesn't have | Let Marcel tag PERMANENT manually; Yuri suggests (not auto-decides) for promotion | HARD-FACT (H4-memory-policy.md) |
| C11 | **Vector embeddings + semantic dedup** | Makes search elegant; overkill for <500 episodes | FTS5 wins on simplicity + cost. Only upgrade if search quality degrades | HARD-FACT (H4-memory-policy.md) |
| C12 | **Distributed memory (YURI+Claude+Codex)** | Yuri needs LOCAL episodic store for voice latency. Track A canonical memory is separate | Yuri's jarvis-memory.db is HER episodic store. Cross-link, don't duplicate | HARD-FACT (H4-memory-policy.md) |
| C13 | **God-session (one session doing everything)** | Easy to give Yuri a single massive prompt that covers all capabilities | Decompose into focused sessions per OpenProse antipatterns guidance | RECALLED-PATTERN (OpenProse antipatterns.md) |
| C14 | **Sequential-when-parallel** | Easy to chain independent tasks sequentially | Fan out independent work to parallel substrates per H5 routing table | RECALLED-PATTERN (OpenProse antipatterns.md) |
| C15 | **Framework-before-need** | YURI already has the substrate (MURE, energy gates, quantum sims, circuitry graphs) — easy to wire Yuri into all of them | Prove the core loop first: boot → morning brief → one task → confirm (if large) → execute → log → summarize | HARD-FACT (H2-gap-analysis.md "SOLID-BUT-MINIMAL DEFINITION") |

---

### 7. THE SOLID-BUT-MINIMAL CORE (from H2 gap analysis)

**Core loop (REQUIRED):**
1. Boot → persona config loads → voice greeting + absence report → listen for input
2. Receive task → check if large-scale (needs confirm) → execute or present for approval
3. Respond (voice or text) → log to memory + task result → loop

**Must have (next 2 weeks):**
- [ ] Persona config file (externalizes name/dials/greeting/rules)
- [ ] Data-routing filter (no PII to provider)
- [ ] Provider meter (track usage; suggest tasks to pace quota)
- [ ] Morning brief (structured absence report at boot)
- [ ] Confirm gate (defined thresholds for "needs approval")
- [ ] Memory: permanent tier (never forgotten)

**Success metric:** Marcel boots Yuri → gets morning brief → gives one task → Yuri confirms (if large) → executes → logs + summarizes → feels like a "digital co-worker," not a tool.

---

**RESULT_LABEL:** 08DS_YURI_ASSISTANT_ROLE_SCOPE_SURVEY_X_PASS_COMMITTED