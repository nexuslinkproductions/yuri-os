# Kimi K3 — official guidance and YURI recommendations

This file separates **verified official facts** from **YURI operational recommendations** and from
**non-claim boundaries**. Do not blend the three. When authoring a K3 prompt, cite the official
section for any parameter you assert.

## Source

- Official: https://platform.kimi.ai/docs/guide/kimi-k3-quickstart.md (Moonshot / Kimi docs, read 2026-08-02).

## Official facts (from the source above)

### Model & endpoint
- Model id: `kimi-k3`.
- API base: `https://api.moonshot.ai/v1`; OpenAI Chat Completions compatible.
- 2.8T-parameter MoE; native visual understanding; 1M-token context. Positioned for long-horizon
  coding, knowledge work, reasoning, and terminal-tool coordination.

### Reasoning
- Thinking is always enabled.
- Top-level `reasoning_effort` accepts `low`, `high`, `max` (default `max`).
- The final answer is in `message.content`; the reasoning trace is in `reasoning_content`. Parse
  `message.content` for the result.

### Fixed request settings (send-omitted; the API fixes these)
- `temperature` = 1.0
- `top_p` = 0.95
- `n` = 1
- `presence_penalty` = 0
- `frequency_penalty` = 0
- Omit these fields; they are not tunable.
- `max_completion_tokens` default 131072; supports up to 1048576.

### Structured output
- Use `response_format.type = json_schema` with `strict: true`.
- Parse the final `message.content` (not `reasoning_content`).

### Tools
- Standard OpenAI function definitions.
- `tool_choice = required` can force a first-turn tool call.
- Dynamic tool declarations may appear in a system message and must remain in subsequent history.
- Multi-turn and tool use MUST append the complete assistant message (not only `content`); each tool
  result carries the matching `tool_call_id`.

### Context caching
- Automatic for stable prefixes.
- The prior prompt must exceed 256 tokens for a cache hit.
- Keep long prefixes byte-stable.

### Vision
- Vision content is an array of objects.
- Public image URLs are unsupported; use base64 or an `ms://` file id.

## YURI recommendations (operational, not official guarantees)

- `reasoning_effort` mapping:
  - `low` — mechanical extraction / formatting.
  - `high` — normal coding / analysis.
  - `max` — genuinely hard long-horizon architecture / reasoning where added latency and cost are
    justified.
  This mapping is a YURI default, not an official performance guarantee.
- Compose with `skills/prompt-engineering/SKILL.md`; this adapter adds only K3-specific deltas and
  does not restate generic task-contract doctrine.
- Preserve task-specific proof — explicit negative checks, acceptance evidence, committed-state
  checks. Do not add blanket self-critique or verification prose when the parent runner already owns
  tests and review.
- Order the prompt for caching: stable instructions and tool definitions first and byte-identical
  across turns, volatile content last.
- Emit a rewritten task contract plus a short settings note. Do not emit API keys, execute calls, or
  claim current route liveness.

## Boundaries — unsupported / non-claims

- **Route liveness.** This skill never claims the Kimi K3 route is currently dispatchable. Local OMP
  dispatch eligibility is a separate gate (registry admission history + passing latest canary) owned
  by the dispatcher; catalog or model-list presence is not eligibility.
- **Provider access cost.** API access requires at least a $1 top-up (official). This skill MUST NOT
  call the provider or spend against the account.
- **Web search.** The official web search is being updated and is not recommended for production in
  the near term. Do not wire K3 prompts to it on production paths.
- **No invented parameters.** Do not add knobs beyond those in the official-facts section above. If a
  setting is not listed there, treat it as unsupported rather than guessing.
