# Feature Spec: contract-dispatch-drift-reconcile

**Feature Branch**: `contract-dispatch-drift-reconcile`

**Created**: 2026-05-15

**Status**: Draft

**Input**: Reconcile camelCase contract lane keys vs kebab-case offload.sh dispatch tokens so _SYSTEM/Scripts/offload-contract-dispatch-check.mjs exits 0 (currently exits 1).

## 1. Title + Summary

**Reconcile Contract Lanes ↔ Dispatch Tokens Drift**

Add a `dispatchTokens` array field to every lane in `_SYSTEM/Scripts/offload-contract.mjs` so the dispatch-drift checker can perform exact bidirectional reconciliation between contract lanes and `_SYSTEM/Scripts/offload.sh` dispatch surfaces, making `_SYSTEM/Scripts/offload-contract-dispatch-check.mjs` exit 0.

## 2. Goal

`node _SYSTEM/Scripts/offload-contract-dispatch-check.mjs` exits 0 (was 1).

## 3. Non-Goals

- Do NOT auto-generate `offload.sh` from the contract.
- Do NOT rename existing dispatch tokens (would break user muscle memory).
- Do NOT remove dispatch-only surface tokens from `offload.sh` (e.g., deprecated DeepSeek aliases, legacy Claude versions).
- Do NOT change `list_models`, `is_direct_lane_token`, or `dispatch_model` in `offload.sh` unless strictly required to close a drift row.

## 4. Stakeholders

- NUDIMMUD operators who rely on `offload -l` and direct `-m` invocations.
- Future Spec Kit campaigns that depend on consistent routing between the contract and dispatch surfaces.
- The checker itself (`offload-contract-dispatch-check.mjs`), which gates drift visibility.

## 5. Acceptance Criteria (Tasks)

- [ ] `node _SYSTEM/Scripts/offload-contract-dispatch-check.mjs` exits 0 (was 1)
- [ ] Every contract lane has a `dispatchTokens` array field listing the kebab-case tokens in `offload.sh` that route to that lane
- [ ] Every dispatch token listed in `is_direct_lane_token` + `dispatch_model` + `list_models` is referenced by at least one contract lane's `dispatchTokens` (unless explicitly documented as a deprecated/legacy surface-only alias)
- [ ] No regression in `offload-contract-regression.test.mjs`
- [ ] `offload --list` output remains identical to current (no visual change for users)

## 6. Constraints

- Anime DNA gates apply (evidence-forward, no speculation).
- Codex-primary for implementation (gpt-5.5 / gpt-5.4-mini).
- No T7 writes; keep changes scoped to `_SYSTEM/Scripts/offload-contract.mjs` lanes object and, minimally, `_SYSTEM/Scripts/offload-contract-dispatch-check.mjs`.
- Preserve all existing dispatch behavior in `offload.sh`.
- Max 90 lines in this spec file.

## 7. Risks

- **Missed alias breaks routing**: if a `dispatchTokens` entry doesn't match the token an operator types, `offload -m <token>` fails. Mitigation: regression test + dispatch-check both pass; review every `is_direct_lane_token` case and `list_models` entry.
- **Over-normalization**: collapsing too many aliases into one lane may break the "smallest lane" contract principle. Mitigation: each lane's `dispatchTokens` should only include tokens that genuinely route to that lane.

## 8. Open Questions

- Should `codex` (= gpt-5.5 alias in `offload.sh`) be a `dispatchToken` of the `gpt55` lane, or should `codex` get its own contract lane entry? Current `offload.sh` treats `codex`, `codex-high`, `codex-full` as aliases → gpt-5.5; proposal: include them in `gpt55.dispatchTokens`.
- Should deprecated DeepSeek aliases (`deepseek-r1:8b`, `deepseek-r1:latest`, `deepseek-v2:16b`) that appear only in `list_models`/`is_direct_lane_token` be added as `dispatchTokens` of the `deepseek` lane, or left surface-only with a documented exemption in the checker?
