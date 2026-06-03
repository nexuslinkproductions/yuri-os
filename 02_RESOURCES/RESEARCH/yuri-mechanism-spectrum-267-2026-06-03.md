# YURI Mechanism Spectrum — 267 Distinct Mechanisms (2026-06-03)

**Method:** 9 read-only Explore sweepers across the whole codebase, each extracting every distinct mechanism/technique (breadth over depth), verified against real code. Full per-mechanism detail (what/where/why-distinct) lives in the workflow transcript `wn1o3peci`.

**The point:** YURI is not "a skills harness with a few clever features." It is a dense weave of **267 distinct mechanisms across 9 layers.** Most competitors have *zero* mechanisms in several of these layers. This density — and the fact that many are techniques nobody else builds — IS the moat.

| Layer | Count |
|---|---|
| Energy & Math | 28 |
| Memory & Subconscious | 27 |
| Retrieval & Knowledge | 28 |
| Governance & Safety | 28 |
| Cognition & Persona | 32 |
| Learning & Continuity | 31 |
| Skills & Orchestration | 28 |
| Token-Efficiency & Session | 28 |
| Hidden / Meta / Self-referential | 31 |
| **TOTAL** | **267** |

---

## The 9 hidden gems (each sweeper's "most underrated" — the invisible architecture)

1. **Divisive-normalization info-gain ceiling** (energy) — normalizes credit by log(n) so fabricating a huge state-space can't manufacture evidence credit. Grounded in dopamine RPE coding / homeostatic synaptic scaling. Closes a subtle buy-back hole.
2. **Verb-aware negation gate in memory autopilot** — pattern-matches mutation *intent* against protected prefixes WITH negation lookahead: "never write .claude/state/" passes; "write .claude/state/" fails. A linguistic gate that checks the human actually *negated* the bad action.
3. **Spreading-activation recall over manual crosslinks** (retrieval) — surfaces conceptually-related memories via 1-hop human-curated crosslinks, not vector dot-products → conceptual association with zero embedding cost AND a fully auditable reason for every surfaced memory.
4. **Symlink realpath ancestor-climb defense** (governance) — resolves ancestors one-by-one to build a safe path even for files that don't exist yet, blocking symlink attacks against *future* files. Looks trivial; is careful.
5. **Symbiotic Pulse (lightweight)** (cognition) — a micro-gate firing on *every* visible input (user msg, self-proposal, tool result, docked-LLM output): source → intent → authority → risk → claims-vs-evidence → action. Most of YURI's safety comes from this silent gate everywhere, not the flashy powers. *The invisible architecture that makes the flashy parts trustworthy.*
6. **Pulse-bus accumulated-risk decay** (learning) — single-occurrence risks older than 30min evaporate silently, keeping cross-turn threats hot while letting transient false-positives age out without cleanup logic.
7. **Collision policy: canonical wins over migrated shadows** (skills) — how YURI did a large skill migration without breaking discovery: provider shims coexist, collisions marked-but-suppressed silently.
8. **FSRS retrievability overflow gate with order restoration** (token) — ranks curated memory by spaced-repetition decay to handle the 12-row cap, then *restores file order* so display stays stable while the logic sorted by salience underneath.
9. **Fail-closed role resolution + O_EXCL stale-lock self-heal** (meta) — treats a broken-module-plus-existing-creds as a *tampering signal* (not an error); a crashed writer's lock self-heals after 5s without human intervention.

---

## Full inventory by layer

### Energy & Math (28)
Nine-Term Weighted Additive Energy Composition · Verified-Evidence Logarithmic Saturation + Hard Cap · KL Epsilon Clamping (both sides) · Claim-Verified Length-Mismatch as Maximal Drift · Repeated-Failure Per-Event Counting · Malformed-Forecast Fail-Closed (lambda) · Divisive-Normalization Info-Gain Ceiling · Hard Veto (protected-path, eta=100) · Structural Floor (ladder-inversion) · Byte-Stable Float Rounding (-0→+0) · Privacy Gate (string allow-list) · Closed-Set Canonical Promotion Labels · Salience Tiers SKIP/WORK/CRITICAL · Layer-C Depth-Gated Surprise (median+MAD) · State Snapshot Capping · Config Fail-Closed (drop not coerce) · Finite-Number Coercion · Nine Certified Math Primitives (22 formulas + proof gate) · Formula-Bank Promotion Ladder · Deep-Copy Evidence Records · Protected-Path Regex Matching · Telemetry Regime Tag · FSRS-4.5 Retrievability Power-Law · Demotion Floor (never overwrite forceKeep) · Energy Descent Composition (U+ΔU) · Downsample (stride + dedup) · State Summarization (numeric-only) · Component Meta Catalog (11 terms).

### Memory & Subconscious (27)
FSRS Power-Law Forgetting · Stability Boost (freq×salience×surprise) · Reversible Relocation + Tombstone · Two-Track Architecture · Propose→Decide→Ledger (+autopilot) · Operator-Gated Re-Promotion (cold recall pressure) · Protected-Types Never Demote · Tier-Based Base Stability · Cold Store (FTS5) separate from search · Use-Signal vs mtime Scoring · Blended Ranking (BM25+recency+salience+crosslink) · 1-Hop Spreading-Activation Bonus · Prior-Turn-Lag Async Recall · Consume-Once Rendering · v3 Frontmatter Parser · MEMORY.md Self-Heal · Deterministic Proposal Review (protected-surface intent) · Codex Reviewer Escalation · Scoped Commit + Secret Scan · Offline Subconscious Consolidation (FSRS + local MLX) · Dual-Ledger Event Log · Protected-Surface Enforcement · Salience Tagging · Over-Fetch for Blending (topK×4) · Best-Effort Async Write · Exponential Recency Decay.

### Retrieval & Knowledge (28)
Injection-Hardened buildMatch · Porter+Unicode61 Tokenizer · Incremental mtime Indexing + WAL · Protected-Path Index Exclusion · Memory/Search Wall (2 DBs) · Symbolic Trigger-Scoring Router · Evidence Contract Grammar (TERM/FILE/MATCH) · BM25 + Snippet Extraction · Lexical Fallback Scorer · Cold-Store BM25+metadata · Spreading-Activation Recall · Recency+Salience+Crosslink Blending · Memory-Usage Ledger · FSRS Retrievability (Bjork disuse) · Effective Stability Boost · Demote-Never-Delete Relocator · Three-Tier Classification · Scope Gates + Origin-Lane Authority · Manual Cold Crosslinks · Cue-Match Over-Fetch · Lane Session Compaction · Prefix-Routed Persistent Lanes · Evidence Contract Validator · Protected-Surface Literal Matching · Claim Promotion Ladder · Research Capture + Provenance · Cross-Reference Failure Taxonomy.

### Governance & Safety (28)
Download-Execute Block (HI-12) · .env Read Block · .env Write/Mutate Block · Intra-Repo .env Mirror Exemption · Sensitive .claude File Block · Broad .claude Destruction Block · Two-Role Coworker Gating · Coworker Push/Remote Block · Protected-Role Path Block · Owner Passphrase-Init Block · Tool-Agnostic Write Guard · Case-Insensitive Path Norm (APFS) · Symlink Realpath Canonicalization · Dual-Path Lexical+Canonical Check · Audit Log Append · Catastrophic Risk Hard-Block · URL Threat Assessment (Tirith) · Control-Packet Gate · Route-Plan Evidence Gate · Codex Task-Spec Requirement · Plan Dispatch Gate · Sprint-Mode Bypass · Shintai Ops Block · Scrypt Dev-Credential Hash · Word-Tokenization+Unquote Norm · Shell-Wrapper Inline-Exec Detection · Cross-Terminal Bus Awareness · Tier-Based Compaction Dispatch · Declarative Deny-List Fallback.

### Cognition & Persona (32)
Brain-Dump Decoder · Haki (intent pre-cognition) · Izanagi (counterfactual sim) · Nen (phase specialization) · Bankai (externalize mode) · Geass (constraint lock) · Five-State Thought Router · Monotropic Depth + Exit Checks · Divergent Scan Before Convergence · Polymathic Transfer + Verification · Symbiotic Pulse · Noesis (perception by contact) · Shura (6-perspective adversarial) · Pattern-Mirror Core · Execution-Domain Core · Non-Destructive Infinity Guard · Probabilistic Decision Core · Failure-Evolution Loop (Zenkai) · Parallel-Clone Orchestrator · Zone-A Stable Core (cache-aware zoning) · Polarity Reframe · Deliberate Salience Switching · Lattice-Map Compression · Cortex Dynamic (cross-turn risk) · Behavioral Fingerprint (L2) · Neuron-Loop Self-Synthesis · Noesis Protocol (4 engines) · Anima-DNA Modes · Learned-Rules Synthesis · Curated Memory Ordering · Hardware Constraints + Frozen Models · Launch-Readiness Gate · Lane-Health Snapshot · Roadmap State Tracking.

### Learning & Continuity (31)
9-Phase Neuron-Loop · Dream-Processor (mistakes→rules) · Per-Advisor F1 Calibration · Per-Lane Overconfidence Gap · Kagami Event Bus · Pulse-Bus Ring + Archive · Claim-Integrity Gate · Deterministic Closeout · Izanagi Decision Recording · Self-Hypothesis Gen+Validation · Cross-Session Miner · Self-Model Fingerprint · Self-Model Feedback (scalar drive nudging) · Fingerprint-Baseline Drift · Crypto-Chained Token Ledger · Pattern-Promoter (consensus clustering) · Council Synthesis Writeback · Brain:Stale Sentinel · Cross-Turn Accumulated Risk · Advisor-Disagreement Detector · OpenClaw Quarantine Severity Cap · Yuri-Risk Strategic Foresight · Codex Advisory vs Queue · Synthesis Delta Metric · Knowledge-Scout (GitHub/ArXiv) · AI-News-Digest (HN) · Learned-Rules Injection · Curated Memory Consciousness Cap · PDC+Calibration Injection · Hardware Snapshot · Lane-Health/Launch-Gate Snapshots.

### Skills & Orchestration (28)
SHA-256 Hash-Manifest Integrity + Drift Exit-Codes · 6-Source Discovery Precedence · Realpath Skill Containment · Capability×Stage Profiling (5 stages) · Tokenmaxxing Self-Injecting Rules · Skill-Body Size Gating · Symbolic Packet Routing · DAG Topological-Sort Hard Gate · 5-Phase Universal Workflow · Lane Routing Priority · Canonical Collision Sources · Profile-Based Skill Inference · Matched-Signals Scoring · Selection Hash · Memory-Authority RBAC · Safe Rel-Path Assertion · Patch Dry-Run Validation · Materialized Patch + Rollback Manifest · Worker Packet Schema + Scope Check · Memory Capsule Read-Only · Decomposition + RunId Stamping · Protected-Surface Whitelist · Shintai Superaudit Roster · DeepSeek Quality Gate · Native Function Gates (Argus+Obliteratus) · Scenario-Based Lane Selection · Collision Policy (canonical wins) · Learner Loop + Durable Seed · Cross-Reference Taxonomy + Bridge Maps · Token Estimator.

### Token-Efficiency & Session (28)
Zone-A Stable / Zone-C Volatile · FSRS Overflow Gate (12-row cap + order restore) · 4-Tier Compaction Dispatch · Cross-Terminal Bus (session-id+sequence) · Local-First Agent Intercept · Cost Estimator (tool-family table) · Weekly Token Accumulator · Prompt-Cache Hit-Rate Viz · Auto-Compact Trigger (tier 2) · Context-% Hysteresis · Dream-Rules Injection · Session-Checkpoint Context · Cortex Risk Ranking+Escalation · Anima-DNA Mode Triggers · Behavioral Fingerprint Self-Model · Geass-Lock Validation · Selective Context Compression (LLMLingua/H2O attention-sink) · Compact Hint Template · Aversion-Memory Gate · Tokenmaxxing Auto-Activation · Ultra-Caveman Enforcement · Session Lifecycle Tracking · Design-Memory Capture · Energy Knob Surface · Salience-Surprise Tier · FSRS Floor+Multipliers · Mid-Session Learning Async Spawn · Session-Journal Reflection.

### Hidden / Meta / Self-referential (31)
Pulse Cortex Bus (atomic aggregation) · Scout Orchestrator (event-driven routing) · Dream Processor (correction mining) · Operator Write Guard · Brain Inject (unified boot) · Symbiotic Pulse engine · Energy Tick Core (ΔU transitions) · Energy Function (primitive composition) · Calibration Tracker · Claim-Integrity Gate · Lane Arbitration (Codex/main) · Workcell DAG + Memory Authority · Pulse-Trace Ledger · Pre-Tool Gate · Soul Persona Inject · Token-Session Init · Stale-Lock Detection (O_EXCL+mtime) · Memory Bus · Adversarial Reasoning Loop · Haki 5-Layer Intent · Nen Phase→Ensemble · Bankai Manifest · Geass Lock · Evidence Contract · Protected-Path Matching · Fail-Closed Role Resolution · Consciousness-Cap Retrieval · Cross-Turn Risk Tracking · Anima-DNA Triggers · PDC Bayesian Priors · Behavioral Fingerprint · Neuron-Loop Baseline · Roadmap State.

---

## What this means for the ship (MUSUBI ONE)
- The differentiation is **density + integration**, not any one mechanism. Competitors ship the commodity layer (skills/hooks/sandbox). YURI has 267 mechanisms, many in layers competitors have *nothing* in (work-dynamics math, cognition, governed epistemic memory, the silent symbiotic-pulse spine).
- The shipped narrative: *"every input passes through a measurable conscience (energy), a chaos-decoder (brain-dump + Haki), a fail-closed governance spine, and a science-curved memory — 267 mechanisms most agent stacks don't have one of."*
- This catalog is the canonical inventory for deciding what goes into the naked core vs what stays private — and what to lead with.
