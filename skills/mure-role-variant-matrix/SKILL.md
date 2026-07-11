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

The authoritative source is `.openclaw/mure-agent-catalog.json` — every role entry and its `variants:` list lives there. `.openclaw/agents/` is a catalog-generated projection for OpenClaw-native config consumption. Repo-local `.omp/agents/` is a deterministic generated projection for OMP discovery, never hand-edited. Each variant:

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

### Variant frontmatter (schema preservation)

A variant's ID, model binding, thinking level, tools, and token budget are core control fields — these appear in variant frontmatter (`id`, `model`, `thinkingLevel`, `tools`, `max_tokens`, `systemSections`, `eligibilityFlags`, `costTier`, `quota`). The role's top-level `description` is preserved across all variants; it captures the role's invariant mission and appears inherited in each variant. The explanatory tuning note — why this variant exists, what model behavior it optimizes for, how it differs from the base role — lives in body documentation, not in frontmatter. Never rewrite a role's description to document a single variant's tuning; that belongs in the body and the variant's field choices.

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

## Projections

### OpenClaw native

The catalog is the role × variant authority; OpenClaw supplies execution primitives:

- `agents.list[]` projects stable role identities and their baseline model/fallbacks.
- `sessions_spawn({agentId, model, thinking})` selects a configured role and an
  explicit variant model for one run.
- `subagents.allowAgents` controls which configured role identities can be targeted.
- Each target `agentId` resolves auth from its own `agentDir`; static API-key/token
  profiles may be seeded, but OAuth refresh credentials must not be copied between
  role stores. OpenAI OAuth model overrides run under the authenticated
  Yuri agent scope unless that target role has completed its own OAuth login.
- **OpenClaw-specific:** nested `variants[]` are routing metadata, not automatically
  separate native agents. Do not multiply OpenClaw dashboard agents merely to
  represent every model binding. OpenClaw is one projection surface, not the only
  runtime.

### OMP projection

OMP projects each variant to an explicit agent card. `.omp/agents/` is generated
deterministically from the catalog — every catalog variant produces a projected
OMP agent card for discovery. This is the opposite of the OpenClaw model: OMP
variants ARE separate agent cards because OMP's dispatch model requires
one-card-per-binding. Being projected is not the same as being executable;
only `canary-proven` cards with passing latest canary are dispatch-eligible (see Provider route eligibility
below). Never edit `.omp/agents/` by hand; regenerate from the catalog on seed.

MURE task/session-level sparse expert routing remains catalog-driven. It does
**not** turn any runtime into a token-level neural MoE. Candidate scoring, policy
gates, quota features, calibration, and the MLP remain MURE logic; the runtime
performs the selected dispatch and lifecycle management.
## Provider route eligibility

The MURE agent catalog is the sole authority for role-variant bindings.
Catalog presence alone is insufficient for dispatch eligibility. Every variant's
model binding must satisfy both conditions:

1. **Admission history**: Resolvable to a `canary-proven` entry in
   `_SYSTEM/config/provider-route-registry.json`.
2. **Live gate**: The variant's latest canary must have passed; no later failed canary
   exists. A failed canary (quota exhaustion, provider drift, API change) blocks that
   route immediately until re-canary succeeds.

Acceptable evidence is exactly one of:
- Exact source-route match (e.g. `zai/glm-5.2`) in the registry with `canary-proven`
  status and passing latest canary.
- Normalized selector match (provider-scoped shorthand like `minimax-code` →
  `minimax-code/MiniMax-M3`) backed by `canary-proven` registry evidence and passing
  latest canary.

Missing admission history OR latest canary failure → route fails closed.

Routes with `blocked-schema`, `unresolved`, or `owner-excluded` status are known
disqualifications — they fail closed regardless of catalog or model-list appearance.

### Discoverability vs. executability

All catalog cards are projected — every variant and role binding appears in generated
`.omp/agents/` for discovery. But being projected is not the same as being executable.
Unproven, blocked, and excluded cards are listed in the generated project config's
`task.disabledAgents` and must never inherit the parent or default model binding.
Only cards meeting Provider route eligibility criteria (canary-proven admission history and passing latest canary) are dispatch-eligible.

### Card-level stale-session backstop

`task.disabledAgents` is the primary steady-state gate after session startup.
`disabled/mure-route-unavailable` is the card-level stale-session backstop
that blocks parent/default model inheritance. Project-config changes require a
fresh OMP session — there is no hot reload; do not rely on settings-layer
enforcement until the session has restarted.

The MLP and fallback chain skip ineligible variants automatically.

## Provider status and pilot rollout

**Sol (`openai/gpt-5.6-sol`)** is catalogued but currently unproven — no successful exact OMP canary exists. It was Yuri's experimental variant and carried `sol-pilot` flag; later hardening tasks targeted different routes. Sol remains blocked until a fresh canary succeeds and meets dispatch eligibility criteria.

**Terra (`openai/gpt-5.6-terra`)** is a normalization example only. Currently quota-blocked after provider drift; routes configured for Terra dispatch will fail closed. Terra re-proves only when liveness is confirmed by passing canary.

**Fallback defaults** are seeded from routes with `canary-proven` admission history, subject to dispatch eligibility criteria (see Provider route eligibility), depending on role and cost tier. No role is currently promoted to Sol or Terra dispatch until their latest canaries pass.

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
