# NEXUS LINK — Build Doctrine

> The company's constitution for self-directed improvement. Owner-ratified truth.
> Read at **cycle start** (to choose work) and **cycle end** (to grade work).
> Authoritative human form. Executable mirror: [`_SYSTEM/config/improvement-doctrine.json`](../config/improvement-doctrine.json) · reader: [`mure/doctrine.mjs`](doctrine.mjs).
> Authority: this is *direction* doctrine — it never overrides `yuri-origin.md`, Protected Surfaces, the Mutation Contract, the Self-Governance Charter, or owner intent.
> v2 — GLM-5.2 adversarial review integrated (2026-06-23).

---

## 0. Why this exists

A company that only ranks work by urgency does reactive maintenance forever. It never decides what *better* means, so it can't move toward it on purpose.

A cycle has three lenses. Two already existed; this document is the third.

| Lens | Question it answers | Where it lives |
|---|---|---|
| **OpenMass** | What is most *urgent / stale / blocking*? | `job-pool.mjs` → `rankJobs` (openprocess-pool) |
| **Governance** | What is *safe to do alone* vs hold for the owner? | `mure/governance.mjs` → `evaluateGovernance` (6-gate charter) |
| **Build Doctrine** | Which direction counts as *improvement*, and did we move? | **this document** + `mure/doctrine.mjs` |

A cycle needs all three: pick the work that is **urgent × direction-fit**, run only what is **safe**, then grade it by **how far it moved a sanctioned axis, with evidence**.

The single line to remember:

> **OpenMass says what's loudest. Governance says what's safe. The Doctrine says what's *worth* moving — and proves whether it moved.**

---

## 1. The improvement axes — the directions

These are the only directions the company recognizes as "better." Every job, role, substrate, and build report maps to **at least one** axis. Adding or removing an axis is **owner-gated** (axis A8b, §6).

Score scale at both ends (§3, §4): an axis can move **+** (advance), **0** (neutral), or **−** (regress).

| ID | Axis | Definition (moving *forward* means…) | Regress looks like | Primary signal (evidence) |
|---|---|---|---|---|
| **A1** | **Capability** | the system can do something it *couldn't* before — a new primitive, skill, role, substrate, or model lane | a capability rots / is lost / **or code is rewritten where an existing one should have been reused** (capability-first) | new `@capability` registered; new lane/role live-verified; reuse-vs-rebuild check |
| **A2** | **Reliability** | the *same* work succeeds more often — fewer crashes, flakes, false "done" | a regression; a new flake; a silent failure path | green/red/grey suite; failure-rate ↓ across cycles; no false-PASS |
| **A3** | **Autonomy** | the owner drives less — work completes autonomously **without the owner cleaning up after it** | manual intervention needed to fix a broken state the cycle left behind | **5+ consecutive clean autonomous runs, no owner rollback/state-fix**; manual-fire count ↓ (NOT just "passes its own gates") |
| **A4** | **Quality** | outputs are *more correct / better verified / higher craft* | shipped-but-wrong; verification skipped; craft drops | adversarial pass clean; local-evidence verdict; review findings ↓ |
| **A5** | **Efficiency** | the *same outcome for less* — tokens, wall-time, $, owner attention | cost/time per outcome rises with no quality gain | tokens/job, latency/job, $/job, human-touch/job all ↓ |
| **A6** | **Compounding** | the system gets *smarter over time* — knowledge captured, never-stale, re-discovery killed | research evaporates; indexes go stale; the same thing re-derived | findings reindexed; registries fresh; a procedure becomes a launcher |
| **A7** | **Safety** | the gates get *stronger* — blast better bounded, fewer ways to do harm | a gate weakens; blast widens; arming discipline slips | a new veto/guard; tighter scope; arming stays owner-gated |
| **A8a** | **Self-improvement — machinery** | the company improves its own *engine* — loop hardening, the pool, roles, the assessor (**not** this doctrine) | the machinery ossifies; the company can't improve its engine | an owner-ratified change to roles/pool/assessor/loop |
| **A8b** | **Doctrine / goalposts** *(owner-only)* | changing the axes, the vector, the rubrics, or this document — the *definition of success* | the company alters its own success metric to make its work look better | an **owner-ratified** doctrine version bump |
| **A9** | **External value** | delivered work creates *value outside the OS* — a venture/product/client outcome | promised external value undelivered or net-negative | shipped deliverable; owner/client-confirmed outcome |
| **A10** | **Observability** | the owner can read the system's *exact internal state from logs + dashboards* without reading code | a silent failure, an un-logged mutation, hidden state | a cycle failure explainable from logs alone; dashboard state-coverage |

A1–A8a + A10 are the **self-improving-engine** axes. **A8b is owner-only** (weight 0 — the company *proposes* doctrine changes, never self-credits them; §6). A9 is **delivery** (owner-steered). Together they generalize the doctrine to *any* work the company touches.

---

## 2. The current vector — the knob you turn

The axes are stable. **Which axes the company weights *right now*** is the owner-tunable knob — the "certain direction" of a given phase. Lives as `currentVector` in the JSON; weights: 0 = ignore, 1 = baseline, 2 = push, 3 = primary front.

**Current vector (v2 — GLM-5.2 reweight integrated):**

| Axis | Weight | Why now |
|---|---|---|
| A2 Reliability | **3** | the cycle just had to be made reliable; trust is the precondition for arming |
| A3 Autonomy | **3** | the whole pivot is owner-drives-less → self-running company |
| A6 Compounding | **3** | a 3rd substrate (ollama) adds complexity — capture the knowledge now or pay in 3 months *(GLM-5.2 ↑ from 2)* |
| A1 Capability | **2** | the 3rd substrate (ollama-fleet) is the live build front |
| A4 Quality | **2** | correctness of the new substrate's outputs must rise with the new architecture *(GLM-5.2 ↑ from 1)* |
| A5 Efficiency | **2** | free ollama lane + Sonnet pool = more work per owner-dollar |
| A10 Observability | **2** | an auto-runner the owner can't see into is one the owner turns off |
| A7 Safety | floor | always-on; never traded down, never *the* push |
| A8a Self-improvement (machinery) | 1 | baseline; this doctrine's reader + the assessor are A8a work |
| A9 External value | 1 | steady; owner-steered, no autonomous external commitments |
| **A8b Doctrine** | **0** | **locked — only the owner moves the goalposts** |

**Live jobs mapped to the vector (proof this isn't abstract):**

- OLLAMA-FLEET → **A1** (new substrate) + **A5** (free bulk lane) — top of the current front.
- Dashboard seamless + deeper → **A10** (observability) + **A3** + **A4**.
- Arm-readiness assessment → **A7** + **A3**.
- The reliability fix (`picked` bug) → **A2**.
- This doctrine + its reader → **A8a**.

---

## 3. Direction-fit — the SELECTION rubric (deterministic)

When the company is launched "to find something to do," it does **not** pick by OpenMass alone. It scores each candidate's expected per-axis effect, weights by the current vector, and blends — by **strict arithmetic**, no subjective "urgency bands" (an autonomous ranker needs arithmetic it can compute).

```
For each candidate job J:
  fit(J,A) ∈ {-2,-1,0,+1,+2,+3}                  # expected effect per axis, evidence-stated
  directionFit(J) = Σ_A  weight(A) · fit(J,A)     # floor axis: 0 push, but a regression = hard violation
  priority(J)     = OpenMass(J) + wDir · directionFit(J)   # wDir default 1.0, tunable
```

- **Hard veto from auto-exec:** drop J if `directionFit(J) ≤ 0 AND OpenMass(J) < staleThreshold`, **or** if J would regress a floor axis. (A loud job that moves no sanctioned direction does not auto-run.)
- **Governance is a filter, not a score** — an owner-gated job is surfaced and held regardless of priority.
- **Generalization:** `fit` is scored against **axes**, never job type. A `gap`, `infra`, `blender`, or a future `role-X` job all run the identical rubric.
- **Evidence discipline:** every non-zero `fit` carries a one-line reason ("adds the ollama substrate → +2 A1").

---

## 4. Advancement assessment — the COMPLETION rubric (churn-penalized)

The same axes become the grader. After a job runs, its build report is assessed against the axis it *claimed* to advance.

For each claimed axis A on job J:

| Field | Meaning |
|---|---|
| `verdict` | `advanced` \| `partial` \| `none` \| `regressed` |
| `evidence` | the local proof — `TERM_COUNT` / `FILE_COUNT` / `MATCH`, a green test, a live probe (Evidence Contract Grammar) |
| `magnitude` | rough ΔU on that axis (small / medium / large) |
| `regressions` | any axis pushed **−** as a side-effect |
| `churn` | lines-touched / token-cost relative to the axis delta |

```
net = verdictScore(verdict) − regressionsCount − churnPenalty
```

Rules:

- **No `advanced`/`partial` without local evidence.** A claim with no proof grades `none`. (Mirrors `yuri-origin` → Evidence Contract: model/lane text is advisory until locally verified.)
- **Churn is penalized.** A big refactor that doubles token cost to claim a small reliability win is *churn*, not an advance — prefer small, surgical wins. (GLM-5.2: blocks A2 Goodharting via bulk.)
- **Rewrite-not-reuse = A1 regression.** Rebuilding what already exists counts *against* Capability (capability-first).
- **Net direction = gains − regressions − churn.** The grade feeds the next cycle: under-served axes (low cumulative advancement vs weight) become the recommender's target (§5).

---

## 5. The loop — how a cycle uses this end to end

```
LAUNCH (owner fires a cycle)
  └─ load doctrine + currentVector
  └─ SELECT:   priority = OpenMass + wDir·directionFit  (§3); hard-veto zero-direction stale jobs; governance = filter
  └─ EXECUTE:  run only self-governable jobs (charter); hold owner/blender/arm/high-blast/A8b
  └─ GRADE:    assess each finished job by advancement (§4), evidence-gated, churn-penalized
  └─ RECOMMEND: propose new jobs that advance the *under-served* axes of the current vector
  └─ REPORT:   per job: axes claimed → verdict → evidence → churn → net
RATIFY (owner): merges the review branch; may re-weight the vector or ratify an A8b doctrine change
```

This makes "get better over time" **measurable and directed**: every cycle states which direction it moved, proves it, and the next cycle steers toward what's lagging.

---

## 6. Self-grading guardrail — the alignment gate (non-negotiable)

A self-improving company that can **edit its own definition of "better"** will Goodhart itself. Three closed loopholes:

1. **The goalposts (A8b).** The company **may PROPOSE** doctrine changes (a new axis, a re-weight, a sharper rubric) as an **A8b** job with evidence. The owner **alone RATIFIES.** A8b is weighted **0** — the company earns *no* self-improvement credit for proposing them, so it can't justify rewriting the doctrine to make its own work easier. Editing the two doctrine files is held by owner-floor, exactly like `arm`/`blender` jobs. `doctrine.mjs` is **read-only by construction** — the reader cannot write the metric. (Same principle `governance.mjs` already enforces for the *safety* gate: a role registers capabilities but cannot modify the gate itself — the Gödel-Agent self-modification veto, now applied to the success metric too.)
2. **Churn (A2/A4).** Net-grading subtracts churn + side-effect regressions, so a bloated refactor that fakes a reliability win nets ≈0 (§4).
3. **Tautological autonomy (A3).** A3 is signalled by *real successful runs the owner didn't have to clean up*, not by the company passing its own deterministic gates (which it could otherwise loosen to inflate the score).

The company optimizes *toward* the doctrine. It never gets to *move the goalposts*.

---

## 7. Generalization contract (keeps it reusable)

- Scored against **axes**, never job specifics → any job/role/substrate, today or future, runs the same lens.
- **One rubric, both ends** → selection (§3) and assessment (§4) are the *same axes*. What you pick *for* is what you're graded *on*.
- Every job/role/substrate declares the axes it serves; an item mapping to **no** axis is a doctrine gap (not worth doing, or an axis is missing → propose one under §6/A8b).
- The doctrine is **stable**; the **vector** is the knob (§2). Re-prioritizing a phase = re-weighting, not rewriting.

---

## 8. Wiring status (executable, not lore)

| Surface | Reads the doctrine for | Status |
|---|---|---|
| `config/improvement-doctrine.json` | machine-readable axes + vector + rubrics | **shipped** |
| `mure/doctrine.mjs` | `directionFit` / `grade` / `underServedAxes` / `blend` | **shipped** |
| `job-pool.mjs` → `rankJobs` | add `directionFit` + blend term to ranking | **queued** (A8a) |
| `nexus-company.mjs` → `recommend()` | propose jobs that fill under-served axes | **queued** (A8a) |
| build-report writer | record per-job `axes → verdict → evidence → churn → net` | **queued** (A8a) |
| cycle self-assessment | cumulative axis advancement vs vector | **queued** (A8a) |

V2 ships the **doctrine + JSON mirror + the `doctrine.mjs` reader**. Wiring the reader into the runner is an A8a self-improvement job — queued; the parts touching `nexus-company.mjs` wait on a parallel session's in-flight edits to that file.

---

## Changelog

- **2026-06-23 v2** — GLM-5.2 adversarial review integrated: A8 split into A8a (machinery) / A8b (goalposts, owner-only weight 0); deterministic selection formula (`OpenMass + wDir·directionFit` + hard veto, no urgency bands); churn penalty + rewrite-not-reuse = A1 regression; A3 resignalled to real clean-run streaks; **A10 Observability** added; vector reweight A4→2, A6→3. Owner-ratified.
- **2026-06-23 v1** — authored (Opus session, owner-requested). 9 axes, current vector, selection + assessment rubrics, self-grading guardrail.
