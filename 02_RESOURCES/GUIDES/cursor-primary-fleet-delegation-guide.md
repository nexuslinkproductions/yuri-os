# Cursor Primary Workspace — Full Fleet Delegation Guide

**Audience:** Marcel (operator) + GLM-5.2 (orchestrator peer)  
**Repo:** `YURI-OS-MUSUBI`  
**Date:** 2026-06-29  
**Purpose:** Switch from VS Code → Cursor as the main cockpit, and delegate work across **all four quota pools** without Deerflow, Hermes, or any external agent harness.

---

## 0. Executive summary

You do **not** delegate through Cursor's model picker alone. You delegate through **YURI's fleet control plane**, with Cursor as the **cockpit**:

| Pool | What it is | Delegation mechanism |
|------|------------|----------------------|
| **Cursor Pro** | IDE, Tab, Composer, Background Agents | Cursor Agent / Background Agent (one native lane) |
| **Claude (Anthropic)** | Opus orchestrator + Sonnet/Haiku Agents | Claude Code session + Cursor `Task` tool |
| **z.ai GLM** | glm-5.2 / glm-4.7 / flash peers | `glm-fleet.mjs`, `runSwarm.mjs`, `ai claude-zai` |
| **Ollama Pro** | Bulk cross-family peers (3 concurrent) | `ollama-fleet.mjs` |

**Control plane entry points (in order of ambition):**

1. **Single lane** — `ai llm <lane> "prompt"` or Cursor Agent inline  
2. **Parallel fan-out** — `glm-fleet.mjs` / `ollama-fleet.mjs` / multiple Cursor Agents  
3. **Governed company run** — `mure/company.mjs` → roles → `runSwarm` + native specs  
4. **Full opus-fleet model** — Opus/GLM-5.2 orchestrates all three substrates + verifies + finalizes

**Golden rule:** Scripts and GLM lanes **plan and execute**. Cursor/Opus **reviews, spawns native Agents, and finalizes** (commit/push). Agents never finalize alone.

---

## 1. Mental model — who does what

```
                    ┌─────────────────────────────────────┐
                    │  YOU (Marcel) — owner, one-token    │
                    │  confirms for owner-gated decisions │
                    └─────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
   ┌─────────────┐            ┌─────────────┐            ┌─────────────┐
   │ Cursor Pro  │            │ Claude Code │            │  Terminal   │
   │  (cockpit)  │◄──review───│  Opus lane  │──dispatch─►│  YURI fleet │
   │ edit · Tab  │            │ orchestrate │            │  scripts    │
   │ bg agents   │            │ native Agent│            │             │
   └─────────────┘            └─────────────┘            └──────┬──────┘
          │                           │                         │
          │                           │              ┌──────────┼──────────┐
          │                           │              ▼          ▼          ▼
          │                           │         glm-fleet  ollama-fleet  MURE
          │                           │         (z.ai)    (Ollama)    (roles)
          └───────────────────────────┴──────────────────────────┘
                              shared blackboard:
                    .claude/jobs/<runId>/results/*.json
```

### Lane responsibilities

| Lane | Best for | Never use for |
|------|----------|---------------|
| **Cursor Tab/Composer** | Fast edits, inline refactors, reviewing diffs | Fleet orchestration, z.ai/Ollama routing |
| **Cursor Background Agent** | Parallel read-only research, scoped multi-file tasks | Finalize, arming gates, protected paths |
| **Claude native Agents** (Cursor `Task` or Claude Code) | Judgment, MCP, browser, native tools | Cheap bulk (wastes Anthropic quota) |
| **glm-fleet / runSwarm** | Architecture, adversarial pass, 1M context, recursion | MCP/browser (not available) |
| **ollama-fleet** | Bulk research, tests, census, cheap fan-out | Finalize, protected-path work without review |

---

## 2. Prerequisites

### 2.1 Subscriptions

- [ ] **Cursor Pro** — BYOK, Background Agents, Composer quota  
- [ ] **Anthropic** (Claude Pro/Max or API) — Opus orchestrator + native Agents  
- [ ] **z.ai Coding Plan** — GLM fleet (`glm-5.2`, `glm-4.7`, flash tiers)  
- [ ] **Ollama Pro** — 3-concurrent ollama-cloud fleet  

### 2.2 Keys (macOS Keychain preferred)

Service prefix: `YURI_OS_MUSUBI:<VAR_NAME>`

| Variable | Used by |
|----------|---------|
| `OLLAMA_API_KEY` | `ollama-fleet`, `llm-lane ollama-cloud` |
| Z.ai token | `ai claude-zai`, `glm-fleet` (via env or `~/.config/yuri/env.sh`) |
| Anthropic | Claude Code, Cursor BYOK |

Verify hydration:

```bash
cd /Users/marcelspatz/YURI-OS-MUSUBI
node _SYSTEM/Scripts/ai doctor
ai llm capabilities | head -80
```

### 2.3 Repo sanity

```bash
cd /Users/marcelspatz/YURI-OS-MUSUBI
git branch --show-current   # expect: main
pwd                       # expect: repo root
node _SYSTEM/mure/mure.mjs --validate
node _SYSTEM/Scripts/glm-fleet.mjs --list
node _SYSTEM/Scripts/ollama-fleet.mjs --list
```

---

## 3. Cursor setup (VS Code → Cursor migration)

### 3.1 First open

1. **File → Open Folder** → `YURI-OS-MUSUBI`  
2. Trust the workspace when prompted  
3. Install recommended extensions if offered (or import from VS Code)  
4. **Terminal → New Terminal** — all fleet commands run here  

### 3.2 Cursor Pro configuration

**Settings → Models:**

1. Add **Anthropic API key** (BYOK) — routes Composer/Agent through your subscription where supported  
2. Do **not** rely on z.ai/Ollama override in Cursor for fleet work — use YURI lanes instead  
3. Enable **Background Agents** for supplemental parallel lanes  

**Settings → Rules:**

- Workspace rules already live in `.cursor/rules/` — they load automatically  
- Policy spine: `_SYSTEM/yuri-origin.md`, `CLAUDE.md`, `AGENTS.md`  

### 3.3 Recommended Cursor layout

| Pane | Purpose |
|------|---------|
| **Editor** | Review fleet output, edit files |
| **Terminal (primary)** | `runSwarm`, `company.mjs`, `glm-fleet`, `ollama-fleet` |
| **Terminal (secondary)** | `ai claude-zai` or `ai claude` orchestrator session |
| **Cursor Chat / Agent** | Native lane — spawn `Task` subagents for research/testing |
| **Optional: browser tab** | `http://localhost:4270` — MURE work dashboard |

Start dashboard:

```bash
node _SYSTEM/Scripts/work-dashboard.mjs --serve
# open http://localhost:4270
```

### 3.4 VS Code habits to drop

| Old (VS Code) | New (Cursor + YURI) |
|---------------|---------------------|
| `code .` as main entry | Open folder in Cursor |
| `ai code` to open VS Code | Use Cursor directly |
| Solo Claude for everything | Opus orchestrates; fleets execute |
| One model for all tasks | Route by substrate (see §5) |

`ai code` still works if you need VS Code for something specific — Cursor is now primary per `.cursor/rules/sync.mdc`.

---

## 4. The four delegation substrates (detailed)

### 4.1 Substrate A — Cursor (native IDE lane)

**Invoke:** Cursor Agent panel, Background Agents, Composer  
**Quota:** Cursor Pro pool  
**Powers:** Edit, search, terminal (sandboxed), MCP plugins  

**When to delegate here:**

- Quick multi-file edits you want to see inline  
- Background research while terminal fleets run  
- UI review, small scoped patches  

**Dispatch pattern (Cursor Agent):**

```
Use MAXIMUM reasoning depth.

ROLE: Research lane for Opus-orchestrated task in YURI-OS-MUSUBI.
CONTEXT: <self-contained state — agents lack conversation history>
TASK: <bounded, exact>
DO NOT: touch protected paths (backend/data, .env, node_modules, .claude/state);
        commit; force-push.
RETURN: table / verdict / file list with evidence.
```

**Limitation:** Cursor Background Agents do **not** use your z.ai or Ollama keys reliably. Treat Cursor as **Anthropic/Cursor-hosted native lane only**.

---

### 4.2 Substrate B — Claude (Anthropic native Agents)

**Invoke:**

- **In Cursor:** `Task` tool (`subagent_type: explore|generalPurpose`, `model: sonnet|fast`)  
- **In terminal:** `ai claude` or `ai claude-full` (interactive Claude Code)  
- **Via MURE:** `nativeSpecs` from `planCompany` — **you** spawn them  

**Quota:** Anthropic weekly / subscription pool  
**Powers:** Full native tools, MCP, browser, highest judgment quality  

**Fleet sizing:** Up to **~12 parallel** native Agents per round when work divides cleanly. Native Agents are **flat** (no sub-sub-agents) — compensate with breadth.

**Critical seam:** `native-spawn-loop.mjs` writes **stub packets** when run from scripts. The **real** native execution happens when **you** (or Opus in Cursor/Claude Code) read `nativeSpecs` and spawn `Task` agents, then write results to:

```
.claude/jobs/<runId>/results/native-<id>.json
```

Packet schema:

```json
{
  "laneId": "research",
  "role": "scout",
  "resultLabel": "01SC_TASK_DONE_X_PASS_COMMITTED",
  "text": "...full output...",
  "status": "ok"
}
```

---

### 4.3 Substrate C — z.ai GLM fleet

**Invoke:**

```bash
# Interactive full Claude Code on GLM
ai claude-zai
# Opus-tier: ZAI_MODEL=glm-5.2 ai claude-zai

# Parallel fleet
node _SYSTEM/Scripts/glm-fleet.mjs --list
YURI_GLM_FLEET=1 node _SYSTEM/Scripts/glm-fleet.mjs --tasks '[...]' --concurrency 3

# Governed loop (orchestrator binary)
node _SYSTEM/Scripts/runSwarm.mjs --leaves-file leaves.json --rounds 3

# Role-based company run
node _SYSTEM/mure/company.mjs --task-file task.json
```

**Quota:** z.ai Coding Plan (independent of Anthropic)  
**Powers:** Full operator harness via `llm-lane.mjs` — read, write, edit, bash, xref  

**GLM tier roster:**

| Alias | Model | Use |
|-------|-------|-----|
| `glm-max` | glm-5.2 | Opus-peer — design, architecture, adversarial |
| `glm` | glm-4.7 | Sonnet — code-gen, judgment |
| `glm-flash` | glm-4.7-flash | Haiku — census, fast tests (free tier) |
| `glm-sub-orch` | glm-5.1 | Sub-orchestrator overflow |

**Hard rules:**

- Always `--reasoning high` (GLM max equivalent)  
- Never `tee` or `>` on GLM streams — use `--out`  
- Verify every GLM "done" claim against local evidence  
- DISARMED by default — arming is owner-gated (§6)  

---

### 4.4 Substrate D — Ollama Pro fleet

**Invoke:**

```bash
node _SYSTEM/Scripts/ollama-fleet.mjs --list
YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs --tasks '[...]' --concurrency 3
```

**Quota:** Ollama Pro (3 concurrent, independent)  
**Powers:** Same harness as GLM — full read/write/bash peers  

**Roster tiers:**

| Tier | Model | Use |
|------|-------|-----|
| `flash` | deepseek-v4-flash:cloud | **Default bulk** — blast freely |
| `minimax` | minimax-m3:cloud | Efficient generalist |
| `kimi` | kimi-k2.7-code:cloud | Code specialist |
| `nemotron` | nemotron-3-ultra:cloud | Heavy reasoning |
| `deepseek-pro` | deepseek-v4-pro:cloud | True 1M — reserve for hard jobs (~2× cost) |

**Note:** `company.mjs` does not yet auto-dispatch ollama leaves. For tri-substrate runs, fire `ollama-fleet` **in parallel** with `runSwarm` / MURE (§7.3).

---

## 5. Routing decision tree

Use this **before** every non-trivial task:

```
START: Non-trivial task?
│
├─ NO  → Do inline in Cursor (Tab/Composer) or single `ai llm` call
│
└─ YES → Can it parallelize into independent lanes?
         │
         ├─ NO  → Single glm-max or Opus session
         │
         └─ YES → How many lanes? What kind?
                  │
                  ├─ Research / census / grep-survey
                  │     → ollama:flash (bulk) OR native:haiku OR glm-flash
                  │
                  ├─ Code-gen / patches / refactors
                  │     → glm:glm OR native:sonnet
                  │
                  ├─ Architecture / design / adversarial
                  │     → glm:glm-max OR native:opus
                  │
                  ├─ Testing / log parsing / mechanical verify
                  │     → ollama:flash OR native:haiku OR glm-flash
                  │
                  ├─ MCP / browser / computer-use
                  │     → native ONLY (Claude/Cursor)
                  │
                  └─ Finalize (commit / push / outward)
                        → Opus/owner ONLY — never delegate
```

**Spread across all three execution substrates** when quotas are independent and lanes are truly parallel → up to ~3× throughput.

---

## 6. Arming ceremony (owner-gated)

All fleet dispatch is **DISARMED by default** (dry-run, zero spend). Arming spends real quota and fans out processes.

### 6.1 Flag files (persistent until removed)

```bash
cd /Users/marcelspatz/YURI-OS-MUSUBI

# Full company run (MURE + runSwarm)
touch _SYSTEM/state/mure.enabled
touch _SYSTEM/state/glm-fleet.enabled
touch _SYSTEM/state/swarm-convergence.enabled

# Ollama bulk (optional, parallel)
touch _SYSTEM/state/ollama-fleet.enabled
```

### 6.2 Disarm (instant, reversible)

```bash
rm _SYSTEM/state/mure.enabled
rm _SYSTEM/state/glm-fleet.enabled
rm _SYSTEM/state/swarm-convergence.enabled
rm _SYSTEM/state/ollama-fleet.enabled
```

### 6.3 Session env (no file, dies with terminal)

```bash
export YURI_MURE_ARMED=1
export YURI_GLM_FLEET=1
export YURI_SWARM_CONVERGENCE=1
export YURI_OLLAMA_FLEET=1
```

### 6.4 Check arm state

```bash
node _SYSTEM/mure/mure.mjs --status
node _SYSTEM/Scripts/glm-fleet.mjs --list
node _SYSTEM/Scripts/ollama-fleet.mjs --list
```

**Never arm recursively** (`YURI_NANOSWARM_SPAWN=1`) until you have reviewed drain-lease hardening. Depth-5 recursion is owner-gated and deferred.

---

## 7. Delegation workflows (copy-paste ready)

### 7.1 Tier S — Trivial (no fleet)

**When:** Single file read, one-liner fix, conversation  
**Delegate to:** Cursor Tab or inline Agent  
**Commands:** None  

---

### 7.2 Tier M — Medium (parallel fan-out, no MURE)

**When:** 2–6 independent research/code/test lanes  
**Delegate to:** Manual tri-substrate fan-out  

**Step 1 — Write task file** `task.json`:

```json
{
  "summary": "Audit module X for missing error handling",
  "lanes": [
    { "substrate": "ollama", "tier": "flash", "label": "R1", "prompt": "Census all throw sites in _SYSTEM/Scripts/foo.mjs. RETURN: table." },
    { "substrate": "glm", "lane": "glm", "label": "C2", "prompt": "Propose patches for each gap. Self-verify. RETURN: diff summary + RESULT_LABEL." },
    { "substrate": "native", "model": "sonnet", "label": "N1", "prompt": "Adversarially verify GLM patches against local evidence. RETURN: verdict." }
  ]
}
```

**Step 2 — Fire ollama + glm in parallel (terminal):**

```bash
# Terminal A
YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs \
  --tasks '[{"tier":"flash","label":"R1","prompt":"..."}]' --concurrency 3

# Terminal B (note runId from output)
YURI_GLM_FLEET=1 node _SYSTEM/Scripts/glm-fleet.mjs \
  --tasks '[{"lane":"glm","label":"C2","prompt":"..."}]' --concurrency 3
```

**Step 3 — Fire native lane (Cursor Agent):** spawn one `Task` per native lane from step 1.

**Step 4 — Review** results in `.claude/jobs/<runId>/results/`.

---

### 7.3 Tier L — Large (MURE company run)

**When:** Multi-role build with governance, convergence, held decisions  
**Delegate to:** `company.mjs` + manual native spawn + optional ollama parallel  

**Step 1 — Copy and edit task file:**

```bash
cp _SYSTEM/mure/_engineer-task.json /tmp/my-task.json
# edit subtasks for your goal
```

Task schema:

```json
{
  "summary": "One-line goal",
  "tags": ["build", "audit"],
  "subtasks": [
    {
      "id": "unique-id",
      "need": ["capability-from-roster"],
      "prompt": "Self-contained prompt. End with RESULT_LABEL requirement.",
      "blastRadius": "LOW|MEDIUM|HIGH",
      "reversible": true,
      "role": "optional-explicit-role-id"
    }
  ]
}
```

**Step 2 — Plan (zero spend):**

```bash
node _SYSTEM/mure/mure.mjs --demo
node _SYSTEM/mure/company.mjs --task-file /tmp/my-task.json --dry-run
```

Review output: `glmLeaves`, `nativeSpecs`, `held` (owner-gated items).

**Step 3 — Arm and run GLM substrate:**

```bash
touch _SYSTEM/state/mure.enabled
touch _SYSTEM/state/glm-fleet.enabled
touch _SYSTEM/state/swarm-convergence.enabled

node _SYSTEM/mure/company.mjs --task-file /tmp/my-task.json
```

Note `swarm.runId` and `swarm.runDir` from output.

**Step 4 — Parallel ollama bulk (optional, separate terminal):**

```bash
touch _SYSTEM/state/ollama-fleet.enabled
YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs \
  --tasks '[{"tier":"flash","label":"BULK1","prompt":"..."},{"tier":"kimi","label":"BULK2","prompt":"..."}]' \
  --concurrency 3
```

**Step 5 — Spawn native specs (Cursor or Claude Code):**

Read `nativeSpecs` from company output. For each spec, spawn a Cursor `Task`:

```
subagent_type: generalPurpose (edits) or explore (read-only)
model: sonnet | fast
prompt: <paste spec.prompt verbatim>
```

Write each result to:

```
.claude/jobs/<runId>/results/native-<spec.id>.json
```

**Step 6 — Verify and finalize (you / Opus only):**

- Read all `results/*.json`  
- Attack every load-bearing claim (adversarial verification skill)  
- Run smallest meaningful local checks  
- Commit with explicit pathspec only: `git add <paths> && git commit -- <paths>`  

---

### 7.4 Tier XL — GLM-5.2 as orchestrator peer

**When:** You want GLM-5.2 to run the full opus-fleet model (not just execute a leaf)  

**Step 1 — Start GLM orchestrator session:**

```bash
ZAI_MODEL=glm-5.2 ai claude-zai
```

**Step 2 — Paste this preamble** (first message):

```
You are the SUB-ORCHESTRATOR for YURI-OS-MUSUBI.

Load and follow: skills/opus-fleet/SKILL.md (full protocol).

Your job: decompose → dispatch peer lanes → aggregate → adversarially verify → report.
You do NOT finalize (commit/push). Marcel does.

Substrates available:
- glm-fleet: node _SYSTEM/Scripts/glm-fleet.mjs (needs YURI_GLM_FLEET=1)
- ollama-fleet: node _SYSTEM/Scripts/ollama-fleet.mjs (needs YURI_OLLAMA_FLEET=1)
- runSwarm: node _SYSTEM/Scripts/runSwarm.mjs --leaves-file leaves.json
- MURE: node _SYSTEM/mure/company.mjs --task-file task.json

DISARMED by default. Ask Marcel before arming.
Every lane prompt must be self-contained and end with RESULT_LABEL.
Verify every peer claim against local evidence before trusting.

TASK: <paste goal here>
```

**Step 3 — Marcel reviews in Cursor** while GLM orchestrates in the terminal session.

---

## 8. GLM-5.2 execution packet

**Hand this section to GLM-5.2 verbatim** when you want it to operate as orchestrator.

---

### GLM-5.2 ORCHESTRATOR PACKET

```
ROLE: Opus-equivalent sub-orchestrator for YURI-OS-MUSUBI (glm-5.2, --reasoning high).
AUTHORITY: Advisory until Marcel verifies locally. You do NOT commit, push, or arm gates without explicit owner confirm.

READ FIRST (in order):
1. skills/opus-fleet/SKILL.md
2. _SYSTEM/mure/README.md (if role-based run)
3. Task-local files referenced in the goal

OPERATING LOOP:
1. DECOMPOSE — independent lanes only; tag each substrate: native | glm | ollama
2. PLAN — DISARMED dry-run first (zero spend):
   - node _SYSTEM/mure/company.mjs --task-file <task.json> --dry-run
   - OR print glm-fleet / ollama-fleet task JSON
3. PRESENT PLAN — show Marcel: lanes, substrates, held (owner-gated) items, estimated quota burn
4. WAIT — Marcel arms OR confirms proceed
5. DISPATCH — parallel where possible:
   - GLM: YURI_GLM_FLEET=1 node _SYSTEM/Scripts/glm-fleet.mjs --tasks '...'
   - Ollama: YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs --tasks '...'
   - Native: output nativeSpecs for Marcel to spawn in Cursor (you cannot spawn Cursor Agents)
6. AGGREGATE — read .claude/jobs/<runId>/results/*.json
7. ADVERSARIAL VERIFY — what's missing? Override peer guesses with local runs
8. CONVERGE — if gaps, re-dispatch gap leaves only (≤3 rounds)
9. REPORT — changed files, checks run, residual risk, held items for Marcel

HARD RULES:
- Never tee/redirect GLM streams (use --out)
- Never touch protected paths: backend/data, .env, node_modules, .claude/state
- Never git add . or bare git commit
- Agent output is hypothesis until locally verified
- glm-fleet DISARMED without YURI_GLM_FLEET=1 or _SYSTEM/state/glm-fleet.enabled

RETURN FORMAT:
## Plan
## Dispatch log (runIds, lanes, arm state)
## Results summary (per lane: pass/fail, RESULT_LABEL)
## Verification (commands run + outcomes)
## Held (owner-gated decisions)
## Residual risk
```

---

## 9. Task templates

### 9.1 `leaves.json` (for runSwarm)

```json
{
  "leaves": [
    {
      "id": "design",
      "lane": "glm-max",
      "reasoning": "high",
      "prompt": "Use MAXIMUM reasoning depth.\nROLE: Design lane.\nTASK: Design the fleet-router feature.\nRETURN: architecture doc + 01DS_DESIGN_X_PASS_COMMITTED."
    },
    {
      "id": "codegen",
      "lane": "glm",
      "reasoning": "high",
      "prompt": "Use MAXIMUM reasoning depth.\nROLE: Code-generation lane.\nTASK: Implement _SYSTEM/Scripts/fleet-router-mlp.mjs skeleton.\nRETURN: diff summary + 02CG_IMPL_X_PASS_COMMITTED."
    },
    {
      "id": "test",
      "lane": "glm-flash",
      "reasoning": "high",
      "prompt": "Use MAXIMUM reasoning depth.\nROLE: Testing lane.\nTASK: Run node --test on the new module.\nRETURN: test output + 03TS_TESTS_X_PASS_COMMITTED."
    }
  ]
}
```

```bash
node _SYSTEM/Scripts/runSwarm.mjs --leaves-file leaves.json --rounds 3
```

### 9.2 Ollama fan-out one-liner

```bash
YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs --tasks '[
  {"tier":"flash","label":"R1","prompt":"Census X in repo. RETURN: table + 01OL_CENSUS_X_PASS_COMMITTED."},
  {"tier":"kimi","label":"R2","prompt":"Code review X. RETURN: findings + 02OL_REVIEW_X_PASS_COMMITTED."},
  {"tier":"flash","label":"R3","prompt":"Run tests for X. RETURN: log + 03OL_TEST_X_PASS_COMMITTED."}
]' --concurrency 3
```

---

## 10. MURE roles quick reference

List all roles:

```bash
node _SYSTEM/mure/mure.mjs --roster
```

| Group | Roles | Typical substrate |
|-------|-------|-------------------|
| Orchestration | helmsman, architect, steward | native / glm-max |
| Research | ideator, scout, synthesist, evolver, deliberator | glm / native |
| Engineering | engineer, mechanic, artificer, sentinel, kernelsmith | glm / native |
| Verification | adjudicator, oracle, calibrator | glm-max / native |
| Knowledge | archivist, chronicler | native |
| Operations | quartermaster, envoy | native |

Cast a subtask by `need` capabilities — see `_SYSTEM/config/fleet-roles.json`.

---

## 11. Verification checklist (before calling anything "done")

- [ ] Every peer RESULT_LABEL parsed and pass type checked (X/P/F)  
- [ ] Load-bearing claims verified with local commands (not peer self-report)  
- [ ] No protected paths touched  
- [ ] Staged scope matches intended files only (`git diff --stat`)  
- [ ] Held (owner-gated) items explicitly surfaced to Marcel  
- [ ] Residual risk named  
- [ ] Manifest / runDir path recorded: `.claude/jobs/<runId>/`  

---

## 12. Anti-patterns (failure-anchored)

| Don't | Why | Do instead |
|-------|-----|------------|
| Route z.ai/Ollama through Cursor model override | Fragile tool-calling, wrong billing | `glm-fleet` / `ollama-fleet` |
| Trust agent "done" without local verify | Haiku mis-guessed WARN vs BLOCK (2026-06-22) | Run the check yourself |
| Use Cursor Workflow for fan-out | Bills main quota, not Sonnet pool | `Task` tool with `model: sonnet` |
| `git add .` | Sweeps parallel session files | Explicit pathspec |
| Arm fleets without reviewing plan | Durable spend, not git-reversible | `--dry-run` first |
| Solo grind parallelizable work | Slower, misses cross-lane findings | Fan out across substrates |
| Let any agent finalize | Authority violation | Marcel / Opus only |

---

## 13. Day-one bootstrap script

Run once when Cursor becomes primary workspace:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /Users/marcelspatz/YURI-OS-MUSUBI

echo "=== YURI Fleet Bootstrap ==="

# 1. Sanity
git branch --show-current
node _SYSTEM/mure/mure.mjs --validate
node _SYSTEM/Scripts/ai doctor

# 2. DISARMED demos (zero spend)
node _SYSTEM/mure/mure.mjs --demo
node _SYSTEM/Scripts/glm-fleet.mjs --list
node _SYSTEM/Scripts/ollama-fleet.mjs --list

# 3. Optional: work dashboard
echo "Start dashboard: node _SYSTEM/Scripts/work-dashboard.mjs --serve"
echo "Then open http://localhost:4270"

# 4. Orchestrator sessions (pick one)
echo "Claude orchestrator:  ai claude"
echo "GLM orchestrator:     ZAI_MODEL=glm-5.2 ai claude-zai"

echo "=== Bootstrap complete. Fleets DISARMED. Arm only when ready. ==="
```

---

## 14. What's next (roadmap hooks)

These are **not** required to start delegating today:

| Item | Status | Notes |
|------|--------|-------|
| `runFleet.mjs` (tri-substrate unified conductor) | Planned | Today: parallel manual dispatch |
| `fleet-router-mlp.mjs` (learned routing) | Planned | Feeds from prediction-ledger |
| Ollama auto-wire in `company.mjs` | Planned | Manual `ollama-fleet` for now |
| `nano-spawn` depth-5 recursion | Owner-gated | Deferred hardening |

---

## 15. Quick command reference

```bash
# Plan (safe)
node _SYSTEM/mure/mure.mjs --demo
node _SYSTEM/mure/company.mjs --task-file task.json --dry-run

# Arm
touch _SYSTEM/state/{mure,glm-fleet,swarm-convergence,ollama-fleet}.enabled

# Dispatch
node _SYSTEM/mure/company.mjs --task-file task.json
node _SYSTEM/Scripts/runSwarm.mjs --leaves-file leaves.json --rounds 3
YURI_GLM_FLEET=1 node _SYSTEM/Scripts/glm-fleet.mjs --tasks '[...]'
YURI_OLLAMA_FLEET=1 node _SYSTEM/Scripts/ollama-fleet.mjs --tasks '[...]'

# Orchestrator sessions
ai claude
ZAI_MODEL=glm-5.2 ai claude-zai

# Monitor
node _SYSTEM/Scripts/work-dashboard.mjs --serve

# Disarm
rm _SYSTEM/state/{mure,glm-fleet,swarm-convergence,ollama-fleet}.enabled
```

---

## 16. Sources of truth

| Doc / module | Purpose |
|--------------|---------|
| `skills/opus-fleet/SKILL.md` | Fleet operating model |
| `_SYSTEM/mure/README.md` | MURE 20-role collective |
| `_SYSTEM/yuri-origin.md` | Policy spine |
| `_SYSTEM/Scripts/runSwarm.mjs` | Governed GLM loop |
| `_SYSTEM/mure/company.mjs` | Role cast + dispatch |
| `_SYSTEM/Scripts/glm-fleet.mjs` | z.ai parallel fleet |
| `_SYSTEM/Scripts/ollama-fleet.mjs` | Ollama parallel fleet |
| `02_RESOURCES/RESEARCH/yuri-multi-agent-architecture-2026-06-22.md` | Architecture audit |

---

*End of guide. Hand §8 (GLM-5.2 execution packet) + your task goal to GLM-5.2 to begin orchestration.*
