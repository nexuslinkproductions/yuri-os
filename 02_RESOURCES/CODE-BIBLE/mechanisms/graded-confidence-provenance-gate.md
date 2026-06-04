# Mechanism Card — graded-confidence-provenance-gate

> Provenance DETERMINES confidence. A low-confidence hit must NAME why it's a twin or be suppressed. Gate on the identity of the evidence, never on its aggregate score.

| field | value |
|---|---|
| **slug** | `graded-confidence-provenance-gate` |
| **source** | IN-REPO — scorer `_SYSTEM/Scripts/xref-provenance.mjs`; closed schema `_SYSTEM/config/schemas/xref-hit.schema.json` (XREF-04) |
| **anchor** | `scoreHit` @ `xref-provenance.mjs:87`; `gateHit` @ `:150`; tunable knobs @ `:43`; closed schema `additionalProperties:false` @ `xref-hit.schema.json:8` + `:20` (both files under concurrent edit at writing — anchor by symbol NAME, re-grep if lines drift) |
| **license** | internal (YURI-OS) — canonical YURI idiom |
| **lane** | js (the scorer `xref-provenance.mjs` is imported by the query + propagation-scan organs) |
| **YURI use** | the cross-reference / propagation engine — grades every surfaced hit so vocabulary-twins can't masquerade as mechanism-twins |
| **STATUS** | BUILT — scorer module `xref-provenance.mjs` exists (`scoreHit`/`gateHit`/`validateHit`/`serializeRevalidate` exported) AND the closed hit schema is present + verified. (Both shipped during this card's authoring by the concurrent session; lines re-verified post-build.) |

## Mechanism (one line)
Every cross-reference hit carries a `provenance` block whose `evidenceKind` (how the match was found) sets a graded `confidence` 0..1: structural call-graph match = HIGH, graph 1-hop neighbor on `calls`/`reads` = MED, lexical-only = LOW; a sub-floor hit is SUPPRESSED unless it carries a human-readable `mismatch` naming the specific shared mechanism — and `writes`-edge neighbors are NEVER siblings. The shape is locked by a closed (`additionalProperties:false`) schema with a canary.

## Algorithm (the idiom, distilled — verified against the built `xref-provenance.mjs`)
1. **Tunable knobs, frozen** — `XREF_PROVENANCE_KNOBS = Object.freeze({ confidenceFloor:0.55, stalenessPenalty:0.6, structuralBand:[0.8,1.0], neighborBand:[0.55,0.75], lexicalCeiling:0.5 })` (`xref-provenance.mjs:43-48`). The 0.55 floor + 0.6 penalty are documented neuro-knobs, not hardcoded magic.
2. **Provenance → confidence tiers** in `scoreHit` (`:87`) (gate on evidence IDENTITY, not aggregate):
   - **gitnexus-structural** → projected into `structuralBand` [0.8,1.0]; **× stalenessPenalty (0.6)** if `stale` (`:101`); a structural surface with `structuralMatch === false` returns `null` (`:98`).
   - **graph-neighbor** on `edge.kind ∈ {calls, reads}` (`SIBLING_EDGE_KINDS` @ `:59`) → MED `neighborBand` [0.55,0.75].
   - **graph-neighbor on `writes`** → EXCLUDED: `if (!SIBLING_EDGE_KINDS.has(edgeKind)) return null` (`:110`), never surfaced as a sibling (verified data-flow ≠ shared mechanism; census calls:77 / reads:31 / writes:45).
   - **lexical-only** → capped at `min(lexicalCeiling, floor − EPSILON)` (`:121`) with `requireMismatch: true` (`:131`).
3. **Mandatory mismatch on low confidence** — `gateHit(hit)` (`:150`): malformed provenance → `{surfaced:false, sublog:true}` (`:154`); `confidence < floor` AND no `provenance.mismatch` → `{surfaced:false, sublog:true, reason:'low-confidence-no-mismatch'}` (`:158`); else `{surfaced:true}` (`:160`). A twin that can't name WHY it's a twin is killed before it floods the queue.
4. **Closed hit schema, fail-closed on unknown fields** (`xref-hit.schema.json`) — validated by `validateHit` (`xref-provenance.mjs:189`):
   - `additionalProperties:false` at the top object (`schema:8`) AND the nested `provenance` (`schema:20`) — an unknown field is REJECTED, consistent with the privacy-gate `ALLOWED_STRING_PATHS` discipline (cross-referenced in the schema description).
   - `required: ["path","surface","snippet","score","provenance"]` (`schema:7`); provenance `required: ["evidenceKind","confidence"]` (`schema:19`).
   - `evidenceKind` 3-value closed enum (`schema:24`; `EVIDENCE_KIND` @ `xref-provenance.mjs:51`); `confidence` `[0,1]` (`schema:26`); optional `stale`, `mismatch` (minLength 1, `schema:28`), `structuralUnavailable` (boolean-checked @ `xref-provenance.mjs:238`).
5. **Serialize-revalidate canary at the boundary** — `serializeRevalidate(hit)` (`:261`): `JSON.stringify` → `JSON.parse` → re-`validateHit` before trusting the hit; on mismatch THROW. (Same canary idiom as `privacy-gate-serialize-revalidate-canary`.)
6. **Shared single source** — `scoreHit`/`gateHit` are ONE module both the query (XREF-01) and the propagation-scan import, so the two organs cannot invent divergent confidence models.

## When to apply
- Any retrieval/merge surface where lexical similarity can masquerade as semantic/mechanism similarity — grade by HOW the hit was found, suppress un-named low-confidence twins.
- Any confidence that depends on an external index — apply a staleness penalty and a fail-closed cap when that index is stale/unavailable; never silently treat stale structural evidence as fresh.
- Any data-flow graph where you want SHARED-MECHANISM siblings — exclude `writes` edges; they encode data movement, not shared technique.
- Any hit object crossing a boundary — lock it to a closed schema and re-validate the serialized output.

## The failure it prevents
- **Mechanism-fit theater (the #1 named risk).** Lexical overlap surfaces vocabulary-twins until the queue floods and trust dies. The mandatory-mismatch gate `gateHit` (`xref-provenance.mjs:158`) suppresses any sub-floor hit that can't name the specific shared mechanism — theater can't reach the main surface.
- **Stale structural evidence laundered as high-confidence.** A call-graph claim on a stale index is not actually high-confidence; the ×0.6 staleness multiplier (`:101`) + the `structuralUnavailable` cap force it down toward the lexical ceiling.
- **`writes`-edge false siblings.** Two functions that both write the same file share data-flow, not mechanism. `return null` for non-`{calls,reads}` neighbors (`:110`) prevents data-flow coupling from being sold as shared technique.
- **Unknown-field smuggling / shape drift.** `additionalProperties:false` at every object level (`schema:8`, `:20`) rejects any field the schema didn't enumerate — a hit can't carry an un-vetted channel — and `serializeRevalidate` (`:261`) catches drift at the boundary.
- **Divergent confidence models.** Two organs each rolling their own scorer would grade the same hit differently and erode trust. A single shared scorer module keeps grading identical.

## Clean-rewrite note
YURI's own pattern. The load-bearing discipline is GATE-ON-IDENTITY-NOT-AGGREGATE: confidence is a function of evidence provenance, not a blended score, and a low-confidence hit is suppressed unless it justifies itself (the Semgrep negative-fixture discipline applied at query time). The scorer `validateHit`/`serializeRevalidate` validate against `xref-hit.schema.json` so the schema stays the single source of shape — any consumer (query, propagation-scan) must import `scoreHit`/`gateHit` from this one module, never re-roll the tiers.

## Verification
Real source read (not from memory). Grep-verified path:line in this repo (both files under concurrent edit at writing; symbol names are the durable anchor, re-grep if lines drift):
- `_SYSTEM/Scripts/xref-provenance.mjs:43-48` `XREF_PROVENANCE_KNOBS` (`confidenceFloor:0.55`, `stalenessPenalty:0.6`, bands)
- `xref-provenance.mjs:87` `export function scoreHit` · `:98` structural-no-match → null · `:101` `*= stalenessPenalty` · `:110` `writes`-edge → null · `:121` lexical ceiling · `:131` `requireMismatch:true`
- `xref-provenance.mjs:150` `export function gateHit` · `:158` low-confidence-no-mismatch → suppressed · `:160` surfaced
- `xref-provenance.mjs:189` `export function validateHit` · `:261` `export function serializeRevalidate` (canary)
- `_SYSTEM/config/schemas/xref-hit.schema.json:8`+`:20` `additionalProperties:false`; `:24` `evidenceKind` enum; `:26` `confidence [0,1]`; `:28` `mismatch minLength 1`
- STATUS verified: `find . -name xref-provenance.mjs` → `./_SYSTEM/Scripts/xref-provenance.mjs` (scorer BUILT); schema present.
