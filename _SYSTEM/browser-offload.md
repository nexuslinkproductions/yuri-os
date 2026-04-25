# Browser Offload Protocol

**Status:** WIP - Integrating Comet + Perplexity via browser-use MCP
**Capacity:** 2–3 concurrent browser instances
**Models:** Comet (primary UI), Perplexity (search/synthesis)

---

## Overview

Offload browser-dependent tasks (screenshots, UI interaction, web research) to Comet/Perplexity instead of running locally.

**Benefits:**
- Frees up M2 Pro CPU/memory for reasoning tasks
- Leverages browser ecosystem (Perplexity for web, Comet for UI control)
- Scales to multiple concurrent browser sessions

---

## Architecture

### Entry Point
```bash
./Scripts/ai @comet "<task description>"
./Scripts/ai @perplexity "<search query>"
```

### Browser-Use MCP Flow

```
User Task
    ↓
./Scripts/ai @comet
    ↓
offload.sh → offload-runner.mjs
    ↓
browser-use MCP client (localhost:8888 or remote)
    ↓
Comet Browser Instance (via Obsidian Web Clipper)
    ↓
[Action: screenshot/click/type]
    ↓
Vision LLM (Comet integrated or local)
    ↓
Result → User
```

---

## Comet Integration

### Setup

**Prerequisite:** Obsidian Web Clipper in Comet browser (installed per user note)

**MCP Configuration:**
```json
{
  "mcpServers": {
    "browser-use": {
      "command": "python",
      "args": ["-m", "browser_use.mcp"],
      "env": {
        "BROWSER_USE_PORT": "8888",
        "HEADLESS": "false"
      }
    }
  }
}
```

### Supported Operations

| Operation | Command | Status |
|-----------|---------|--------|
| Screenshot | `@comet "take screenshot"` | ✓ Ready |
| Click element | `@comet "click button labeled 'Save'"` | ✓ Ready |
| Type text | `@comet "type in search: neural networks"` | ✓ Ready |
| Navigate | `@comet "go to perplexity.com"` | ✓ Ready |
| Extract text | `@comet "extract all links on this page"` | 🔄 Pending |
| Form fill | `@comet "fill form: name='John', email='...'"` | 🔄 Pending |

### Example Workflow

```bash
# Step 1: Navigate to Comet
./Scripts/ai @comet "navigate to https://comet.com/search"

# Step 2: Take screenshot
./Scripts/ai @comet "screenshot"

# Step 3: Analyze and interact
./Scripts/ai @comet "I see a search box. Click it and search for 'quantum computing'"

# Step 4: Extract results
./Scripts/ai @comet "copy all visible search results to markdown"
```

---

## Perplexity Integration

### Setup

**Method 1: Via Comet Browser**
- User opens Perplexity in Comet
- Browser-use MCP interacts with Perplexity UI directly

**Method 2: Perplexity API (Future)**
- Direct API integration (requires API key)
- Faster than UI interaction, but less flexible

### Supported Operations

| Operation | Purpose | Status |
|-----------|---------|--------|
| Web search | Find recent data, papers, news | ✓ Via Comet UI |
| Synthesis | Generate summary from results | ✓ Via Comet UI |
| Citation | Retrieve source links | ✓ Via Comet UI |
| Follow-up | Multi-turn research conversations | 🔄 Pending |

### Example Workflow

```bash
# Search via Perplexity
./Scripts/ai @perplexity "find the latest Claude model release date and features"

# Behind the scenes:
# 1. Navigate to Perplexity in Comet
# 2. Type search query
# 3. Wait for results
# 4. Extract synthesis + sources
# 5. Return to user
```

---

## Task Delegation (Ruflo Integration)

### Automatic Routing

When a task requires browser interaction, Ruflo's `agent-coordination` skill auto-routes:

```
Task: "Find and summarize the latest research on X"
    ↓
[Ruflo detects web research need]
    ↓
Spawn @perplexity agent → search
Spawn @deepseek agent → synthesize results
Spawn @gpt-oss agent → format output
    ↓
Results aggregated
```

### Manual Routing

```bash
# Explicit multi-step workflow
./Scripts/ai @swarm perplexity,deepseek "research and summarize quantum computing"

# Or chained:
./Scripts/ai @perplexity "search quantum computing" | \
  ./Scripts/ai @deepseek "synthesize these results"
```

---

## Capacity & Performance

### Memory Footprint

Per browser instance:
- Comet + browser-use MCP: ~500MB
- Screenshot buffer: ~100MB
- LLM context: ~400MB
- **Total per instance:** ~1GB

**Safe concurrent limit:** 2–3 instances on 16GB M2 Pro

### Response Time

- Screenshot: ~500ms
- Click/Type: ~200ms
- Navigation: ~2–3s
- Full workflow: ~5–10s (varies by task complexity)

---

## Error Handling

### Browser Crash Recovery
```bash
# If browser-use MCP dies:
1. OS_KERNEL scheduler detects timeout (>30s)
2. Restart browser instance
3. Retry task from checkpoint
4. Max retries: 2
```

### Network Issues
```bash
# If Perplexity returns 429 (rate limit):
1. Exponential backoff: 5s → 10s → 20s
2. Queue in OS_KERNEL memory.db
3. Retry after cooldown
```

---

## Future Enhancements

1. **Headless Mode:** Speed up screenshot-only workflows
2. **Perplexity API:** Direct API for faster web research (pending API access)
3. **Form Recognition:** Auto-fill complex forms via vision
4. **Session Persistence:** Cache authenticated sessions across tasks
5. **Analytics:** Track browser task success rate, latency, memory usage

---

## References

- **Browser-use MCP docs:** https://github.com/anthropics/browser-use
- **Comet browser:** https://comet.com
- **Perplexity:** https://perplexity.com
- **Offload workflow:** `/Users/marcelspatz/NUDIMMUD/_SYSTEM/offload-workflow.md`
