# Mechanism Card — Orthogonal Edge Routing (channel track assignment)

- **slug:** `orthogonal-edge-routing`
- **source:** eclipse-elk/elk @ `master` — `plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/p5edges/orthogonal/OrthogonalRoutingGenerator.java` (+ `OrthogonalEdgeRouter.java`)
- **license:** EPL-2.0 — **COPYLEFT, STUDY-ONLY** ⚠️ clean-room rewrite required, do NOT copy source
- **lineage:** Sander GD'03 (LNCS 2912) hyperedge ordering · Di Battista/Eades/Tamassia/Tollis "Graph Drawing" §9.4 (cycle breaking)
- **permissive conceptual base (safe to ship):** Lee maze BFS routing · classic left-edge / interval-graph channel routing

## Mechanism (one line)
Turn each edge's horizontal run into a **hyperedge segment**, decide all pairwise left/right orderings via a **conflict+crossing penalty**, break cycles, then **topologically number** the resulting DAG to assign each segment a **routing slot (track)** → slot × spacing = bend-point x. Deterministic overlap/crossing minimization, no exponential search.

## Algorithm
1. **Build segments** — merge edges sharing an endpoint coordinate into one comb-shaped `HyperEdgeSegment` with sorted `incoming`/`outgoing` connection y-lists and a `[start,end]` vertical span.
2. **Skip straights** — if `|start−end| < TOLERANCE(1e-3)`, edge is a straight line: no slot, no dependency.
3. **Thresholds** — `conflictThreshold = 0.5·edgeSpacing` (fixed); `criticalConflictThreshold = 0.2·min_adjacent_connection_distance` (per layer-pair).
4. **Pairwise dependency** (O(n²)) — for each pair, merge-walk the two sorted position lists:
   - within `criticalThreshold` → **CRITICAL** (sentinel −1): this order is forbidden → add a hard dependency forcing the opposite order.
   - within `conflictThreshold` → soft conflict (count++).
   - no critical → count crossings (positions landing inside the other span); pick cheaper order by penalty, add one regular dep weighted by the penalty gap; tie>0 → two zero-weight deps (a removable 2-cycle).
5. **Break critical cycles** — if ≥2 critical deps, detect cycles; resolve by **splitting** a segment into two vertically-stacked pieces in different slots (only way to satisfy contradictory must-be-left constraints).
6. **Break non-critical cycles** — per cycle dep: weight 0 → remove, else → reverse. Now a DAG.
7. **Topological numbering (Kahn)** — seed in-degree-0 nodes at slot 0; relax `slot(t)=max(slot(t), slot(p)+1)`; right-justify pure back-edge segments to max rank so back edges don't bow.
8. **Emit** — `x = startPos + slot·edgeSpacing`; bend points at slot-x and connection-y; channel consumes `maxSlot+1` slots.

## Formula
```
penalty(order) = 1·conflicts + 16·crossings        # crossing ≫ conflict (16:1)
conflict  ⟺ |p1−p2| < 0.5·edgeSpacing
critical  ⟺ |p1−p2| < 0.2·min_adjacent_dist  → hard constraint
order A<B  iff penalty(A<B) < penalty(B<A);  depWeight = |Δpenalty|
slot(t) = max_pred ( slot(p)+1 );   x = startPos + slot·edgeSpacing
slots_used = maxSlot + 1
```

## YURI application — router-kernel K2 / FLOORPLAN lens (77 traces)
- trace ↔ HyperEdgeSegment · inter-column gutter ↔ channel · K2 track ↔ routing slot.
- **Adopt clean-room:** (1) track assignment as **segment-ordering DAG + Kahn topo-numbering** (deterministic overlap kill, not greedy stuffing); (2) single scalar **penalty (crossings 16× conflicts)** to minimize per pair; (3) **critical(0.2)/soft(0.5) threshold split** to separate "must split the trace" from "tolerable penalty."
- **Critical-cycle split** = the over-subscription escape hatch when 77 traces flood a narrow gutter.
- **Ship core stays permissive:** Lee-maze BFS + left-edge channel routing (classic CS); ELK hyperedge refinement is *studied*, never copied.

## License flag ⚠️
EPL-2.0 = copyleft (file-level source-availability obligation). No copy/transpile of ELK or elkjs into YURI. Reimplement from this description with original identifiers/structure; keep a permissive-licensed Lee/left-edge foundation. Loud flag on any K2 PR.

## Verification
Real source read (not from memory). Quoted: `int depValue1 = CONFLICT_PENALTY * conflicts1 + CROSSING_PENALTY * crossings1;` · constants `CONFLICT_PENALTY=1`, `CROSSING_PENALTY=16`, `CONFLICT_THRESHOLD_FACTOR=0.5`, `CRITICAL_CONFLICT_THRESHOLD_FACTOR=0.2`, `CRITICAL_CONFLICTS_DETECTED=-1` · Kahn line `target.setRoutingSlot(Math.max(target.getRoutingSlot(), node.getRoutingSlot() + 1));`. License confirmed via repo `LICENSE.md` (EPL-2.0) + in-file SPDX header.