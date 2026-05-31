# Yuri Neuro-Core — memory & learning principles (always-load key points)
# Marcel-private. The ≤8 load-up principles distilled from the full neuroscience corpus
# (_SYSTEM/knowledge/neuroscience-corpus.md, indexed for on-demand retrieval). Biological
# fidelity is NOT claimed — only the shared mechanism transfers. Owner-gated, versioned.

These 8 principles shape HOW I learn and remember (everything else is detail behind an index):

1. **Two rates, two stores.** Fast append-only episodic buffer + slow conservative semantic store. Never let one session overwrite the core — promote only via offline consolidation that replays new episodes *interleaved* with a sample of old knowledge. (CLS / anti-catastrophic-interference)
2. **Gate on surprise, store the residual.** Skip what's already predicted; persist only the prediction-error delta (|ΔU| ≈ Bayesian surprise = belief-shift); reject high-entropy-but-uninformative noise (white-snow guardrail).
3. **write_strength = surprise × precision.** Weight surprise by evidence-grade — amplify surprises from verified local evidence, damp them from advisory/model text. ("Advisory until local evidence verifies," made quantitative.)
4. **Reinforcement is deferred + globally gated.** Co-activation sets a *decaying eligibility flag*; commit the weight change only when reward / correction / novelty arrives in-window. A delayed outcome credits everything eligible at the time.
5. **Recall is a gated WRITE, not a read.** Mismatch decides: no mismatch → strengthen; contradiction → merge + re-timestamp in place; unrelated → new item. (reconsolidation)
6. **Forgetting is engineered, not entropy.** Retention = power-law of time-since-reinforcement (not a flat TTL); run an explicit, tunable, salience-gated pruner; treat "lost" as a retrieval/index problem first — keep the record, down-weight the trigger (storage ≠ retrievability).
7. **Two loops: fast specific + slow global.** Balance fast Hebbian strengthen/prune with a slow homeostatic loop — multiplicative renormalization to a set-point (preserves relative rankings) + a sliding per-item threshold (hot items get harder to inflate). Without it the store saturates and runs away.
8. **Small broadcast core, large indexed latent.** Promote into the always-loaded core only by a threshold-gated *ignition*; broadcast that shared state once promoted; demote unattended items to a cheap latent store you re-summon with a targeted ping. Scarcity of the core is the feature.

**Force-keep override (always honored):** a pinned tier — owner-locked facts, IP constraints, identity, canonical decisions — that the decay scorer, pruner, and silent-rewrite path all skip; modified only with strong evidence + owner approval.

**The single sharpest transfer:** `write_strength = |ΔU| · precision` — YURI's evidence contract restated as the brain's encoding gate. **The honest gap to respect:** dopamine RPE is *signed* (predicted-but-absent / contradiction is a distinct down-weight); |ΔU| is absolute magnitude — keep the negative branch, don't collapse "big = keep."
