These are example inputs for the YURI-ADW gate CLI:
- `plan-manifest.example.json` is a realistic planning manifest (3 discrete caching strategies + 1 continuous knob).
- `validate-outcome.example.json` is a matching validate payload shaped like real `PASS_STATE` fixtures.

Run:
1) `node _SYSTEM/Scripts/adw-gate.mjs plan --input plan-manifest.example.json`
2) `node _SYSTEM/Scripts/adw-gate.mjs validate --input validate-outcome.example.json`

Expected behavior:
- Success: command prints JSON and exits `0`
- Gate fail: command prints JSON and exits `3`
- Input/schema/runtime error: prints message and exits `2`

Env notes:
- `ADW_LEDGER_FILE` points to the prediction ledger path.
- `YURI_ENERGY_OBSERVABILITY=1` enables energy trace writing during validate.
