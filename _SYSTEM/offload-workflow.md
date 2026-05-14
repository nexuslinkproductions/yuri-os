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
| `@qwen` | Needle local runtime | needle | General tasks, fallback | ✓ Ready |
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
./Scripts/ai --swarm deepseek,needle "fact-check this"
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

### OpenClaw Browser Handoff

OpenClaw stays the router. Real Chrome work belongs to the browser worker.

**Preferred path:**
- OpenClaw receives the task.
- OpenClaw hands browser tasks to the worker.
- Worker launches headed Chrome with Playwright `channel: 'chrome'`.
- Worker keeps the browser session persistent across tasks.
- Worker returns findings to OpenClaw, which writes the result to `memory.db`.

**Use this for:**
- Authenticated web sessions
- Visible browser debugging
- Screenshot-driven inspection
- Form filling and manual takeover

**Fallback:**
- Direct CDP attach only if the task must reuse an already-running Chrome instance.
- Fetch/curl only if the page is public and does not need browser state.

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

## Yuri Sandbox Improvement Loop

**Entrypoint:** `node Scripts/yuri-sandbox-loop.mjs --live --prompt "<task>"`
**Launcher alias:** `./Scripts/ai sandbox "<task>"`
**Route source of truth:** `Scripts/offload-contract.mjs`
**Default lane:** `@codex-spark`

The sandbox loop is an artifact-first improvement lane. It runs isolated experiments, verifies their effects, and captures only sanitized learning summaries. It does not treat raw model output as canonical truth.

### Lifecycle

```
detect
  -> classify prompt through offload-contract
isolate
  -> create a per-run artifact directory outside tracked repo state
self-probe
  -> verify runner dry-run artifact creation, Codex availability for live mode, and unchanged repo status
run
  -> execute Codex Spark through Scripts/codex-offload-runner.mjs
verify
  -> check route, lane, artifacts, protected-path status, and runner degradation
sanitize
  -> hash raw output and create compact verified summary
log
  -> write sanitized summary through Scripts/yuri-learning-capture.mjs
promote-check
  -> inspect learning queue without auto-approving candidates
report
  -> write live-action-report.md and final-report.md
```

### Artifact Contract

Each run writes:

- `run.json`
- `route-plan.json`
- `preflight.json`
- `sandbox-probe.json`
- `raw-output.md`
- `verification.json`
- `learning-summary.json`
- `live-action-report.md`
- `final-report.md`

### Canonical State Rules

- Sandbox artifacts are tainted and non-canonical.
- Raw output remains artifact-only.
- `_SYSTEM/OS_KERNEL/memory.db` receives only sanitized verified summaries through the existing learning-capture path.
- Existing lesson review and promotion gates remain mandatory.
- Protected paths are not read or mutated by sandbox lanes: token-state files, `.claude/state`, `.claude/history`, `.env`, `backend/data`, secrets, and `node_modules`.

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
| `@qwen` | `./Scripts/ai` | Needle local runtime | General tasks, fallback | ✓ Ready |
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
