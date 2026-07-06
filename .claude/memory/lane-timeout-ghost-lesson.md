---
name: lane-timeout-ghost-lesson
description: "Debugging lesson (2026-06-05, cost ~an hour): a 'lane is broken/sandboxed' phantom was actually MY shell `timeout` wrapper truncating the live node call to empty output. Suspect your own recent change + test-harness first; verify vs LIVE runtime not dry-run/happy-path; and NEVER wrap a live lane dispatch in shell `timeout`."
metadata:
  node_type: memory
  type: feedback
  tier: 1
  scope: project
  trig:
    - timeout
    - lane broken
    - empty output
    - sandbox
    - AggregateError
    - debug lane
    - ai llm empty
    - verify live runtime
  refs:
    - prose-not-outrun-wiring
    - "[[lane-context-front-load]]"
  originSessionId: abb3b542-bc65-4d11-a095-be1c5ca218f0
---

RULE: when something you JUST changed appears broken, suspect your own change + your test harness BEFORE externalizing to "the environment / a sandbox" — and verify the operational claim against LIVE runtime, never a dry-run or happy-path test (the live network/exec path is where the truth hides).

WHEN: debugging a lane/tool/dispatch that "returns empty" or "is sandboxed" — especially right after editing it.

DO: bisect with the method that WORKS vs the one that fails (import-call vs CLI-entry; with-wrapper vs without); add an env-gated stage trace (`LLM_LANE_TRACE`) to see the exact last line reached; run an A/B isolating ONE variable; read the actual captured stderr with a non-shell tool (the Read tool) to dodge output pollution.

DONT: wrap a live lane dispatch in the shell `timeout` command (`timeout 100 node llm-lane.mjs …` / `timeout … ai llm …`) — it truncates the in-flight request to empty output + exit 0, which masquerades as a broken/sandboxed lane. The lane self-limits via its own AbortController (`cfg.timeout_ms`); use the harness Bash-tool `timeout` PARAMETER for an outer cap. Also: the kagami `AggregateError/boot: kagami-start.sh` noise is a RED HERRING (disabled facade, now gated in `29e5b16c`) — don't let it masquerade as a lane error.

WHY: this exact trap cost ~an hour chasing a phantom (process.exit flush → sandbox → flush again → instrument) while the lane was never broken; the owner was right ("we had it going today" — he runs it in a PTY without `timeout`).

SEE: `_SYSTEM/LANE-MANUAL.md` §10.1 · [[prose-not-outrun-wiring]] · [[lane-context-front-load]].
