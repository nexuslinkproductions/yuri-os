# MURE Immaculate Role-Config Brief (2026-07-09)

Ground-truth contract for the lane-designer fleet. Every designer follows THIS doc so 26 roles come out consistent, not 26 drifting styles. Owner decision: **fat catalog entries** (structured `agents.list` config), **roles-first** (base roles only, not model variants).

## What you are producing

For each role assigned to you, a strict JSON object that enriches its `_SYSTEM/mure/agent-catalog.json` entry with the design fields the OMP agent projection actually consumes. You are NOT writing prose files. You are NOT editing any file. You RETURN JSON only. The orchestrator merges it.

The OMP agent projection derives an agent's behavior from its `agents.list` entry (model + tools + identity + **description** + **skills** + **params** + **thinkingLevel**) plus the shared workspace `AGENTS.md`. Your job: make each role's entry sharp, correctly-scoped, and non-generic.

## Output contract (per role — return an array of these)

```json
{
  "name": "mure-<role>",
  "description": "<=320 chars. Mission + what makes THIS lane different from its siblings + when to dispatch it. Sharpen the existing description; do not just copy it. No fluff.",
  "skills": ["<id>", "..."],           // 4–9 skill ids from the CATALOG below, matched to the role's function. No bloat. Valid ids ONLY.
  "thinkingLevel": "off|low|medium|high",
  "params": { "temperature": <0..1> }, // optional extras allowed (e.g. max_tokens); temperature matched to determinism-need
  "reasoningDefault": "off|low|medium|high|xhigh",  // optional; align with thinkingLevel
  "rationale": "1–2 lines: why these skills + this thinking/temp for this role. (kept out of the catalog; for owner review)"
}
```

## Rubrics (bind these — consistency across lanes depends on it)

### Skills — match to FUNCTION, never dump
- Assign 4–9 skills that the role would actually invoke. A skill the role never uses is noise that dilutes routing.
- Common spine (assign where they fit): `cross-reference-navigation` (any research/nav), `verification-before-completion` (anything that ships), `adversarial-verification` (verify/security/critic).
- Cluster guidance (not exhaustive — pick what fits each role):
  - orchestration → `opus-fleet`, `fleet-economy`, `dispatching-parallel-agents`, `plan-review`, `writing-plans`, `haki-intent`, `execution-domain-core`, `probabilistic-decision-core`
  - engineering → `gitnexus`, `gitnexus-refactoring`, `gitnexus-impact-analysis`, `gitnexus-debugging`, `tdd`, `systematic-debugging`, `diagnose`, `improve-codebase-architecture`, `receiving-code-review`
  - research → `cross-reference-navigation`, `agent-reach`, `research-artifact-factory`, `quantum-hypothesis-simulation`, `izanagi-simulator`, `pattern-mirror-core`, `brainstorming`, `probabilistic-decision-core`
  - verification → `adversarial-verification`, `grill-me`, `verification-before-completion`, `requesting-code-review`, `plan-review`, `probabilistic-decision-core`
  - knowledge → `nex-vault`, `nex-deliverables`, `writing-skills`, `skill-creator`, `research-artifact-factory`, `end-of-transmission`, `cross-reference-navigation`
  - operations → `fleet-economy`, `tokenmaxxing`, `triage`, `haki-intent`
  - security (sentinel) → `nexus-security-hardening`, `adversarial-verification`, `gitnexus-impact-analysis`, `systematic-debugging`, `verification-before-completion`
- Only ids from the CATALOG. An invalid id fails the merge.

### thinkingLevel — match to reasoning weight
- `high`: orchestration leads, deep reasoners, adversarial critics, architects, security, strategy (helmsman, architect, deliberator, adjudicator, sentinel, kernelsmith, synthesist, ideator, evolver, steward).
- `medium`: implementers + writers + advisor (engineer, mechanic, chronicler, advisor).
- `low`/`off`: fast mechanical bulk lanes (artificer, composer-fast, deepseek-flash, envoy, scout, quartermaster, oracle if pure-runner).

### params.temperature — match to determinism-need
- `0.1–0.3`: verification / security / calibration / adjudication / oracle (determinism, low variance).
- `0.4–0.6`: engineering / orchestration / knowledge (balanced).
- `0.7–0.9`: ideator, synthesist, evolver (divergence is the job).
- Note: reasoning-heavy models may ignore temperature — still set it; it's harmless and documents intent.

### Do NOT touch
- `model`, `tools`, `fallbackChain`, `variants` — already set. Only add description/skills/thinkingLevel/params/reasoningDefault.
- `bootstrapMaxChars`/`contextInjection` — leave to the orchestrator unless a role clearly needs a cap; if so, note it in rationale, don't set it.

## Skill catalog (valid ids — use EXACTLY these strings)

ad-creative adversarial-verification agent-reach anime-dna-extensions anthropic-managed-agents bankai-manifest brainstorming browser-harness caveman cgs-mold claude-codex-capability-bridge claude-output-lane codebase-to-course codex-plugin-control-plane compact-optimizer cross-reference-navigation design-assistant-inbox design-source-pack diagnose dispatching-parallel-agents end-of-transmission executing-plans execution-domain-core extraction-sprint failure-evolution-loop finishing-a-development-branch fleet-economy frontend-design geass-lock gitnexus gitnexus-cli gitnexus-debugging gitnexus-exploring gitnexus-guide gitnexus-impact-analysis gitnexus-pr-review gitnexus-refactoring grill-me grill-with-docs haki-intent imagegen improve-codebase-architecture izanagi-simulator math-curve-loaders mineru-document-extractor nen-phase-detector nex-deliverables nex-vault nexus-security-hardening non-destructive-infinity-guard openai-codex-workflow openai-docs opus-fleet oracle-adapters oracle-memory oracle-registry oracle-router oracle-voice organ-discovery-precision-gate organ-filing-assessor organ-formula-foundry organ-lane-telemetry-cockpit organ-openprocess-pool organ-yuri-decode organ-yuri-nerve parallel-clone-orchestrator pattern-mirror-core peer-signal-build pilot-feedback plan-review plugin-creator probabilistic-decision-core prompt-engineering quantum-hypothesis-simulation receiving-code-review remotion-motion-design research-artifact-factory sales-psychology sharingan skill-creator skill-installer subagent-driven-development systematic-debugging tdd to-issues to-prd tokenmaxxing triage using-git-worktrees using-superpowers verification-before-completion visual-introspection visual-plan viz-lab write-a-skill writing-plans writing-skills yuri-code-intelligence yuri-sales-intelligence yuri-shura

## Hard rules
- Return ONLY a JSON array of role objects. No prose around it. No markdown fences if avoidable; if you must fence, use one ```json block.
- Every skill id must be in the catalog. Every role you were assigned must appear exactly once.
- Sharpen descriptions; never leave the generic stub.
- End on the JSON. Do not add commentary after it.
