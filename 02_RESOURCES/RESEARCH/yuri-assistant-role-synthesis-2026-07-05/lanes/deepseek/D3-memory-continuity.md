Now I have the full picture. Here is the survey.

---

## SURVEY: Minimal Memory Policy for a Long-Lived Personal Assistant

### 1. WHAT MUST NEVER BE FORGOTTEN (the force-keep tier)

**HARD-FACT** — Marcel's own questionnaire answers (`02_RESOURCES/RESEARCH/answers/marcel-yuri-questionnaire-2026-07-04.md`):
- Organisation, safety, security, compounding efforts, quirks, personal traits, behaviours
- The "never download without clearance" rule
- The "never accept failure as final" rule
- Provider meters and pacing policy (Anthropic / z.ai / ollama-cloud, no hard cap but must pace to fully use weekly quota)
- Relationship: Yuri IS the front-end to ALL of YURI

**HARD-FACT** — YURI neuro-core (`_SYSTEM/neuro-core.md`, principle 8):
- Force-keep override: owner-locked facts, IP constraints, identity, canonical decisions — the decay scorer, pruner, and silent-rewrite path all skip these. Modified only with strong evidence + owner approval.

**HARD-FACT** — YURI memory architecture (`_SYSTEM/MEMORY_ARCHITECTURE.md`):
- Track B (Claude behavioral) has a `pinned` tier concept. The subconscious consolidator hard-exempts `feedback` and `user` floor types — never demoted.

**RECALLED-PATTERN** — The minimal force-keep set for "feels like it remembers me":
1. **Identity layer** — who the operator is (name, roles, relationship to assistant)
2. **Standing rules** — the NEVER list (downloads, failure acceptance, data boundaries)
3. **Provider/pacing config** — which providers, quota policy, pacing rules
4. **Core preferences** — communication style dials (humor 7.5, directness 7.5, warmth 7.5, formality 7.5, swearing 7.5), voice mode, greeting format
5. **Key people** — family, close collaborators, their relationship to the operator
6. **Active projects** — what is currently being built, what state it's in, what the next step is
7. **Recurring workflows** — the morning ritual, the co-questionnaire pattern, the parallel-session conductor pattern

Everything else is tier-2 (decays) or tier-3 (ephemeral).

---

### 2. VERBATIM CONVERSATION vs DISTILLED FACTS

**HARD-FACT** — The neuro-core principle (principle 1, `_SYSTEM/neuro-core.md`):
> Two rates, two stores. Fast append-only episodic buffer + slow conservative semantic store. Never let one session overwrite the core — promote only via offline consolidation.

**HARD-FACT** — The jarvis memory implementation (`_SYSTEM/Scripts/voice/jarvis_memory.py`):
- Episodic store: `episodes` table with `summary` (not verbatim), `cues`, `tags`, `weight`, `reinforced` count, `last_recalled_ts`, `transcript_ref` (optional link to full transcript)
- The MODEL decides what's worth remembering — the `remember` tool is called explicitly, not auto-logged
- Per-turn FTS5 cue-recall surfaces relevant past episodes into the system prompt

**HARD-FACT** — The subconscious design (`_SYSTEM/MEMORY_ARCHITECTURE.md`):
- Demote: memories >30 days old without validation → relocate body verbatim into `cold_docs` FTS5
- Recall: BM25-match current task cues against cold store, surface top-K dormant traces
- Re-promote: if a cold trace keeps getting queried, becomes operator-gated candidate to restore

**RECALLED-PATTERN** — The minimal policy:
- **NEVER store verbatim conversation as memory.** Verbatim is a transcript, not memory. The model decides what's worth remembering at each turn boundary.
- **Store distilled facts** (summary + cues + tags + weight) in the episodic store.
- **Link to full transcripts** via `transcript_ref` for forensic recall, but don't index them as memory.
- **Promote to semantic** only on repeated reinforcement (the "schema-assisted one-shot consolidation" from neuro-core: HIGH congruency → fast one-pass merge; LOW/novel → hold in buffer for more evidence).

---

### 3. EXPIRY / FORGETTING POLICY

**HARD-FACT** — Neuro-core principle 6 (`_SYSTEM/neuro-core.md`):
> Forgetting is engineered, not entropy. Retention = power-law of time-since-reinforcement (not a flat TTL); run an explicit, tunable, salience-gated pruner; treat "lost" as a retrieval/index problem first — keep the record, down-weight the trigger (storage ≠ retrievability).

**HARD-FACT** — Neuro-core principle 4 (NEU-FORG-04, `_SYSTEM/knowledge/neuroscience-corpus.md`):
> Forgetting is an engineered program (DA→Rac1→Cofilin); knockdown ~doubles retention. The brain spends energy to forget.

**HARD-FACT** — The subconscious consolidator (`_SYSTEM/MEMORY_ARCHITECTURE.md`):
- `MEMORY_STALE_DAYS=30` — memories >30 days without validation are demotion candidates
- FSRS power-law decay pass
- Dry-run / proposal-only — nothing leaves active memory without explicit manual yes
- Floor types (`feedback`, `user`) are hard-exempt — never demoted

**HARD-FACT** — Neuro-core principle 7 (homeostatic scaling):
> Periodically multiplicatively renormalize edge-mass to a set-point (never additive zeroing); relative rankings survive, inflation from constant reinforcement bleeds off.

**RECALLED-PATTERN** — The minimal forgetting policy:
1. **Three tiers, not one:**
   - **PINNED** (force-keep) — never decays, never demotes, never prunes. Owner-locked.
   - **ACTIVE** — power-law decay from last reinforcement. Demote to cold store at 30 days without validation. Re-promote on re-query.
   - **COLD** — FTS5/BM25 indexed, cue-recall only. No decay. No auto-delete. Storage is cheap; retrieval index is the scarce resource.
2. **No hard delete.** Relocate, don't delete. Storage ≠ retrievability — keep the record, down-weight the trigger.
3. **Forgetting rate is tunable** (one env var, not hardcoded).
4. **Reinforcement is deferred + globally gated** (neuro-core principle 4): co-activation sets a decaying eligibility flag; commit only when reward/correction/novelty arrives in-window.

---

### 4. SURPRISE-GATED WRITES

**HARD-FACT** — The jarvis energy implementation (`_SYSTEM/Scripts/voice/jarvis_energy.py`):
- `write_strength = clamp(base·precision + BOOST·surprise/(1+surprise), 0.1, 5)`
- Surprise = time-decayed |ΔU| from the energy-gate trace (real system deltaU, not model-judged)
- Precision = evidence-grade (high for deterministic local evidence, low for unverified model text)
- ADDITIVE, not multiplicative — a multiplier saturates the [0.1,5] band at live surprise≈9, erasing the salience gradient
- Degrades gracefully: trace absent/empty/malformed → surprise=0.0 → write_strength = base weight

**HARD-FACT** — Neuro-core principle 2 (`_SYSTEM/neuro-core.md`):
> Gate on surprise, store the residual. Skip what's already predicted; persist only the prediction-error delta (|ΔU| ≈ Bayesian surprise = belief-shift); reject high-entropy-but-uninformative noise (white-snow guardrail).

**HARD-FACT** — Neuro-core principle 3:
> write_strength = surprise × precision. Weight surprise by evidence-grade — amplify surprises from verified local evidence, damp them from advisory/model text.

**HARD-FACT** — Neuro-core principle 5 (reconsolidation):
> Recall is a gated WRITE, not a read. Mismatch decides: no mismatch → strengthen; contradiction → merge + re-timestamp in place; unrelated → new item.

**RECALLED-PATTERN** — The minimal surprise gate:
1. **Model judges salience first** (the `remember` tool call). The model decides "is this worth keeping?" before any energy gate runs.
2. **Energy gate modulates write strength** (not write/no-write). Surprise from real system deltaU nudges the weight up or down, but the model's base judgment is PRIMARY.
3. **Precision dampens unverified surprises.** A surprising model claim that hasn't been locally verified gets low precision → low write strength. A surprising local-evidence finding gets high precision → high write strength.
4. **White-snow guardrail:** reject high-entropy-but-uninformative noise. Random churn is not surprise.

---

### 5. AVOIDING MEMORY-BLOAT AND CATASTROPHIC FORGETTING

**HARD-FACT** — The two-track architecture IS the anti-catastrophic-forgetting design:
- Track B (Claude behavioral) = fast episodic, session-local, grows with use
- Track A (YURI canonical) = slow semantic, governed propose→decide→ledger, operator-gated
- They do not touch each other. One session cannot overwrite the core.

**HARD-FACT** — Neuro-core principle 1 (CLS / anti-catastrophic-interference):
> Never let one session overwrite the core — promote only via offline consolidation that replays new episodes *interleaved* with a sample of old knowledge.

**HARD-FACT** — The convergence design (`02_RESOURCES/RESEARCH/memory-architecture-evolution-2026-06-14/02-CONVERGENCE-DESIGN.md`):
- Per-lane shards (one writer per file) → single drainer folds → canonical.jsonl
- Idempotent UPSERT by content-hash, not by timestamp
- Vector-clock ordering, never wall-clock
- Supersede semantics (not overwrite)

**HARD-FACT** — Current Track B state: 5 files, 525-byte MEMORY.md. The store is minimal and healthy. No bloat problem exists yet.

**RECALLED-PATTERN** — The minimal anti-bloat/anti-forgetting policy:
1. **Two stores, clearly separated.** Fast episodic (model-decides-what-to-remember) + slow semantic (operator-gated promotion). This is the single most important architectural decision.
2. **Cap the episodic store.** Not by row count — by reinforcement. Old unreinforced episodes demote to cold store. The cold store is cheap; the active index is scarce.
3. **No auto-promote.** Nothing moves from episodic to semantic without operator approval. The `propose→decide→ledger` pipeline is the gate.
4. **Homeostatic scaling.** Periodically renormalize weights so no single memory dominates. Relative rankings survive; inflation bleeds off.
5. **Interleaved replay on consolidation.** When promoting, replay new episodes interleaved with a sample of old knowledge. This is the anti-catastrophic-interference mechanism.

---

### 6. THE MINIMAL MEMORY POLICY (the "feels like it remembers me" floor)

**RECALLED-PATTERN** — Synthesized from all evidence above:

```
# YURI MINIMAL MEMORY POLICY

## Tier 1 — PINNED (force-keep, never decays)
- Operator identity and roles
- Standing rules (NEVER list, always-confirm list)
- Provider config and pacing policy
- Core communication dials
- Key people and their relationships
- Active projects and their state
- Recurring workflow patterns

## Tier 2 — ACTIVE (power-law decay, demotes at 30d without reinforcement)
- Episodic memories (model-decided, summary+cues+tags+weight)
- Session outcomes and decisions
- Research findings
- Skill usage patterns
- Reinforcement: on recall → bump stability; on contradiction → merge; on unrelated → new item

## Tier 3 — COLD (FTS5/BM25 indexed, cue-recall only, no decay, no auto-delete)
- Demoted active memories >30d stale
- One-off events and completed projects
- Old research that hasn't been re-accessed

## Write policy
- Model decides salience (the `remember` call)
- write_strength = base·precision + BOOST·surprise/(1+surprise)
- Surprise from real system deltaU (energy gate trace)
- Precision from evidence-grade (high for local verification, low for model text)
- Reject high-entropy noise (white-snow guardrail)

## Recall policy
- Session start: load MEMORY.md index (pinned + recent active)
- Per-turn: FTS5 cue-recall against active + cold stores
- On trigger match: load full memory file
- Subconscious: BM25 match against cold store, surface top-K dormant traces

## Forgetting policy
- No hard delete. Relocate, don't delete.
- Active → Cold: 30 days without validation (proposal-only, operator approves)
- Cold: no decay, no auto-delete. Storage is cheap; retrieval index is scarce.
- Forgetting rate: tunable via env var (default 30d)
- Floor types (feedback, user, pinned): hard-exempt from demotion

## Anti-catastrophic-interference
- Two stores, clearly separated (fast episodic + slow semantic)
- No auto-promote to semantic (operator-gated propose→decide→ledger)
- Interleaved replay on consolidation (new + sample of old)
- Homeostatic scaling (periodic renormalization, never additive zeroing)
```

---

### BUILD LIST (patterns worth adopting)

1. **Three-tier memory** (pinned / active / cold) — already exists in YURI as force-keep / Track B / subconscious. The shape is right. Keep it.
2. **Model-decides salience** (the `remember` tool call) — the model judges what's worth keeping before any gate runs. This is the correct minimal design.
3. **Surprise-gated write strength** (additive, not multiplicative) — `jarvis_energy.py` has the correct formula. The additive nudge preserves the model's salience gradient.
4. **Relocate, don't delete** — the subconscious design is correct. Storage is cheap; retrieval index is scarce.
5. **Power-law decay with tunable horizon** — FSRS-style retention curve, not flat TTL. Already designed in the subconscious consolidator.
6. **Session-start MEMORY.md index** — the one-page index loaded every session is the "feels like it remembers me" mechanism. Keep it minimal (pinned + recent active only).
7. **Morning greeting with continuity** — "Good morning Marcel, shall we continue from where we left off?" This single line does more for continuity than any database schema.
8. **Per-lane shards for concurrent writes** — the convergence design (event-sourced, one-writer-per-file, single drainer) solves the N-concurrent-session problem without a distributed-systems PhD.

### CUT LIST (over-engineering traps to avoid)

1. **Vector embeddings for personal memory.** BM25/FTS5 is sufficient for cue-recall at this scale. Embeddings add cost, latency, and a second index to maintain. Defer until the active store exceeds ~10K entries.
2. **Real-time cross-session memory sync.** The per-lane shard + periodic drainer design is sufficient. Real-time sync is a distributed-systems problem that doesn't exist yet (5 memory files, 3 concurrent sessions).
3. **Automatic entity extraction / knowledge graph construction.** The model already decides what to remember. A separate entity extraction pipeline would duplicate that judgment and add failure modes.
4. **Memory compression / summarization chains.** The model's own summary in the `remember` call is sufficient. A separate summarization pipeline is premature optimization.
5. **Differential privacy / anonymization for personal memory.** This is a single-operator system. Privacy boundaries are already handled by the protected-paths rule and the split-routing design.
6. **Multi-modal memory (images, audio, files).** The assistant is text+voice. Storing non-text modalities adds complexity without a demonstrated need.
7. **Memory versioning / rollback UI.** Git tracks the code. The memory stores are append-only event logs. A rollback UI is a feature that won't be used until something breaks, and by then the append log is sufficient for forensics.
8. **Cross-assistant memory sharing (Yuri ↔ Jeffrey).** Two different operators, two different assistants. Shared memory is a future problem that requires solving identity and authorization first.

---

**08CW_MEMORY_CONTINUITY_SURVEY_MINIMAL_POLICY_X_PASS_COMMITTED**