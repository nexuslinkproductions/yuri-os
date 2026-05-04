# Yuri Incident Log

**advisory_only**: true
**local_truth_claim**: false
**schema_version**: 1

Purpose: Records AI output incidents, evidence conflicts, and trust escalations.
Satisfies NIST AI RMF MANAGE function and EU AI Act Art. 12 spirit.

## Incident Registry

| incident_id | date | lane | description | severity | resolution | status |
|---|---|---|---|---|---|---|
| 001 | 2026-05-04 | 08CX-SCRAPLING | Scrapling v0.2.99 CLI `extract` subcommand unavailable (API changed). Python API works; T1/T2 verified. | low | documented in 07_scrapling_capture_integration.md | closed |
