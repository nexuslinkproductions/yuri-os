# Perplexity via Claude Computer Use — Integration Workflow

**Pattern:** Claude Code → Computer Use → perplexity.ai chat → extract response → integrate into NUDIMMUD context
**Status:** Design specification (not yet implemented)
**Authority:** Extends `_SYSTEM/Scripts/offload-contract.mjs` `@perplexity` lane
**Date:** 2026-05-13

---

## Strategic Intent

Leverage Perplexity's deep reasoning and live web research capabilities **without API key dependency** by treating perplexity.ai chat as a browser-controlled tool. Claude Code uses computer use (screen capture, click, type) to drive the Perplexity interface directly, extracting responses and feeding them back into NUDIMMUD workflows.

**Why this works:**
- Claude Code has native computer use capabilities (Anthropic Computer Use API)
- Perplexity chat is accessible via browser with no authentication wall for basic use
- Response extraction from web UI is deterministic (DOM scraping, screenshot OCR)
- No API key cost, no rate limits beyond what Perplexity applies to free-tier chat

**Why this is better than API bridge:**
- Zero infrastructure (no custom MCP server to maintain)
- Zero API cost (uses free Perplexity chat tier)
- Direct access to Perplexity's full reasoning interface (not just API endpoints)
- Can leverage Perplexity's multi-model council, citations, follow-up context

---

## Lane Definition

The `@perplexity` lane in `offload-contract.mjs` already exists[1]:

```javascript
perplexity: {
  alias: '@perplexity',
  description: 'Browser research lane',
  preferredUsage: ['web research', 'latest facts', 'citations']
}
```

This workflow **implements** that lane via computer use rather than API.

---

## Workflow Steps

### Phase 1: Route Decision (Main Session)

When a task requires:
- Live web research ("What's the current status of...")
- Citation-backed analysis ("Compare X and Y with sources")
- Multi-perspective synthesis ("Analyze the debate around...")
- Real-time data (market info, breaking news, latest releases)

Main session routes to `@perplexity` lane.

### Phase 2: Task Spec Generation (Main Session)

Generate a bounded task spec in NUDIMMUD format:

```markdown
## PERPLEXITY COMPUTER USE TASK SPEC

**Query:** <exact question to send to Perplexity>

**Context:** <optional: background info Perplexity needs>

**Expected output:**
- [ ] Full response text extracted
- [ ] Citations captured (if present)
- [ ] Response saved to artifact file

**Success criteria:**
- Response is substantive (not error message or "I don't know")
- Response directly addresses the query
- All visible citations/sources are captured

**Timeout:** 120 seconds max
```

### Phase 3: Computer Use Execution (Claude Code)

**Implementation pattern:**

1. **Launch browser** → Open `https://perplexity.ai`
2. **Wait for load** → Verify homepage loaded (screenshot check or DOM query)
3. **Locate input** → Find the main query input field
4. **Type query** → Enter the exact query from task spec
5. **Submit** → Click search / press Enter
6. **Wait for response** → Poll until response is fully rendered (detect "generating..." → "complete")
7. **Extract response:**
   - **Method A (DOM scraping):** If Claude has DOM access, extract response container HTML
   - **Method B (Screenshot OCR):** Screenshot the response area, OCR the text
   - **Method C (Copy-paste simulation):** Select all response text, Cmd+C, read clipboard
8. **Extract citations** (if present): Capture all `[1]`, `[2]` citation markers + their URLs
9. **Save artifact:** Write response to `/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/perplexity-responses/response-{timestamp}.md`
10. **Return to Claude:** Close browser tab, report success + artifact path

**Error handling:**
- If Perplexity returns "I don't have enough information": capture that verbatim, mark as PARTIAL
- If browser fails to load: retry once, then report FAILED
- If response extraction fails: save screenshot as fallback, mark as DEGRADED

### Phase 4: Verification (Main Session)

Main session reads the artifact file:
- Verify response is non-empty
- Verify response addresses the original query
- If response quality is insufficient, optionally: refine query and re-route

### Phase 5: Integration (Main Session)

Main session uses the Perplexity response as evidence in the current workflow:
- Inline the response where needed (brief, analysis, report)
- Cite the artifact: `[perplexity-response:{timestamp}]`
- If Perplexity provided web citations, forward-cite them: `[web:N via perplexity]`

### Phase 6: Learn (Memory)

Record in session log:
- Query sent
- Response quality (FULL / PARTIAL / FAILED)
- Execution time
- Any corrections applied (if response was insufficient)

---

## Technical Implementation Notes

### Computer Use API Requirements

Claude Code must have:
- `computer` tool enabled in session
- Screen resolution set (recommend 1920x1080 for reliable UI targeting)
- Browser control permissions (no sandbox restrictions on opening URLs)

### Response Artifact Structure

```markdown
# Perplexity Response — {timestamp}

**Query:** {original query text}

**Response:**

{full response text extracted from UI}

**Citations:**

1. [Source Name](URL)
2. [Source Name](URL)
...

**Meta**
- Timestamp: {ISO 8601}
- Extraction method: {DOM / OCR / clipboard}
- Quality: {FULL / PARTIAL / DEGRADED / FAILED}
- Execution time: {seconds}
```

### DOM Selectors (as of 2026-05-13)

These may change as Perplexity updates their UI — verify on first use:

- Main input: `textarea[placeholder*="Ask anything"]` or similar
- Response container: likely a `div` with class containing "answer" or "response"
- Citations: look for `[1]`, `[2]` inline markers + a references section at bottom

**Robust extraction strategy:** If DOM selectors break, fall back to screenshot OCR immediately rather than debugging selectors mid-task.

---

## Integration with Existing NUDIMMUD Systems

### Offload Contract

Add to `_SYSTEM/Scripts/offload-contract.mjs` under the `perplexity` lane definition:

```javascript
perplexity: {
  alias: '@perplexity',
  description: 'Browser research lane via computer use',
  preferredUsage: ['web research', 'latest facts', 'citations'],
  implementation: 'computer-use-browser-control',
  artifactPath: '.claude/state/perplexity-responses/',
  timeout: 120,
  fallback: '@deepseek' // if computer use unavailable, route to DeepSeek reasoning
}
```

### Claude Code Skill

Create `.claude/skills/perplexity-computer-use/SKILL.md`:

```markdown
# perplexity-computer-use

Drive perplexity.ai chat via computer use to access deep research without API.

## When to use
- Query requires live web research
- Citation-backed analysis needed
- Multi-source synthesis required
- Real-time data (markets, news, releases)

## Tools required
- `computer` tool (screen, click, type)
- Browser access
- DOM or OCR capability

## Workflow
1. Generate task spec with exact query
2. Launch perplexity.ai
3. Type query, wait for response
4. Extract response + citations
5. Save to artifact file
6. Return artifact path to main session

## Artifact location
`.claude/state/perplexity-responses/response-{timestamp}.md`

## Quality gates
- Response must be substantive (not "I don't know")
- Extraction must be complete (no truncation)
- Citations captured if present
```

### Session State Tracking

Add to `.claude/state/` (create if missing):

- `perplexity-responses/` — directory for response artifacts
- `perplexity-query-log.json` — log of all queries sent, for debugging / cost tracking

### Memory Integration

Add to `memory-core.md` or create `_SYSTEM/memory/perplexity-integration.md`:

```markdown
# Perplexity Integration — Query Patterns

## High-success query types
- "What is the current status of [specific project/event]?"
- "Compare [A] and [B] with sources"
- "Summarize recent developments in [domain]"

## Low-success query types
- Speculative questions ("What will happen if...")
- Opinion questions ("Is X better than Y?")
- Requests for private/internal info (Perplexity only has public web)

## Corrections learned
- If Perplexity returns generic answer → add more specific constraints to query
- If citations missing → explicitly request "with sources" in query
```

---

## Example: Full Execution Trace

**Scenario:** User asks: "What's the latest on Anthropic's Claude 4 release?"

### Step 1: Main session routes to `@perplexity`

Recognizes query needs:
- Live web data ("latest")
- Specific factual answer (not reasoning)

### Step 2: Generate task spec

```markdown
## PERPLEXITY COMPUTER USE TASK SPEC

**Query:** What is the latest information on Anthropic's Claude 4 release, including release date, new capabilities, and pricing?

**Expected output:**
- [ ] Full response text
- [ ] Citations to official Anthropic announcements or credible tech news
- [ ] Response saved to artifact

**Success criteria:**
- Response includes specific dates or "not yet announced"
- Capabilities mentioned if released
- Pricing info if available
```

### Step 3: Claude Code executes

```
[COMPUTER USE] Opening https://perplexity.ai
[COMPUTER USE] Page loaded, input field detected
[COMPUTER USE] Typing query: "What is the latest information on Anthropic's Claude 4 release..."
[COMPUTER USE] Submitted, waiting for response
[COMPUTER USE] Response rendering... (15s)
[COMPUTER USE] Response complete, extracting
[COMPUTER USE] Extracted 847 characters
[COMPUTER USE] Found 4 citations
[COMPUTER USE] Saved to .claude/state/perplexity-responses/response-20260513-210500.md
[COMPUTER USE] Returning to main session
```

### Step 4: Main session verifies

Reads artifact:

```markdown
# Perplexity Response — 2026-05-13T21:05:00Z

**Query:** What is the latest information on Anthropic's Claude 4 release...

**Response:**

As of May 2026, Anthropic has not officially announced a "Claude 4" model. The current flagship is Claude 3.7 Opus, released in March 2026 [1]. Industry speculation suggests Claude 4 may arrive in Q4 2026, with rumors of significant improvements in reasoning and multimodal capabilities [2][3]. No official pricing has been announced. Anthropic's CEO Dario Amodei mentioned in a recent interview that the next major release will focus on "agentic workflows" and extended context windows [4].

**Citations:**

1. [Anthropic Official Blog - Claude 3.7 Release](https://anthropic.com/news/claude-3-7)
2. [The Information - Claude 4 Speculation](https://theinformation.com/...)
3. [TechCrunch - Anthropic Roadmap Leak](https://techcrunch.com/...)
4. [Interview with Dario Amodei - Future of Claude](https://youtube.com/...)

**Meta**
- Extraction method: DOM
- Quality: FULL
- Execution time: 18s
```

### Step 5: Main session integrates

Uses this in response:

> Claude 4 has not been officially announced by Anthropic as of May 2026. The current flagship model is Claude 3.7 Opus. Industry sources speculate a Q4 2026 release with focus on agentic workflows and extended context[perplexity:20260513-210500][1][2][3][4].

### Step 6: Memory records

Adds to session log:

```
PERPLEXITY_QUERY timestamp=2026-05-13T21:05:00Z query="Claude 4 release info" quality=FULL time=18s citations=4
```

---

## Cost-Benefit Analysis

### Benefits
- **Zero API cost** — uses free Perplexity chat
- **Zero infrastructure** — no custom servers, just browser automation
- **Full reasoning access** — Perplexity's multi-model council, not just API endpoints
- **Citations included** — automatic source tracking
- **No rate limits** — beyond what Perplexity applies to free tier

### Costs
- **Execution time** — 15-30s per query (vs. 2-5s for API)
- **Brittle to UI changes** — DOM selectors may break with Perplexity updates
- **Computer use overhead** — requires screen rendering, not headless API
- **No batch operations** — one query at a time

### When to Use This vs. API

| Scenario | Use computer use | Use API |
|---|---|---|
| Ad-hoc research queries | ✅ Yes | ❌ Overkill |
| High-frequency automated queries | ❌ Too slow | ✅ Yes |
| Need Perplexity's full UI features | ✅ Yes | ❌ Limited |
| Budget-constrained | ✅ Yes (free) | ❌ Paid |
| Production reliability required | ❌ Brittle | ✅ Stable |

---

## Implementation Priority

### Phase 1: Proof of Concept (1-2 hours)

1. Manually test computer use on perplexity.ai — verify Claude Code can:
   - Open URL
   - Type into input
   - Wait for response
   - Extract text (DOM or screenshot)
2. Save one successful response artifact
3. Verify artifact is readable and contains expected structure

### Phase 2: Skill Creation (2-3 hours)

1. Write `.claude/skills/perplexity-computer-use/SKILL.md`
2. Add `perplexity-responses/` directory to `.claude/state/`
3. Test 3-5 queries across different domains (tech news, market data, factual lookup)
4. Document failure modes (UI changes, extraction errors)

### Phase 3: Offload Integration (1-2 hours)

1. Update `_SYSTEM/Scripts/offload-contract.mjs` with implementation notes
2. Add routing logic: if `@perplexity` selected AND computer use available → execute workflow
3. Add fallback: if computer use unavailable → route to `@deepseek` with note

### Phase 4: Memory & Learning (1 hour)

1. Add query log tracking to `.claude/state/perplexity-query-log.json`
2. Create `_SYSTEM/memory/perplexity-integration.md` with learned patterns
3. Run 10+ queries, capture corrections, update memory file

---
## Maintenance Notes

### DOM Selector Monitoring

Perplexity's UI will change. When extraction fails:
1. Take screenshot of current UI
2. Inspect new DOM structure
3. Update selectors in skill file
4. Log the change in `_SYSTEM/memory/perplexity-integration.md`

### Extraction Method Priority

1. **DOM scraping** (fastest, most reliable when selectors are current)
2. **Clipboard simulation** (Cmd+A, Cmd+C — works even if DOM changes)
3. **Screenshot OCR** (slowest, but bulletproof fallback)

Always implement all three. Try DOM first, fall back to clipboard, OCR as last resort.

---

## Security & Privacy

- **No credentials stored** — uses free Perplexity tier, no login required
- **Query logging** — all queries saved to `.claude/state/perplexity-query-log.json` for transparency
- **No sensitive data** — do not send private/internal info to Perplexity (it's public web research)
- **Response artifacts** — stored locally in `.claude/state/`, not synced to cloud

---

## Conclusion

This workflow transforms Perplexity from "external service requiring API key" into "browser-controlled research tool" that Claude Code can invoke as naturally as running a shell command. The `@perplexity` lane already exists in the offload contract — this document defines how to **implement** it via computer use rather than API.

**Next action:** Run Phase 1 proof of concept. One successful query → response artifact → integrate into a real NUDIMMUD task. Then formalize.

---

**References:**

[1] `_SYSTEM/Scripts/offload-contract.mjs` — `perplexity` lane definition
[2] Anthropic Computer Use API documentation
[3] `CODEX_PROTOCOL.md` — task spec format
[4] `_SYSTEM/yuri-origin.md` — evidence contract, verification phase
