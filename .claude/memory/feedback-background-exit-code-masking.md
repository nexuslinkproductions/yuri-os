---
name: feedback-background-exit-code-masking
description: "A background task's reported exit code is the LAST statement's — `npm test; echo X` masks a RED suite as exit 0; read the log, never trust the wrapper code"
metadata: 
  node_type: memory
  tier: hot
  scope: claude-behavioral
  trig: 
    - npm test
    - background test
    - baseline green
    - exit code
    - TEST_EXIT
    - run_in_background
    - verify tests
    - is it green
  refs: 
    - feedback-prose-not-outrun-wiring
    - live-recall-not-stale-trackers
  type: feedback
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

RULE: Never trust a background/compound command's reported exit code as the result of the test inside it. The task-notification + `$?` report the LAST statement's exit, not the suite's.

WHEN: any `run_in_background` test, or any `cmd1 && cmd2; echo "X=$?"`, or `npm test > log; echo done` shape — especially when claiming a suite is green/baseline-clean.

DO: read the actual log/test output (grep for AssertionError / not ok / TEST_EXIT line) and confirm the SUITE's exit, before asserting pass. Put the exit-capture as the SOLE final statement OR inspect the log, not the notification.

DONT: report "npm test exit 0 → green on HEAD" off a background notification when the command was `npm test ...; echo "TEST_EXIT=$?"` — the echo's 0 masks a RED suite. (Did exactly this 2026-06-13: claimed a green baseline; the log said TEST_EXIT=1, root-architecture failed first. False-green for ~2 cycles.)

WHY: trailing `echo`/`&&`-chains reset `$?`; the harness reports the process group's final exit. The conscience-disease is the same as "domain gates silently RED on HEAD" — verify against the real artifact, not a proxy.

SEE: [[feedback-prose-not-outrun-wiring]] (verify vs live runtime), [[live-recall-not-stale-trackers]].
