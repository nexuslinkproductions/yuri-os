# MURE Sol-first native OpenClaw architecture — 2026-07-09

## Decision

Use OpenClaw as the native execution/control plane and MURE as the policy + learned routing layer.

- OpenClaw owns agent identities, sessions, `sessions_spawn`, model overrides, auth resolution, lifecycle, nesting, concurrency, and fallback execution.
- MURE owns role eligibility, hard governance, quota/cost gates, candidate features, MLP scoring, calibration, and telemetry.
- This is task/session-level sparse expert routing. It is not token-level neural MoE and OpenClaw alone does not train or execute the MURE MLP.

## Live state proved in this pass

- `mure-yuri` is the default native agent with primary `openai/gpt-5.6-sol`, thinking `high`, and temporary fallback `anthropic/claude-opus-4-8`.
- The catalog contains eight complete Sol pilot variants and 26/26 complete base roles.
- Native configured-role dispatch completed successfully as `mure-mechanic` on `opencode-go/deepseek-v4-flash`.
- Live config validation and `_SYSTEM/Scripts/mure-fleet-validate.mjs` are green.
- The sync path now rejects concurrent config changes, writes atomically, and keeps `~/.openclaw/openclaw.json.bak-mure-sync` as a rollback copy.

## Sol pilot matrix

| Role | Sol use | Selection | Security/cost boundary |
|---|---|---|---|
| `mure-yuri` | Main input, synthesis, tool orchestration | Default pilot | Opus fallback retained during evaluation |
| `mure-envoy` | Dense/ambiguous intake only | Explicit | Not cheap-auto eligible |
| `mure-helmsman` | Goal trees and delegation discipline | Explicit | No automatic fallback until role auth is proven |
| `mure-scout` | Final synthesis after cheap recon | Explicit | Never first-pass census |
| `mure-engineer` | Complex multi-file implementation | Explicit | Cheaper code variants remain auto-prime |
| `mure-architect` | Architecture and long-context system design | Explicit | Non-security until calibrated |
| `mure-adjudicator` | Non-security adversarial review | Explicit | Security anchor unchanged |
| `mure-advisor` | Heavy non-security escalation | Explicit | Never the per-turn watcher |

Terra and Luna are registered and visible in the model catalog, but are not seeded into role fallback chains yet. Catalog availability is not a reproducible inference or role-fit result. Terra previously hit provider overload; Luna needs a clean native rerun.

## Why native dispatch looked broken

Three independent conditions were conflated:

1. `sessions_spawn` accepted explicit configured `agentId` targets, proving routing policy and registration were active.
2. `ollama-cloud/qwen3.5:cloud` rejected the request/tool schema before inference.
3. OpenCode Go credentials were absent/stale in the selected role stores. Although local docs describe main-agent static profiles as fallbacks, this installation did not resolve `opencode-go` for the target roles until `opencode-go:default` was seeded and the live config reloaded.

Auth is resolved by target agent id. Never reuse an `agentDir`. Portable static `api_key`/`token` profiles may be seeded. OAuth refresh credentials must not be copied between role stores. Until a role completes its own OpenAI OAuth login, Sol role experiments should run under the authenticated Yuri agent scope with an explicit role contract and model override.

## Practical MoE/MLP boundary

### Native OpenClaw primitives

- stable role identities in `agents.list[]`
- `sessions_spawn({agentId, model, thinking})`
- target allowlists via `subagents.allowAgents`
- depth and fan-out caps
- model fallbacks and per-run overrides
- per-agent auth stores and session isolation
- completion events and session telemetry

### MURE logic that remains custom

- task feature extraction
- hard eligibility and owner/security gates
- role × variant candidate construction
- quota pressure and cost tiers
- MLP scoring and confidence thresholds
- deterministic fallback when the MLP is cold/uncertain
- outcome labeling, Brier calibration, and learning updates

The existing `_SYSTEM/Scripts/fleet-router-mlp.mjs` is advisory and scores coarse substrate candidates. It must be extended to score seeded role variants, not allowed to invent variants, and connected to native `sessions_spawn` after governance gates. `_SYSTEM/Scripts/fleet-dispatch.mjs` is a separate legacy subprocess/substrate dispatcher; do not mistake it for native OpenClaw agent dispatch.

## Minimum router contract

1. Build candidates only from the selected role's catalog `variants[]`.
2. Apply hard gates first: role match, autonomy, protected surfaces, security anchor, auth reachability, quota, cost tier, and concurrency.
3. Score surviving candidates with the MLP.
4. Require a confidence margin; otherwise use deterministic catalog order.
5. Dispatch through native `sessions_spawn` with explicit role/model/thinking.
6. Cap orchestration at depth 2 and default parallelism at 3.
7. Record role, variant, selection mechanism, model, latency, tokens, result label, escalation count, and outcome in `_SYSTEM/state/role-variant-ledger.jsonl`.
8. Never learn across hard-gate violations; the MLP re-ranks only the seeded eligible set.

## Next gates

- Benchmark Sol input quality against the previous main binding on 10–20 real turns.
- Run one explicit Sol architecture task and one implementation task under Yuri scope.
- Re-test Terra and Luna natively with fixed prompts and capture exact provider outcomes.
- Add a native-dispatch adapter between the MURE selector and `sessions_spawn`; keep the existing router advisory until replay tests show calibration better than deterministic ordering.
- Diagnose Cursor's OpenClaw JSONL/parser integration separately; direct Cursor CLI success does not make the provider integration healthy.
