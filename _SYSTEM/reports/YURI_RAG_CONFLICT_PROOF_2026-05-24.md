# YURI RAG Conflict Proof

Generated: 2026-05-24T17:49:51.952Z

## Purpose

This report proves deterministic local multi-hop RAG conflict handling. YURI resolves or preserves ambiguity across conflicting synthetic sources without letting retrieved content become runtime instruction authority.

## Boundaries

- owned-local-synthetic-fixtures-only
- retrieved-source-content-is-never-runtime-authority
- ambiguous-high-confidence-conflicts-remain-visible
- low-confidence-only-evidence-stays-unverified
- no external target retrieval
- no production RAG security claim

## Summary

- Cases: 5
- Resolved: 5
- Ambiguous: 1
- Unverified: 1
- Claim: Deterministic local multi-hop RAG conflict proof only; not production RAG security proof.

## Cases

### single-high-winner

- Entity: YURI-SYNTH-2026-XYLON
- Resolution: adopt_high_confidence
- Severity: Critical
- Final source: xylon-vendor-critical (92, HIGH)
- Runtime authority: false
- Conflict log: none
- Low evidence: none
- Claim: Deterministic local multi-hop RAG conflict proof only; not production RAG security proof.

### two-high-conflict

- Entity: YURI-SYNTH-2026-XYLON
- Resolution: ambiguous_high_conflict
- Severity: AMBIGUOUS
- Final source: xylon-vendor-critical (92, HIGH)
- Runtime authority: false
- Conflict log: xylon-vendor-critical:Critical/92, xylon-research-high:High/88
- Low evidence: none
- Claim: Deterministic local multi-hop RAG conflict proof only; not production RAG security proof.

### medium-only-winner

- Entity: YURI-SYNTH-2026-XYLON
- Resolution: adopt_medium_confidence
- Severity: Medium
- Final source: xylon-medium-a (55, MEDIUM)
- Runtime authority: false
- Conflict log: none
- Low evidence: none
- Claim: Deterministic local multi-hop RAG conflict proof only; not production RAG security proof.

### low-only-unverified

- Entity: YURI-SYNTH-2026-XYLON
- Resolution: unverified_low_confidence_only
- Severity: UNVERIFIED
- Final source: xylon-low-only-a (22, LOW)
- Runtime authority: false
- Conflict log: none
- Low evidence: xylon-low-only-a:Critical/22, xylon-low-only-b:Low/10
- Claim: Deterministic local multi-hop RAG conflict proof only; not production RAG security proof.

### unanimous-noop

- Entity: YURI-SYNTH-2026-ZEPHYR
- Resolution: adopt_unanimous
- Severity: Medium
- Final source: zephyr-cisa-copy (83, HIGH)
- Runtime authority: false
- Conflict log: none
- Low evidence: none
- Claim: Deterministic local multi-hop RAG conflict proof only; not production RAG security proof.
