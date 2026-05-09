---
title: "09C Fixture — Yuri LLM Wiki Compiled Memory Layer"
page_type: "concept"
status: "reviewed"
reviewed_by: "owner:marcel-spatz"
reviewed_at: "2026-05-09T16:18:26Z"
created_at: "2026-05-09T14:31:23Z"
source_refs:
  - path: ".claude/rules/nudimmud_operating_dna.md"
    line_range: "1-68"
    source_type: "repo"
    authority_class: "current_local_truth"
    evidence_status: "verified"
    content_class: "canonical_control"
    provenance_note: "Inspected local authority and mutation contract markers."
    review_note: "Supports current-local-truth authority and scoped mutation rules."
    current_truth_status: "current"
  - path: ".claude/rules/research_pipeline.md"
    line_range: "1-83"
    source_type: "repo"
    authority_class: "current_local_truth"
    evidence_status: "verified"
    content_class: "canonical_control"
    provenance_note: "Inspected low-cost research and no-raw-dump markers."
    review_note: "Supports compact evidence and no broad crawl behavior."
    current_truth_status: "current"
  - path: ".clinerules"
    line_range: "6-29"
    source_type: "repo"
    authority_class: "current_local_truth"
    evidence_status: "verified"
    content_class: "canonical_control"
    provenance_note: "Inspected scoped patch, forbidden path, and local truth markers."
    review_note: "Supports exact-path reads and no broad status/find behavior."
    current_truth_status: "current"
  - path: "_SYSTEM/yuri-evidence-pack-schema.md"
    line_range: "1-34"
    source_type: "repo"
    authority_class: "verified_reference"
    evidence_status: "verified"
    content_class: "curated_reference"
    provenance_note: "Inspected advisory_only, local_truth_claim, and ingestion status markers."
    review_note: "Supports advisory evidence metadata."
    current_truth_status: "current"
  - path: "_SYSTEM/yuri-content-governance.md"
    line_range: "1-41"
    source_type: "repo"
    authority_class: "verified_reference"
    evidence_status: "verified"
    content_class: "curated_reference"
    provenance_note: "Inspected governance markers for generated cache and RAG allowlist."
    review_note: "Supports non-authority status for generated/model output."
    current_truth_status: "current"
  - path: "_SYSTEM/yuri-token-ops.md"
    line_range: "1-32"
    source_type: "repo"
    authority_class: "verified_reference"
    evidence_status: "verified"
    content_class: "curated_reference"
    provenance_note: "Inspected model routing doctrine headings and rules."
    review_note: "Supports future-only model synthesis and evidence-gated truth."
    current_truth_status: "current"
  - path: "_SYSTEM/TOKEN-SMART-CHECKLIST.md"
    line_range: "1-97"
    source_type: "repo"
    authority_class: "verified_reference"
    evidence_status: "verified"
    content_class: "curated_reference"
    provenance_note: "Inspected token-smart file operation markers."
    review_note: "Supports targeted reads and small evidence handling."
    current_truth_status: "current"
  - path: "_SYSTEM/model-registry.md"
    line_range: "1-34"
    source_type: "repo"
    authority_class: "verified_reference"
    evidence_status: "verified"
    content_class: "curated_reference"
    provenance_note: "Inspected DeepSeek and Codex Spark router note markers."
    review_note: "Supports lane existence as advisory routing context, not execution evidence."
    current_truth_status: "current"
authority_class: "generated_cache"
evidence_status: "verified"
local_truth_claim: false
advisory_only: true
rag_eligibility: "NOT_ELIGIBLE"
ingestion_status: "NOT_INGESTED"
sensitive_content_class: "curated_reference"
last_verified_head: "df6b9e331"
last_verified_at: "2026-05-09T16:18:26Z"
tags:
  - "llm-wiki"
  - "compiled-memory"
  - "no-ingest"
  - "fixture"
---

## Purpose

This candidate defines a minimal Yuri-native LLM Wiki control-plane island for future compiled-memory work. It is a reviewed-docs fixture only: raw/source truth stays outside the wiki, pending pages are advisory only, accepted pages require review, and RAG requires a future explicit gate before any eligibility or indexing.

Manual lint passed for the `candidate -> linted` transition at head `d6247ba9a`. Manual source-ref review passed for the `review_pending -> reviewed` transition at head `df6b9e331`. The candidate remains advisory, non-RAG, and blocked from acceptance. Review is assigned to `owner:marcel-spatz`.

Owner-approved manual local-source provenance allowed the `linted -> review_pending` transition. Owner review via `owner:marcel-spatz` allows the `review_pending -> reviewed` transition for this fixture candidate. The candidate remains advisory and non-RAG, the source registry remains missing, and no acceptance is claimed.

## Separation Rule

Raw corpora, source registries, archives, model outputs, runtime observations, backend data, and generated caches remain outside this wiki unless a future reviewed contract explicitly allows a derived summary. The wiki stores compact control-plane pages, source reference metadata, review state, supersession links, and lint status.

## Routing Doctrine For This Fixture

DeepSeek direct API lanes are future-only for review, compression, classification, and synthesis. Claude Sonnet 4 is future-only for maximum-nuance or safety-critical review. Local/Ollama is frozen for this work, OpenRouter is not used, and any Codex Spark/offload lane present in the repo is not executed in this fixture sprint.

## Non-Claims

- No accepted wiki page is created.
- No source registry is created or repaired.
- Source registry remains missing.
- Review is assigned to `owner:marcel-spatz`; no acceptance is claimed.
- No RAG eligibility is granted.
- No RAG indexing is run.
- No DB is opened or mutated.
- No backend/runtime wiring is changed.
- No offload/model/API call is run.
