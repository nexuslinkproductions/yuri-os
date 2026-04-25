# NUDIMMUD Offload Workflow

**Status:** Integrating Ruflo + Openclaw with existing offload infrastructure.
**Last Updated:** 2026-04-24
**Capacity:** 8–14 sub-agents (M2 Pro, 16GB unified memory)

---

## Architecture Overview

Three-tier offload routing:
1. **Primary:** Local inference (Deepseek, Qwen, GPT-OSS via Ollama)
2. **Secondary:** Browser offload (Comet, Perplexity)
3. **Fallback:** Claude (when local saturated or task requires language nuance)

### Entry Point
```bash
./Scripts/ai @<lane> "<prompt>"
```

### Lanes

| Lane | Provider | Model | Use Case | Status |
|------|----------|-------|----------|--------|
| `@deepseek` | Local Ollama | deepseek-r1:latest | Reasoning, code analysis | ✓ Ready |
| `@qwen` | Local Ollama | qwen2.5:7b | General tasks, fallback | ✓ Ready |
| `@gpt-oss` | Local wrapper | GPT-OSS:20b/120b | Rendering, formatting | ✓ Ready |
| `@ollama` | Local Ollama | Any registered | Custom models | ✓ Ready |
| `@comet` | Browser (Comet) | Integrated via browser-use MCP | Web interaction, browser control | 🔄 In Progress |
| `@perplexity` | Browser (Perplexity) | Web search, synthesis | Research, fact-checking | 🔄 In Progress |
| `@swarm` | All parallel | Deepseek + GPT-OSS + Ollama | Consensus, cross-check | ✓ Ready |
| `@claude` | Claude (fallback) | Claude 3.5 Sonnet | High-nuance, safety-critical | ✓ Ready |

---

## Task Routing Rules

### Automatic Dispatch (via offload.sh context)

**Deepseek** ← Code generation, multi-step reasoning, algorithm design
**GPT-OSS** ← Formatting, synthesis, template generation, UI text
**Qwen** ← General Q&A, summarization, extraction
**Comet** ← UI interaction, screenshot analysis, browser automation
**Perplexity** ← Web research, real-time data, external APIs
**Swarm** ← High-stakes decisions, consensus needed, validation required

### Manual Override
```bash
./Scripts/ai --model deepseek "analyze this code"
./Scripts/ai --swarm deepseek,qwen "fact-check this"
```

---

## Integration: Ruflo + Openclaw

### Ruflo Agent Coordination
**File:** `/Users/marcelspatz/NUDIMMUD/RESEARCH/ruflo/.agents/skills/agent-coordination/`

**How it works:**
1. Ruflo `agent-coordination` skill detects multi-agent opportunity
2. Dispatches via OS_KERNEL syscalls/kernel.py
3. Queues tasks in OS_KERNEL memory.db
4. Swarm-handoff.sh executes offload lanes in parallel
5. Results aggregated back to primary agent

### Openclaw Skill Discovery
**File:** `/Users/marcelspatz/NUDIMMUD/RESEARCH/ORACLE-CORPUS/openclaw-openclaw/`

**Setup:**
```bash
openclaw mcp set offload '{"url":"http://127.0.0.1:8081/mcp","transport":"streamable-http"}'
```

**Skill Bridging:**
- `skill-discovery` → finds available models
- `delegate-task` → routes to appropriate lane
- `model-adapter` → normalizes input/output across APIs

---

## Browser Offload (Comet / Perplexity)

### Comet Integration

**Protocol:** browser-use MCP + remote agent orchestration
**Location:** `/Users/marcelspatz/NUDIMMUD/_SYSTEM/browser-offload.md` (WIP)

**Triggers:**
```bash
# Take screenshot, analyze, return action
./Scripts/ai @comet "click the 'Sign In' button in the top-right"

# Full browser session control
./Scripts/ai @comet "navigate to perplexity.com and search for 'neural networks'"
```

### Perplexity Integration

**Via:** Comet browser + Perplexity UI
**Data Flow:** Comet visual → extraction → LLM response

---

## Task State Tracking

**Database:** `/Users/marcelspatz/NUDIMMUD/_SYSTEM/OS_KERNEL/memory.db` (SQLite)

**Schema:** (from schema.sql)
- `agent_id` | `task_id` | `state` | `model` | `created_at` | `completed_at`

**Queries:**
```sql
-- Current load
SELECT model, COUNT(*) as active_tasks FROM tasks WHERE state='ACTIVE' GROUP BY model;

-- Agent health
SELECT agent_id, SUM(CASE WHEN state='COMPLETED' THEN 1 ELSE 0 END) as success_rate FROM tasks GROUP BY agent_id;
```

---

## Capacity Planning (M2 Pro, 16GB)

**Memory per agent:** ~1GB
**Overhead:** ~2GB (OS + Ollama + browser)
**Usable:** ~13GB

**Safe Config:**
```
Deepseek (7B):  2 agents  (2GB per agent)
Qwen (7B):      2 agents
GPT-OSS (20B):  1 agent   (6GB)
Browser:        2–3 concurrent tabs (Comet + Perplexity)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total:          8–9 agents + 2–3 browser tabs
```

**Overload Handler:**
- Monitor memory via `./Scripts/ai --list`
- If >90% memory, gracefully queue remaining tasks
- OS_KERNEL scheduler auto-retries after 2min cooldown

---

## Execution Flow

```
User Input
    ↓
./Scripts/ai @<lane> "prompt"
    ↓
offload.sh (parse args)
    ↓
offload-runner.mjs (initialize model)
    ↓
[Ruflo] agent-coordination detects multi-agent opportunity
    ↓
[OS_KERNEL] memory.db queues task(s)
    ↓
swarm-handoff.sh spawns N sub-agents in parallel
    ↓
Each agent → offload lane (Deepseek/GPT-OSS/Comet/etc)
    ↓
Results aggregated
    ↓
Response to user
```

---

## Next Steps

1. **Comet/Perplexity Bridge:** Finalize browser-offload.md + test screenshot → action loop
2. **Ruflo Sync:** Verify `agent-coordination` dispatches to offload lanes correctly
3. **Capacity Monitor:** Deploy memory tracking in OS_KERNEL scheduler
4. **Users Folder:** Consolidate scattered folders → canonical `/01_PROJECTS/ORACLE/backend/src/api/users`

---

## Gemini CLI Integration (2026-04-24)

### Gemini CLI Lane (`g`)

**Status:** Active — primary free workhorse for all non-Claude tasks  
**Token cost:** Zero (Google paid tier, unlimited)  
**Context window:** 1M tokens (Gemini Flash 3.1)

| Trigger | Command | Use Case |
|---------|---------|----------|
| File ops, doc writing | `g "<prompt>"` | Template gen, synthesis, archiving |
| Large context (>50k) | `g` via RLM pattern | Recursive shard processing |
| Background analysis | Antigravity tab | Shadow context, Full Tape |
| NotebookLM prep | `g "prepare markdown digest"` | Pre-process before manual upload |

**Token Routing Rule:** If a task can run on `g` or local LLM → it MUST. `c` (Claude) only for tasks requiring Claude's specific capability.

### RLM Pattern (Recursive Language Model)

Gemini Flash processes large-context tasks via REPL loop — decomposing, recursively calling itself, and outputting a **Mental Map JSON** per shard. Sonnet ingests the JSON map (not raw output) to preserve token bandwidth.

```bash
# Example: large vault analysis
g "analyze these 80k tokens of vault content. Output Mental Map JSON with: task, shards_processed, key_findings[], open_questions[], next_shard"

# Antigravity background tab for shadow context
# Keeps Full Tape playback without burning active context
```

**Reference:** [`rlm-synthesis.md`](../06_KNOWLEDGE-BASE/05_OPERATIONAL/rlm-synthesis.md) — full synthesis of MIT RLM paper

### Antigravity Universal Pipe (`apip`)

Chain CLI tools directly in Antigravity:

```bash
apip g "synthesize this document" | apip c "extract action items"
apip x "review code" | apip g "write documentation for it"
```

### Updated Lane Table

| Lane | CLI | Provider | Use Case | Status |
|------|-----|----------|----------|--------|
| `@deepseek` | `./Scripts/ai` | Local Ollama | Reasoning, code analysis | ✓ Ready |
| `@qwen` | `./Scripts/ai` | Local Ollama | General tasks, fallback | ✓ Ready |
| `@gpt-oss` | `./Scripts/ai` | Local wrapper | Rendering, formatting | ✓ Ready |
| `@ollama` | `./Scripts/ai` | Local Ollama | Custom models | ✓ Ready |
| `@gemini` | `g` | Google (unlimited) | Free workhorse, RLM loops | ✓ Active |
| `@comet` | `./Scripts/ai` | Browser (Comet) | Web interaction | 🔄 In Progress |
| `@perplexity` | `./Scripts/ai` | Browser | Research, fact-checking | 🔄 In Progress |
| `@swarm` | `./Scripts/ai` | All parallel | Consensus, cross-check | ✓ Ready |
| `@claude` | `c` | Anthropic | High-nuance, orchestration | ✓ Active |
| `@codex` | `x` | OpenAI | Code-specific tasks | ✓ Active |

---

## References

- **Existing offload.sh:** `/Users/marcelspatz/NUDIMMUD/Scripts/offload.sh`
- **Offload runner:** `/Users/marcelspatz/NUDIMMUD/Scripts/offload-runner.mjs`
- **OS_KERNEL:** `/Users/marcelspatz/NUDIMMUD/_SYSTEM/OS_KERNEL/`
- **Ruflo:** `/Users/marcelspatz/NUDIMMUD/RESEARCH/ruflo/`
- **Openclaw docs:** `/Users/marcelspatz/NUDIMMUD/RESEARCH/ORACLE-CORPUS/openclaw-openclaw/docs/providers/`
