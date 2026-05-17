# Ruflo Offload Integration Spec

## Goal

Make offloading the default execution path, with Ruflo as the swarm routing plane and the active chat session as overseer/finalizer only.

## Current State

- Global startup seed lives in [`.claude/nisaba/learning/global.md`](/Users/marcelspatz/YURI-OS-MUSUBI/.claude/nisaba/learning/global.md).
- [`SessionStart`] and [`SubagentStart`] hooks in [`.claude/settings.json`](/Users/marcelspatz/YURI-OS-MUSUBI/.claude/settings.json) inject that seed.
- Root session guidance now points to the same seed in [`.claude/nisaba/learning/global.md`](/Users/marcelspatz/YURI-OS-MUSUBI/.claude/nisaba/learning/global.md).
- `@swarm` routes through Ruflo-aware logic in [`Scripts/ai`](/Users/marcelspatz/YURI-OS-MUSUBI/Scripts/ai).
- `Scripts/swarm-proxy.sh` normalizes `@swarm` and `swarm` to the same entrypoint.

## Exact Files

- [AGENTS.md](/Users/marcelspatz/YURI-OS-MUSUBI/AGENTS.md)
- [CLAUDE.md](/Users/marcelspatz/YURI-OS-MUSUBI/CLAUDE.md)
- [Scripts/ai](/Users/marcelspatz/YURI-OS-MUSUBI/Scripts/ai)
- [Scripts/swarm-proxy.sh](/Users/marcelspatz/YURI-OS-MUSUBI/Scripts/swarm-proxy.sh)
- [`.claude/nisaba/learning/global.md`](/Users/marcelspatz/YURI-OS-MUSUBI/.claude/nisaba/learning/global.md)
- [`.claude/settings.json`](/Users/marcelspatz/YURI-OS-MUSUBI/.claude/settings.json)
- [`.claude/skills/ai-pipeline-offloading/SKILL.md`](/Users/marcelspatz/YURI-OS-MUSUBI/.claude/skills/ai-pipeline-offloading/SKILL.md)
- [`.claude/skills/swarm-coordination/SKILL.md`](/Users/marcelspatz/YURI-OS-MUSUBI/.claude/skills/swarm-coordination/SKILL.md)

## Startup Chain

1. Session starts.
2. Root protocol points to `.claude/nisaba/learning/global.md`.
3. Subagent hook injects the same seed into delegated sessions.
4. Seed states caveman tone, strict offload, and Ruflo-backed swarm routing.
5. The main session stays in router/overseer/finalizer mode.

## Routing Matrix

| Input | Route | Responsibility |
|---|---|---|
| `btw offload this` | Immediate delegation | Skip narration. Send to lane or swarm. |
| `@ollama` | Local deterministic lane | Cheap, private, mechanical work. |
| `@gpt-oss` | Local reasoning lane | Offline reasoning and structured analysis. |
| `@kimi` | Remote reasoning lane | Deep cloud reasoning and broad context. |
| `@swarm` | Ruflo-backed swarm | Route, fan out, or compare across lanes. |
| `ruflo` | Routing-only helper | Ask Ruflo for route guidance without execution. |

## Fallback Behavior

- If `ruflo` is installed, use it for routing guidance.
- If `ruflo` is missing, fall back to `npx -y ruflo@latest`.
- If Ruflo returns a lane hint, execute the hinted lane.
- If Ruflo returns a swarm or ambiguous route, fall back to `run_codex_swarm`.
- If the `ai` launcher is unavailable in `Scripts/swarm-proxy.sh`, fall back to direct `gpt-oss`.

## Acceptance Criteria

- Every new session sees the caveman rule and the offload rule.
- Subagents inherit the same startup seed automatically.
- `@swarm` uses Ruflo-backed routing first.
- `swarm-proxy.sh` and `ai` agree on the same swarm path.
- No nested project file is required for the first-pass rollout.
