# YURI Code Bible — Curated Mechanism-Excellence Corpus

**What this is.** A local, compounding corpus of *world-class code mechanisms*, distilled from the best existing implementations the field has produced. Not a snippet dump and not a copy of anyone's repo — a curated library of **techniques** (the algorithm + the math + how the masters actually did it), rebuilt clean for YURI. The code counterpart to [`RESEARCH/`](../RESEARCH/) (theory) and the [math-theory-transfer-catalog](../RESEARCH/math-theory-transfer-catalog-2026-06-03.md) (math mechanisms).

**Why.** Standing method (Marcel): *before/while building any YURI mechanism, study how the field/competition solved it, then transfer the mechanism-excellence — not the code/IP — so YURI code is of pure excellence, not merely functional.* This corpus is where that study is captured so it stops evaporating and starts compounding.

## The discipline (non-negotiable)

1. **Mechanism, not code.** We study the *technique* and rebuild it clean. We do NOT paste source into shipping code. This is the sharingan rule: observe deeply → extract the underlying technique → rebuild as a legally-clean diamond.
2. **License-tag every source.** Each card records the source's license. Permissive (MIT/BSD/ISC/Apache) = safe to study + reimplement. Copyleft (GPL/EPL/MPL) = **study-only, clean-room rewrite, never lift a line** — flagged loudly on the card.
3. **Language by purpose** (per the standing Rust preference):
   - New **engines / tools / shipped products / perf- or security-critical** → **Rust** (or the Rust family: Rust → WASM for heavy client).
   - YURI **Node infra, JS hooks, and web deliverables** (incl. the circuitry instrument) stay native JS/TS.
   - The corpus stores the *mechanism* language-agnostically; the rebuild targets whichever of the above the consumer is.
4. **Cite + capture + index.** Every card carries a precise citation and is indexed into the existing FTS5 corpus (`ai reindex` → searchable via `ai search`). We reuse the FTS5 search infra — we do **not** reinvent search.

## Architecture

- **Store:** `mechanisms/<slug>.md` — one card per technique (schema below).
- **Search:** existing FTS5 (`_SYSTEM/OS_KERNEL/search-index.db`) via `ai search` / `ai reindex`. Native, reused.
- **Engine (earmarked, not yet built):** when the corpus scales enough to warrant heavy fetch / dedup / license-scan / mechanism-ranking, that engine is a **Rust** CLI (perf + shipped). Until then the flow is native + the research-pipeline Tier-2 raw pulls. Don't build the engine before the corpus earns it.

## Mechanism-card schema

```markdown
---
name: <slug>
description: <one-line: the mechanism + what YURI uses it for>
metadata: { node_type: code-mechanism, source: <repo>, license: <SPDX>, lane: <rust|js|agnostic> }
---
SOURCE: <repo + file + commit/branch> · LICENSE: <SPDX> (<permissive|copyleft-study-only>)
MECHANISM: <what the technique is, in one paragraph>
ALGORITHM: <the steps / the core loop, distilled — NOT a paste>
FORMULA: <the math, where one exists>
YURI APPLICATION: <which YURI subsystem consumes it + how>
CLEAN-REWRITE NOTE: <what to reimplement vs avoid; copyleft cautions>
CITATION: <author / project / url>
```

## Index of mechanisms

First deposits (2026-06-04) — pulled for the circuitry-instrument build:

| Card | Source · license | YURI use |
|---|---|---|
| [d3-catmull-rom-spline](mechanisms/d3-catmull-rom-spline.md) | d3-shape · ISC | smooth district coastlines (spectral atlas) + soft signal-edges |
| [d3-convex-hull](mechanisms/d3-convex-hull.md) | d3-polygon · ISC | base hull per layer before coastline-smoothing |
| [cytoscape-ego-focus-zoom](mechanisms/cytoscape-ego-focus-zoom.md) | cytoscape.js · MIT | inspect mode — 1-hop ego select + animated camera focus |
| [orthogonal-edge-routing](mechanisms/orthogonal-edge-routing.md) | ELK/elkjs · **EPL-2.0 ⚠️ study-only** | chip-die trace routing (K2) — clean-room: segment-DAG + Kahn topo-numbering |
| [symmetric-laplacian-eigensolve](mechanisms/symmetric-laplacian-eigensolve.md) | ml-matrix · MIT | spectral atlas — ψ₂/ψ₃ of the type-weighted Laplacian (K3, deterministic) |
| [semantic-zoom-transform](mechanisms/semantic-zoom-transform.md) | d3-zoom · ISC | shared pan/zoom shell + macro→focus transition + LOD |

Core non-viz mechanisms (2026-06-04) — the YURI-native excellence patterns the rest of Wave 0/1 cites (each card sources an IN-REPO path:line, grep-verified):

| Card | Source · license | Mechanism / failure it prevents |
|---|---|---|
| [closed-set-fail-closed-validator](mechanisms/closed-set-fail-closed-validator.md) | `math-adapters.mjs:13` · internal | frozen allow-`Set` + negative-default flag — kills open-set leak + silent privilege grant |
| [single-resolver-env-override-path](mechanisms/single-resolver-env-override-path.md) | `yuri-user.mjs:53` · internal | one resolver, env → persisted-verbatim → derived → safe fallback — kills identity drift + cwd-path breakage |
| [privacy-gate-serialize-revalidate-canary](mechanisms/privacy-gate-serialize-revalidate-canary.md) | `yuri-energy-trace.mjs:321` · internal | validate→serialize→re-validate canary + closed-key projection — kills serialization-time secret smuggling |
| [circuit-breaker-3-state-fail-open](mechanisms/circuit-breaker-3-state-fail-open.md) | `energy-breaker.mjs:144` · internal (resilience4j lineage) | CLOSED/OPEN/HALF_OPEN + anti-stuck auto-escape — a safety breaker that can never permanently brick |
| [fsrs-retrievability-demotion](mechanisms/fsrs-retrievability-demotion.md) | `memory-relocator.mjs:115` · internal (FSRS/MIT) | retrievability-scored RELOCATE-not-delete + dry-run + restore — reversible forgetting |
| [graded-confidence-provenance-gate](mechanisms/graded-confidence-provenance-gate.md) | `xref-provenance.mjs:87` + `xref-hit.schema.json:8` · internal | provenance→graded confidence + mandatory-mismatch suppression — kills mechanism-fit theater |
