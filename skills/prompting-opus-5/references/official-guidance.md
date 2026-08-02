# Official guidance — Claude Opus 5 prompting

Source-backed detail for the `prompting-opus-5` skill. Every claim below traces to an official Anthropic or Claude Platform page and is grouped under the page whose documented scope carries it: model specs to the models overview, prompting strategy to the prompting page, launch framing to the announcement. No third-party or benchmark claims.

## Sources

1. Prompting Claude Opus 5 — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5
2. Claude prompting best practices — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
3. Models overview — https://platform.claude.com/docs/en/about-claude/models/overview
4. Claude Opus 5 announcement — https://www.anthropic.com/news/claude-opus-5

## Confirmed claims by source

### Models overview (3) — model specs

- API model id: `claude-opus-5`.
- 1M-token input context; 128k-token synchronous output.
- Adaptive thinking; effort defaults to `high` in the API and in Claude Code.

### Prompting Claude Opus 5 (1) — prompt adjustments

- Effort calibration: `low`/`medium` often retain strong quality at lower cost; `xhigh` targets demanding coding and agentic work. Start high and calibrate with evals.
- Strength areas to prompt for: difficult multi-file coding, larger refactors, end-to-end features, review and bug-finding, long-context work, vision, and multi-agent coordination.
- Effort controls thinking depth, not visible answer length; constrain response length explicitly.
- Set progress cadence: one short pre-tool sentence, updates only on important findings or a direction change, final message opens with the outcome.
- Calibrate written-artifact length; avoid filler, redundant summaries, and boilerplate.
- Opus 5 self-verifies; remove legacy blanket verification, double-check, and self-correction instructions to avoid over-verification and token waste. Retain task-specific proof requirements.
- Constrain narrow-task scope: make routine decisions, ask only on materially different readings, flag a better path once then execute the requested scope, never silently widen, narrow, or transform it.
- Cap subagents to genuinely independent, sizeable tracks; do not fan out small tasks or spawn agents to verify routine work.
- Narrate only corrections that change the user's code, conclusions, or decisions.
- Keep thinking enabled; prefer `low` effort over disabling it. If disabled: permit a brief pre-tool sentence, require admitting when no tool fits, and forbid internal or system XML tags.
- Review prompts: request all real issues, then filter severity separately; requesting only severe or conservative findings suppresses useful findings.

### Claude prompting best practices (2) — general contract

- Give complete task specifications up front, with clear authority, input, tool, output, evidence, and pass contracts.
- Examples should be relevant, diverse, and well-structured.

### Claude Opus 5 announcement (4) — launch and positioning

- Launch positioning: Anthropic's strongest Opus for demanding coding and agentic work.

## Evidence table

| Claim | Source | Status |
|---|---|---|
| `claude-opus-5`; 1M input / 128k output; adaptive thinking; effort default `high` | Overview (3) | Confirmed |
| Effort calibration: start high, low/medium cheaper, xhigh for demanding work, calibrate with evals | Prompting Opus 5 (1) | Confirmed |
| Strength areas: multi-file coding, refactor, review, long-context, vision, multi-agent | Prompting Opus 5 (1) | Confirmed |
| Effort tunes thinking, not visible brevity; set length, progress cadence, artifact length | Prompting Opus 5 (1) | Confirmed |
| Remove blanket verification; keep task-specific proof | Prompting Opus 5 (1) | Confirmed |
| Narrow-scope discipline; subagent cap; corrections only when material | Prompting Opus 5 (1) | Confirmed |
| Thinking-disabled fallback (brief speech, admit no-tool-fit, no XML tags) | Prompting Opus 5 (1) | Confirmed |
| Review: elicit all issues, filter severity separately | Prompting Opus 5 (1) | Confirmed |
| Full task spec up front; relevant, diverse, structured examples | Best practices (2) | Confirmed |
| Launch positioning as strongest Opus for demanding coding/agentic work | Announcement (4) | Confirmed |

## Scope note — model prompting vs fleet admission

Official Opus 5 availability on these pages does not establish that a local OMP route for `claude-opus-5` is executable. Dispatch eligibility is governed by the local provider route registry plus the latest canary, not by official model availability. Keep prompt design and route admission separate.
