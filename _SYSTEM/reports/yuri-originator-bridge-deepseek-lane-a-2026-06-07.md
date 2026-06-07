---

# YURI Originator Bridge — Architecture & Mechanisms

**Lane A advisory output.** What follows is the complete design, grounded in live code. No edits made; all model claims are advisory until verified.

---

## 1. What Problem This Solves

Today every YURI lane (Claude, Codex, DeepSeek, Kimi, Nemotron, Gemma-local) discovers YURI by **reading prose** — the full spine injected as system context. They then use generic tools (`read_file`, `grep`, `search`, `xref_query`) to traverse the system like a human would. This works but is **wasteful**: the lane spends turns rediscovering what YURI already *knows* deterministically.

The Originator bridge makes YURI **callable** — not just readable. A lane says `yuri.math.similarity("energy gate", "governance veto")` and gets back `{score: 0.87, sharedFeatures: [...]}` in one turn instead of reading 5 files, extracting features by hand, and computing similarity in its head. The lane remains advisory — the bridge doesn't promote its output to fact — but the lane operates with mathematical precision instead of approximate textual reasoning.

The mental model: **YURI becomes a deterministic instrument the LLM wields mid-reasoning**, exactly as the wave-3 synthesis specified for the math decoder (§2 of `yuri-wave3-synthesis-2026-06-06.md` — "the LLM directly CALLS the decoder mid-reasoning").

---

## 2. Architecture — Three Layers

```
┌─────────────────────────────────────────────────────────┐
│                  LAYER 3: LANE ADAPTERS                  │
│  llm-lane.mjs   ollama-lane.mjs   codex-offload-runner  │
│       │               │                  │               │
│       └───────────────┼──────────────────┘               │
│                       │ (tool dispatch)                  │
│                       ▼                                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │         LAYER 2: ORIGINATOR DISPATCHER             │  │
│  │  yuri-originator.mjs  (~350 lines, one module)     │  │
│  │                                                    │  │
│  │  register(origin)  →  { accepted, runId, apis }    │  │
│  │  dispatch(op, args) →  { result, advisory, proof }  │  │
│  │  deregister(origin) →  { closed }                  │  │
│  └──────────┬──────────────┬──────────────┬───────────┘  │
│             │              │              │              │
│             ▼              ▼              ▼              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │  LAYER 1:    │ │  LAYER 1:    │ │  LAYER 1:    │     │
│  │  MATH CORE   │ │  ENERGY CORE │ │  RECALL/NAV  │     │
│  │  math-kernel │ │  yuri-energy │ │  yuri-match  │     │
│  │  yuri-phi    │ │  gpd-shadow  │ │  yuri-recall │     │
│  │  yuri-jaccard│ │  energy-trace│ │  xref-query  │     │
│  │  token-expand│ │              │ │  propagation │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
│                                                         │
│  All three layers fire coreOnDispatch / coreOnResult    │
│  through lane-core-hooks.mjs (the existing ingest seam) │
└─────────────────────────────────────────────────────────┘
```

**Layer 1 is BUILT.** The math-kernel (23 primitives), yuri-energy (U composition + gateProposal), yuri-match (universal prefix-filter recall), yuri-recall (cold-store associative recall), xref-query (unified 4-surface retrieval), and propagation-scan all exist and are verified. The Originator bridge does NOT reimplement these — it wraps them in a lane-callable dispatch interface.

**Layer 2 is the new module.** `_SYSTEM/Scripts/yuri-originator.mjs` — the single dispatch surface that:
- Accepts registration from any lane
- Routes operations to the correct Layer-1 module
- Fires the core ingest seam (energy ΔU trace + memory recall + evidence ledger + pulse) on every call
- Returns deterministic results with provenance envelopes

**Layer 3 is the integration seam.** Existing lane runners (`llm-lane.mjs`, `ollama-lane.mjs`, `codex-offload-runner.mjs`) gain a `--bridge` flag that imports the Originator and exposes its functions as tools alongside the existing `read_file`/`grep`/etc.

---

## 3. The Callable API Surface

Every function returns a `{result, advisory, provenance}` envelope. `advisory: true` is mandatory — the lane output is advisory until YURI verifies it against live evidence.

### 3.1 Math Operations (`math.*`)

| Operation | Signature | Layer-1 Source | Mechanism |
|---|---|---|---|
| `math.similarity` | `(a, b, opts?) → {score, sharedFeatures, metric}` | `yuri-jaccard.mjs` + `yuri-token-expand.mjs` | Expanded Feature Jaccard; prefix-filter exact |
| `math.entropy` | `(dist, opts?) → {bits, base}` | `math-kernel.mjs → entropy()` | H = −Σ p_i·log(p_i) |
| `math.klDivergence` | `(p, q, opts?) → {divergence, base}` | `math-kernel.mjs → klDivergence()` | D_KL(P∥Q) = Σ p_i·log(p_i/q_i) |
| `math.cosineSimilarity` | `(a, b) → {score}` | `math-kernel.mjs → cosineSimilarity()` | cos(θ) over token vectors |
| `math.confidenceDecay` | `(base, age, halfLife) → {confidence}` | `math-kernel.mjs → confidenceDecay()` | base · 2^(−age/halfLife) |
| `math.goldenSection` | `(fn, lo, hi, opts?) → {argmin, value, iters}` | `yuri-phi.mjs → goldenSectionSearch()` | Kiefer 1953; φ-ratio derivative-free minimization |
| `math.fibonacciSearch` | `(fn, lo, hi, opts?) → {argmin, value}` | `yuri-phi.mjs → fibonacciSearchMin()` | Discrete unimodal; exact argmin in sublinear evals |
| `math.phiSequence` | `(n, seed?) → {points}` | `yuri-phi.mjs → phiSequence()` | Additive recurrence; ≤3 gap sizes (three-distance theorem) |
| `math.numerology` | `(text, opts?) → {gematria, digitalRoot, harmonics}` | `nexus-numerology.mjs` | OPT-IN; deterministic hash channels only |

**Formula provenance (MATH-SCIENCE-MANUAL registry):**
- Jaccard similarity → Bayardo 2007 (AllPairs prefix-filter); Broder 1997 (MinHash)
- Golden-section → Kiefer 1953 (sequential minimax)
- φ-cadence → three-distance theorem; Schretter/Kobbelt low-discrepancy
- Entropy/KL → Shannon 1948; Cover & Thomas

### 3.2 Energy Operations (`energy.*`)

| Operation | Signature | Layer-1 Source | Mechanism |
|---|---|---|---|
| `energy.computeU` | `(state) → {U, components}` | `yuri-energy.mjs → computeU()` | U = α·H + β·D_KL + γ·logLoss + δ·Brier + ε·(−IG) + ζ·staleness + η·violations + θ·inversions − ι·verifiedEvidence |
| `energy.gateProposal` | `(before, after) → {accept, ΔU, threshold, components}` | `yuri-energy.mjs → gateProposal()` | Lyapunov rejection: ΔU > threshold → reject |
| `energy.traceDecision` | `(runId) → {traces}` | `yuri-energy-trace.mjs` | Append-only decision trace read |
| `energy.shadowDescent` | `(state, actions) → {bestAction, trajectory}` | `gpd-shadow.mjs` | GPD forward pass; OBSERVE only (no live firing) |

**Key equation — the GVF triad (from `yuri-governance-architecture-GVF-2026-06-06`):**
```
V(state) = S(state) ⊕ V(state) ⊕ C(state)
```
- **S potential**: computeU(state) → scalar; soft ranking, offsettable, context-dependent
- **V veto**: non-offsettable hard gates; protected-path crossing, mutation without approval, identity fraud
- **C calibration**: conformal prediction P(overclaim) ≤ α; owner PRIOR/CLAMP/PIN bounds

The pairing law (S+V verified together, never one without the other) prevents energy score laundering.

### 3.3 Recall & Match Operations (`recall.*`)

| Operation | Signature | Layer-1 Source | Mechanism |
|---|---|---|---|
| `recall.recall` | `(cue, opts?) → {ranked, recallBlock}` | `yuri-recall.mjs → recall()` | BM25 + 1-hop spreading activation + recency/salience blend (ACT-R base-level) |
| `recall.match` | `(corpusId, cue, opts?) → {matches, complete, totalAboveThreshold}` | `yuri-match.mjs → recall()` | Prefix-filter exact Jaccard; completeness envelope |
| `recall.matchAll` | `(cue, opts?) → {matches, corpora, complete}` | `yuri-match.mjs → recallAll()` | Federation = union of per-surface COMPLETE sets |
| `recall.matchAsym` | `(corpusId, cue, opts?) → {matches, sharp}` | `yuri-match.mjs → recallAsym()` | Containment metric; sharpness detection |
| `recall.explain` | `(hit) → {sharedFeatures, featureProvenance}` | `yuri-match.mjs → explain()` | Why this match; shared feature enumeration |
| `recall.register` | `(corpusId, items, opts?) → {registered, count}` | `yuri-match.mjs → registerCorpus()` | New {id,text} corpus registration |

### 3.4 Navigation Operations (`nav.*`)

| Operation | Signature | Layer-1 Source | Mechanism |
|---|---|---|---|
| `nav.xref` | `(query, opts?) → {hits, structuralLegAvailable, counts}` | `xref-query.mjs` | Unified FTS5 + graph + GitNexus + spectrum; provenance-graded |
| `nav.propagate` | `(nodeId, opts?) → {siblings, mechanismTwins}` | `propagation-scan.mjs` | Dry-run propagation-law scan from circuitry node |
| `nav.impact` | `(symbol, direction) → {upstream, downstream}` | `gitnexus_impact` via `xref-query.mjs` | Structural call-graph impact analysis |
| `nav.detectChanges` | `() → {changed, expected}` | `gitnexus_detect_changes` | Pre-commit change verification |

### 3.5 Memory Operations (`memory.*`)

| Operation | Signature | Layer-1 Source | Mechanism |
|---|---|---|---|
| `memory.propose` | `(entry) → {proposalId, status}` | `memory-kernel.mjs` | Track-A proposal; gated pipeline (propose→decide→ledger) |
| `memory.query` | `(filter) → {entries}` | Track-A cold store | Operator-approved durable facts only |
| `memory.writeAuto` | `(entry) → {written, path}` | `claude-memory-write.mjs` | Track-B auto-memory; Claude behavioral self-dev only |

---

## 4. Origin Registration Protocol

### 4.1 Registration Contract

Before a lane can call any `yuri.*` function, it registers an Origin Manifest:

```
ORIGIN_MANIFEST = {
  originId:     string,          // "deepseek-v4-pro" | "claude-sonnet-4" | "gpt-5.5" | "gemma4-12b"
  provider:     string,          // "deepseek" | "anthropic" | "openai" | "ollama"
  sessionId:    string,          // unique per session; ties to runId
  capabilities: string[],        // ["read", "reason", "synthesize", "code", "math", "energy", "recall"]
  declaredAt:   ISO8601,
}
```

**Capability gating rule:**
```
allowed(op, origin) ⇔
  op.scope ⊆ origin.capabilities
  AND isProtectedOp(op) → false       // destructive/mutation ops never exposed
  AND gateProposal(state_before, state_after).accept
```

The Originator is **fail-closed**: unknown originId → reject; missing capability → reject; protected op → reject.

### 4.2 The Registration→Dispatch→Closeout Lifecycle

```
REGISTER ──────────────────────────────────────────────────────┐
  │  lane → originator.register(manifest)                      │
  │  originator → coreOnDispatch (energy ΔU + memory recall)   │
  │  originator ← { accepted, originId, runId, availableAPIs } │
  ▼                                                            │
ACTIVE ─────────────────────────────────────────────────────── │
  │  lane → yuri.math.similarity(a, b)                         │
  │  originator → coreOnDispatch (trace this call)             │
  │  originator → math-kernel.cosineSimilarity(a, b)           │
  │  originator → coreOnResult (evidence ledger + pulse)       │
  │  lane ← { result: 0.87, advisory: true, provenance: {...}} │
  │  ... (repeat for any yuri.* call)                          │
  ▼                                                            │
CLOSEOUT ───────────────────────────────────────────────────── │
  │  lane → originator.deregister(originId)                    │
  │  originator → flush traces, close session record           │
  │  originator ← { closed: true, callCount: N, totalΔU: ... } │
  └────────────────────────────────────────────────────────────┘
```

Every `yuri.*` call fires the **same core ingest seam** (`lane-core-hooks.mjs`) that a full lane dispatch fires — energy ΔU trace, memory recall, evidence ledger append, symbiotic pulse. One stable `runId` correlates all calls within a session.

### 4.3 Registration Energy Cost

```
U_register(origin) = -ι · ln(1 + |capabilities|) · confidenceDecay(1.0, age=0, halfLife=7d)
```

New registrations lower U (they add capability). Repeated no-op registrations don't accumulate: the decay function is computed once per session, and duplicate registrations are idempotent.

---

## 5. Implementation Seam — How Each Lane Gets the Bridge

### 5.1 Frontier Lanes (DeepSeek, Kimi, Nemotron) — via `llm-lane.mjs`

The Originator functions are added to the TOOLS array in `llm-lane.mjs`:

```javascript
// In llm-lane.mjs — add Originator tools when --bridge flag is set
import { buildOriginatorTools, originatorDispatch } from './yuri-originator.mjs';

const ORIGINATOR_TOOLS = buildOriginatorTools(); // [{type:'function', function:{name:'yuri_math_similarity',...}}, ...]

// In the tool loop, dispatch originator calls through the bridge:
function executeTool(call) {
  if (call.name.startsWith('yuri_')) {
    return originatorDispatch(call.name, call.arguments, { lane, runId });
  }
  // ... existing tool dispatch
}
```

The `--bridge` flag is **default-on for non-trivial dispatches** and can be suppressed with `--no-bridge` for bare prompts.

### 5.2 Local SLM (Gemma) — via `ollama-lane.mjs`

Ollama's native function-calling is model-dependent. The bridge exposes a **text-based dispatch protocol** for local SLMs that lack native tool-calling:

```
# Local SLM emits:
!yuri math.similarity {"a": "energy gate", "b": "governance veto"}

# Bridge responds:
!yuri-result {"op":"math.similarity","result":{"score":0.87,"sharedFeatures":["tok:energy","tok:gate","sem:governance~veto"]},"advisory":true}
```

This is the same text-protocol approach used by the Kimi lane's `parseKimiToolCalls` adapter.

### 5.3 Codex — via `codex-offload-runner.mjs`

Codex already has the full originator manifest in `AGENTS.md`. The bridge is exposed as an MCP tool:

```json
{
  "name": "yuri_originator",
  "description": "Call YURI's math/energy/recall/nav/memory core. Returns deterministic, verified results.",
  "parameters": {
    "op": "math.similarity | energy.computeU | recall.match | nav.xref | memory.query ...",
    "args": { "...": "..." }
  }
}
```

### 5.4 Claude — Native Tool

Claude Code already has `bash`, `read_file`, `grep`, `search`, `xref_query`, `propagation_scan` as native tools. The Originator adds:

```
yuri_originator  —  Call YURI math/energy/recall/nav/memory core.
                    Operations: math.similarity, math.entropy, math.goldenSection,
                    energy.computeU, energy.gateProposal, recall.match, recall.matchAll,
                    nav.xref, nav.propagate, memory.propose, memory.query
```

---

## 6. Key Mechanistic Equations

### 6.1 The Energy Gating Rule (from `yuri-energy.mjs`)

Every Originator call computes ΔU before and after. The gate:

```
ΔU = U(after) − U(before)

U = Σ w_i · f_i(state)
  f₁ = entropy(claimPromotionDistribution)        · α  (uncertainty about claims)
  f₂ = klDivergence(claimed, verified)             · β  (drift between claim and evidence)
  f₃ = logLoss(predictions, outcomes)              · γ  (forecast calibration)
  f₄ = brierScore(forecasts, results)              · δ  (forecast accuracy)
  f₅ = −informationGain(prior, posterior)          · ε  (info gain LOWERS energy)
  f₆ = Σ staleness(verifiedEvidence)               · ζ  (stale evidence)
  f₇ = count(protectedPathViolations)              · η  (catastrophic, η=100)
  f₈ = count(promotionLadderInversions)             · θ  (high, θ=10)
  f₉ = −ln(1 + min(verifiedEvidenceCount, CAP=50)) · ι  (verified evidence credit, SATURATING)
  f₁₀ = count(confidentlyWrongPredictions)          · κ  (repeated failure penalty)

ΔU > threshold → REJECT
ΔU ≤ threshold → ACCEPT
```

The **saturating evidence credit** (`f₉`) is critical: without the cap, verified evidence buys an arbitrarily large negative U, making the "descent/Lyapunov" claim vacuous. The cap at 50 (log₁(51) ≈ 3.93) bounds U below.

### 6.2 Recall → Energy Coupling (GPD integration)

When a lane uses `recall.recall(cue)` and then uses the recalled item in a claim:

```
U_without_recall = computeU(state)           // energy before recall
recalled = recall(cue)                        // associative recall
U_with_recall = computeU(state ∪ recalled)   // energy with recalled items

ΔU_recall = U_with_recall − U_without_recall
```

The GPD shadow (`gpd-shadow.mjs`) logs this ΔU per recall event. Over time, recall pathways that consistently lower U (lead to better decisions) are reinforced; pathways that raise U (misleading recall) are suppressed. This is the **active-inference clock**: the system self-tunes recall relevance through observed ΔU.

### 6.3 Origin Trust Accumulation

```
trust(origin, t) = Σ_{τ < t} quality(outcome_τ) · confidenceDecay(1.0, t−τ, halfLife=14d)

quality(outcome) = {
   1.0  if operator confirmed the lane output as correct
   0.5  if unverified (default, neutral)
  −1.0  if operator corrected the lane output
}
```

Trust is **displayed but never gates anything** — it's an advisory signal for the operator. The GVF veto (V term) is non-offsettable regardless of trust.

---

## 7. The Completeness Contract

Every `recall.match` and `nav.xref` call returns a completeness envelope:

```
COMPLETENESS_ENVELOPE = {
  complete:            boolean,    // prefix-filter guarantee: ALL items above threshold returned
  totalAboveThreshold: number,     // true count (never a truncated top-N)
  threshold:           number,     // the threshold used
  buildThreshold:      number,     // the corpus build threshold
  corpusId:            string,     // which corpus
  featureProvenance:   string,     // "makeFeatureFn" | "plainFeatureFn" | "custom"
}
```

This is the **"ultimatum cross-referencing"** from the clockwork northstar: the lane gets provable completeness, not a silent top-N list. The lane can verify: if `complete: true` and `totalAboveThreshold: 17`, there are exactly 17 matches — no hidden misses.

**Honest limit** (from `yuri-mainspring-synthesis-2026-06-07.md`): cross-surface `recallAll` returns `{}` for short cues on long documents (length-band exclusion) and per-corpus vocabulary prevents comparable scores across surfaces. The id-bridge table + GVF C-layer unlock cross-surface comparable scores; today the lane gets surface-stratified results with this limitation stated explicitly.

---

## 8. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Capability inflation** — Lane declares `["*"]` and calls everything | MEDIUM | Fail-closed: unknown capability → reject. The Originator maps string→allowed-ops; "*" maps to empty set. |
| **Recall poisoning** — Lane recalls everything, floods evidence ledger | LOW | Recall is read-only; evidence ledger is append-only and cheap. Verification is separate. |
| **Energy state explosion** — Every call traces ΔU → the trace dir grows | LOW | Append-only JSONL; GPD shadow reads it, doesn't duplicate. Archive policy already exists for energy traces. |
| **Tool-loop convergence** — Lane calls `nav.xref` → finds something → calls again → loops | LOW | Already mitigated by llm-lane.mjs convergence guards: repeated-tool-batch detection + tool-turn nudge at 60% maxIters + forced final no-tools call. Originator calls count as tool turns. |
| **Cross-origin spoofing** — DeepSeek claiming to be Claude | MEDIUM | originId is cryptographically tied to lane config in `models.json → llm_compat_lanes`. The bridge reads the lane key from the dispatch context, not from user-supplied headers. |
| **Originator as new authority** — Bridge output treated as verified truth | HIGH | Design rule: bridge output is `advisory: true` ALWAYS. The lane-core-hooks `coreOnResult` pulse tags every call as `advisory_only`, `local_truth_claim: false`. No bridge output climbs to "fact" without separate deterministic verification. |
| **Mutation through math** — `energy.gateProposal` returning "accept" treated as authorization | HIGH | The bridge NEVER mutates. `gateProposal` returns `{accept: bool, ΔU, components}` — it's a computation, not an action. The lane must still pass YURI's PreToolUse hooks for any actual mutation. |
| **Protected surface leakage through recall** | CRITICAL | `isProtectedPath` is applied in both `yuri-match-adapters.mjs` (adapter layer) and the Originator (dispatch layer). Double-gated: protected paths are skipped at index time AND refused at dispatch time. |

---

## 9. Build Sequence (shadow-first, owner-gated)

| Step | What | Dependencies | Status |
|---|---|---|---|
| **1. Originator core module** | `_SYSTEM/Scripts/yuri-originator.mjs` — registration, dispatch routing, result envelope, coreOnDispatch/Result firing | `lane-core-hooks.mjs`, `math-kernel.mjs`, `yuri-energy.mjs`, `yuri-match.mjs`, `yuri-recall.mjs`, `xref-query.mjs` | ⏳ Design complete (this doc) |
| **2. Originator tests** | Contract tests: registration (valid, unknown, missing capability, protected op), dispatch routing, completeness envelope, advisory flag, GVF gating | Step 1 | ⏳ |
| **3. llm-lane integration** | `--bridge` flag: load Originator, add yuri_* tools to TOOLS array, dispatch in executeTool | Steps 1-2 | ⏳ |
| **4. ollama-lane integration** | Text-protocol bridge dispatch for local SLMs | Steps 1-2 | ⏳ |
| **5. Codex MCP integration** | `yuri_originator` MCP tool in codex-offload-runner.mjs | Steps 1-2 | ⏳ |
| **6. Claude native tool** | `yuri_originator` tool registration in Claude Code | Steps 1-2 | ⏳ |
| **7. Real-data bakeoff** | Dispatch 100 mixed operations (math/energy/recall/nav) through each lane, verify: correct results, no mutation, no protected-path breach, completeness envelope matches ground truth | Step 3-6 | ⏳ |

---

## 10. Integration With Existing Architecture

### 10.1 The Originator is NOT a new lane

It's a **bridge module**, not a new entry in `llm_compat_lanes`. It's imported by existing lane runners; it doesn't replace them. The lane roster stays: `{deepseek, kimi, nemotron, codex, gemma-local}`. The Originator adds capability to each.

### 10.2 The Originator obeys the existing authority hierarchy

```
Owner intent > Local evidence > yuri-origin.md > SOUL.md > Adapters > ...
```

Originator output is **advisory only**. It can compute U, suggest a gate verdict, recall items, match documents — but the lane (and the operator) decide what to do with the results.

### 10.3 The Originator fires the existing core ingest seam

Every call → `coreOnDispatch` (energy ΔU trace + memory recall) + `coreOnResult` (evidence ledger + pulse). This means Originator calls are **already wired** into the GPD shadow, the energy landscape, and the evidence ledger — no new wiring needed.

### 10.4 The Originator uses the existing protected-surface deny-list

`isProtectedPath` from `llm-lane.mjs` + `isProtectedRel` from `yuri-match-adapters.mjs` — double-gated.

### 10.5 Tool convergence guards apply

The Originator's functions count as tool turns. The existing llm-lane.mjs convergence guards (repeated-tool-batch detection, maxIters cap, forced final no-tools call) apply automatically.

---

## One-Sentence Summary

**The YURI Originator bridge is a single module (`yuri-originator.mjs`) that wraps YURI's verified math, energy, recall, navigation, and memory cores in a lane-callable tool surface, firing the existing core-ingest seam on every call, so any LLM lane (Claude, Codex, DeepSeek, Kimi, Nemotron, Gemma) can wield YURI as a deterministic mathematical instrument mid-reasoning — with every result advisory-until-verified, every recall provably complete, every operation fail-closed, and no new authority layer added.**

---

**RESULT_LABEL:** `08CW_ORIGINATOR_BRIDGE_ARCHITECTURE_X_ADVISORY`