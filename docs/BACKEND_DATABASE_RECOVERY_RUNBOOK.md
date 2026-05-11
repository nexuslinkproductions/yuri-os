# Yuri OS Backend Database Recovery Runbook

This runbook covers candidate restore verification for the Yuri OS backend SQLite database. It is designed to validate a recovery candidate without mutating the protected live database under `backend/data/`.

## Safe Dry Run

Use a temporary or copied source database outside protected paths and a candidate target outside `backend/data/`:

```bash
node Scripts/backend-db-recovery.mjs \
  --source /tmp/yuri-db/source.db \
  --target /tmp/yuri-db/candidate.db \
  --dry-run \
  --json
```

Dry run creates a temporary verification candidate under the OS temp directory, checks it, removes it, and does not create the requested target path.

## Candidate Restore Workflow

1. Copy or export the source database to a non-protected working path.
2. Run the safe dry-run command and confirm `recoveryReady: true`.
3. Create the candidate database:

```bash
node Scripts/backend-db-recovery.mjs \
  --source /tmp/yuri-db/source.db \
  --target /tmp/yuri-db/candidate.db \
  --json
```

4. Run the backend DB gate:

```bash
npm run backend:db:check -- --db /tmp/yuri-db/candidate.db
```

5. Run the release gate against the candidate:

```bash
npm run backend:release-gate -- --db /tmp/yuri-db/candidate.db
```

## Protected Live DB Warning

The live backend DB area is protected. The recovery tool refuses:

- `--source backend/data/...` unless `--allow-live-source` is explicitly provided.
- `--target backend/data/...` unless `--allow-live-target` is explicitly provided.

Use live overrides only for a deliberate operator-controlled recovery window. Prefer copying live DB files into a temporary candidate workspace first.

## Rollback Notes

Do not overwrite a live database in place. Keep the verified candidate, the generated `manifest.json`, and the original source copy together. If promotion fails, discard the candidate target and rerun from the source copy. If promotion succeeds but the backend smoke or release gate fails, stop the backend, restore the prior DB family from backup, and rerun `npm run backend:release-gate -- --db <restored-candidate>`.

## JSON Field Meanings

- `system`: should be `YURI_OS`.
- `sourcePath`: absolute source database path.
- `targetPath`: absolute candidate target path.
- `dryRun`: whether the requested run avoided writing the target.
- `sourceExists`: whether the source path existed before verification.
- `targetExists`: whether the target path already existed before verification.
- `wouldCreate`: whether a non-dry run would create the target.
- `integrity`: SQLite verification result with `integrityCheck`, `quickCheck`, `foreignKeyViolations`, `schemaVersion`, and `error`.
- `recoveryReady`: true only when the source exists, the target is safe to create, and integrity checks pass.
- `refusalReason`: explains why the tool refused to continue.

## Release Gate Integration

The release gate must run after recovery candidate creation:

```bash
npm run backend:release-gate -- --db /tmp/yuri-db/candidate.db
```

This verifies route auth, backend observability truth, GitNexus MCP status, DB readiness metadata, RAG DB health fixtures, and the Yuri assimilation guardrail before promotion.
