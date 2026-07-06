---
name: total-recall-time-windowed-selective-recall
description: "Marcel 2026-06-09 build idea — 'Total Recall': a short, SELECTIVE, mathematically-ranked dump of memories/actions/thoughts/code/implementations from any given timeframe, for context continuity. It is the TIME-axis instance of the recall-layer primitive; the literal antidote to context-compaction loss + 'forgetting is broken trust'."
metadata:
  node_type: memory
  type: project
  tier: high
  scope: nexus
  trig: "total recall, continuity, timeframe, rehydrate, recall, compaction, salience, time window, recent memories, context continuity"
  refs:
    - recall-layer-is-a-primitive-many-banks
    - yuri-navigation-layer-guides-are-skills
    - cross-surface-comparability-cracked
    - fleet-findings-must-persist-durably
  originSessionId: 4ed73ec6-6154-40e8-99d5-61bd201923eb
---

GOAL: build 'Total Recall' — given a TIMEFRAME (recent OR older window) + optional topic + a length budget, return a
SHORT, SELECTIVE, ranked dump of what happened (memories, actions, thoughts, code/implementations, tasks) so an LLM
rehydrates continuity. Not a raw dump — a budget-constrained coverage selection.

WHO: Marcel (loved it live; "mathematically an llm can recall the most recent or even older memories/actions/thoughts/code/anything").

THE MATH (the crux): TotalRecall(W, q, B) = argmax over S ⊆ events(W) of [ Σ salience(e,q) − λ·redundancy(S) ]
subject to Σ len(e) ≤ B. salience(e,q) = w_rec·decay(age) + w_imp·importance(e) + w_rel·sim(e,q) + w_sur·infoGain(e):
- decay(age) = hazard/confidenceDecay (recency, tunable so older high-salience still surfaces)
- importance(e) = event weight (owner correction ≫ routine read; confirmed fix ≫ passing test) — OpenMass-style
- sim(e,q) = cross-surface relevance (containment+RRF, [[cross-surface-comparability-cracked]]) — only with a topic
- infoGain(e) = surprise (−log P): how much the event changed state (high-|ΔU| energy trace, inversion, correction)
Selection = submodular/MMR coverage maximization (greedy, redundancy-penalized, token-budgeted) → THIS makes it
"short + selective" (max covered salience per token), not a window dump.

EVENTS LIVE IN (time-keyed, non-protected): memory store (Track A/B), git log (code/impl + diffs), originator/energy
telemetry (actions + ΔU), OpenProcess pool (tasks) — joined by the id-bridge, ordered by time.

WHY: it is the TIME-axis instance of [[recall-layer-is-a-primitive-many-banks]] (banks were topic-keyed; this is
time-keyed) and the literal fix for context-compaction loss (which ate the red-team findings this session, see
[[fleet-findings-must-persist-durably]]) + the AFFERENT nerve realized on time (a fresh/compacted session wakes
knowing what happened, selectively).

STATE: idea logged 2026-06-09, queued to "check out + find the math + create." NEXT: prototype the salience function
over git log + memory timestamps first (cheapest events), then add energy/OpenProcess sources.
