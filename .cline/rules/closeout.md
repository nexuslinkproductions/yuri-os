# Closeout Reference (Cline)

## Trigger Words

`end of transmission`, `/eot`, `closeout`, `run EOT`

## Procedure

1. Run `node Scripts/yuri-closeout.mjs --path <files>`.
2. Pass only exact scoped paths touched in the session.
3. Never run broad `git status`, `git diff`, `find`, or unbounded `grep`.
4. Never mutate, stage, commit, or install during closeout.
5. If no scoped paths exist, report repo metadata only (branch + HEAD).

## Rules

- Local truth outranks model text — verify before claiming.
- Compact report only: RESULT | CURRENT | SCOPED_STATUS | VALIDATION | NON_CLAIMS | NEXT_RECOMMENDED.
- No raw dumps, no tables, no trailing summaries.
