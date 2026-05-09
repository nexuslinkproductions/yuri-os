# Yuri LLM Wiki Page Schema

This is a docs-only schema contract for future compiled-memory pages. It defines structure and lifecycle only; it does not implement ingestion, linting, RAG, backend wiring, or source registry behavior.

## Required Frontmatter

- `title`
- `page_type`
- `status`
- `created_at`
- `source_refs`
- `authority_class`
- `evidence_status`
- `local_truth_claim`
- `advisory_only`
- `rag_eligibility`
- `ingestion_status`
- `sensitive_content_class`
- `last_verified_head`
- `last_verified_at`
- `tags`

## Conditional Required Frontmatter

Required when `status` is `reviewed`, `accepted`, `superseded`, or `rejected`:

- `reviewed_at`
- `reviewed_by`

Required when supersession applies:

- `supersedes`
- `superseded_by`

## Optional Frontmatter

- `contradictions`
- `hash_refs`
- `review_note`
- `canonical_topic`
- `owner`
- `expires_at`

## Page States

- `candidate`
- `linted`
- `review_pending`
- `reviewed`
- `accepted`
- `superseded`
- `rejected`
- `historical_only`

## Allowed Transitions

- `candidate -> linted -> review_pending -> reviewed -> accepted`
- `candidate|linted|review_pending|reviewed -> rejected`
- `accepted|reviewed -> superseded`
- `accepted|reviewed|superseded -> historical_only`

## RAG Eligibility Rule

Pending pages must keep `advisory_only: true`. Only accepted pages may ever become RAG-eligible, and only after a future explicit ingestion gate.

## source_refs Shape

```yaml
source_refs:
  - path: string
    line_range: optional string
    hash: optional string
    source_type: repo|archive|external|model_output|runtime_observation
    authority_class: canonical|current_local_truth|verified_reference|historical_only|external_unreviewed|generated_cache
    evidence_status: verified|needs_review|stale|contradicted|missing
    content_class: canonical_control|curated_reference|external_corpus|generated_cache|forbidden
    provenance_note: string
    review_note: string
    current_truth_status: current|reference_only|superseded|deprecated|unknown
```

## Source Reference Rules

- `source_refs` must not cite forbidden content classes as accepted evidence.
- Missing sources may be recorded as gaps only with `evidence_status: missing` and `current_truth_status: unknown`.
- Model output references are advisory until locally verified.
- Current local repo truth outranks historical archives, generated caches, handoffs, and model output.
