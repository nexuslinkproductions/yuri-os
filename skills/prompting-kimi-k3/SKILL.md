---
name: prompting-kimi-k3
description: "Rewrite prompts, settings, tool loops, and structured output for Kimi K3 (model id kimi-k3, OpenAI Chat Completions compatible). Use when targeting Kimi K3 and you need reasoning_effort selection (low/high/max), strict json_schema structured output, tool-call / tool_call_id loop hygiene, automatic prefix caching, or removal of unsupported sampling controls. Triggers: 'adapt this for Kimi K3', 'prompt for kimi-k3', 'kimi k3 settings / reasoning_effort / json_schema / tool loop', or $prompting-kimi-k3."
scope: harness
invocation: ability
---

# Prompting Kimi K3

Model-specific adapter for Kimi K3 (`kimi-k3`). Rewrite a prompt into an explicit K3 task contract plus a short settings note. Never call the provider, expose keys, invent parameters, or claim the route is live.

## Compose, do not duplicate

1. First load `skills/prompt-engineering/SKILL.md` and build the generic task contract there (objective, inputs, authority order, constraints, tool policy, required checks, output schema, evidence rules, pass criteria). Use objective / responsibility phrasing, never identity-roleplay.
2. Then apply the K3-specific deltas below. This skill adds only what is specific to Kimi K3; it does not restate generic prompt doctrine.

Sourced API facts and the official-vs-YURI split live in [references/official-guidance.md](references/official-guidance.md). Read it before asserting any parameter.

## Process (K3 deltas)

1. **Gate route eligibility separately, and fail closed.** Route liveness is not a prompting concern. Local OMP dispatch eligibility (registry admission history + passing latest canary) is a separate gate owned by the dispatcher. Emit the rewritten contract as an authoring artifact only; never assert the K3 route is currently dispatchable.
2. **Classify the task, then choose `reasoning_effort`.** `low` for mechanical extraction/formatting; `high` for normal coding/analysis; `max` only for genuinely hard long-horizon architecture/reasoning where added latency and cost are justified. Thinking is always on — you tune depth, you cannot disable it. Default is `max` when unset. (YURI mapping, not an official performance guarantee.)
3. **Compile the contract explicitly:** objective; bounded evidence (name the exact files/inputs, not "the codebase"); allowed tools; constraints; acceptance criteria; output schema.
4. **Preserve stable long prefixes for automatic caching.** Caching is automatic for byte-stable prefixes over 256 tokens. Put stable instructions and tool definitions first, keep them byte-identical across turns, and place volatile content last.
5. **Use strict JSON Schema when machine parsing matters.** Set `response_format.type=json_schema` with `strict:true` (all keys `required`, `additionalProperties:false`, nullable via union types), and parse the final `message.content` — not `reasoning_content`.
6. **Keep tool-loop history complete.** Append the complete assistant message (with its `tool_calls`), not only `content`; return each tool result with its matching `tool_call_id`. Dynamic tool declarations placed in a system message must remain in subsequent history. `tool_choice=required` forces a first-turn call.
7. **Remove unsupported sampling controls.** Omit `temperature`, `top_p`, `n`, `presence_penalty`, `frequency_penalty` — the API fixes them. Do not add knobs absent from the reference.
8. **Preserve task-specific proof; skip blanket self-critique.** Keep explicit negative checks and acceptance evidence (committed-state checks, test output, no-inference guards). Do not add generic "double-check your work" prose when the parent runner already owns tests and review.

## Settings matrix

| Setting | Value / action |
|---|---|
| Model / base | `kimi-k3` · `https://api.moonshot.ai/v1` (OpenAI Chat Completions compatible) |
| `reasoning_effort` | `low` mechanical · `high` normal coding/analysis · `max` hard long-horizon (default `max`) |
| Answer field | parse `message.content`; ignore `reasoning_content` for the result |
| Sampling controls | omit `temperature` / `top_p` / `n` / `presence_penalty` / `frequency_penalty` (fixed, not tunable) |
| `max_completion_tokens` | default 131072; up to 1048576 |
| Structured output | `response_format.type=json_schema`, `strict:true` |
| Tools | OpenAI function defs; `tool_choice=required` forces first turn; keep full assistant message + matching `tool_call_id` |
| Caching | automatic for byte-stable prefixes > 256 tokens; keep long prefixes first and stable |
| Vision | content is an array of objects; no public image URLs (base64 or `ms://` file id) |
| Web search | official search is being updated; avoid for production paths |

## Transformations

### (a) Long-horizon coding task with tools + committed-state proof

Raw: "Refactor the auth module onto the new token service and make sure it works."

Rewritten K3 contract:

```
## Objective
Migrate src/auth/* from the legacy signer to TokenService; no behavior change for callers.

## Evidence (bounded)
- src/auth/session.ts, src/auth/middleware.ts, src/services/token-service.ts
- tests/auth/*.test.ts

## Tools
- Allowed: read, edit, run tests. Forbidden: dependency installs, unrelated refactors.

## Constraints
- Keep the public authenticate() signature stable. Migrate every caller; leave no shim.

## Acceptance (proof, not assertion)
- tests/auth/* green — paste the run summary.
- git show --stat HEAD lists only the auth/token files named above.
- Negative check: grep shows zero remaining imports of the legacy signer.

## Output
- Summary: files changed, checks run with their output, residual risk.
```

Settings note: `reasoning_effort=high` (raise to `max` only if the refactor spans many interacting modules); text output; preserve the complete assistant + tool history with matching `tool_call_id` across the loop; keep the system/tool prefix byte-stable for caching; omit sampling controls.

### (b) Structured extraction task

Raw: "Pull the key fields out of these invoices."

Rewritten K3 contract:

```
## Objective
Extract fields from each supplied invoice into one object per invoice.

## Evidence (bounded)
- Only the invoice documents provided in this request.

## Constraints
- Extract only fields present in the source. Use null when a field is absent; never infer.

## Acceptance
- Output validates against the schema below.
- Negative check: no field is populated by inference — each non-null value is present verbatim in its source invoice.

## Output schema (response_format.json_schema)
{
  "name": "invoice_extraction",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["invoices"],
    "properties": {
      "invoices": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["invoice_id", "issue_date", "total", "currency"],
          "properties": {
            "invoice_id": { "type": ["string", "null"] },
            "issue_date": { "type": ["string", "null"] },
            "total":      { "type": ["number", "null"] },
            "currency":   { "type": ["string", "null"] }
          }
        }
      }
    }
  }
}
```

Settings note: `reasoning_effort=low`; `response_format.type=json_schema` with `strict:true`; parse `message.content`; omit sampling controls.
