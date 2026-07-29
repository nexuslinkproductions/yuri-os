# NEXUS BACKEND — engineered core spec (cyber-pattern applied)

Built bit by bit as Marcel's digital workspace. Every module below applies a
battle-tested pattern mined from the cyber skills (recon 2026-07-29,
`.claude/skills/cyber-*`). Zero npm dependencies; node builtins only
(`node:sqlite`, `node:crypto`, `node:http`).

## Module 1 — Object store (`backend/store.mjs`)
Pattern: STIX 2.1 typed objects (cyber-processing-stix-taxii-feeds) +
OpenCTI connector taxonomy (cyber-building-ioc-enrichment-pipeline-with-opencti).

- All workspace entities as **typed objects**: `signal`, `draft`, `post`,
  `media`, `reference-pack`, `benchmark`, `capture`, `decision`, `note`.
- Every object: `{ id, type, created, modified, confidence (0-100),
  markings: ["private"|"public-ready"|"internal"], data: {...} }`.
- **Relationships** as first-class rows: `derived-from`, `references`,
  `approved-by`, `posted-to`, `captured-from`, `synthesized-into`.
- Storage: `node:sqlite` at `_SYSTEM/state/nexus/nexus.db`, WAL mode.
  Drafts on disk remain the human-editable surface; the store INDEXES them
  (file = source of truth for text, store = source of truth for graph).

## Module 2 — Policy gate (`backend/policy.mjs`)
Pattern: cyber-securing-agentic-ai-tool-invocation (deny-by-default registry
+ tamper-evident audit).

- **Action registry**: every mutation is a named action
  (`draft.edit`, `draft.approve`, `draft.disapprove`, `post.execute`,
  `media.write`, `store.delete`) with a policy fn returning allow/deny +
  reason. Deny by default for anything unregistered.
- `authorize(actor, action, args)` → decision + **hash-chained audit event**
  to `_SYSTEM/state/nexus/audit.jsonl`: `{ts, actor, action, args_sha256,
  decision, reason, prev_hash, hash}`. Chain verifiable offline.
- The approval rule lives HERE, not in the UI: `post.execute` denies unless
  the draft object has relationship `approved-by → marcel`.

## Module 3 — Detection rules (`backend/rules.mjs`)
Pattern: cyber-building-detection-rules-with-sigma (detection-as-code).

- YAML-ish rule files in `backend/rules/*.json`:
  `{ id, description, match: {action?, actor?, object_type?, field_op},
     severity, score }`.
- Rules fire on audit events: e.g. `post-attempt-unapproved` (deny events on
  post.execute), `draft-edited-after-approval`, `media-missing-on-approve`,
  `foreign-writer` (actor not in allowlist writing store objects).
- Rule hits → alert records into the store (`alert` object type).

## Module 4 — Risk-based alerting (`backend/alerts.mjs`)
Pattern: cyber-implementing-alert-fatigue-reduction (RBA).

- Alerts accumulate risk per actor+rule over a rolling window; the UI shows
  a banner only when cumulative score ≥ threshold (default 75). No
  per-event noise.

## Module 5 — Verification toolkit (`backend/verify.mjs`)
Pattern: cyber-verifying-build-provenance-with-slsa-sigstore +
cyber-detecting-aws-credential-exposure-with-trufflehog +
cyber-generating-and-analyzing-sboms.

- `nexus verify <path>`: secret-pattern sweep (trufflehog-style regexes),
  file inventory + sha256 manifest (SBOM-lite), and audit-chain
  verification (`--audit` flag re-verifies the hash chain). Gate for any
  spinoff release AND for the app's own releases.

## Module 6 — Anomaly watch (later, `backend/anomaly.mjs`)
Pattern: IsolationForest baseline-deviation
(cyber-detecting-anomalies-in-industrial-control-systems) +
beaconing CV (cyber-hunting-for-beaconing-with-frequency-analysis).

- Over `engagement.jsonl` + lane telemetry once M3 lands: flag posts whose
  engagement deviates >2σ from the per-platform baseline; flag periodic
  loop behavior in agents (CV < 0.20). Parked until data exists.

## Wiring
- `server.mjs` delegates ALL mutations through `policy.authorize` first,
  writes objects to `store`, emits audit events; `rules` consume events;
  `alerts` surface in UI banner.
- `social-mcp.mjs` verbs call the same `policy.authorize` (actor =
  "mcp:<client>") so UI and agents share one gate.

## Build order
1. store + policy + audit (the spine)
2. rules + alerts (the watch)
3. server + social-mcp wiring (one gate everywhere)
4. verify toolkit (release gate)
5. anomaly (when data exists)
