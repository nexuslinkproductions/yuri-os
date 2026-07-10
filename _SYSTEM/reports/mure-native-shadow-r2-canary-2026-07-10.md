# MURE native shadow R2 canary — 2026-07-10

## Scope

One bounded, read-only native R2 task was observed through both the live native reducer and the provider-neutral delegation ledger. The shadow observer did not select, execute, retry, or alter a route.

Task: count `NATIVE_DISPATCH_SHADOW_SCHEMA_VERSION` in `_SYSTEM/mure/native-dispatch-shadow.mjs` and report the one scoped file.

## Native route evidence

| Purpose | Agent | Requested model | Resolved model | Run ID | Result |
|---|---|---|---|---|---|
| Producer | `mure-synthesist` | `minimax-portal/MiniMax-M3` | `minimax-portal/MiniMax-M3` | `0420b1a8-6349-4132-b45f-4a7f3e1eb456` | completed |
| Verifier | `mure-calibrator` | `anthropic/claude-sonnet-5` | `anthropic/claude-sonnet-5` | `e3c1fc2b-967a-4ac6-b44b-7604d59b938c` | `pass` |

- Producer child: `agent:mure-synthesist:subagent:e403cc46-fbc9-4bd2-9092-76e888031054`
- Verifier child: `agent:mure-calibrator:subagent:de2b127d-c82d-44eb-9e40-8577e16d3bb2`
- Availability fallback used: no
- Quality escalation used: no

## Deterministic evidence

```text
TERM_COUNT term=NATIVE_DISPATCH_SHADOW_SCHEMA_VERSION count=4
FILE_COUNT file=_SYSTEM/mure/native-dispatch-shadow.mjs count=1
```

The producer reported the same counts. The independent verifier returned exactly `{"verdict":"pass"}`.

## Lifecycle comparison

| Surface | Terminal state | Additional evidence |
|---|---|---|
| Native reducer | `passed` | terminal action `none/task-passed` |
| Shadow ledger | `accepted` | 2 admissions, 6 observations, nothing awaiting |

The replay required exact agreement on task ID, entry ID, child session key, run ID, requested model, and resolved model before either lifecycle advanced.

## Residual finding

The company caster did not recognize the requested `researcher` role and defaulted it to `engineer`. The governed R2 route still selected the intended MiniMax producer and Sonnet verifier, so the canary result is valid. Role-name normalization remains a separate documentation/catalog repair.

## Promotion ruling

This is one successful observation trial, not production-readiness evidence. Keep the adapter shadow-only. Next, repeat the same contract across failure and provider-route canaries before enabling shadow recommendations.
