# YURI OS NeMo Guardrail Matrix

Date: 2026-05-20
Source crawl:

- `_SYSTEM/state/shintai-advisory/nemo-guardrails-docs-crawl-2026-05-20T16-12-58Z.md`
- `_SYSTEM/state/shintai-advisory/nemo-guardrails-docs-crawl-2026-05-20T16-12-58Z.json`

Browser method: local browser-harness DOM extraction and `http_get`, not screenshot scraping.

Docs coverage: 167 NVIDIA NeMo Guardrails pages across overview, YAML schema, guardrail catalog, Colang, custom actions, custom initialization, caching, exceptions, evaluation, observability, deployment, and reference sections.

Official source repo:

- Upstream: `https://github.com/NVIDIA-NeMo/Guardrails`
- Local checkout: `_SYSTEM/tools/nemo-guardrails`
- Branch: `develop`
- Commit: `c98f7dfec98af0707983060d73b5fc465ffe4ff5`
- Source progress note: `_SYSTEM/docs/YURI_OS_NEMO_GUARDRAILS_SOURCE_REPO_PROGRESS_2026-05-20.md`

## Translation Rule

YURI should not copy NeMo as a dependency in this slice. YURI should translate NeMo rail concepts into local enforcement modules:

- `lane-kernel.mjs`: lane truth, dispatch, health, model mapping.
- `rails.mjs`: deterministic guardrail evaluation.
- `shintai-dispatch.mjs`: advisory council assembly and packet policy.
- `rick-repl.mjs`: terminal input/output rail surface.
- `_SYSTEM/state/`: runtime audit artifacts and violations.
- `_SYSTEM/docs/`: durable documentation and runbooks.
- `_SYSTEM/tools/nemo-guardrails`: ignored upstream checkout for source-level rail mechanics, schemas, examples, and tests.

## Matrix

| NeMo concept | YURI surface | Decision | Tests |
|---|---|---|---|
| Input rails | Rick input parser, slash commands, lane mentions | Parse `/help`, `/noexec`, `@lane`, `@shintai`, shell blocks before model dispatch | Unit tests for command parsing, lane mention parsing, shell block detection; compare against upstream `docs/about/rail-types.md` |
| Dialog rails | Shintai assembly and task tiering | Codex/main assembles Shintai from roster, task tier, health, and fit; Shintai never self-selects | `assembleShintaiTeam` critical task tests; no Spark defaults |
| Retrieval rails | Memory recall, browser-harness, repo file reads | Recall allowed memory before dispatch; browser-harness DOM/CDP before screenshots; protected paths denied | Protected path predicate tests; browser-harness health; memory recall tests |
| Execution rails | Shell execution, worker PONG, timeout caps | Shell blocks require guard checks and noexec state; health preflight before fan-out; per-lane timeout policy | Shell guard tests; worker health tests; timeout regression tests |
| Output rails | Rick streaming renderer, Shintai artifacts | Role prefixes, ANSI-safe streaming, output caps, evidence-required repo claims | PTY two-turn streaming test; ANSI/scroll region tests; artifact schema checks |
| Tool input rails | Offload runner tools and lane tool mode | Tool mode is allowed for capable NIM lanes; tool inputs still pass protected path and destructive action rails | Tool-mode dry-runs; protected path tool-call denial tests |
| Tool output rails | Shell/browser/lane output normalization | Outputs are capped, prefixed, sanitized, and never treated as verified repo truth without evidence | Output cap tests; repo-claim evidence tests |
| Custom actions | Browser-harness bridge, worker tmux, shell tools | Actions live behind named adapters, never ad hoc shell injection inside prompts | Adapter tests and command allow/deny tests |
| Custom initialization | Shintai Gate 0 | Load roster, memory guidance, extraction templates, lane kernel, and plan before any Shintai packet | Gate 0 missing-source abort test |
| Colang / flows | YURI workflow gates | Represent audit/pact flows as explicit Gate 0..N state, not hidden prompt behavior | Control-plane gate sequencing test |
| Guardrail catalog | Reusable rail presets | Maintain local presets: harness-critical, browser-research, memory-migration, backend-hardening, lane-probe | Preset snapshot tests |
| Caching | Lane/session history and browser docs crawl | Cache advisory artifacts and docs crawl under `_SYSTEM/state`; avoid protected state | Cache path tests; generated artifact hygiene |
| Exceptions | Failure artifacts | Failed Shintai runs remain evidence with failure reason; final guidance must point to superseding run | Artifact supersession metadata test |
| Evaluation | Regression suite | Evaluate rails with unit, PTY, browser, lane health, and protected-path tests | Single `yuri-supercharge` test command target |
| Vulnerability scanning | Threat model and security scan | Run security scan against shell execution, browser automation, memory writes, auth routes, and backend file reads | Codex Security threat-model checklist |
| Logging | `_SYSTEM/state` audit logs | Runtime logs go to YURI-owned state paths, not Claude-owned state | Runtime path tests |
| Tracing | Audit ledger | Every fan-out records task, roster, health, skipped lanes, artifacts, and synthesis | Shintai artifact schema test |
| Deployment | Local launchd/tmux/worker health | Automations expose PONG and health JSON; failed daemons are repairable | launchd/tmux health tests |
| API server endpoints | YURI backend routes | Backend routes must enforce auth, file boundaries, and database safety | backend route auth matrix tests |

## Immediate Rail Modules

### `rails.mjs`

Minimum exported API:

```js
evaluateInputRails(input, context)
evaluateRetrievalRails(request, context)
evaluateExecutionRails(action, context)
evaluateOutputRails(output, context)
evaluateHealthRails(targets, context)
```

Return shape:

```js
{
  ok: boolean,
  rail: string,
  severity: "allow" | "warn" | "block",
  reasons: string[],
  evidence: object
}
```

### `yuri-control-plane.mjs`

Minimum gates:

1. Gate 0: load evidence and constraints.
2. Gate 1: classify task and assemble team.
3. Gate 2: health preflight.
4. Gate 3: fan-out.
5. Gate 4: critique.
6. Gate 5: synthesis.
7. Gate 6: Codex arbitration and patch plan.

## Hard Requirements

- No active rail writes to Claude-owned state.
- No rail reads protected paths.
- No advisory lane commits or pushes.
- No browser screenshot dependency for text docs extraction.
- No stale `seal-team` roster.
- No active `rick-shintai` import.
- No critical Shintai route falls back to Spark.
- No DeepSeek CLI tool flag unless explicitly requested.
- NIM tool mode remains available under YURI rails.
