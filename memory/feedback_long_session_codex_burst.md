# Rule: Single Long Session > Multiple Short Sessions for Codex Work

**Set:** 2026-05-14
**Severity:** OPERATIONAL RULE — applies whenever planning Codex-heavy campaigns

## The Insight

When Codex hits a rate limit window (~5-10min), DO NOT end the session and start a new one.
Stay in session. The rate limit pause costs less than a fresh session startup.

## Cost Comparison

**Multi-session approach:**
- Session startup overhead: ~2-3min per session (hooks, palace inject, tool loads, context rebuild)
- Tool deferred loads: re-acquired each session
- Context re-establishment: re-read RUNBOOK.md, session-state, MEMORY.md, relevant files
- Ollama model cold-start: llama3.2 needs re-warming
- GitNexus: may need re-index
- Total: 6-9min overhead for 3 sessions vs actual work

**Single long session with staged bursts:**
- Pay startup cost ONCE
- Rate limit window (~5-10min): do DeepSeek analysis, llama3.2 local work, or git operations
- Resume Codex when quota resets
- All context, tools, warm models stay live throughout

## Session Assets That Stay Warm (don't re-pay)

- GitNexus graph already enriched and warm
- palace-context already injected
- llama3.2 loaded in Ollama memory
- All deferred tools resolved (mcp__*, ToolSearch calls done)
- Session token context holds full decision history (no handoff hallucination risk)
- Codex artifact directories accessible
- BLOCKED file guards already computed

## The Operational Pattern

```
Codex burst → rate limited →
  ├── Dispatch @deepseek for analysis/spec work
  ├── Run llama3.2 local tasks (summaries, file reads)
  ├── Run deterministic Bash checks, git operations, gitnexus
  └── 5-10min passes naturally → Codex quota resets → next burst
```

## When TO Start a New Session

- Context window at 80%+ (compact first, then continue)
- Explicit user EOT request
- Unrelated work domain that would pollute context

## When NOT to Start a New Session

- Codex rate limited (wait it out)
- One task complete, more pending (stay in session)
- "Need fresh context" — compact instead

## Evidence

User instruction 2026-05-14: "one entire session going of these bursts with codex to keep
context and consistency without needing to launch several sessions that require new context
and tool load up etc"
