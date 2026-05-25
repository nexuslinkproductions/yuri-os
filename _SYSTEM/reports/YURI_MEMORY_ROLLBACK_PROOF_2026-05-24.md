# YURI Memory/RAG Rollback Proof

Generated: 2026-05-24T19:45:06.852Z

## Purpose

This report proves deterministic local rollback behavior for poisoned memory/RAG candidates. It is an in-memory simulation and does not touch live memory runtime files.

## Boundaries

- owned-local-synthetic-fixtures-only
- in-memory-simulation-only
- no protected memory runtime reads
- no live memory writes
- no production memory safety claim

## Summary

- Cases: 5
- Rolled back: 3
- No snapshot: 1
- Idempotent no-op: 1
- Claim: Deterministic local memory/RAG rollback proof only; not production memory safety proof.

## Cases

### duplicate-key-rollback

- Status: ROLLED_BACK
- Reason: duplicate_key
- Before count: 3
- After fault count: 4
- Final count: 3
- Restored snapshot: true
- Faulty absent: true
- Runtime authority: false
- Claim: Deterministic local memory/RAG rollback proof only; not production memory safety proof.

### no-snapshot-found

- Status: NO_SNAPSHOT_FOUND
- Reason: no_snapshot
- Before count: 0
- After fault count: 0
- Final count: 0
- Restored snapshot: true
- Faulty absent: true
- Runtime authority: false
- Claim: Deterministic local memory/RAG rollback proof only; not production memory safety proof.

### valid-ingests-then-faulty

- Status: ROLLED_BACK
- Reason: duplicate_key
- Before count: 2
- After fault count: 3
- Final count: 2
- Restored snapshot: true
- Faulty absent: true
- Runtime authority: false
- Claim: Deterministic local memory/RAG rollback proof only; not production memory safety proof.

### idempotent-noop

- Status: NOTHING_TO_ROLLBACK
- Reason: duplicate_key
- Before count: 3
- After fault count: 4
- Final count: 3
- Restored snapshot: true
- Faulty absent: true
- Runtime authority: false
- Claim: Deterministic local memory/RAG rollback proof only; not production memory safety proof.

### confidence-threshold-abort

- Status: ROLLED_BACK
- Reason: confidence_below_threshold
- Before count: 3
- After fault count: 4
- Final count: 3
- Restored snapshot: true
- Faulty absent: true
- Runtime authority: false
- Claim: Deterministic local memory/RAG rollback proof only; not production memory safety proof.
