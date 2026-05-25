# YURI Promotion Ledger Research Packet

Generated: 2026-05-25
Owner: Codex/main
Promotion state: research
Evidence boundary: official standards review, local source-controlled evidence, DeepSeek advisory, Flash advisory, and Shintai advisory synthesis. This packet is a design input for the next hardening sprint, not a claim that the ledger is implemented.

## Decision

Build the next hardening step as a small YURI-native operator validation and recurring evidence ledger.

The ledger should extend the existing truth-promotion runtime enforcement without turning canonical memory, artifact registry, or Shintai into root truth authorities. Runtime enforcement remains the gate. The ledger records why a promotion was allowed or blocked, who approved it, what evidence was hashed, and when the evidence must be checked again.

The MVP should use append-only JSONL events under `_SYSTEM/state/promotion-ledger/` and source-controlled schema/script/tests under existing registered paths. Cryptographic operator signing is useful, but it should be a later ratchet unless key management is designed in the same sprint. The first tranche should require explicit operator approval evidence and hash-bound event records; it should not create a half-owned trust store.

## Standards Mapping

| Source | Research takeaway | YURI design consequence |
| --- | --- | --- |
| NIST AI RMF Core, https://airc.nist.gov/airmf-resources/airmf/5-sec-core/ | The core frames AI risk work as govern, map, measure, and manage, and stresses continuous lifecycle risk management. | `trusted` cannot be permanent. Promotion needs recurrence, expiry, and downgrade behavior. |
| W3C PROV-O, https://www.w3.org/TR/prov-o/ | PROV-O models interoperable provenance across entities, activities, and agents, and can be specialized for local domains. | Ledger events should separate subject, activity, agent/operator, evidence, and generated decision. |
| SLSA v1.2, https://slsa.dev/spec/v1.2/ and build provenance, https://slsa.dev/spec/v1.2-rc1/build-provenance | SLSA uses provenance and attestation structure around subject artifacts, build definitions, run details, builder identity, and invocation metadata. | YURI ledger events should bind a subject to the exact command/run/evidence hash that produced the decision. |
| in-toto Attestation Framework, https://github.com/in-toto/attestation/blob/main/spec/README.md | in-toto separates predicate, statement, envelope, and bundle layers for authenticated metadata about subjects. | YURI should keep event payload, future authentication, and event bundles separable. Do not bake key policy into the first event schema. |
| NIST SSDF SP 800-218, https://csrc.nist.gov/pubs/sp/800/218/final | SSDF is a common vocabulary for repeatable secure software development practice across the lifecycle. | Treat promotion as a repeatable verification practice with tests, evidence, and rollback/deprecation paths. |
| OpenTelemetry naming, https://opentelemetry.io/docs/specs/semconv/general/naming/ | Semantic names should be namespaced, stable, lowercase, and avoid collisions with reserved namespaces. | Use names like `claim.validation.operator_validated`, not invented mixed-case or telemetry-reserved names. |

## Local Evidence

- `_SYSTEM/Scripts/yuri-truth-promotion-enforcement.mjs` already provides runtime enforcement for registry-visible truth-promotion surfaces and canonical-memory import approval boundaries.
- `_SYSTEM/reports/YURI_TRUTH_PROMOTION_PROVING_PATH_REWORK_2026-05-25.md` maps proving-path outputs into the canonical ladder.
- `_SYSTEM/config/schemas/yuri.promotion-ladder.v0.schema.json` defines the allowed promotion states.
- `_SYSTEM/Scripts/claim-integrity-gate.mjs` scans high-risk claim language, but advisory review flagged scanner self-noise around schema constants and detector definitions as a likely follow-up fix.
- Shintai large dispatch artifact: `_SYSTEM/state/shintai-advisory/shintai-2026-05-25T15-58-51-902Z.md`.
- Shintai substance summary: proposal phase had degraded outputs from `claude-opus-audit`, `nemotron`, `minimax-m27`, and `qwen-coder`; critique degraded only `claude-opus-audit`; final synthesis was not degraded and included all required sections.
- DeepSeek Pro and Flash both converged on the same core gap: runtime enforcement exists, but promotion attempts, operator validation, and recurring evidence are not yet durably recorded.

## Codex Arbitration

Accepted:

- Add a durable promotion ledger before any `trusted` claims are allowed to rely on one-time evidence.
- Record both allow and block decisions so future audits can see failed promotion attempts.
- Require hash-bound evidence references for every upward transition.
- Require explicit operator validation before `operator_validated`; model-lane endorsement is advisory only.
- Require recurring evidence before `trusted`; stale or missing evidence must degrade or block, not silently persist.
- Keep event names within the canonical ladder. Do not introduce parallel states such as `proven` or `stale`.

Deferred or rejected for MVP:

- Do not require operator private keys or in-repo key stores in the first tranche. Public-key verification can be a v1.1 layer after key custody is designed.
- Do not switch to SQLite first. JSONL plus event hashes is easier to audit, diff, and keep out of source-controlled commits.
- Do not add cron or background writes yet. Start with a manual recurring-evidence command.
- Do not make artifact-registry validation reject all non-`trusted` artifacts. The registry intentionally contains research, docs, tests, configs, and runtime surfaces. Only promotion-sensitive artifacts should require ledger state.
- Do not auto-write canonical memory. Ledger events can authorize later operator action, but they do not themselves import memory.

## Proposed MVP Surface

New source-controlled files for the implementation sprint:

- `_SYSTEM/config/schemas/yuri.promotion-ledger-event.v0.schema.json`
- `_SYSTEM/Scripts/yuri-promotion-ledger.mjs`
- `_SYSTEM/Scripts/yuri-promotion-ledger.test.mjs`

Runtime event path:

- `_SYSTEM/state/promotion-ledger/events.jsonl`

The runtime path is append-only runtime state and should not be staged unless the operator explicitly promotes a sanitized report derived from it.

Minimal event fields:

```json
{
  "schema": "yuri.promotion-ledger-event.v0",
  "event_id": "claim.validation.operator_validated:example:2026-05-25T00:00:00.000Z",
  "event_name": "claim.validation.operator_validated",
  "generated_at": "2026-05-25T00:00:00.000Z",
  "subject": {
    "kind": "claim",
    "id": "example.claim",
    "path": "_SYSTEM/reports/example.md",
    "content_sha256": "hex"
  },
  "transition": {
    "from": "runtime_tested",
    "to": "operator_validated"
  },
  "evidence": [
    {
      "kind": "test",
      "path": "_SYSTEM/Scripts/example.test.mjs",
      "command": "node _SYSTEM/Scripts/example.test.mjs",
      "result": "pass",
      "sha256": "hex"
    }
  ],
  "operator": {
    "id": "marcel",
    "approval_reference": "operator supplied approval id or note hash",
    "approved_at": "2026-05-25T00:00:00.000Z"
  },
  "policy": {
    "ladder_schema": "_SYSTEM/config/schemas/yuri.promotion-ladder.v0.schema.json",
    "recurrence_required_for_trusted": true
  },
  "decision": "allow",
  "blockers": [],
  "warnings": [],
  "previous_event_sha256": "hex-or-null",
  "event_sha256": "hex"
}
```

## Transition Policy

| Transition | Required evidence |
| --- | --- |
| `draft -> research` | Source, advisory, or design evidence with clear research boundary. |
| `research -> fixture_ready` | Owned fixture or deterministic example, claim gate pass, and evidence hash. |
| `fixture_ready -> runtime_tested` | Local executable command passed, command recorded, output artifact or report hash recorded. |
| `runtime_tested -> operator_validated` | Explicit operator approval event, exact evidence set hash, no claim gate blockers, no protected-path evidence. |
| `operator_validated -> trusted` | At least two passing recurring evidence checks across distinct cycles, current evidence hashes still match, no supersession or revocation. |
| `any -> deprecated` | Contradiction, supersession, missing evidence, protected-path reference, failed revalidation, or operator revocation. |

Upward transitions must be explicit. Prose cannot promote a claim.

## Guardrails

- Reject protected paths before reading, hashing, or recording evidence.
- Require registered source-controlled paths or explicit runtime-state run roots for evidence references.
- Store raw runtime events under `_SYSTEM/state/`; store only synthesized reports under `_SYSTEM/reports/`.
- Include `previous_event_sha256` and `event_sha256` so tampering is detectable.
- Detect duplicate event IDs and duplicate transition attempts for the same subject/evidence hash.
- Treat lane output as advisory evidence only. It can support `research`; it cannot satisfy `operator_validated` or `trusted`.
- Record blocked transitions with `decision: "block"` when safe to do so; blocked events must not update the latest allowed promotion state.
- Keep canonical memory imports dry-run by default and live writes operator-gated.
- Keep the MVP manual. Recurrence should be a command the operator runs, not an unattended writer.

## Test Plan

- Schema test: valid event passes; missing subject, transition, evidence hash, or decision fails.
- Protected path test: evidence under `backend/data/`, `.claude/state/`, `.claude/history/`, `.claude/file-history/`, `.claude/projects/`, `.env`, `node_modules/`, or `.amp/` is rejected before read.
- Transition test: `operator_validated` without prior `runtime_tested` is blocked.
- Recurrence test: `trusted` without two passing cycles is blocked.
- Tamper test: changing a previous JSONL event invalidates hash-chain verification.
- Integration test: canonical memory import live mode requires an operator ledger event reference; dry-run remains allowed.
- Registry test: artifact registry validates the new schema/script/test entries and does not stage runtime JSONL.
- Claim gate precision test: schema enum values and claim-gate detector definitions do not create self-noise while prose remains strict.

## Implementation Sequence

1. Fix claim-gate self-noise for schema constants and scanner definitions if it reproduces locally.
2. Add ledger event schema and unit tests.
3. Add `yuri-promotion-ledger.mjs` with append, validate, hash-chain verify, latest-state, and due-recurrence commands.
4. Wire canonical-memory live import to require an operator ledger event reference instead of only a boolean approval flag.
5. Add recurring evidence check command for `operator_validated` and `trusted` candidates.
6. Register new durable files in `_SYSTEM/config/artifact-registry.json`.
7. Verify with truth-promotion tests, artifact registry validation, root architecture test, claim gate tests, and Shintai dispatch tests.

## Next Sprint Exit Criteria

- No upward promotion can occur without ledger event validation.
- `operator_validated` requires explicit operator evidence.
- `trusted` requires recurring evidence.
- Missing or changed evidence blocks or deprecates, it does not silently pass.
- No canonical memory write happens automatically.
- No protected path is read or hashed.
- Runtime ledger state remains unstaged unless a sanitized source-controlled report is intentionally generated.
