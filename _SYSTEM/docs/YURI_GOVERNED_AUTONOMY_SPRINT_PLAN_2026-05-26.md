# YURI Governed Autonomy Sprint Plan

Status: active implementation plan
Owner: Codex/main
Date: 2026-05-26

## Purpose

Turn YURI automation from helpful scripts into governed autonomy: planned work loops that can gather context, route lanes, collect evidence, propose memory/truth changes, and eventually perform scoped edits only after explicit approval gates.

The first implementation target is not a fully autonomous agent. It is a dry-run autonomy runner that can produce a baseline-anchored run manifest, prove which gates would apply, and emit optional Kagami events without mutating source or memory by default.

## Research Grounding

- NIST AI RMF frames trustworthy AI around govern, map, measure, and manage. YURI maps that to baseline anchors, risk gates, scorecards, and operator approval before higher autonomy.
- NIST Generative AI Profile highlights provenance, evaluation, monitoring, and abuse resistance. YURI maps that to source freshness, contradiction detection, protected-path refusal, and evidence ledgers.
- Anthropic agent guidance favors simple composable patterns, clear tool boundaries, and explicit human escalation for consequential actions. YURI maps that to L1-L5 autonomy levels, dry-run defaults, and mandatory approval at mutation boundaries.
- OpenAI Agents SDK tracing, handoffs, and guardrails reinforce traceable execution and explicit transfer of control. YURI maps that to Kagami events, handoff records, and verifier-owned promotion gates.
- METR time-horizon research suggests measuring autonomy by sustained task time and intervention frequency. YURI maps that to timed runs, scorecards, and intervention counts.
- OWASP Agentic AI and MCP threat guidance highlight tool misuse, confused-deputy failures, and data exfiltration risks. YURI maps that to protected-surface checks, approval gates, and no silent memory writes.

References:

- https://airc.nist.gov/airmf-resources/airmf/5-sec-core/
- https://doi.org/10.6028/NIST.AI.600-1
- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://openai.github.io/openai-agents-python/tracing/
- https://openai.github.io/openai-agents-python/handoffs/
- https://openai.github.io/openai-agents-python/guardrails/
- https://metr.org/time-horizons/
- https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/
- https://owasp.org/www-project-mcp-top-10/

## Autonomy Levels

| Level | Label | Allowed default behavior |
|---|---|---|
| L0 | Manual | Human-directed commands only. |
| L1 | Evidence runner | Build context, route packets, collect baseline evidence, and report. |
| L2 | Research loop | Add source freshness, contradiction checks, memory proposals, and truth-promotion candidates. |
| L3 | Code autopilot | Propose and apply scoped edits only after explicit operator approval and rollback readiness. |
| L4 | Timed run | Operate within a timebox with intervention logging, checkpoints, and pause/resume handoff. |
| L5 | Scheduled automation | Run from a scheduler only after dry-run proving, health gates, and an operator enable switch. |

L1 and L2 are safe defaults. L3 and above require a hard approval boundary. A task can be classified as L3/L4/L5 while still producing only a dry-run manifest.

## Implementation Plan

1. Baseline anchor: capture git HEAD, dirty-file list, context-router result, protected-path status, and source hashes for selected control-plane files.
2. Lane health preflight: record whether required worker lanes are available before dispatch or escalation.
3. Kagami event spine: use YURI-owned `_SYSTEM/state/kagami-control/` events for optional runtime evidence, never Claude runtime state.
4. Evidence runner: produce a run manifest that states goal, autonomy level, gates, approval boundary, decision, and evidence references.
5. Approval boundary: default to `dry-run-only`; require explicit operator approval before L3 mutation.
6. Rollback contract: block mutation-capable modes unless a rollback strategy is declared and verified.
7. Source freshness: require dated provenance checks before promoting research, memory, or truth claims.
8. Contradiction gate: compare proposed claims against existing truth/memory/math evidence before promotion.
9. Scorecard wiring: attach task clarity, context precision, lane health, proof coverage, contradiction risk, protected-path risk, rollback readiness, elapsed time, and intervention count.
10. Memory proposal lane: generate memory candidates only; do not write canonical memory without verification and promotion.
11. Math proof gate: route formula, scoring, and simulation changes through the math packet and deterministic proof checks.
12. Skill decision gate: create skills only when repeated workflow friction appears; do not front-load skills before the L1-L4 pipeline exists.
13. Dry-run CLI: provide `yuri-autonomy-runner.mjs plan --goal ...` as the first operator surface.
14. Event emission option: support `--emit-events` only when an explicit safe event root is provided or the canonical Kagami root is acceptable.
15. Test harness: cover default dry-run, L2 research, L3 approval blocking, L4 timed runs, protected-root refusal, and optional event emission.
16. Context packet: add an autonomy packet so future broad exploration routes to the runner, plan, automation, Kagami, memory, and math gates.
17. Prime review lane: after local tests pass, send the completed slice to the live escalation lane for gap review before declaring the task done.
18. Release gate integration: once stable, add autonomy checks to the supercharge gate after GitNexus impact review.
19. First timed run: run a 15-minute L4 dry-run loop that records checkpoints and intervention counts but performs no mutation.
20. First L3 edit run: apply one scoped low-risk edit after explicit operator approval, rollback contract, and local verification.
21. Dashboard later: build dashboard/reporting only after real dry-run and edit-run data exists.
22. Scheduler later: add launchd/cron style scheduling only after dry-run proving, health checks, and an operator enable switch.
23. Negative testing: include protected-path, stale-provenance, contradiction, and missing-approval failures as first-class tests.
24. Promotion review: convert proven repeated procedures into skills, docs, or registry entries through the storage protocol.

## Non-Negotiables

- No commits unless the owner authorizes them.
- No source or memory mutation by default.
- No protected runtime reads or writes.
- No Claude one-shot prompt calls.
- No L3 mutation without explicit operator approval.
- No L3 mutation without rollback readiness.
- No truth or memory promotion without evidence and contradiction checks.
- No dashboard or scheduler work before the dry-run runner proves useful.

## First Slice

The first slice lands:

- `_SYSTEM/Scripts/yuri-autonomy-runner.mjs`
- `_SYSTEM/Scripts/yuri-autonomy-runner.test.mjs`
- `_SYSTEM/config/schemas/yuri.autonomy-run.v0.schema.json`
- context and artifact registry entries

Expected verification:

```bash
node --test _SYSTEM/Scripts/yuri-autonomy-runner.test.mjs
node _SYSTEM/Scripts/artifact-registry.mjs --validate
node _SYSTEM/Scripts/context-router.mjs "governed autonomy evidence runner"
git diff --check
```
