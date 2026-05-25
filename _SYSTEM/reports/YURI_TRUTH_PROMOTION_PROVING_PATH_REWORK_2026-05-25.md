# YURI Truth Promotion Proving Path Rework

Generated: 2026-05-25
Status: active design note, source-controlled procedure
Scope: align the May 10 evidence-first proving path with the May 25 truth-promotion sprint

## Finding

The May 10 commit `17ec7bf9` was committed and is present on `origin/main`. It introduced the evidence-first proving substrate that still matters for truth promotion:

- `_SYSTEM/Scripts/yuri-council-claim-evidence.mjs`
- `_SYSTEM/Scripts/yuri-artifact-audit.mjs`
- `_SYSTEM/Scripts/yuri-canonical-memory-import.mjs`
- `_SYSTEM/Scripts/yuri-proving-run-repeatable.mjs`
- `_SYSTEM/Scripts/yuri-control-plane-schema.mjs`
- `_SYSTEM/Scripts/schemas/normalized-intent.schema.json`
- `_SYSTEM/Scripts/schemas/graph-plan.schema.json`

The May 25 truth-promotion sprint adds the governance layer:

- `_SYSTEM/Scripts/claim-integrity-gate.mjs`
- `_SYSTEM/config/schemas/yuri.promotion-ladder.v0.schema.json`
- `_SYSTEM/reports/YURI_ACTUAL_CAPABILITY_AUDIT_2026-05-25.md`
- `_SYSTEM/Scripts/shintai-dispatch.mjs` substance metadata

These are complementary. The old path proves and gates claims. The new path controls what claims may be made and what promotion state they can occupy.

## Procedure

1. Fast claim language gate

   Use `_SYSTEM/Scripts/claim-integrity-gate.mjs` first for selected docs, reports, and source-controlled claim surfaces. It blocks unsupported high-risk terms unless nearby promotion state, executable evidence, artifact references, or advisory/research/fixture boundaries are present.

2. Advisory claim extraction

   Use `_SYSTEM/Scripts/yuri-council-claim-evidence.mjs split` to classify council or advisory output into claim candidates. Raw advisory output remains tainted and cannot become canonical memory.

3. Artifact and reference proof path

   Use `_SYSTEM/Scripts/yuri-artifact-audit.mjs` to produce source manifests, section manifests, document claims, reference registries, verified source claims, claim-evidence graphs, and promotion gates.

4. Promotion ladder mapping

   Map old proving-path gates into the canonical ladder:

   | Old proving path result | New promotion state |
   |---|---|
   | Unsupported high-risk claim | `draft` or blocked |
   | Advisory hypothesis or unverified claim candidate | `research` |
   | Test candidate with local fixture evidence | `fixture_ready` |
   | Executable runtime evidence exists | `runtime_tested` |
   | `eligible_for_canonical_memory_candidate` after local proof and operator review | `operator_validated` |
   | Repeated operator-validated evidence with stable local tests | `trusted` |
   | Contradicted, stale, or superseded claim | `deprecated` |

   `eligible_for_canonical_memory_candidate` is not automatically `trusted`. It is only a candidate for operator validation and sanitized storage.

5. Canonical memory import

   `_SYSTEM/Scripts/yuri-canonical-memory-import.mjs` remains gated. The repeatable proving runner invokes canonical import as `--dry-run`; live import requires explicit operator approval and must only write sanitized summaries, not raw source or advisory prose.

6. Shintai substance

   Shintai output substance metadata is a quality gate for advisory lanes. It can reject PONG, schema-only, too-short, or stderr-dominant output as degraded. It does not prove truth by itself.

## Integration Boundaries

- No registry write-time enforcement exists in this tranche. `_SYSTEM/Scripts/artifact-registry.mjs --validate` verifies registered artifact shape, classes, protected-prefix markings, and file existence; the evidence graph remains an explicit proving-path step.
- No promotion ladder runtime migration is performed in this tranche. Legacy proving-path terms are mapped into the canonical ladder for procedure and review, while existing scripts keep their current local gate names.
- Canonical memory remains operator-gated. `_SYSTEM/Scripts/yuri-proving-run-repeatable.mjs` invokes `_SYSTEM/Scripts/yuri-canonical-memory-import.mjs import` only with `--dry-run`; live import is a separate explicit operator action after claim gate, evidence graph, promotion gate, and operator validation agree.
- `_SYSTEM/Scripts/claim-integrity-gate.mjs` is a claim-language scanner for docs, reports, and selected source surfaces. It does not consume council JSON as a proof schema and it does not replace `_SYSTEM/Scripts/yuri-council-claim-evidence.mjs` or `_SYSTEM/Scripts/yuri-artifact-audit.mjs`.

## Verification Checklist

Run:

```bash
node _SYSTEM/Scripts/claim-integrity-gate.test.mjs
node _SYSTEM/Scripts/yuri-council-claim-evidence.test.mjs
node _SYSTEM/Scripts/yuri-artifact-audit.test.mjs
node _SYSTEM/Scripts/yuri-canonical-memory-import.test.mjs
node _SYSTEM/Scripts/shintai-dispatch.test.mjs
node _SYSTEM/Scripts/yuri-truth-promotion-pipeline.test.mjs
node _SYSTEM/Scripts/artifact-registry.mjs --validate
npm run test:truth-promotion
```

## Decision

Rework the May 10 proving path as the evidence engine under the May 25 truth-promotion layer. Do not run canonical memory writes automatically. Do not treat advisory output as local truth until the claim gate, evidence graph, promotion gate, and operator validation agree.
