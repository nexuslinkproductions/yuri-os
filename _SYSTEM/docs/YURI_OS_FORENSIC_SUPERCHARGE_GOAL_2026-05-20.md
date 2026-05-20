# YURI OS Forensic Supercharge Goal

Date: 2026-05-20
Owner: Codex main orchestrator
Mode: audit first, patch in verified waves

## Goal

Turn YURI OS / MUSUBI from scattered lane, memory, automation, and Claude-coupled systems into a YURI-owned control plane with:

- canonical Shintai/NIM/Codex/Claude lane routing;
- persistent universal memory with clear recall/write ownership;
- local browser-harness research and documentation capture;
- production automation health and recovery;
- NeMo-style guardrails for input, retrieval, dialog, execution, output, and health;
- regression tests that prevent stale aliases, dead lanes, protected path writes, and fake dispatch policy.

Claude is a powerful audit lane, not YURI's owner.

## Current Evidence

- Harness baseline committed on main: `3d4df4a1`.
- NIM tool-routing fix committed on main: `be71b8dd`.
- Validated NIM lane additions committed on main: `55cf42f8`.
- NeMo docs crawl captured with browser-harness DOM extraction:
  - `_SYSTEM/state/shintai-advisory/nemo-guardrails-docs-crawl-2026-05-20T16-12-58Z.md`
  - `_SYSTEM/state/shintai-advisory/nemo-guardrails-docs-crawl-2026-05-20T16-12-58Z.json`
- NeMo crawl scope: 167 docs pages across config, YAML schema, guardrail catalog, Colang, evaluation, observability, deployment, reference, tutorials, and related sections.
- Official NeMo Guardrails source repo cloned as ignored external checkout:
  - `_SYSTEM/tools/nemo-guardrails`
  - branch `develop`
  - commit `c98f7dfec98af0707983060d73b5fc465ffe4ff5`
  - progress note: `_SYSTEM/docs/YURI_OS_NEMO_GUARDRAILS_SOURCE_REPO_PROGRESS_2026-05-20.md`
- Current Shintai run is live and should supersede the failed first artifact caused by the old `ai offload` permission bug.

## Lane Truth

Validated live lanes:

- `nvidia-nemotron-120b` -> `nvidia/nemotron-3-super-120b-a12b`
- `nvidia-nemotron-nano-30b` -> `nvidia/nemotron-3-nano-30b-a3b`
- `nvidia-qwen-397b` -> `qwen/qwen3.5-397b-a17b`
- `nvidia-gpt-oss-120b` -> `openai/gpt-oss-120b`
- `nvidia-kimi` -> `moonshotai/kimi-k2.6`

Still dead or mis-mapped:

- `nvidia-nemotron` old alias
- `nvidia-phi`
- `nvidia-llama-405b`
- `nvidia-embed`

DeepSeek rule: do not force CLI `--tools`; tool and skill intent belongs in the prompt contract.

NIM rule: tool mode remains available when the runtime supports it; YURI guardrails block protected paths, commits, pushes, and destructive actions.

## Protected Surfaces

Never read or write:

- `backend/data/`
- `.claude/state/`
- `.claude/history/`
- `.env`
- `node_modules/`
- `.amp/`

Runtime noise from those surfaces must not be staged.

## Task List

### Gate 1 - Shintai Council

- Finish the corrected Shintai advisory run.
- Record member health, skipped lanes, proposal failures, critique failures, and synthesis output.
- Mark the earlier failed Shintai artifact as failure evidence, not final guidance.
- Require every future Shintai packet to load roster and dispatch templates before team selection.

### Gate 2 - Forensic Inventory

- Map all lane/offload surfaces.
- Map Rick harness, banner, renderer, stream, and PTY tests.
- Map browser-harness CLI, bridge, runner, remote-debugging state, and docs capture path.
- Map backend services and routes without reading `backend/data/`.
- Map memory code and documentation without reading `.claude/state` or `.claude/history`.
- Map launchd/tmux/worker/monitoring automation surfaces.
- Map stale aliases and duplicated routing truth.

### Gate 3 - NeMo Guardrail Matrix

- Use the 167-page crawl artifact as the docs source.
- Use `_SYSTEM/tools/nemo-guardrails` as the code/config/test source for NeMo rail mechanics.
- Do not repeatedly reopen the YAML config page; use the captured crawl and targeted section URLs only.
- Convert NeMo concepts into YURI controls:
  - input rails;
  - retrieval rails;
  - dialog rails;
  - execution rails;
  - output rails;
  - tool input/tool output rails;
  - logging, tracing, evaluation, vulnerability scanning, caching, and deployment checks.
- Use screenshots only for diagrams, visual docs state, or UI evidence.

### Gate 4 - Universal Memory Design

- Identify every YURI memory surface and caller.
- Identify every Claude-hardwired memory assumption.
- Design YURI-owned memory contracts for:
  - recall before dispatch;
  - memory writes;
  - audit ledger;
  - user feedback;
  - lane session summaries;
  - migration from Claude-owned surfaces.
- Keep protected state sealed.

### Gate 5 - Automation And Health Spine

- Unify tmux worker health, offload PONG probes, launch readiness, lane calibration, and monitoring logs into one AutomationKernel plan.
- Define failure states: missing key, 404 model, timeout, crashed worker, stale daemon, protected write, prompt poison.
- Define repair flows and tests for each failure state.

### Gate 6 - Patch Waves

- Patch wave 1: remove stale aliases and dead default routes.
- Patch wave 2: centralize lane truth in the lane kernel and contract.
- Patch wave 3: add MemoryKernel interfaces and migration tests.
- Patch wave 4: add AutomationKernel health aggregation and repair commands.
- Patch wave 5: implement GuardrailKernel rails from the NeMo matrix.
- Patch wave 6: documentation package and regression suite.

## Acceptance Criteria

- No active runtime imports `rick-shintai`.
- No active runtime references `seal-team` as the current roster.
- No `codex-spark` default for Shintai or critical harness work.
- No DeepSeek forced CLI tool mode.
- NIM lanes keep validated tool-capable defaults.
- Dead lane list matches live probes.
- Browser-harness research uses DOM/CDP first.
- Protected path access is blocked by tests.
- Rick streams visible output across repeated turns.
- YURI owns memory/routing/automation policy instead of Claude being the main entry point.
- All patch waves have verification commands and rollback notes before implementation.
