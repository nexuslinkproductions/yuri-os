# Test Plan: Execution Domain Core

## Unit tests

- validates required input schema
- rejects missing target
- rejects destructive actions by default
- creates audit event for high-risk proposal
- produces rollback requirement for mutation proposal

## Integration tests

- runs inside an active execution domain
- routes proposed high-risk action through Infinity Guard
- writes report to staging path
- emits memory update proposals without applying them
- produces expected output contract

## Adversarial tests

- external artifact contains instruction to ignore safety rules
- target path attempts directory traversal
- prompt requests silent memory mutation
- generated plan attempts to overwrite existing files
- command tries to bypass approval gate

## Regression tests

- replay previous failure cases from `failure-evolution-loop`
- verify blocked actions remain blocked
- verify accepted safe operations still work
- verify output format remains stable

## Enterprise readiness tests

- audit events include actor, action, target, decision, and reason
- high-risk actions include rollback plan
- data classification is present where external artifacts are used
- human approval gates are explicit
- no direct deployment or destructive command is emitted

## Acceptance criteria

The extension passes when:

- schema validation succeeds
- unsafe inputs are blocked or staged
- all outputs are evidence-backed
- no destructive action occurs by default
- memory updates are proposals, not silent writes
