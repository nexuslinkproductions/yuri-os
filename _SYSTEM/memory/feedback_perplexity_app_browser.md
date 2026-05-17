# Rule: Perplexity App = the New Browser for Web Search

**Set:** 2026-05-14
**Severity:** HARD ROUTING RULE — applies to every web search task

## The Rule

**All web search routes through the Perplexity desktop app via Claude computer control.**

- Perplexity app = the canonical browser for research, lookup, current events, citations
- Comet has Obsidian Web Clipper attached for vault ingestion of results
- Computer control MCP tools (`mcp__computer-use__*`) drive the app

## What NOT to Do

- ❌ Do NOT call `WebSearch` tool
- ❌ Do NOT call `WebFetch` tool
- ❌ Do NOT use `curl` / `wget` for live web content
- ❌ Do NOT use the Perplexity API adapter (`_SYSTEM/Scripts/perplexity-adapter.mjs`) for general search
- ❌ Do NOT spawn an Agent for web research

## What TO Do

For any web search / research need:

1. `mcp__computer-use__request_access` for Perplexity app
2. `mcp__computer-use__open_application` Perplexity
3. `mcp__computer-use__screenshot` to see state
4. `mcp__computer-use__left_click` on the prompt input
5. `mcp__computer-use__type` the search query
6. Wait for response, screenshot the result
7. Read content from screenshot or use `mcp__computer-use__read_clipboard` after copy

## Why This Replaces API + WebSearch

- Perplexity Pro plan includes Deep Research mode (125+ source synthesis)
- Multiple model selection (Sonar Pro, Sonar Reasoning Pro, GPT-5.5 Max, Opus 4.7, etc.) within app
- Comet's Obsidian Web Clipper captures results directly into vault
- Filesystem access for local context fusion
- App is already authenticated — no API key juggling
- No token cost on the API adapter — token cost is on the Claude session running computer control

## When Perplexity API Adapter (`_SYSTEM/Scripts/perplexity-adapter.mjs`) IS Used

Only when explicitly requested by user (e.g., "use the perplexity API" or `--m perplexity`).
Default web research path is the app, not the API.

## Tooling Already Wired

- `mcp__computer-use__*` — full computer control (loaded via deferred ToolSearch)
- `mcp__Claude_in_Chrome__*` — Chrome browser tools (also loaded)
- `mcp__obsidian-mcp-tools__*` — vault ingestion of Comet clippings (loaded, points to /Users/marcelspatz/YURI-OS-MUSUBI)

## Evidence

User instruction 2026-05-14: "all of web search has to be done now via perplexity app, that is
our new 'browser'"

Earlier 2026-05-14: "perplexity is only going to be used with claude computer control to use
perplexity app chat (mcp tool for folder search is already present and functioning directed
to users/marcelspatz/NUDIMMUD)"

## Anti-Patterns to Catch

- Reaching for `WebSearch` reflexively for "what is X" or "current news on Y"
- Falling back to WebFetch when an inline URL appears
- Spawning agents for "research this topic"
- Using DeepSeek without tools for web research (DeepSeek has tools but no native web access)
