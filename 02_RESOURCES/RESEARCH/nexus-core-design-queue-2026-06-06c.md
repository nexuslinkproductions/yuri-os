---
name: nexus-core-design-queue-2026-06-06c
description: ADVISORY design outputs from the standing fleet (2026-06-06c) preserved for next-session build — NEXUS CORE rename plan (C5), circuitry auto-registration+regen+LOD-viz architecture (C6), 2nd-order RRI synonym design (C7), matcher-on-code adapter (D3), Rust hot-kernel memo (C4). Owner-gated; verify vs live before building.
metadata: { node_type: design-queue, date: 2026-06-06, status: advisory-queued, local_truth_claim: false }
tags: nexus_core, rename, circuitry_autoregen, rri, matcher, rust, design_queue
---



=============================================================
## LANE C6
=============================================================

**Architecture Memo**

Today the die is mostly hand-authored: `yuri-circuitry-graph.json` is the source of truth, and both generators consume it. `build-circuitry-html.mjs` lays it out manually by layer columns. `circuitry/build-circuitry-instrument.mjs` is better: it derives deterministic spectral positions from that JSON via `laplacian.mjs`, but the graph itself is still curated prose.

The upgrade is: stop treating `yuri-circuitry-graph.json` as authored truth. Make it a generated artifact.

**Recommendation**
Use a hybrid model: **declare identity, derive wiring**.

Do not try to infer all node semantics from AST alone. Source inference will miss intent, layer, moat status, and safety meaning. But do not hand-add edges either. Each module/test declares a small manifest block once, then the build scans code, imports, exports, tests, corpus matches, and GitNexus relations to regenerate the die.

**Registration Mechanism**
Create a registry packet under the existing YURI registry/context architecture, not a random top-level folder.

Proposed durable source:
`_SYSTEM/registry/circuitry.nodes.jsonl`

Each line is one declared organ, mechanism, or test:

```json
{
  "id": "energy-fn",
  "kind": "module",
  "label": "Energy Function",
  "layer": "Energy & Math",
  "files": ["_SYSTEM/Scripts/math/yuri-energy.mjs"],
  "exports": ["computeU", "computeDeltaU", "gateProposal"],
  "mechanisms": ["lyapunov-potential", "protected-path-veto"],
  "moat": true,
  "statusPolicy": "derive",
  "description": "short human-authored purpose"
}
```

Tests register either explicitly or by colocated convention:

```json
{
  "id": "energy-weights-drift-test",
  "kind": "test",
  "tests": ["energy-config", "energy-fn", "fsrs"],
  "guardVector": ["config-default-invariant", "non-finite-drop", "drift-refusal"],
  "files": ["_SYSTEM/Scripts/energy-weights-drift.test.mjs"],
  "layer": "Energy & Math"
}
```

Declaration owns identity, label, layer, mechanism tags, moat flag, and prose. Derivation owns file existence, imports, exports, calls, reads/writes, test coverage links, status, and layout.

**Why Hybrid Wins**
AST-only gives fake confidence because “what imports what” is not “what the organ means.”
Manual JSON gives stale circuitry.
Hybrid makes humans declare ontology once, then machines prove and wire it repeatedly.

**Regeneration Pipeline**
1. `circuitry.nodes.jsonl`: declared organ/test identities.
2. Filesystem scan: only allowed repo paths; skip protected/runtime surfaces.
3. AST scan for JS/MJS/CJS/TS/PY where supported:
   imports, exports, function names, test declarations, spawned scripts, static file reads/writes.
4. Test scan:
   `*.test.*`, `node --test` files, shell harnesses, formula-bank examples, counterexample gates.
5. Corpus-match substrate:
   use `{id,text}` mechanism tags over code + tests to infer soft edges like “same guard vector,” “same formula primitive,” “same protected surface.”
6. GitNexus / xref-query / propagation-scan:
   add structural edges, but mark them `evidence=derived:gitnexus`, not canonical unless repeatable.
7. Edge resolver:
   produce typed edges: `calls`, `imports`, `exports`, `reads`, `writes`, `tests`, `guards`, `shares-mechanism`, `supersedes`.
8. Status resolver:
   `live` if file exists and has runtime hook/import/CLI path; `dormant` if declared but no live trigger; `phantom` if declared missing or claim-only.
9. Graph compiler:
   emit generated `yuri-circuitry-graph.generated.json`.
10. Layout compiler:
   run deterministic Laplacian/GORDIAN layout and emit `yuri-circuitry-layout.generated.json`.
11. HTML builder:
   inline generated graph + layout into the instrument.

**Deterministic Transform**
The graph build must be byte-stable:
- sort nodes by `id`
- sort files and edges lexicographically
- freeze edge weights by kind
- canonicalize paths relative to repo root
- include derivation evidence per node/edge
- fail on duplicate IDs
- warn on declared file missing
- never let free prose affect coordinates

Layout remains doctrine-aligned:
- macro atlas: normalized Laplacian spectral layout
- floorplan lens: GORDIAN constrained by 9 layers
- tests: placed as satellites around the module/mechanism they guard
- tie-breaks: lexicographic node ID, fixed sign gauge, fixed layer centers

**Test-As-Node Model**
Tests are not annotations. They are safety organs.

A test node has:
- `kind: "test"`
- `guardVector`: what invariant it protects
- `targetIds`: modules/mechanisms guarded
- `failureSurface`: config, parser, protected path, math invariant, hook route, memory migration, etc.
- `strength`: smoke, regression, adversarial, proof-gate, property, fixture
- `lastObserved`: optional derived test result metadata, kept outside protected runtime

Edges:
- test `guards` module
- test `calls` module if AST confirms import
- test `covers-mechanism` mechanism tag
- test `guards-parameter` config key or formula card
- failing/absent tests can render as thin red perimeter nodes

This makes “safety parameters” visible as actual guard-vector nodes.

**Microscope Viz**
Use a single multi-scale instrument, not separate pages.

Rendering stack:
- WebGL/canvas for thousands of nodes and edges
- SVG or HTML overlay only for labels, panels, controls
- quadtree/R-tree spatial index for hit testing and culling
- deterministic server/build-time layout, client only renders and filters
- no client force simulation

LOD levels:
- zoom 0: 9 layer districts + moat core hulls
- zoom 1: macro organs, current 83-node equivalent
- zoom 2: modules/files inside organs
- zoom 3: exported mechanisms/functions/config surfaces
- zoom 4: individual tests, guard vectors, parameters, formula examples

Visual grammar:
- organs as die blocks
- modules as cells inside organ blocks
- mechanisms as pins/traces
- tests as small shield/diode nodes orbiting guarded mechanisms
- guard failures as red broken traces
- moat layers retain gold thread treatment
- commodity layers remain visually quieter

For scale, render labels only when:
- selected
- hovered
- search hit
- zoom threshold reached
- pinned by layer/mode filter

**Migration Path**
1. Freeze current `yuri-circuitry-graph.json` as seed input.
2. Convert each existing node into one JSONL declaration.
3. Write `build-circuitry-graph.mjs` that regenerates the current graph shape from declarations plus scans.
4. Make current prose descriptions survive as declarations, not generated guesses.
5. Add test-node extraction for existing `*.test.mjs` first.
6. Swap `build-circuitry-instrument.mjs` input from hand JSON to generated JSON.
7. Keep the old hand JSON as a fixture until generated output reaches parity.
8. Add drift check: generated graph must be clean or CI fails.

**Hard Risks**
Determinism: spectral layouts can flip signs or wobble on near-degenerate eigenvalues. Fix with gauge pinning and deterministic perturbation by node ID.

Scale: thousands of test nodes will crush SVG. WebGL/canvas becomes mandatory; SVG only for overlays.

Truth quality: AST edges are factual but shallow; corpus-match edges are useful but probabilistic. Keep edge evidence and confidence visible.

Aesthetic: generated layouts can become ugly even when mathematically correct. Use GORDIAN layer constraints and test satellites to preserve chip-die structure.

Registry decay: declarations can go stale. Solve with “declared but unobserved” warnings and “observed but undeclared” candidate reports.

Protected paths: scanners must never read protected runtime/secrets. Use the existing protected-path kernel and fail closed.

**Strongest Objection**
The hybrid registry can become another manual burden: every new module now needs metadata, and developers may skip or cargo-cult it.

Answer: require only identity metadata by declaration, derive everything else. Also emit “unregistered observed node” candidates from AST/test scan, so the system proposes registrations automatically. The human approves ontology; the machine owns wiring.

=============================================================
## LANE C7
=============================================================

**Design Memo**

Recommended: **PPMI-vector cosine**, not Reflective Random Indexing.

Why:
- It is fully deterministic from the existing `stats` object: `df`, `cooc`, `N`.
- It has no seed, no projection dimension, no approximation noise, and no RNG-at-query.
- It is easier to reason about for prefix-filter completeness because it emits a fixed `Map<term, string[]>`, then `features()` turns those pairs into deterministic namespaced feature edges.
- RRI is useful when vocab/context scale is too large for exact sparse profiles, but it adds more knobs and an approximation layer before we need one.

The core move: first-order PPMI says “terms that co-occur are related.” Second-order cosine says “terms that co-occur with the same neighbors are substitutable.” So `login` and `signin` can match even if they never appear in the same document, because both have high PPMI with `password`, `auth`, `credential`, `form`, etc.

**Drop-In API**

```js
export function buildPpmiProfiles(stats, opts = {}) → Map<string, Map<string, number>>
export function sparseCosine(a, b) → number
export function buildSecondOrderMap(stats, opts = {}) → Map<string, string[]>
```

Precision knobs:
- `minProfilePpmi = 0.5`: ignore weak profile dimensions.
- `minProfileDims = 2`: require enough shared structure.
- `secondOrderFloor = 0.75`: cosine threshold.
- `secondOrderTopN = 3`: cap synonyms per token.
- `excludeFirstOrder = true`: avoid adding `sem2:` for direct co-occurrence pairs.

Completeness:
- `sem2:` edges are not soft scores at query time.
- The corpus index builds one deterministic `secondOrderMap`.
- Both index and query call the same `featureFn`.
- `features()` emits symmetric string features like `sem2:login~signin`.
- Prefix filtering remains complete because the set representation is identical and totally orderable.

**Draft Code**

```js
// ── 3. SECOND-ORDER PPMI PROFILE COSINE (paradigmatic / synonym bridge) ────────────────────────

/**
 * Build sparse PPMI profile vectors: term -> Map<contextTerm, ppmi(term, contextTerm)>.
 * This captures distributional context. Terms with similar profiles can be synonyms even when
 * they never co-occur directly.
 */
export function buildPpmiProfiles(stats, { minProfilePpmi = 0.5 } = {}) {
  const profiles = new Map();

  for (const [key] of stats.cooc) {
    const [a, b] = key.split('');
    const s = ppmi(a, b, stats);
    if (s < minProfilePpmi) continue;

    if (!profiles.has(a)) profiles.set(a, new Map());
    if (!profiles.has(b)) profiles.set(b, new Map());

    profiles.get(a).set(b, s);
    profiles.get(b).set(a, s);
  }

  return profiles;
}

/** Cosine similarity between two sparse numeric maps. Deterministic, no allocation-heavy union. */
export function sparseCosine(A, B) {
  if (!A || !B || A.size === 0 || B.size === 0) return 0;

  let dot = 0, normA = 0, normB = 0;
  for (const v of A.values()) normA += v * v;
  for (const v of B.values()) normB += v * v;

  const [sm, lg] = A.size <= B.size ? [A, B] : [B, A];
  for (const [k, v] of sm) {
    const w = lg.get(k);
    if (w !== undefined) dot += v * w;
  }

  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

function cooccurs(a, b, stats) {
  const key = a < b ? a + '' + b : b + '' + a;
  return stats.cooc.has(key);
}

/**
 * Build paradigmatic synonym map from PPMI profile cosine.
 *
 * term -> [similar terms], sorted by descending cosine, then lexical tie-break.
 * By default excludes direct co-occurrence pairs so sem2: focuses on true second-order bridges.
 */
export function buildSecondOrderMap(stats, {
  minProfilePpmi = 0.5,
  minProfileDims = 2,
  secondOrderFloor = 0.75,
  secondOrderTopN = 3,
  excludeFirstOrder = true,
} = {}) {
  const profiles = buildPpmiProfiles(stats, { minProfilePpmi });
  const terms = [...profiles.keys()].sort();
  const out = new Map();

  for (let i = 0; i < terms.length; i++) {
    const a = terms[i], A = profiles.get(a);
    if (!A || A.size < minProfileDims) continue;

    const hits = [];
    for (let j = 0; j < terms.length; j++) {
      if (i === j) continue;
      const b = terms[j], B = profiles.get(b);
      if (!B || B.size < minProfileDims) continue;
      if (excludeFirstOrder && cooccurs(a, b, stats)) continue;

      let shared = 0;
      const [sm, lg] = A.size <= B.size ? [A, B] : [B, A];
      for (const k of sm.keys()) if (lg.has(k)) shared++;
      if (shared < minProfileDims) continue;

      const s = sparseCosine(A, B);
      if (s >= secondOrderFloor) hits.push({ t: b, s });
    }

    hits.sort((x, y) => y.s - x.s || x.t.localeCompare(y.t));
    if (hits.length) out.set(a, hits.slice(0, secondOrderTopN).map((x) => x.t));
  }

  return out;
}
```

Patch into `features()`:

```js
export function features(text, {
  expansionMap = null,
  secondOrderMap = null,
  semPerToken = 4,
  sem2PerToken = 3,
} = {}) {
  const toks = tokenize(text);
  const F = new Set();

  for (const t of toks) {
    F.add('tok:' + t);

    if (t.length >= CHARGRAM_MINLEN) {
      let added = 0;
      for (let i = 0; i + CHARGRAM_K <= t.length && added < CHARGRAM_MAX; i++, added++) {
        F.add('c4:' + t.slice(i, i + CHARGRAM_K));
      }
    }

    if (expansionMap) {
      const ns = expansionMap.get(t);
      if (ns) for (let i = 0; i < ns.length && i < semPerToken; i++) {
        const u = ns[i];
        F.add('sem:' + (t < u ? t + '~' + u : u + '~' + t));
      }
    }

    if (secondOrderMap) {
      const ns = secondOrderMap.get(t);
      if (ns) for (let i = 0; i < ns.length && i < sem2PerToken; i++) {
        const u = ns[i];
        F.add('sem2:' + (t < u ? t + '~' + u : u + '~' + t));
      }
    }
  }

  return F;
}
```

Patch into `makeFeatureFn()`:

```js
export function makeFeatureFn(items, opts = {}) {
  const texts = items.map((it) => it.text);
  const stats = buildCooccurrence(texts, opts);
  const expansionMap = buildExpansionMap(stats, opts);
  const secondOrderMap = buildSecondOrderMap(stats, opts);

  const semPerToken = opts.semPerToken ?? 4;
  const sem2PerToken = opts.sem2PerToken ?? 3;

  const featureFn = (text) => features(text, {
    expansionMap,
    secondOrderMap,
    semPerToken,
    sem2PerToken,
  });

  return { featureFn, stats, expansionMap, secondOrderMap };
}
```

**Test Plan**

```js
const corpus = [
  'login requires password auth token',
  'login form credential check',
  'login account password reset',
  'signin requires password auth token',
  'signin form credential check',
  'signin account password reset',
  'subdomain takeover dangling dns record',
];

const stats = buildCooccurrence(corpus, { minCooc: 2 });
const second = buildSecondOrderMap(stats, {
  minProfilePpmi: 0.1,
  minProfileDims: 2,
  secondOrderFloor: 0.7,
  secondOrderTopN: 3,
});

assert(second.get('login').includes('signin'));
assert(second.get('signin').includes('login'));

const A = features('login password', { secondOrderMap: second });
const B = features('signin password', { secondOrderMap: second });
assert(A.has('sem2:login~signin'));
assert(B.has('sem2:login~signin'));

assert.deepEqual(
  [...buildSecondOrderMap(stats)].map(([k, v]) => [k, v]),
  [...buildSecondOrderMap(stats)].map(([k, v]) => [k, v])
);
```

Also test precision bounds:
- `secondOrderTopN: 1` never emits more than one synonym per term.
- Raising `secondOrderFloor` to `0.99` should reduce or eliminate matches.
- Direct co-occurrence exclusion: add `"login signin migration"` and assert pair is excluded when `excludeFirstOrder: true`.

**False-Positive Attack**

This will surface topical siblings as synonyms: `password` and `token`, `dns` and `record`, `bug` and `vulnerability`, because they share contexts even when they are not substitutable. The controls that matter most are `excludeFirstOrder`, `minProfileDims`, high `secondOrderFloor`, and low `secondOrderTopN`.

Cost is the main scaling risk. Naive pairwise profile cosine is `O(V^2 * profileOverlap)`. Fine for small/medium YURI context packets; painful for huge corpora. If it grows, add an inverted index from context dimension to candidate terms and only compare terms sharing at least `minProfileDims` dimensions.

=============================================================
## LANE C5
=============================================================

**NEXUS CORE Migration Plan**

Scope: advisory draft only. No execution, no commits.

**Boundary**
NEXUS CORE should mean the executable math/science engine, not the research corpus.

Rename into NEXUS CORE:
- `_SYSTEM/Scripts/math/` → `_SYSTEM/Scripts/nexus-core/`
- `_SYSTEM/Scripts/corpus-match*.mjs` → include under `_SYSTEM/Scripts/nexus-core/` because it is a deterministic matcher engine.
- `_SYSTEM/data/math/` → `_SYSTEM/data/nexus-core/` for formula banks and mechanism-pattern registry.
- `_SYSTEM/labs/math/` → `_SYSTEM/labs/nexus-core/` for proof fixtures/labs.
- `02_RESOURCES/RESEARCH/MATH-SCIENCE-MANUAL.md` title/frontmatter → “NEXUS CORE Manual”; optional final path should be owner-decided: keep in `02_RESOURCES/RESEARCH/` as a living reference, or promote to `_SYSTEM/docs/NEXUS_CORE_MANUAL.md` if it becomes engine governance.
- package script `test:math-substrate` → `test:nexus-core`.

Stay research DB / notes:
- `02_RESOURCES/RESEARCH/**` research notes, plans, source ledgers, handoffs.
- `_SYSTEM/research-archive/yuri-math-engine-2026-05/**` historical research intake.
- `_SYSTEM/OS_KERNEL/search-index.db` and `ai search/reindex` corpus.
- `03_NEXUS-LINK/**` company/brand/project assets. Do not conflate with NEXUS CORE.

**Reference Inventory**
Search patterns to run before execution:
- Paths: `_SYSTEM/Scripts/math`, `_SYSTEM/data/math`, `_SYSTEM/labs/math`, `_SYSTEM/research-archive/yuri-math-engine-2026-05`
- Relative imports: `./math/`, `../math/`, `from './math`, `from "../math`, `from './yuri-`, `from './math-kernel`
- Engine names: `math substrate`, `math engine`, `Mathematical Operating Substrate`, `MATH-SCIENCE-MANUAL`, `math-science-manual`
- Module ids: `math-kernel`, `math-proof-gate`, `math-adapters`, `math-health`, `yuri-energy`, `yuri-fsrs`, `yuri-jaccard`, `yuri-minhash`, `yuri-mdl`, `yuri-token-expand`
- Newer methods: `corpus-match`, `transfer-distance`, `transfer-distance-cores`, `scoreTransferV2`, `matchPrefixFilter`
- Wiki/doc links: `[[*math*]]`, `[[*transfer*]]`, `[[*nexus*]]`
- CLI/test refs: `test:math-substrate`, `node _SYSTEM/Scripts/math`, `ai route-plan .*math`

Likely files to update:
- `package.json`
- `README.md`
- `_SYSTEM/INDEX.md`
- `_SYSTEM/context/context-registry.json`
- `_SYSTEM/config/folder-registry.json`
- `_SYSTEM/config/artifact-registry.json`
- `_SYSTEM/config/schemas/*.json` where descriptions cite math paths
- `_SYSTEM/Scripts/yuri-supercharge-gate.mjs`
- `_SYSTEM/Scripts/energy-tick-core.mjs`, `energy-breaker.mjs`, `claim-cortex.mjs`, `kagami-memory-consolidator.mjs`, `memory-relocator.mjs`, `brain-inject.js` references/imports into math modules
- `_SYSTEM/Scripts/corpus-match*.mjs`
- `_SYSTEM/Scripts/nexus-core/**/*.mjs` after move
- `_SYSTEM/data/math/formula-banks/*.json`
- `_SYSTEM/data/math/mechanism-pattern-registry.json`
- `02_RESOURCES/RESEARCH/MATH-SCIENCE-MANUAL.md`
- `02_RESOURCES/RESEARCH/SESSION-HANDOFF-2026-06-06-nexus-core.md`
- `02_RESOURCES/RESEARCH/transfer-distance-engine-v2-build-plan-2026-06-06.md`
- `02_RESOURCES/CODE-BIBLE/**`
- `02_RESOURCES/RESEARCH/yuri-circuitry-map-2026-06-03.md`
- `02_RESOURCES/RESEARCH/yuri-circuitry-graph.json`
- `02_RESOURCES/RESEARCH/yuri-circuitry-2026-06-03.html` or its generator/source if present

**Staged Order**
Stage 0: Freeze baseline.
- Run `git status --short`.
- Run reference inventory with the patterns above.
- Run current tests: `npm run test:math-substrate`, plus `node _SYSTEM/Scripts/math/transfer-distance.test.mjs`, `node _SYSTEM/Scripts/corpus-match.test.mjs`, `node _SYSTEM/Scripts/corpus-match.collapse.mjs`.
- HIGH risk: existing stale docs already disagree on transfer-distance path. Baseline must distinguish source truth from stale prose.
- Rollback: no mutation yet.

Stage 1: Registry decision.
- Add/adjust registry entries conceptually for `_SYSTEM/Scripts/nexus-core`, `_SYSTEM/data/nexus-core`, `_SYSTEM/labs/nexus-core`.
- Update context packet label from `Mathematical Operating Substrate Context` to `NEXUS CORE Context`.
- Keep trigger terms `math`, `mathematics`, `algorithm`, `proof`, `energy`, plus add `nexus core`, `nexus-core`.
- Verify: `node _SYSTEM/Scripts/context-router.mjs "nexus core math proof energy"` selects the same packet.
- Rollback: restore registry/context entries.

Stage 2: Move engine paths in one source motion.
- `git mv _SYSTEM/Scripts/math _SYSTEM/Scripts/nexus-core`
- `git mv _SYSTEM/Scripts/corpus-match*.mjs _SYSTEM/Scripts/nexus-core/`
- `git mv _SYSTEM/data/math _SYSTEM/data/nexus-core`
- `git mv _SYSTEM/labs/math _SYSTEM/labs/nexus-core`
- Update all import paths in the same change.
- HIGH risk: broken relative imports across moved `corpus-match*.mjs`, `energy-tick-core.mjs`, `claim-cortex.mjs`, `kagami-memory-consolidator.mjs`, `brain-inject.js`.
- Verify: `rg "_SYSTEM/Scripts/math|_SYSTEM/data/math|_SYSTEM/labs/math|./math/" _SYSTEM package.json README.md 02_RESOURCES`.
- Rollback: inverse `git mv` and restore imports.

Stage 3: Update tests/CLI gates.
- Rename `test:math-substrate` to `test:nexus-core`; optionally keep `test:math-substrate` as a temporary alias for one release cycle.
- Update `yuri-supercharge-gate.mjs` test paths.
- Update all `node _SYSTEM/Scripts/math/...` commands in active docs and packets.
- Verify: `npm run test:nexus-core`; run transfer-distance, corpus-match, collapse, energy test suite.
- HIGH risk: hidden command strings in reports/control packets. Active docs first; archive prose can be marked historical instead of rewritten.

Stage 4: Update data bindings.
- Formula banks: `implementedBy`, `binding`, `proofGate`, `local:` evidence refs.
- Mechanism registry evidence refs.
- Lab fixture defaults in Python scripts.
- Verify with `node _SYSTEM/Scripts/nexus-core/math-health.mjs` and proof-gate tests.
- Rollback: restore `_SYSTEM/data/nexus-core` references to old paths.

Stage 5: Docs/manual rename.
- Rename manual title/frontmatter to `NEXUS CORE Manual`.
- Define first-page boundary: “engine lives in `_SYSTEM/Scripts/nexus-core`, data in `_SYSTEM/data/nexus-core`, labs in `_SYSTEM/labs/nexus-core`; research notes stay in `02_RESOURCES/RESEARCH` and search DB.”
- Update README, INDEX, context README if needed.
- Verify: `rg "math substrate|math engine|MATH-SCIENCE-MANUAL|_SYSTEM/Scripts/math" README.md _SYSTEM 02_RESOURCES/RESEARCH/MATH-SCIENCE-MANUAL.md`.
- Rollback: restore old title/path refs.

Stage 6: Circuitry DIE update.
- Update nodes currently in `Energy & Math` that are actually NEXUS CORE substrate:
  `math-kernel`, `math-proof-gate`, `fsrs`, `energy-fn`, `energy-trace`, `energy-config`, `energy-dispatch-bridge`, `energy-experiment`, `energy-sanitize`, `transfer-distance`, `corpus-match`, `yuri-jaccard/minhash/token-expand/mdl`.
- Rename layer label from `Energy & Math` to either `Energy & NEXUS CORE` or split into `NEXUS CORE` plus `Energy Runtime`; I recommend `Energy & NEXUS CORE` for minimal graph churn.
- Update every node `files[]` and edge description/path.
- Regenerate viz HTML from graph source, not by hand-editing embedded JSON if a generator exists.
- Verify: graph JSON has zero `_SYSTEM/Scripts/math`, node count/edge count expected, viz loads.
- HIGH risk: circuitry graph/viz desync.

Stage 7: Reindex and final drift gate.
- Run `bash _SYSTEM/Scripts/ai reindex`.
- Run final references:
  `rg "_SYSTEM/Scripts/math|_SYSTEM/data/math|_SYSTEM/labs/math|test:math-substrate|MATH-SCIENCE-MANUAL"`.
- Accept only historical archive hits that explicitly say “historical old path”.
- Run full meaningful tests: `npm run test:nexus-core`, energy tests, transfer-distance proof/bakeoff, corpus-match collapse, context-router selection.
- No commit unless Marcel authorizes.

**Circuitry DIE Impact**
Today the math substrate is represented mainly as:
- Core primitives: `math-kernel`
- Proof/data: `math-proof-gate`, formula-bank edges to `_SYSTEM/data/math/formula-banks/*.json`
- Energy runtime: `energy-fn`, `energy-config`, `energy-trace`, `energy-dispatch-bridge`, `energy-experiment`, `energy-sanitize`, `energy-dashboard-data`, `energy-control-server`
- Memory math consumers: `fsrs`, `yuri-jaccard` via memory consolidator
- Newer NEXUS CORE methods missing or underrepresented: `transfer-distance*`, `corpus-match*`, `yuri-minhash`, `yuri-token-expand`

Rename changes:
- File paths, not core node semantics.
- Layer label should absorb NEXUS CORE branding.
- Add or update nodes for transfer-distance and corpus-match so the 2026-06-06 methods are no longer only doc/manual truth.
- Edges from consumers remain the same but target paths change.

Main risk: doing code rename without graph/registry/manual in the same migration creates exactly the drift the continuity law is trying to kill.

=============================================================
## LANE D3
=============================================================

Good. Everything's grounded. Here's the design.

---

## YURI Circuitry Auto-Regeneration — `corpus-match` Generalization Design

### 1. The `{id, text}` Adapter

Three record types, emitted by a single adapter `extractCircuitryRecords(repoRoot)`:

```
MODULE record  (one per .mjs file):
  id    = "_SYSTEM/Scripts/corpus-match.mjs:"
  text  = path + export-names + import-lines + header-doc(first JSDoc/comment block)

SYMBOL record  (one per exported name):
  id    = "_SYSTEM/Scripts/corpus-match.mjs:buildIndex"
  text  = "export function buildIndex(items, opts)  // Build a match index over {id,text} items. Precomputes token sets + optional MinHash/LSH."

TEST record  (one per .test.mjs file):
  id    = "_SYSTEM/Scripts/corpus-match.sqlsec.test.mjs:"
  text  = test-path + imported-module-names + test-block-names + assert-description-fragments
```

**ID stability**: `path:symbolName` with trailing colon for module-level. Git rename orphans old IDs → the near-duplicate edge (Jaccard ≥ 0.9) auto-links the old and new paths. Symbol renames within a file are a new node; the old one becomes a dead reference that the matcher flags as "orphan with one strong candidate."

**Feature function**: build the index with `makeFeatureFn(items)` from `yuri-token-expand.mjs` — tok+c4+sem namespaced features. The PPMI expansion map is corpus-derived from the module texts themselves, so `energy` ↔ `computeU` ↔ `gateProposal` get the `sem:` bridge even with zero shared raw tokens.

### 2. Edge-Type Taxonomy & Division of Labor

| Edge | Derives | Method | Confidence |
|---|---|---|---|
| `imports` | **GitNexus** | AST static analysis (`context` / `impact`) | HIGH |
| `calls` | **GitNexus** | Call-graph resolution | HIGH |
| `reads` / `writes` | **GitNexus** | Variable/data-flow analysis | HIGH |
| `process-member` | **GitNexus** | Process-phase grouping | HIGH |
| `near-duplicate` | **corpus-match** | Jaccard ≥ 0.85 (exact+prefix-filter) | HIGH |
| `mechanism-family` | **corpus-match** | Jaccard ≥ 0.30 with `featureFn` (tok+c4+sem) | MEDIUM |
| `tests-cover` | **Hybrid** | Import-parse name-match + matcher confirm | HIGH when both agree |

**GitNexus terrain**: imports, calls, reads, writes, processes, communities, MRO chains, API routes, tool handlers. Structural. Owns the "how data and control flow" graph.

**corpus-match terrain**: similarity edges. Owns the "what looks like what" graph — the one AST cannot see because two modules can share mechanism DNA with zero import/call relationship. Example: `yuri-energy.mjs` and `protected-surfaces.test.mjs` share the `gateProposal`/`veto`/`circuitBreaker` pattern but have zero imports between them. AST sees nothing; the matcher sees Jaccard ≥ 0.3 via `sem:gate~veto` features.

**Do NOT let the matcher derive**: import chains, call hierarchies, type relationships, data-flow edges. Those are GitNexus's job. The matcher only says "these two things look similar." Letting it guess structural edges from text overlap is how you get a graph of false calls.

### 3. Test → Module Mapping

A test file (`context-router.test.mjs`) produces ONE test-node and ONE `tests-cover` edge to its module-under-test. The resolver is a three-signal AND-OR ladder:

1. **Import parse** (strong): regex `import ... from './module-name.mjs'` in the test file → candidate module `_SYSTEM/Scripts/module-name.mjs`. If exactly one local module import, edge is provisionally HIGH.

2. **Name-match fallback** (medium): test `foo.test.mjs` → module `foo.mjs` when no direct import exists (testing via CLI `execFileSync` or testing infra/config).

3. **Similarity confirmation** (matcher): run the test record against all module records at t=0.25. If the structurally-matched module IS the top hit, confidence stays HIGH. If a DIFFERENT module is the top hit, emit a `MISMATCH` warning — the test name/import says X but the text fingerprint says Y. This catches misnamed tests.

The `tests-cover` edge is bidirectional in the circuitry graph: `test-node --[tests-cover]--> module-node` and `module-node --[covered-by]--> test-node` (derived inverse).

### 4. Completeness Guarantee — "No Orphan Node Missed"

The prefix-filter (`matchPrefixFilter`) gives a **mathematical completeness guarantee**: for any threshold t > 0, every pair with Jaccard ≥ t is returned. Zero false negatives. This is the Bayardo/Xiao theorem: any pair whose Jaccard ≥ t MUST share at least one token in their prefixes under the global-rarity ordering. The inverted index over prefixes means the probe touches ONLY candidates that could possibly match, and exact Jaccard verifies each one.

Applied to the circuitry:

- **All-pairs run**: `matchPrefixFilter` over the module/symbol records at t=0.30. Every mechanism-family edge is found. No orphan mechanism escapes detection.
- **New node intake**: when a new module is added, run `matchPrefixFilter` for that single record against the index. Every existing node with similarity ≥ t is found. The new node is immediately wired into the mechanism-family graph.
- **Threshold layering**: t=0.85 → near-duplicates (rename detection, copy-paste clones). t=0.30 → mechanism-family (shared DNA across distant modules). t=0.15 → weak association (advisory only, not auto-registered as edges).

**The one gap**: if two modules implement the same mechanism with vocabulary that shares NO raw tokens AND NO PPMI context terms (no shared co-occurrence partners), even the expanded features miss it. This is the "vocabulary island" problem — rare in practice for a single codebase, and detectable because the node stays isolated. An isolated node with high structural complexity (many imports, many exports) is a flag: something is here that nothing else looks like. That's a prompt for human review, not a silent miss.

### 5. Integration Surface — What Ships

A single new script: `_SYSTEM/Scripts/circuitry-auto-register.mjs`

```
Pipeline:
  1. extractCircuitryRecords(repoRoot) → { modules[], symbols[], tests[] }
  2. buildIndex(modules+symbols, { featureFn: makeFeatureFn(...).featureFn, threshold: 0.30, prefixFilter: true })
  3. For each module/symbol: matchPrefixFilter → mechanism-family edges
  4. For each pair of module records: matchPrefixFilter at t=0.85 → near-duplicate edges
  5. For each test: resolve tests-cover edges (import parse + name match + similarity confirm)
  6. Emit circuitry-graph.json delta: new nodes + new edges + orphan-report

  GitNexus structural edges (imports, calls, reads, writes, processes)
  are MERGED from a `gitnexus cypher "MATCH ..."` call — not re-derived.
```

The existing `yuri-circuitry-graph.json` (87 nodes, 157 edges, `calls/reads/writes`) becomes the base. The auto-register adds `near-duplicate`, `mechanism-family`, and `tests-cover` edges. On each run, it diffs against the existing graph, adds only genuinely new nodes/edges, and reports orphans (nodes with zero edges of any kind — structural OR similarity).

### What the Matcher Must NOT Do

- **Do not** derive `imports` or `calls` from text similarity. "These two modules both import `fs`" is not the same as "A imports B."
- **Do not** create edges between a module and a test that mentions it without a structural import or name-match. Similarity alone is not a tests-cover edge.
- **Do not** use LSH for the circuitry build — use prefix-filter (complete). LSH is an accelerator with recall < 100%; the circuitry graph is small enough (~200 modules + 128 tests) that prefix-filter exact is milliseconds and completeness matters.
- **Do not** auto-delete edges. Only add. Human or governed-autonomy runner prunes stale edges.

=============================================================
## LANE C4
=============================================================

**Decision Memo**

Verdict: **SCOPED-YES, post-v1 gate only.**  
Port the matcher hot kernel to Rust behind a bit-exact determinism harness, but do not make it mandatory for the OSS release unless the harness is already green and packaging is boring. Keep Node as the canonical fallback.

**What Should Move**

Move only the kernel:

- FNV-1a token hashing
- LCG-seeded permutation generation
- `modAffine`
- MinHash signature generation
- LSH band key generation
- prefix-filter candidate generation
- exact Jaccard rerank over pre-tokenized sets

Keep in Node:

- SQLite / `better-sqlite3`
- FTS5 comparison path
- CLI orchestration
- context routing/hooks/llm-lane
- corpus loading and registry integration

This preserves the architecture: Node remains the control plane; Rust becomes an optional deterministic accelerator.

**1. `modAffine` Assessment**

Current JS avoids unsafe `f64` multiplication:

```js
a*xm up to ~2^62
```

That exceeds the 53-bit exact integer range, so the hi/lo split is necessary.

Rust simplifies this cleanly:

```rust
const P: u128 = 2_147_483_647;

fn mod_affine(a: u32, x: u32, b: u32) -> u32 {
    let xm = (x as u128) % P;
    (((a as u128 * xm + b as u128) % P) as u32)
}
```

Using `u128` makes `(a*x+b)%p` exact, removes the fragile split logic, and should produce the same result as the corrected JS implementation if inputs are cast identically.

Important: Rust must emulate JS `%` over non-negative integers only. That is fine here because `a`, `b`, `x`, and `p` are unsigned-domain values.

**2. Delivery Mechanism**

Recommendation:

- **napi-rs for production Node hot path**
- **WASM only for browser/circuitry visualization or portable demos**

Why napi-rs:

- best fit for existing `.mjs` callers
- direct Node addon, less serialization overhead
- good for large corpus arrays/signatures
- can expose typed arrays cleanly
- better path to Rayon/native threading
- simpler to keep Node as orchestrator

Why not WASM first:

- browser-capable, but the current production surface is Node
- threading is more constrained and environment-dependent
- large Set/Map-like structures require careful marshaling
- performance wins may be eaten by JS↔WASM boundary copies

Use WASM later for:

- circuitry viz
- deterministic educational/demo signature generation
- client-side inspection of MinHash/LSH behavior
- small corpus experiments

**3. Determinism-Conformance Harness**

Migration gate: Rust is accepted only if it is bit-identical to JS on golden fixtures.

Harness should compare these layers independently:

1. **FNV-1a**
   - input strings: ASCII, mixed case, punctuation, empty string, long token
   - assert exact `u32`

2. **LCG stream**
   - seed `0x9e3779b1`
   - first N raw `u32` outputs
   - assert exact sequence

3. **Permutation params**
   - `makeHashes(k)`
   - compare full `a[]`, `b[]`, `seed`
   - include `k = 1, 8, 128, 257`

4. **`modAffine`**
   - edge cases:
     - `x = 0`
     - `x = 0xffffffff`
     - `a = 1`
     - `a = p - 1`
     - `b = 0`
     - `b = p - 1`
   - randomized deterministic fixture generated once by JS

5. **MinHash signature**
   - token sets:
     - empty
     - one token
     - duplicate input tokens
     - realistic bug-bounty title text
     - high-overlap XSS examples
   - compare all `Uint32Array` coordinates

6. **LSH band keys**
   - same signature, same tuned `(b,r)`
   - compare exact string keys: `"band#:hash"`

7. **End-to-end matcher**
   - small fixed corpus
   - compare:
     - exact matches
     - prefix-filter candidates
     - prefix-filter final matches
     - LSH candidates
     - LSH final matches
     - sorted order and rounded scores

Golden fixture format should be JSON emitted by the current JS implementation, committed under the test suite. Rust reads it; JS also revalidates it to catch accidental fixture drift.

The rule: **Rust cannot replace JS for any path until every fixture is green on macOS/Linux CI.**

**4. Parallelism and Performance Projection**

Assumptions:

- docs are short
- corpus today: ~9,487 reports
- target: 100k to 1M short docs
- query-time exact Jaccard is O(N)
- prefix-filter reduces candidate count when threshold is sane
- Rust uses compact token IDs or hashed token sets, not string-heavy JS `Set`s
- Rayon parallelizes build/signature/exact rerank/candidate verification

Projected shape:

| Corpus | Current Node likely | Rust kernel likely | Notes |
|---:|---:|---:|---|
| 9.5k | already fine | 2x-8x faster | mostly ergonomic win, not urgent |
| 100k | noticeable latency under exact scan | 5x-15x faster | Rust memory layout + Rayon matter |
| 1M | Node exact scan becomes uncomfortable | 10x-30x possible | prefix-filter/LSH needed; exact still costly |

The biggest Rust win is not only arithmetic speed. It is memory layout:

- JS `Set<string>` has high object overhead
- Rust can store sorted `u32` token hashes or interned token IDs
- Jaccard can become two-pointer intersection over sorted arrays
- Rayon can split corpus verification across cores

Prefix-filter also benefits from Rust because candidate generation and verification can avoid JS Map/Set churn. But if candidate counts are already tiny, the absolute win may be modest.

Do not promise 100x. A credible target is **single-digit gains at 9.5k**, **order-of-magnitude-ish gains by 100k+**, assuming data structures are redesigned rather than transliterated.

**5. Mutation Testing**

`cargo-mutants` is an upgrade over hand-rolled JS mutation testing for the Rust kernel.

Why:

- mature mutation operator set
- integrates with `cargo test`
- good at catching weak arithmetic and branch tests
- especially useful for determinism code where tiny changes must fail tests

Use it against:

- FNV constants
- LCG constants
- modulo prime
- `a` generation range
- `b` generation range
- MinHash min comparison
- LSH byte hashing order
- prefix length formula
- Jaccard threshold comparison

It does not replace golden conformance. It complements it. Golden tests prove compatibility; mutants prove the tests are hard to fool.

**6. Strongest Case Against Porting**

The strongest argument against porting now:

The current system’s moat is correctness, determinism, and release readiness, not raw speed at 9,487 docs. A Rust addon adds packaging risk, CI matrix risk, Node ABI concerns, build-tool friction, and a second implementation that can silently diverge from JS.

Specific risks:

- unsigned integer semantics differ at the seam
- JS `Uint32Array` vs Rust `u32` serialization mistakes
- string normalization/tokenization drift
- LSH band key byte order mismatch
- sorted match order mismatch on equal scores
- threshold rounding differences
- prefix-filter completeness bug if build threshold/query threshold logic diverges
- npm install friction for users without native build support
- CI green on Marcel’s machine but broken on Linux users

For a 2-week OSS release, making Rust mandatory is the wrong bet unless the harness already exists and packaging is proven.

**7. Reversibility Plan**

Stage it like this:

1. **Pre-v1**
   - keep JS canonical
   - add fixture generator from JS
   - document determinism contract
   - no Rust dependency in default install

2. **Post-v1 experimental**
   - add Rust crate behind `NEXUS_MATCHER_BACKEND=rust`
   - napi-rs optional package
   - JS fallback always available
   - CI runs JS and Rust conformance

3. **Shadow mode**
   - production calls JS
   - Rust computes in parallel on sampled queries
   - log mismatch summaries only, no runtime behavior change

4. **Opt-in acceleration**
   - allow Rust backend when conformance passes
   - fail closed to JS on addon load error
   - expose backend in diagnostics

5. **Default switch**
   - only after real corpus runs show zero mismatches
   - only after install works on target OS matrix
   - keep JS fallback for at least one release cycle

**Final Recommendation**

Do the Rust port, but scope it as a **post-v1 accelerator with a determinism-conformance gate**. Use **napi-rs for the Node production kernel**, and reserve **WASM for browser/viz surfaces**.

Do not fork the release around Rust performance. Fork the implementation only after the harness proves bit-exact compatibility from FNV through full matcher output.