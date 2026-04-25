---
name: NUDIMMUD HUD OS Revamp (April 2026)
description: Full personality + Oracle revamp — Oracle page rebuilt as React, streaming SSE, pixel art logo, token bars, VSCode wired, design master agent, GeneratedContent routing
type: project
originSessionId: cc6f7856-b5a7-4955-a018-4e12655ac49d
---
Oracle page is now a React component at `src/components/Oracle/OraclePage.tsx`. It replaces the old `oracleHTML()` + `bindOracle()` pattern in `main.ts`.

Streaming oracle: `GET /api/oracle/stream?command=...&model=...` — SSE, pipes Ollama token stream. Bridge: `submitOracleCommandStream()` in `oracleCommandBridge.ts`.

Stale timers bumped: staleSoft 10s→30s, staleHard 25s→60s.

Token status bar: polls `GET /api/telemetry/tokens` every 5s. Data written by hooks to `.claude/state/token-session.json` + `token-weekly.json`. T7 write bug fixed in token-session-end.js.

Generated content: `/Users/marcelspatz/GeneratedContent/{images,videos}/`. Symlinked as `NUDIMMUD/GeneratedContent`. kie.ai is primary image pipeline, browser automation routes for ChatGPT/Gemini.

Design Master skill: `.claude/skills/design-master/` — stores decisions in design-memory.json, learns per use.

VSCode primary IDE: `.vscode/tasks.json` has all offload lanes + Oracle tasks. `.vscode/extensions.json` created.

Pre-tool-use hook: `.claude/hooks/pre-tool-use.js` — scores tool calls, warns at high context pressure.

**Why:** Marcel wanted personality, token economy, fast Oracle responses, unified tool space, and visual synthesis pipeline.
**How to apply:** Always mount Oracle as React (`mountModule('ORACLE', ...)`) not old oracleHTML. Use design-master skill for all UI work.
