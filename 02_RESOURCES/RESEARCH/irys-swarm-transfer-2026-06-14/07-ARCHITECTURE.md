# MOVE 1b — RECURSIVE EXOSKELETON NANOSWARM · FULL ARCHITECTURE MAP

> Owner mandate: "map this out to the very last detail with no gaps … think several steps in advance, simulate everything, then once we know what we are doing we proceed with the build." This doc is the architecture; **no code is shipped from it yet.** Build follows owner confirmation of the open decisions (§14).
> Provenance: extends `06-CHECKPOINT.md` + `05-QUANTUM-SIM-FINDINGS.md`. All substrate APIs below were re-read from source this session (signatures verified, not recalled). Calc/sim harnesses: `sims/` (reproducible, seeded).
> Authority: ADVISORY design. Everything DISARMED-first + reversible. Persona/mutation/protected-path rules unchanged.

---

## 0. ONE-PARAGRAPH THESIS

A lane (any peer: nemotron / deepseek / kimi / gemma / mimo / Claude / codex / local) can call a single governed `spawn_nano` tool that equips a sub-lane with the **full YURI exoskeleton** (already built: `nano-external.externalNanoWork`) and runs it as a nano (already built: `nano-tick`). Recursion is made **safe** by three composing limits — a hard **node budget** (size), **decaying fan-out** (shape), and the owner's **depth tier** (race-window bound) — and made **sound** by a **tree-scoped convergence barrier** (no ancestor declares "done" while any descendant is in flight, and the canonical read-view is force-drained before every terminal verdict). Every nano closes with an **EOT that writes its claims to its own canonical shard**, so the whole tree converges into one canonical truth. ~80% of this is existing substrate; Move 1b is the **governor + barrier + spawn tool** that binds it together.

---

## 1. WHAT THE SIMULATIONS CHANGED (read this first)

The pre-sim design (06-CHECKPOINT) had the barrier + depth tiers right but **two load-bearing gaps**. The calc/sim (§2) found them:

| # | Pre-sim assumption | Sim verdict | Architecture consequence |
|---|---|---|---|
| **A** | Owner depth caps (heavy 5 / light 10) bound the blowup | **FALSE alone.** `F=4 @ D=10 = 1.4M nodes`; `F=3 @ D=10 = 88,573`. Depth caps don't bound width; the *deeper* (light) tier is the *worse* one. | Add a **hard node budget B** (primary size cap) + **decaying fan-out** (shape). Depth tier stays — but as the *race-window/soundness* bound it actually is, not a size bound. |
| **B** | The barrier = "parent waits for child's EOT write" | **INSUFFICIENT.** Under any drain lag, `direct-child` barrier waiting on the *write* = **1.000** false-completion (it waits for the write, not for the read-view to reflect it). | Barrier needs **INV-2: force a `drainOnce()` before every terminal converge.** Waiting for the lease isn't enough; the read-view must be drain-fresh. |
| **C** | "depth ↔ soundness entangled" (Schmidt) is just a cost story | **It's an ARCHITECTURE-CHOICE story.** `direct-child` barrier false-completion = `1−(1−q)^D` (grows with depth from one buggy level). `tree-scoped` barrier = **0 at all depths**, robust to `q`. | Choose **tree-scoped enumeration** (root checks the *whole* subtree's leases, not just direct children). This *breaks* the depth↔soundness entanglement → **the owner's depth-10 light tier becomes SOUND.** |

**Net:** the owner's depth-tier rule **survives the simulation** — but only because we add (1) a node budget, (2) decaying fan-out, and (3) a tree-scoped + drain-forced barrier. Depth alone was necessary, never sufficient.

---

## 2. THE EVIDENCE (calc + sim, reproducible in `sims/`)

### 2.1 `tree-calc.mjs` — combinatorics + reliability
- **C1 worst-case size** `N(F,D)=ΣF^k`: D5 → F3=364, F4=1365; **D10 → F3=88,573, F4=1.4M, F5=12.2M**. Light(deep) tier is the danger.
- **C2 decaying fan-out + budget** `F_eff(d)=max(1,⌈F0·decay^d⌉)`: `F0=4,decay=0.5,D=10,B=128` → **77 nodes**, perDepth `[1,4,8,8,8,8,8,8,8,8,8]`. Geometric blowup → ~linear after depth 2.
- **C3 barrier cost** = #edges = `N−1` **cheap deterministic reads** (one `contestedClaims()` per child landing), NOT LLM calls. Affordable at any sane N.
- **C4 orphan inevitability** `P(≥1 death)=1−(1−p)^N`: at `N=64, p=1%` → **47%**. Orphans are EXPECTED → first-class path, not an exception.

### 2.2 `barrier-interleave.mjs` — multi-level barrier race (200k schedules/cell)
False-completion (root declares done while a *deep* contradiction is un-drained):

| policy | drainLag=0 | drainLag=3 | depth-robust? | q=0.05 @ D10 |
|---|---|---|---|---|
| **none** | ~0.50 | 0.59–0.80 | no | 0.587 |
| **direct-child** | 0 (q=0) | **1.000** | **no** (`1−(1−q)^D`) | 0.185 (lag0) / 0.847 (lag3) |
| **tree-scoped + forced drain** | **0** | **0** | **YES** | **0** |

- `none ≈ 0.50` independently **cross-checks the quantum sim's 0.5 amplitude** (two unrelated instruments, same number → the race is real, not a geometry artifact).
- `direct-child @ drainLag=3 = 1.000` is the §1-B finding: waiting for the write without forcing a drain is *worse* than useless.
- `tree-scoped + forced drain = 0` everywhere → the §1-C fix.

### 2.3 `tree-cost-cvar.mjs` — tail-aware reservation (50k sampled trees, decision-sim RNG)
Realistic decaying trees are **small**: mean 15–63 nodes, p99 36–112, max ≤ B. Cost CVaR₅% **$0.47–$0.74**; hard-B worst-case (all-heavy) ≤ ~$6.40. **Local-heavy tree hits max=B=128** → for free lanes the **node budget is the binding constraint, not USD**. Both limits required; neither subsumes the other.

---

## 3. THE BOUNDED-TREE MODEL — THREE COMPOSING LIMITS

Every limit guards a different failure axis. None subsumes another.

```
                         guards            mechanism                         backstop role
  ── NODE BUDGET  B  ──  total SIZE        atomic tree counter (manifest)    absolute cap — holds even if depth/fanout logic has a bug
  ── DECAYING FANOUT ──  width SHAPE       F_eff(d)=max(1,⌈F0·decay^d⌉)       turns geometric → ~linear; keeps trees naturally small
  ── DEPTH TIER  D   ──  race WINDOWS      heavy(>200B)=5 · light(<200B)=10   soundness/latency bound (owner rule, sim-validated)
```

Defaults (recommend, owner-confirm §14): `B=64`, `F0=4`, `decay=0.5`. Tier from model param count (the existing `>200B` rule).

---

## 4. SPAWN-TREE TOPOLOGY & IDENTITY (answers open-Q: tree shape, shard-per-nano)

**Identity is a path.** Root = the main session. Every nano has a **path** that encodes lineage:

```
rootRunId = <main session run id>            tree id  = "tree:<rootRunId>"
nano path = r            (root, depth 0)
            r.0          (root's 1st child, depth 1)
            r.0.2        (that child's 3rd child, depth 2)   depth = (#segments − 1)
            r.0.2.1      (depth 3)                            parent = path minus last segment
nanoId    = "<rootRunId>/<path>"             (globally unique; sortable; lineage-decodable)
```

Derived for free from the path: **depth** (segment count), **parent** (drop last segment), **ancestor test** (string prefix), **descendant test** (string prefix the other way). No separate parent-pointer store needed.

**Two state surfaces per nano, both keyed by path:**
| surface | key | written by | purpose |
|---|---|---|---|
| in-flight **lease** | `nanotree:<rootRunId>:<path>` | parent at spawn (atomic), renewed by child | the barrier's "is this descendant alive?" registry (§5) |
| canonical **shard** | `appendClaim(nanoId, rootRunId, claim)` → `<nanoId>--<rootRunId>.jsonl` | the child's EOT | per-nano claim provenance (§6) |

**Shard-per-nano is FREE** — `memory-canonical-store` is *already* shard-per-writer (one writer per file → zero interleave). Passing `nanoId` as the lane segment gives every nano its own shard automatically: clean provenance, no clobber, automatic sha256 dedup at fold (same fact from two nanos collapses to one canonical event). **Decision: shard-per-nano, not shared.**

---

## 5. THE CONVERGENCE BARRIER — THE CORE MECHANISM

The quantum sim + interleave sim both say: an ancestor must not finalize while a descendant's contradiction is in flight. Concretely, **two invariants**, both proven necessary in §2.2:

### INV-1 — tree-scoped in-flight enumeration
A node's terminal `converge()` may return `converged:true` ONLY if it has **no live descendant lease**:
```js
function inflightDescendants(rootRunId, myPath) {
  const prefix = `nanotree:${rootRunId}:${myPath}.`;          // strict descendants
  return inspectLeases().filter(l => l.alive && String(l.leaseId).startsWith(prefix));
}
```
`inspectLeases()` (verified: returns `{leaseId, nanoId, alive, …}`, pure read) → the parent enumerates the **whole subtree at any depth**, not just direct children. Registration is **atomic at spawn** (parent acquires the child's lease BEFORE the child boots) → there is no "in-flight-but-unregistered" window. This is the policy the sim scored at **0 false-completion, depth-independent**.

### INV-2 — forced drain before finalize
Immediately before the terminal verdict, force the canonical fold so the read-view reflects every landed shard, THEN read contested state:
```js
drainOnce(myNanoId);                       // idempotent, lease-elected; inline — never rely on the 300s cron
const contested = contestedClaims();       // GLOBAL read-view → sees ANY subtree's contradiction
```
Without INV-2, §2.2 shows even a perfect lease-wait false-completes at **1.000** under drain lag.

### The combined check (re-run on every child completion event)
```js
function canFinalize({ rootRunId, myPath, ledger, poolOutputs, damping, round }) {
  const live = inflightDescendants(rootRunId, myPath);
  if (live.length) return { converged:false, reason:'descendants-in-flight', live: live.map(l=>l.leaseId) };
  drainOnce(myNanoId);                                            // INV-2
  const signals = [
    ...contestedClaims().filter(c => touchesSubtree(c, myPath))   // late contradiction → CRITICAL (H2)
        .map(c => ({ id:`contested:${c.key}`, severity:'CRITICAL', resolved:false })),
    ...orphanSignals(rootRunId, myPath),                          // §8
  ];
  return converge({ ledger, poolOutputs, signals, adversarialResult, damping, round });  // Move-1 gate, unchanged
}
```
**Non-blocking by construction.** A node that can't finalize simply stays not-converged and is re-ticked on its next wake (the `nano-tick` wake/refresh/act/handoff model) — it does **not** sleep holding a compute slot. This is what avoids the thread-pool-exhaustion deadlock that a naïve "parent blocks on children" barrier would cause (calc C3). The barrier is an **event-driven re-evaluation**, not a blocking wait.

---

## 6. PER-NANO EOT CLOSEOUT CONTRACT (RULE 3, answers open-Q: claims/dedup/shard)

Every spawned nano, on finishing its work, runs a **lean nano-scoped closeout** (the existing `yuri-closeout` discipline, miniaturized). Strict ordering — this is the §1-B / sim §2.2 fix made concrete:

```
1. emit RESULT_LABEL          (Lane Result Grammar) → parent's Layer-1 obligation floor reads this as poolOutputs[childPath]
2. appendClaim(nanoId, rootRunId, claim) × N        → ONLY durable/verified claims (type-filter ~99% lane_output noise,
                                                       same discipline as memory-kernel-canonical-bridge); fsync
3. release  nanotree:<root>:<path>  lease   LAST     → AFTER the claim is durably written
```
**Ordering is load-bearing:** write-claim-then-release. Release-first reopens exactly the race the barrier closes (the parent would see the lease gone, finalize, and miss the just-about-to-land claim). The sim's `tree-scoped=0` result *assumes* this ordering.

Dedup is automatic (`contentHashOf` = sha256 over `[kind,subject,predicate,object]`). EOT-as-canonical-writer is **sound IFF INV-1+INV-2 hold** — which §2.2 confirms.

---

## 7. CROSS-LEVEL CONVERGENCE — FLAT, NOT RECURSIVE (answers open-Q directly)

**Decision: flat per-node converge(), with the tree-scoped barrier as the ONLY coupling. A parent does NOT call its children's `converge()`.**

Rationale: `contestedClaims()` reads the **global** canonical read-view, which already spans the entire tree. So a grandchild's contradiction is visible to the root's own Layer-2 directly — recursion would re-discover what the global read already surfaces, at O(depth) cost, with cascade risk. Each node runs its own Move-1 `converge()` over (its own obligation ledger) + (the global contested set) + (its INV-1 descendant check). The sim's winning `tree-scoped` policy **is** exactly this: independent per-node finalize, gated by whole-subtree liveness + a global drain-fresh read. Flat + global-read + tree-scoped-barrier is both simpler and the proven-sound choice.

---

## 8. ORPHAN / DEATH HANDLING (first-class — 47% likely per run, calc C4)

A nano dies mid-flight → its lease goes stale → `reclaimLeases` reaps it after TTL (5 min default) → INV-1 sees it as not-in-flight → the parent *can* finalize. **But the dead nano wrote no EOT → its work is lost.** Silent finalize here = the H3 false-completion we're killing.

**Guard — distinguish owner-release from TTL-reap:**
- Parent records every spawn in a durable **tree manifest** (append-only): `_SYSTEM/state/nano/trees/<rootRunId>/manifest.jsonl`, one line per spawn `{path, lane, depth, ts}`. Recovery-safe (append-only, like nano-tick's cursor-from-bus).
- At finalize, the parent checks: for every spawned child path → does an EOT claim (or explicit `child-complete` marker) exist in canonical? **Missing + lease gone = ORPHAN.**
- Orphan → inject `{id:'orphan:<path>', severity:'CRITICAL', resolved:false}` into `converge()` signals → Layer-2 BLOCKS. The tree converges to **"done-with-known-gap" (H2)**, never silent (H3). If the gap can't be filled (re-spawn also fails), damping force-stops with `forced-stop:orphan-incomplete`, surfaced to the operator. This is the H2-not-H3 guarantee from the quantum verdict, made operational.

---

## 9. `spawn_nano` TOOL + GOVERNANCE (answers open-Q: schema + enforcement point)

A single new tool in the `llm-lane` TOOLS array — **the one choke point every lane (native or external) routes through**:

```jsonc
spawn_nano({
  task:      "<scoped sub-task>",        // required
  lane:      "<llm-lane lane key>",      // required; resolved by llm-lane table (assertLlmLaneRouted)
  count:     1,                          // requested children (clamped to remaining fan-out)
  reasoning: "xhigh"                     // inherited default
})
```

**Governance runs INSIDE the handler, BEFORE any dispatch — the single enforcement point:**
```
ctx (injected at lane boot) = { rootRunId, myPath, depth, treeReservationId }
0. DISARMED gate:    require YURI_NANOSWARM_SPAWN=1 + flag file → else return "spawn disabled" (lane degrades to doing it itself)
1. DEPTH cap:        tier = (modelParams(lane) > 200B) ? heavy:light; cap = heavy?5:10. depth+1 > cap → REFUSE
2. FANOUT cap:       F_eff = max(1, ⌈F0·decay^depth⌉); clamp count to remaining fan-out at this node
3. NODE BUDGET:      ATOMIC increment of the tree counter (append-to-manifest-then-count, or lease-guarded);
                     currentNodes + count > B → clamp/refuse  (atomic → two siblings can't both pass the TOCTOU)
4. COST:             admit({lane, model, steps:estChildSteps}) vs the tree-root reservation → !admitted → REFUSE
5. GRANT each child: mint childPath → acquireLease(nanotree:<root>:<childPath>)  [INV-1 atomic registration]
                     → append spawn marker to manifest → dispatch externalNanoWork({lane,task}) via nano-tick
                        with ctx{ rootRunId, myPath:childPath, depth:depth+1, treeReservationId }
```
Refusals return a **tool error** (the lane reads "cap reached, do it yourself"), never an exception. DISARMED-default + reversible (unset env / remove the tool entry).

**Bypass to close (§13 #7):** the toolset has `bash`, so a lane could shell `node nano-external.mjs` directly and skip governance. The `bash-security-guard` must **deny direct `nano-external` / `nano-tick` invocation from a lane context** — all spawns route through `spawn_nano`. This is a required guard increment (INC-5), not optional.

---

## 10. WHOLE-TREE COST CEILING (answers open-Q: cost-reservation-pool integration)

- **One reservation at the tree root:** `admit({ steps:B, model:representative })` reserves the tree budget up front (size at CVaR₅% per §2.3, or B×worst for a hard guarantee).
- **Per-spawn decrement:** each `spawn_nano` calls `admit()` for the child's estimate; the pool tracks active reservations globally (`sumActiveReservations`). On child EOT → `release(childReservationId)`. `reacquireWithRollback` is the forward-wired primitive for a long multi-step nano that must release between steps (currently no live caller — this becomes its first).
- **Free-lane reality:** local ollama / mimo-flat = `$0` → exempt by default → for a local-heavy tree the USD cap is inert and **the node budget B is the real limiter** (sim §2.3 confirmed: local-mostly tree pins at max=B). This is *why* both limits exist.
- DISARMED-default (the pool is already `advisory_pass` until `YURI_COST_ADMISSION_ENFORCE=1` + cap). Arm independently of the spawn gate.

---

## 11. STATE LAYOUT (all ephemeral, gitignored — none in protected paths)

```
_SYSTEM/state/nano/leases/                         in-flight registry (nanotree:* leases)        [existing nano-lease dir]
_SYSTEM/state/nano/trees/<rootRunId>/manifest.jsonl  spawn manifest: node-budget counter + orphan detection   [NEW, append-only]
_SYSTEM/state/memory-canonical/shards/<nanoId>--<rootRunId>.jsonl   per-nano EOT claim shards   [existing store]
_SYSTEM/state/swarm-convergence/                   ephemeral damping state                        [existing Move-1 dir]
_SYSTEM/state/cost-reservations/                   tree reservation                               [existing pool dir]
kagami-event-bus                                   lifecycle events (DISPATCHED/DELTA/HANDOFF)    [existing]
```
`_SYSTEM/state/` is the YURI ephemeral state root (writable; the canonical store, leases, and convergence state already live there). **Distinct from the protected `.claude/state/`.** The one NEW path is the per-tree manifest dir — gitignored under the existing `_SYSTEM/state/` ignore.

---

## 12. ARMING & REVERSIBILITY (DISARMED-first, the energy-enforce pattern)

| gate | env + flag | default | reverse |
|---|---|---|---|
| spawn recursion | `YURI_NANOSWARM_SPAWN=1` + flag file | OFF (lanes degrade to self-work) | unset / delete tool entry |
| convergence barrier | `YURI_SWARM_CONVERGENCE=1` (Move-1, existing) | OFF (passthrough) | unset |
| cost enforcement | `YURI_COST_ADMISSION_ENFORCE=1` + cap | OFF (advisory_pass) | unset |

Three independent arms → can enable barrier-observe-only first (watch the tree converge with the gate advisory), then arm spawn, then arm cost. Every layer reversible by deleting a file + unsetting an env var. No protected-path writes, no commit authority, advisory verdicts only.

---

## 13. ADVERSARIAL FAILURE-MODE TABLE (attack the design)

| # | failure | guard | proven by |
|---|---|---|---|
| 1 | in-flight-but-unregistered child (race) | parent acquires child lease BEFORE child boots (atomic) | INV-1 / sim tree-scoped=0 |
| 2 | stale read-view at finalize | INV-2 forced `drainOnce()` inline | sim: lag>0 → direct-child=1.0 |
| 3 | released-before-written EOT race | write-claim-fsync THEN release lease (ordering) | §6 ordering; sim assumes it |
| 4 | orphan (dead child, no EOT) | manifest + missing-EOT → CRITICAL signal (H2) | calc C4 (47% → first-class) |
| 5 | sibling TOCTOU on node budget | atomic counter (append-then-count / lease-guarded) | classic; designed atomic |
| 6 | compute-slot exhaustion (parents block) | non-blocking re-tick; parents never sleep on a slot | §5 event-driven re-eval |
| 7 | bash bypass of governance | bash-guard denies direct nano-external/nano-tick (INC-5) | known toolset hole |
| 8 | runaway recursion (cap logic bug) | hard node budget B = absolute backstop | C1/C2 |
| 9 | drainer cron down at finalize | finalize triggers `drainOnce()` inline (lease-elected) | INV-2 |
| 10 | reservation exhausted mid-tree | spawn refuses new; existing finish; damping 'budget' stop | §10 |
| 11 | contradiction in a SIBLING subtree | `contestedClaims()` is global → root sees it regardless | §7 |
| 12 | two concurrent trees | leases/manifest prefixed by rootRunId; cost pool global (shared wallet) | §4/§10 |

---

## 14. OPEN DECISIONS FOR OWNER (the genuine choices — everything else is derived)

1. **Node budget B** — recommend **64** (sim: realistic trees are 15–63 nodes; 64–128 is the sweet spot). Confirm or set.
2. **Fan-out F0 + decay** — recommend **F0=4, decay=0.5** (~linear growth, 77-node worst @ D10/B128). Confirm.
3. **Tier param counts** — confirm `minimax-m3` + `mimo-v2.5-pro` heavy/light classification (still VERIFY; likely ≥200B → heavy). The `>200B → depth 5 / else depth 10` rule itself is **sim-validated** (tree-scoped barrier makes depth-10-light SOUND).
4. **Arm order** — recommend barrier observe-only → spawn → cost. Confirm or reorder.

---

## 15. BUILD PLAN (after §14 confirmation — TDD, DISARMED-first, each increment committed+pushed)

| inc | module | content | key tests |
|---|---|---|---|
| **1** | `nano-tree.mjs` | path identity (mint/parent/depth/ancestor), manifest append + atomic node-budget counter, `inflightDescendants` (lease prefix) | registration atomicity, prefix enumeration, budget TOCTOU |
| **2** | barrier (`canFinalize`, extend swarm-convergence) | INV-1 + INV-2 + orphan-signal injection → `converge()` | in-flight blocks, drain-fresh, orphan→CRITICAL, release-after-write |
| **3** | `nano-eot.mjs` | nano closeout: RESULT_LABEL + `appendClaim` + lease-release-LAST | claim-before-release, dedup, label conforms |
| **4** | `spawn_nano` tool + governance | depth/fanout/budget/cost checks, DISARMED gate, ctx propagation | each cap refuses/clamps, disarmed=degrade |
| **5** | bash-guard deny direct nano-external/nano-tick | close the §13-#7 bypass | lane bash spawn → denied |
| **6** | wire ctx into nano-tick + arm flag + reversibility doc | depth/path/root propagation; observe-mode | end-to-end depth-2 tree converges (hermetic) |

All behind `YURI_NANOSWARM_SPAWN=1`; arm-injectable for hermetic tests (the Move-1 `opts.armed` pattern). Adversarial-verify each increment before claiming green.

RESULT_LABEL: `08RX_MOVE1B_RECURSIVE_NANOSWARM_ARCHITECTURE_MAPPED_SIM_VALIDATED_X_PASS_UNCOMMITTED`
