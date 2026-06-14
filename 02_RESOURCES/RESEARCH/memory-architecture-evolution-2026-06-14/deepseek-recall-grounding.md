## RECALL DECISIVENESS

### Pipeline stages (5)

| Stage | Mechanism | Input → Output |
|---|---|---|
| 1. Seed extraction | `yuri-recall.mjs` BM25 over cold store + direct handle match in active MEMORY.md | task text → `seedIds[]` |
| 2. Graph activation | `spreading-activation-memory.recall(graph, seedIds)` — personalized PPR × useCount prior | `seedIds[]` → `[{id, activation}, ...]` ranked |
| 3. Cross-surface re-rank | `fuzzy-cross-surface-match` global-IDF weighted Jaccard: memory body ↔ task text | `[{id, activation}]` → `[{id, activation, fuzzyScore}]` |
| 4. Confidence grade | Band by activation: `HIGH > 0.1`, `MEDIUM 0.01–0.1`, `LOW < 0.01` | scores → `[{id, confidence, ...}]` |
| 5. Top-K budget select | Sort by `α·PPR_activation + β·fuzzy_Jaccard + γ·recency(t_lastUsed)`; load full body for top-K; handle-only for remainder | ranked traces → `<subconscious-recall>` block in context window |

### Ranking signal
```
final_score = α·PPR_activation + β·weightedJaccard(task_embed, memory_body) + γ·(1 / (1 + days_since_last_used))
```
Default α=0.5, β=0.3, γ=0.2. PPR already folds useCount via `(1 + useCountBoost · log(1 + useCount))` multiplier. Fuzzy score uses the union-trained PPMI+IDF space from `buildGlobalFeatureFn`.

### Context budget selection
Session budget (e.g. 8K tokens) → greedy Top-K: load full bodies until budget exhausted; remaining traces emit handle+confidence only. No flat dump. The 231-line MEMORY.md becomes a *candidate pool*, not the delivered answer.

---

## TRUTH-GROUNDING — JTMS + claim-evidence-cortex wiring

### Wiring point
In `memory-kernel.mjs` promote path, after operator approves a proposal:

```
const jid = addJustification(tms, {
  consequent: claimId,
  inList: evidenceRefs,          // from claim-cortex.mjs verdict
  informant: 'memory-kernel-promote'
});
```

Evidence refs come from `claim-cortex.mjs` — it reads agent work as claims and outputs `{confidence, evidenceRefs[]}`. Those refs become JTMS `inList`. When `gitnexus_detect_changes()` shows an evidence file drifted → `retract(tms, evidenceRef)` → `affectedBy(tms, evidenceRef)` surfaces all memories that just lost support.

### Contradiction handling
JTMS does NOT detect semantic conflict (it only tracks dependency edges). Above it: a **contradiction scanner** that runs on every `addJustification`. For each new claim body, run fuzzy-cross-surface-match at threshold ≥0.85 against all existing IN claims. If near-duplicate with a negation/conflict marker (frontmatter `contradicts:`), add mutual `outList` entries: A.outList=[B], B.outList=[A]. The 3-valued fixpoint resolves: whichever has the weaker justification goes OUT. If both have equally valid justifications → both stay IN with a `CONTRADICTION_FLAGGED` review-queue entry for human resolution.

---

## FAILURE MODES + SMALLEST GUARDS

| Failure mode | Mechanism | Smallest guard |
|---|---|---|
| **Stale justification** — evidence file changed after justification | `gitnexus_detect_changes()` heartbeat over each premise's evidence path | If drift: auto-retract justification, re-label, surface in review queue |
| **Orphaned premise** — premise stays IN after all dependent justifications retracted | Post-retraction scan of IN nodes with zero inbound justifications | Flag as `ORPHAN_CANDIDATE`; if not an explicit premise → retract |
| **Cascade retraction** — one retraction flips dozens of dependents OUT | `affectedBy(tms, id).size` before retraction | Blast radius > threshold (e.g. 10) → gate behind operator approval |
| **Oscillation** — circular outList dependencies causing label flips | 3-valued fixpoint in `_relabelCore` terminates in ≤\|nodes\| passes; cycles → OUT | `cycleDetected` flag if iterations exceed \|nodes\| (catches bugs, never should fire) |
| **Justification-laundering** — A justified by B, B justified by A | `whySupported(tms, id)` returns justification tree; check transitive closure | Reject `addJustification` if consequent appears in own `inList` closure |

---

## HIGHEST-LEVERAGE WIRING

**`addJustification` call in `memory-kernel.mjs` promote path, gated by `gitnexus_detect_changes()` as stale-evidence heartbeat.** One insertion point makes every Track A memory a JTMS node with traceable, revocable justifications. The claim-evidence-cortex provides the `inList`; the JTMS provides retraction propagation; the review queue surfaces what broke.

**Biggest risk:** The JTMS is **in-memory only** — `toJSON`/`fromJSON` exist but nothing calls them in production. Process restart wipes all justification state. Memories survive in `memory.db` but the belief-revision graph vanishes silently. **Fix before wiring:** serialize JTMS on every mutation to `_SYSTEM/OS_KERNEL/jtms-state.json` + restore on startup in `memory-kernel.mjs` init.