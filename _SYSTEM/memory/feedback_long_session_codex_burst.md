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

## DeepSeek 1M Context — Large Burst Advantage

DeepSeek V4 Pro has a **1 million token context window**. During a Codex rate-limit window,
this is not just a fallback — it is an opportunity for deep analysis impossible at smaller context sizes.

**What to send DeepSeek during a Codex window:**
- Multiple full source files (no summarization needed)
- Entire directory trees dumped raw
- Full session history + prior EOT reports
- Large spec documents + existing implementations side-by-side
- Cross-file dependency analysis spanning 10-20 files at once

**Do NOT send DeepSeek summarized context packs** (old pattern: max 5 facts, 3 refs).
That was for rate-limited/token-scarce contexts. At 1M tokens: send everything raw.
DeepSeek can hold the full picture and produce more accurate analysis.

**Burst pattern:**
```
Codex burst → rate limited →
  ├── @deepseek LARGE BURST: send 10-30 full files + full session context
  │   → deep analysis, comprehensive spec, full blast radius map
  ├── llama3.2: local lightweight tasks (summaries, quick reads)
  ├── Deterministic: Bash checks, git operations, gitnexus
  └── 5-10min passes → Codex quota resets → implement from deepseek spec
```

**Why this is better than splitting into sessions:**
- DeepSeek in session already has the accumulated context from prior turns
- No re-sending of background/rules/prior decisions
- DeepSeek's spec feeds directly into Codex implementation — no handoff gap
- 1M tokens = can analyze the entire ruflo subproject in one call

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
