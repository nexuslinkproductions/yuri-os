# Three Seams, Shaped + Prior-Art-Grounded (2026-06-04)

> Companion to `02_RESOURCES/RESEARCH/yuri-math-engine-and-propagation-roadmap-2026-06-04.md`. Shapes the 3 architectural seams (mechanismPattern taxonomy · lifecycle loop · node-size-as-living-activity) AFTER an adversarial design+critique+coherence pass AND a competitive study of how shipping tools solved each. Every design here is the POST-CRITIQUE version (the first-pass designs were built against a card population that doesn't exist; corrected below). Cited prior art captured per the research-capture mandate.

## THE CORRECTION (coherence pass, verified) — the unit is the GRAPH NODE, not the formula-card
The "evolved formula-card = one unit, four engines" framing was over-unified. Live reality: 21 thin math-primitive formula cards (semantic ids: shannon-entropy, brier-score…), NONE carrying mechanismPattern/organ, and `math-proof-gate.mjs` structurally forbids self-minting new formulas (hard-requires a `FORMULA_IMPLEMENTATIONS[id]` kernel binding). The 5 propagation patterns describe **cross-organ CODE mechanisms** (energy `DEFAULT_WEIGHTS`, governance realpath guard, memory autopilot) that are NOT formula cards.

**Corrected through-line:** the **circuitry-graph node** is the universal mechanism record; the formula-card is the math-specific elaboration that hangs off math nodes. `mechanismPattern` lives on the NODE (so it can tag any code mechanism — the real population the 5 verbs describe). Three render channels, **one owner each** (kills the triple-sizing double-build): structure→size (architecture-graph engine), pattern→color/edges (mechanismPattern), heat→breath (live channel). Tag once (verb), size by structure, breathe by heat, walk by gap-scan. Nothing double-builds; no write touches a baked coordinate or the protected energy-trace.

---

## SEAM 1 — mechanismPattern taxonomy (the keystone)

### Locked design (post-critique)
- **Population = graph nodes + formula-cards**, not formula-cards alone. mechanismPattern is a field on the node record; a formula-card inherits it when the node is a math node.
- **v0 = the 5 found verbs as a FLAT closed enum** — `replace-hand-tuned-constant`, `read-lower-bound-not-point`, `gate-on-identity-not-aggregate`, `shared-prerequisite-unlock`, `compose-readonly-analyzer`. **Verb is the key; layer is NOT in the key** (the spectrum gives prose labels not slugs; verbs span layers). No faceted cathedral, no Jaccard dedup, no FTS5 auto-tagger — premature for 5 entries.
- **Schema:** `mechanismPattern: string[]` (a node can instantiate 2+); element[0] = primary. Hard cap ≤ a few (CodeQL's ≤10-tag discipline).
- **Registry:** new file `_SYSTEM/config/mechanism-pattern-registry.json`, **CLOSED-on-write** (validator fail-closed-rejects unknown verbs). Governed by the existing propose→decide→ledger grammar (owner-gated).
- **Validator:** a NEW ~30-line closed-set check (honestly separate from `math-proof-gate.mjs`, which validates executable math via the impl-binding — a string-in-set check shares none of that machinery). Don't oversell "reuse the proof gate."
- **Promotion (rule-of-three):** a verb earns a vocabulary slot only after it transfers across **≥2 independent organs** (the two-witness rule = GoF/Fowler's rule-of-three).

### Prior art (cited)
- **OpenRewrite RecipeDescriptor** — taxonomy is DERIVED from the namespaced dotted name against a closed CategoryDescriptor registry (not author-free-typed); `recipeList` (recipe composed of other recipe ids) is the structural twin of `propagatesTo` (reference card ids, never re-describe inline). Ref: `raw.githubusercontent.com/openrewrite/rewrite/main/rewrite-core/.../config/RecipeDescriptor.java` (fields L44-77; inferCategoriesFromName L99-145). **MISMATCH:** their registry is OPEN-on-write (auto-invents categories = the sprawl vector) → YURI must be CLOSED-on-write.
- **Semgrep registry (THE top transfer)** — schema-conditional required fields (if `category:security` then cwe+owasp mandatory) + **mandatory paired positive/NEGATIVE test fixtures** (`// ruleid:` true-positive AND `// ok:` true-negative). Ref: `semgrep.dev/docs/contributing/contributing-to-semgrep-rules-repository` + raw `semgrep-rules/.../subprocess-shell-true.yaml`. **ADOPT:** if a node declares a mechanismPattern, then `propagatesTo` + a named `mismatch` + a cross-domain worked example + **at least one NEGATIVE vocabulary-twin example** (a look-alike that is NOT the mechanism) become machine-required. The negative example is the concrete machine-check that forces the author to prove twin≠mechanism — killing mechanism-fit theater at authoring time, not via author trust.
- **CodeQL query metadata** — stable cross-surface `@id` (same mechanism = one canonical id across languages) + hard ≤10-tag cap + suite-by-metadata selection. **ADOPT:** one canonical mechanismPattern id all 4 engines key on (deterministic twin-detection at the identity layer, not lexical BM25).

---

## SEAM 2 — the lifecycle loop

### Locked design (post-critique)
- **V1 = the read-only loop-closer ALONE:** `lifecycle-gap-scan.mjs`, manual, zero mutation. Reads the 5 real card banks + graph sectors; derives `organ` from the existing card `domain` field (the `organ` field is absent everywhere) via a **pinned allowlist of MATH-BEARING sectors only** (exclude unassigned/services/operator_io/control_plane/prompt_hooks/command_registry — else ~5 permanent false gaps). Emits 3 deficit classes: (a) organ with 0 cards, (b) pattern with 1 instance (under-propagated), (c) stale verified-baseline (source mtime >30d, no canary run). Degrades gracefully but discriminates via `domain` (not the absent `organ`).
- **MINT split in two** (the proof-gate forbids self-minting new math): (a) **CARD-AUTHOR** — research → a card for an EXISTING kernel primitive lacking one (slack: 23 primitives, ~18 cards); passes the gate because the binding exists. (b) **KERNEL-PROPOSE** — a NEW primitive = owner-gated code change to `math-kernel.mjs` + binding, NOT loop-self-certifiable. Conflating these was the core defect.
- **No staging bank** — research-status cards stage inside existing banks (`inspectFormulaBankDirectory` only proof-gates PROMOTED_STATES). Drop the persisted `lifecycleStage` field (the backlog JSONL state column suffices).
- **Host = neuron-loop.mjs** (daily 03:00) as phases 4.5 (card-author) + 8.5 (gap-detect); gap-targets ARE next-cycle hypotheses. Subconscious + EOT untouched (different domain).
- **Loop-closer must** dedup targets vs the open backlog AND `hypotheses.json`, and mark kernel-primitive-requiring targets **UNACTIONABLE** so the blocked-MINT reality doesn't make it an infinite re-notifier.

### Prior art (cited)
- **THE #1 transfer — match on SEMANTIC STRUCTURE, not lexical tokens** (all 5 tools converge). OpenRewrite/Refaster match on the typed LST/AST; Renovate/Sourcegraph/Rosie on deterministic facts — **none guess mechanism from words.** YURI's DETECT builds its signature from `description`+`triggeredBy` TOKENS = exactly the lexical guess they avoid. **ADOPT:** add a STRUCTURAL signature leg via GitNexus's typed call-graph (the LST-proxy) — a candidate sibling must share structural shape (same calls/reads edge-kinds, same `math-kernel` primitive imported, same before-shape) in addition to lexical tokens; auto-suppress lexical-pass-but-structural-fail to the low-confidence sub-log. Converts `propagation-scan.mjs` from a lexical flood-risk into a high-precision engine before it ships. Ref: `github.com/openrewrite/rewrite` (LST visitors); error-prone Refaster `@BeforeTemplate/@AfterTemplate`.
- **Google Rosie / LSC** (Abseil SWE-book Ch.22) — approve-the-CLASS-once (one up-front authorization, not N gates) + **cap OUTSTANDING shards** (in-flight, not total-found) + run-at-lower-priority + the **Tricorder backsliding-guard** (flag any NEW site introducing the deprecated pattern → the loop CONVERGES instead of regenerating). **ADOPT:** owner approves the pattern-class once; cap in-flight proposals per pattern; a card's before-shape becomes a standing review-time detector for regressions = loop-closure.
- **Renovate** — live in-flight counters (`getConcurrentPrsCount`/`getPrHourlyCount`) gate **EMISSION, not DISCOVERY** (work is still found; only surfacing is throttled) — validates our `matched=N, surfaced=K` shape exactly. + GROUPING (collapse sibling proposals into one review unit) + cooldown (min-age). Defaults `open-pull-requests-limit=5` + cooldown independently corroborate our ~5-shown + 24h-cooldown knobs (two shipping tools landing on the same numbers = real validation).
- **Sourcegraph Batch Changes** — PREVIEW-before-APPLY (spec→preview-diff→apply) + **BURNDOWN** (sites found vs resolved over time) = the measurable loop-closure surface. **ADOPT:** a per-pattern burndown rendered on the circuitry instrument IS the "surface the next target / close the loop" mechanism.

---

## SEAM 3 — node-size as living activity (CORRECTED by prior art)

### Locked design (post-critique + CodeScene correction)
The first-pass design blended into one radius (`liveR = baseR*(1+k·boost)`). **CodeScene overrides this: never collapse structure×activity into one scalar.** Two fields, two channels, one owner each:
- **STRUCTURE → `size` (deterministic, baked).** Owned by the architecture-graph engine. v1 = the 83-node graph's OWN degree (already in `laplacian.mjs:340`, no join, no unshipped dependency); upgrade to the card-4/16/17 composite (degree+betweenness+spectral-centrality) only after that engine ships AND a documented 83↔124 id-join (log unmatched). **Kiali-style: rank → normalize to a bounded range** so hubs can't swamp and runs stay comparable. mechanismPattern does NOT size (owns color/edges only).
- **ACTIVITY → `heat` (live, decaying, separate channel).** A NEW PostToolUse pulse stamp writes `circuitry-live.json` as a **heat-only file** (`{nodeId: heatScalar}`, never a radius/size file — structurally prevents persisting hot sizes). Reads `classifyTransition`'s `file_path` (`energy-tick-core.mjs:58`, already in hand) → file→node via a baked index → `heat += w(salience)+|ΔU|`. **NEVER add file_path to the energy-trace** (`yuri-energy-trace.mjs:48` is a hardened privacy gate, ALLOWED_STRING_PATHS, Codex-blocked 2026-05-28 — a raw path is structurally illegal there). Browser decays `heat(t)=Σ fires·exp(−Δt/τ)` (Gource idle-time decay, τ≈45s) → drives a **glow/halo / Grafana-style arc-ring** (values sum to 1), NOT the radius. Organs cool to a baseline floor, never vanish.
- **Determinism reconciliation (verified):** radii compute AFTER positions finalize (`laplacian.mjs:343` post `resolveCollisions:337`); positions never read radii → live breath can't perturb layout. **Breathing-vs-frozen-layout** handled by the **d3-collide math** (r=ri+rj, area-weighted yield: heavy nodes hold, light yield) as a bounded post-pass over FIXED coords — NOT a re-sim (AABB variant for chip-die rects). Clamp boost against each node's actual nearest-neighbor gap (not the global min-30, which is a configurable opt, not a constant).
- **Lens-specific breath:** atlas circles breathe via halo radius; **chip-die rects breathe via inner-fill/glow INTENSITY, not outer dimensions** (scaling a rect in a packed lattice forces overlap/relayout; the die is the owner-locked hero — FB:CIRCUITRY-VISUAL-IS-CHIP-DIE). Two breath channels, one heat signal. **Label pinned to baseR** (not live size) so working nodes don't jitter their own text (`build-circuitry-instrument.mjs:265`).
- **Path correction:** circuitry files live at `02_RESOURCES/RESEARCH/circuitry/` (`laplacian.mjs`, `build-circuitry-instrument.mjs`), NOT `_SYSTEM/Scripts/math/`. Adding `size`+`heat` to the node schema fires the full propagation law (graph→both builders→manual §11→reverify→reindex).

### Prior art (cited)
- **CodeScene** (behavioral hotspots) — structure (LOC) and activity (change-frequency/relative-churn) stay on SEPARATE channels (size vs color vs ranking), never multiplied; churn normalized against file size so big files don't auto-win. **The canonical "don't blend into one scalar."**
- **CodeCity / CodeCharta** — split mass into orthogonal sub-dimensions (footprint vs height), each a different metric, log-scale the high-variance one; treemap keeps area bounded/legible.
- **Gource** — `--file-idle-time` decay: a node brightens on touch, cools over τ, fades to baseline. The decay primitive YURI lacked: `activity(t)=Σ fires·exp(−Δt/τ)`. Borrow the decay timer, NOT its re-settling force layout.
- **Kiali / Grafana node-graph** — Kiali rank-then-normalize-to-1..100 (hubs can't swamp, comparable across runs); Grafana: size = one pre-normalized number the engine computes (viz just renders) + `arc__*` ring (sums to 1) = the canonical "wrap live status as a proportional halo around a stable-size node."
- **d3-force forceCollide** (`src/collide.js` L43-53) — r=ri+rj overlap, push area-weighted (`rj²/(ri²+rj²)`) so the bigger node barely moves; radius re-read on initialize so size can change and collision re-resolves LOCALLY without recomputing global position. The exact breathing-size↔frozen-layout reconciliation (apply as a bounded seeded post-pass, not d3's stochastic sim).

---

## Net build order (unchanged spine, now precision-gated)
1. Architecture-graph engine (card 4→16→17) — owns `size`; ships the structural metrics; read-only.
2. mechanismPattern v0 (5-verb closed registry + ~30-line fail-closed validator + Semgrep negative-fixture requirement).
3. `lifecycle-gap-scan.mjs` (read-only loop-closer; domain→math-sector allowlist; unactionable-marking).
4. `propagation-scan.mjs` with the **structural signature leg** (GitNexus call-graph) from day one — never ship the lexical-only version.
5. Live-heat channel (`circuitry-live.json` heat-only + PostToolUse stamp + decay halo + d3-collide post-pass).

*Evidence: shape-three-seams workflow (design+critique+cohere, 7 agents) + competitive-study workflow (3 agents, local-first then web→real code), 2026-06-04. Citations are to live YURI paths + raw.githubusercontent/official docs. Advisory until built + locally verified.*
