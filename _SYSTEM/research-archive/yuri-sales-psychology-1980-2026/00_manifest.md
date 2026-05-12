# Yuri Sales Psychology + Depth Psychology Research Archive

Date: 2026-05-12
Archive status: CURATED_SEED_READY
rag_approval_status: READY_FOR_RAG_AFTER_APPROVAL
rag_ingestion_status: NOT_RUN
rag_notebook_stable_key: yuri-os/sales-psychology-1980-2026
rag_scope: curated archive Markdown only; raw external sources remain linked reference evidence
advisory_only: true
local_truth_claim: false

## Purpose

Create a Yuri-native source archive for ethical sales reasoning across sectors. The archive combines sales methodology, customer success, buyer psychology, positive and omission signals, and depth-psychology lenses while keeping every claim evidence-tiered.

## Governance

- Canonical origin: `_SYSTEM/yuri-origin.md`
- Applied communication note: `06_KNOWLEDGE-BASE/03_COMMUNICATION/sales.md`
- Native skill: `.agents/skills/sales-psychology/`
- Runtime engine: `backend/src/services/salesPsychologyEngine.ts`
- RAG notebook stable key: `yuri-os/sales-psychology-1980-2026`

## Rules

- This archive is advisory only and never outranks local evidence, direct buyer statements, contracts, laws, or Yuri canonical policy.
- Depth psychology is an interpretive lens, not a diagnostic engine.
- Do not use clinical labels against buyers.
- Do not use false scarcity, shame, deception, vulnerability exploitation, or pressure.
- Probabilities require calibration history; otherwise return `not_estimable`.
- Raw external pages are not ingested into RAG without separate license/IP review.

## Source Count

- Curated source registry entries: 33
- RAG-approved archive files: 10
- Years covered by matrix: 1980-2026

## Files

| File | Status | Content | RAG Status |
|---|---|---|---|
| `00_manifest.md` | CURRENT | Archive purpose and governance | READY_FOR_RAG_AFTER_APPROVAL |
| `01_source_registry.md` | CURRENT | Evidence-tiered source registry | READY_FOR_RAG_AFTER_APPROVAL |
| `02_methodology_atlas.md` | CURRENT | Sales systems and lineage map | READY_FOR_RAG_AFTER_APPROVAL |
| `03_signal_model.md` | CURRENT | Positive, negative, omission, and fan-energy signals | READY_FOR_RAG_AFTER_APPROVAL |
| `04_depth_psychology_atlas.md` | CURRENT | Jungian and adjacent psychology layers | READY_FOR_RAG_AFTER_APPROVAL |
| `05_prediction_model_spec.md` | CURRENT | Deterministic engine and calibration contract | READY_FOR_RAG_AFTER_APPROVAL |
| `06_ethics_guardrails.md` | CURRENT | Ethical persuasion boundaries | READY_FOR_RAG_AFTER_APPROVAL |
| `07_yuri_sales_doctrine.md` | CURRENT | Yuri-native operating doctrine | READY_FOR_RAG_AFTER_APPROVAL |
| `08_yearly_coverage_matrix.md` | CURRENT | 1980-2026 coverage ledger | READY_FOR_RAG_AFTER_APPROVAL |
| `09_rag_ingestion_approval.md` | CURRENT | Owner-scoped RAG approval | READY_FOR_RAG_AFTER_APPROVAL |
| `10_rag_ingested.md` | GENERATED_AFTER_RUN | Ingestion report | RAG_INGESTED_VERIFIED after `sales:rag` |
