---
name: "mure-role-variant-matrix"
description: "MURE role × model variant matrix. One role, several tuned variants. Seeded from audit; MLP re-ranks. Cheap auto, heavy surfaced."
scope: harness
invocation: workflow
---

# MURE Role × Model Variant Matrix

## Purpose

One MURE role, several model variants — each variant tuned to a specific model's profile (tools / thinking / max_tokens / system sections) without changing the role's core function. Lets the orchestrator pick the right model for the right job while staying inside the role's contract.

## Schema

A role entry in `.openclaw/agents/<role>.md` gains a `variants:` list. Repo-local `.omp/agents/` is retired and is not a MURE source. Each variant:

```yaml
variants:
  - id: "<role>-sonnet5"
    model: anthropic/claude-sonnet-5
    thinkingLevel: medium
    tools: [read, grep, glob, edit, write, bash]
    max_tokens: 16384
    systemSections: ["coding-excellence", "agentic-clean-tool-use"]
    eligibilityFlags: ["default-prime"]
    costTier: medium

  - id: "<role>-opus48"
    model: anthropic/claude-opus-4-8
    thinkingLevel: high
    tools: [read, grep, glob, edit, write, bash]
    max_tokens: 32768
    systemSections: ["apex-judgment", "narrow-prompt-reserved"]
    eligibilityFlags: ["heavy", "require-explicit-call"]
    costTier: heavy

  - id: "<role>-haiku"
    model: anthropic/claude-haiku-4-5
    thinkingLevel: low
    tools: [read, grep, glob]
    max_tokens: 4096
    systemSections: ["minimalist"]
    eligibilityFlags: ["cheap", "auto-eligible", "recon-eligible", "cheap-research-only"]
    costTier: cheap
```

The role's top-level `model:`, `thinkingLevel:`, `tools:` fields remain for backwards compatibility and act as the role baseline; `variants[]` overrides take precedence when populated.

### Backwards compatibility

If `variants` is absent, MURE falls back to the legacy single-binding (`model:` + `thinkingLevel:` + `tools:`). Existing single-model roles keep working without modification.

## Per-variant fields (full set)

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | unique within the role; `<role>-<model-shortname>` convention |
| `model` | string | yes | exact provider/model string |
| `thinkingLevel` | enum | yes | `off` / `low` / `medium` / `high` / `xhigh` (model-specific meaning). `max` is not an OpenClaw value. |
| `tools` | string[] | yes | subset of the role's allowed tools |
| `max_tokens` | int | yes | maximum output tokens for this variant |
| `systemSections` | string[] | yes | which role-body sections apply to this variant |
| `eligibilityFlags` | string[] | no | `cheap`, `default-prime`, `medium`, `heavy`, `require-explicit-call`, `security-only`, `auto-eligible`, `recon-eligible`, `cheap-research-only`, etc. |
| `costTier` | enum | yes | `cheap` / `medium` / `heavy` / `apex` — used by selector |
| `quota` | enum | no | subscription-quota binding (e.g. `claude-pro-x5`, `z-ai-coding-plan`, `minimax-ultra`, `direct-deepseek-capped`) |

`reasoningDefault` is **not** a second effort field in OpenClaw. It controls
reasoning visibility (`on` / `off` / `stream`); effort belongs in
`thinkingLevel` and projects to `agents.list[].thinkingDefault`.

## Native OpenClaw projection

The catalog remains the role × variant authority, while OpenClaw supplies the
execution primitives:

- `agents.list[]` projects the stable role identities and their baseline model/fallbacks.
- `sessions_spawn({agentId, model, thinking})` selects a configured role and an
  explicit variant model for one run.
- `subagents.allowAgents` controls which configured role identities can be targeted.
- Each target `agentId` resolves auth from its own `agentDir`; static API-key/token
  profiles may be seeded, but OAuth refresh credentials must not be copied between
  role stores. OpenAI OAuth model overrides therefore run under the authenticated
  Yuri agent scope unless that target role has completed its own OAuth login.
- Nested `variants[]` are routing metadata, not automatically separate native
  agents. Do not multiply dashboard agents merely to represent every model binding.

This gives MURE task/session-level sparse expert routing. It does **not** turn
OpenClaw into a token-level neural MoE. Candidate scoring, policy gates, quota
features, calibration, and the MLP remain MURE logic; native OpenClaw performs
the selected dispatch and lifecycle management.

## GPT-5.6 pilot (Sol first)

Current rollout is deliberately asymmetric:

- `openai/gpt-5.6-sol` is the Yuri main-input pilot and an explicit, non-automatic
  variant for Envoy, Helmsman, Scout, Engineer, Architect, Adjudicator, and Advisor.
- Only Yuri is promoted to Sol primary. Opus 4.8 remains the temporary Yuri fallback.
- Non-Yuri Sol variants carry `sol-pilot` plus `require-explicit-call`; they do not
  enter automatic fallback chains until live outcome, auth, and quota gates pass.
- Security-critical Adjudicator/Advisor work does not move to Sol during the pilot.
- Terra and Luna may be registered in the provider catalog, but remain unseeded
  until reproducible native inference and role-fit benchmarks pass. Availability in
  `models list` is not evidence of reliable runtime access.

## Cost tier semantics (binding)

Each `costTier` maps to an explicit placement rule:

- **`cheap`** — eligible for auto-selection on cheap sub-tasks. Fallback chain advance lands here first. Examples: `haiku`, `deepseek-v4-flash`, `glm-5-turbo`, `m2.7-highspeed`.
- **`medium`** — eligible for auto-prime or surfaced-default depending on role. Examples: `sonnet-5`, `glm-5.1`, `m2.7`.
- **`heavy`** — surfaced-default with operator override. Examples: `opus-4-8`, `dvp-pro-think-max`, `glm-5.2`, `m3`.
- **`apex`** — `require-explicit-call` only; not auto-prime. Examples: `fable-5` (when accessible).

### Haiku's lane (clarification, 2026-07-09)

Per owner: **Haiku's role is recon + cheap-research only.** Eligible contexts for Haiku variants:
- `mure-scout` (research / census)
- `mure-envoy` (ops / brain-dump decode)
- `mure-chronicler` cheap-tier (technical writing where fine-tuning not needed)
- `mure-advisor` watcher Tier 1 fallback

NOT eligible for heavy-advisor fallback. NOT eligible for sentinel / adjudicator / architect. The heavy-tier fallback chain for any role is role-dependent but **never falls through to Haiku**.

## System sections (harness diff)

The role body's section names are indexed and referencable per-variant. Convention (composable, reusable):
- `minimalist` — bare essentials; for cheap / fast models
- `coding-excellence` — code-quality emphasis (type hints, tests, edge cases)
- `agentic-clean-tool-use` — strict tool-call discipline (no spurious calls, return clean JSON)
- `apex-judgment` — adversarial-ally contract, weight caveats, refutation default
- `narrow-prompt-reserved` — short context, narrow scope; used by heavy-tiers when scope is bounded
- `security-strict` — protected-path emphasis, no exceptions; used by sentinel / adjudicator
- `vision-cross-modal` — instructions for image / video understanding
- `recon-breadth` — read-heavy, scan-friendly; used by cheap recon roles
- `cheap-research` — minimal-but-complete; used by cheap research-tier
- `orchestrator-peer` — full fleet doctrine + dispatch rules + 6-gate charter; used by helmsman / architect / helmsman-glm
- `governance-strict` — protected paths + autonomy-class + finalize-never; used by owner-gated lanes

A variant's `systemSections` chooses which named sections apply. The role body must explicitly mark each section heading so a tool can extract + concat.

## Seeding (must be deterministic cold-start)

Variants MUST seed from the model-audit relevance cells:

- **★ = PRIMARY** — eligible for auto-selection as the default-prime variant.
- **● = SECONDARY** — eligible for surfaced-default with manual override; not auto-prime.
- **— = DO NOT INCLUDE** — model is unfit for the role; do not add as a variant.
- **? = UNVERIFIED** — verification needed before inclusion.

The MLP cannot introduce NEW variants. Its job is to **re-rank within the seeded set** using prediction-ledger features.

This prevents the MLP from cold-pruning out a great model the owner invested quota in.

## Selection (cheap auto + heavy surfaced)

### Cheap variants (costTier: cheap / medium)

AUTO. The dispatcher picks the cheapest reachable variant matching the role + task shape, with predicted-success from the MLP. Operator-visible via the GUI afterwards + override-next-round via slash command (`/use sonnet-5 next`).

### Heavy variants (costTier: heavy / apex)

Surfaced-default + operator override. The dispatcher proposes a default (ranked #1 by MLP score); the operator sees the choice in the GUI + can override next round. Per-dispatch prompts are NOT used (would wear thin over a long session).

### Security rule (hard)

For security-relevant turns (sentinel, adjudicator, parts of architect), the variant picked MUST be Opus 4.8 (or equivalent apex-tier if Opus is gated). The dispatcher enforces; deepseek-v4-pro may be added when audit confirms capability parity.

## Harness diff (binding rule)

A variant's diff from the role baseline MAY include:
- `model` (binding)
- `thinkingLevel`
- `tools` (subset)
- `max_tokens`
- `systemSections` (which sections apply)
- `quota` (which subscription)

A variant MUST NOT change:
- Role `mission` / `description` / `capabilities`
- Role `autonomy` class (`self-governable` / `owner-gated`)
- Role `independence` set (structural independence between roles)
- The RESULT_LABEL grammar at turn-end

If a role's function needs to change, that's a NEW role — not a variant.

## Telemetry (feeds back into MLP)

Per-dispatch logs to `_SYSTEM/state/role-variant-ledger.jsonl`:
- role ID
- variant ID picked
- selection mechanism (auto / surfaced-default / override)
- tokens in / out (precise, for cost accounting)
- success criterion outcome (success / partial / fail, from role's RESULT_LABEL)
- time-to-first-token (latency)
- escalation count if heavy advisor was triggered

Feeds:
- `mure-calibrator` for Brier scoring
- Role-variant MLP for re-ranking within the seeded set
- Operator dashboard for cost / latency dashboards

## Fallback chain

Per role, an ordered fallback chain: cheapest eligible variant first; on quota / failure, advance. MLP learns the chain ordering over time.

Static defaults at first, MLP-updated post-warmup (role-dependent but never includes Haiku at heavy tier):
1. costTier cheap variants (auto-prime if eligible)
2. medium costTier (auto-prime)
3. heavy costTier (surface default)
4. apex costTier (explicit-call only)

Haiku placement reminder: cheap tier (recon + cheap-research lanes only). At heavy tier, the chain is role-defined but never includes Haiku.

## Operator command surface

- `mure.mjs --list` — every role + every variant + current ranking + last 24h outcome histogram.
- `mure.mjs --variants <role>` — role + variants + current ranking + per-tier cost.
- `mure.mjs --pick <role> <variant>` — next-round override for the role.
- `mure.mjs --seed-from-audit` — re-seed the variants[] from current `_SYSTEM/research/model-audit*.md` cells (manual / scheduled).
- GUI equivalent for visibility + intervention.

## Anti-patterns

- A variant that CHANGES the role's mission (that's a new role).
- The MLP pruning outside its seeded set (cold-prune of expensive-but-critical).
- Operator getting prompted per heavy-dispatch (chatter burns focus).
- Variants without telemetry (silent untested variants rot the routing).
- Variants missing `max_tokens` (silently expensive / short on long outputs).
- Haiku appearing in a heavy-tier role's fallback chain.
- Adding a variant from an audit `—` cell without a verification pass.

## Related

- Source audit: `_SYSTEM/research/model-audit-2026-07-09.md` (★/● cells are seed source).
- Rene recon: `_SYSTEM/research/rene-branch-patterns-2026-07-09.md` (compose-with-MURE-YAML recommendation).
- mure-advisor (the tiered per-turn advisor consumes role×variant telemetry + emits watchdog notes).
- Cloud fleet roster: `_SYSTEM/config/cloud-fleet-models.json` (provider mapping; needs an update pass).
- Substrate dispatch: `_SYSTEM/Scripts/{glm,ollama}-fleet.mjs` + Opus fleet substrate.

## Versioned authority

v1.0.0 — created 2026-07-09. Revision incorporated: Haiku lane clarification. Pending Skill Workshop approval.

## Change log

- 2026-07-09 — initial draft per grill round + Opus 4.8 adversarial review (HV03).
- 2026-07-09 (rev 1) — clarified Haiku's lane (recon + cheap-research only, never heavy-tier fallback); added `recon-eligible`, `cheap-research-only`, `orchestrator-peer`, `governance-strict` to the systemSections vocabulary.
