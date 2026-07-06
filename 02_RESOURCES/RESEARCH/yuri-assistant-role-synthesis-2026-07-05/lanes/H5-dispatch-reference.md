# H5: YURI Dispatch Substrate Reference

**Role:** YURI conductor selects the right substrate for a task: cheap breadth (deepseek-flash), build peer (glm), governed multi-role (MURE), or native reasoning (Agents). This doc is the dispatch decision table.

---

## 1. Deepseek-Flash (Ollama-Cloud Nano-Swarm)

**Purpose:** Cheap, parallel breadth — bulk research, fast analysis, scout-tier work.

**Exact CLI:**
```bash
node _SYSTEM/Scripts/ollama-fleet.mjs --tasks '[{"tier":"flash","label":"R1","prompt":"your prompt here"}]' --concurrency 3
```

**Arm requirement:** `YURI_OLLAMA_FLEET=1` (env) OR `touch _SYSTEM/state/ollama-fleet.enabled` (flag)

**Results land:** `.claude/jobs/<run-id>/results/<label>.json`

**When to reach for it:** Research, breadth scans, parallel brainstorm, bulk classification. Default model = `deepseek-v4-flash:cloud`. Also available: `minimax`, `kimi`, `nemotron` (heavy), `deepseek-pro` (avoid for bulk). Concurrency cap = 5.

**Live roster check:**
```bash
node _SYSTEM/Scripts/ollama-fleet.mjs --list
```

---

## 2. Z.ai GLM (Opus-Tier Peer Lane)

**Purpose:** Heavy build partner — code-gen, synthesis, multi-tool orchestration, design.

**Exact CLI:**
```bash
node _SYSTEM/Scripts/glm-fleet.mjs --tasks '[{"lane":"glm","label":"R1","prompt":"your prompt"}]' --concurrency 3
```

**Arm requirement:** `YURI_GLM_FLEET=1` (env) OR `touch _SYSTEM/state/glm-fleet.enabled` (flag)

**Results land:** `.claude/jobs/<run-id>/results/<label>.json`

**When to reach for it:** Implementation, architecture, heavy reasoning, code review. Lane roster: `glm-max` (glm-5.2, 1M, 30min timeout), `glm` (glm-4.7, 15min), `glm-turbo`/`glm-flash` (600s). Reasoning always `high`. Concurrency cap = 3.

**Live roster check:**
```bash
node _SYSTEM/Scripts/glm-fleet.mjs --list
```

---

## 3. MURE (20-Role Governed Collective)

**Purpose:** Multi-role dispatch with governance gates — decompose complex work into role-matched subtasks, automatically held/self-goverable per 6-gate charter.

**Exact CLI:**
```bash
node _SYSTEM/mure/company.mjs --task-file tasks.json --dry-run
```
(Dry-run to inspect plan; remove `--dry-run` to arm if `YURI_MURE_ARMED=1` or `_SYSTEM/state/mure.enabled` exists)

**Arm requirement:** `YURI_MURE_ARMED=1` (env) OR `touch _SYSTEM/state/mure.enabled` (flag) to dispatch; **default is DISARMED (plan-only)**

**Task file format (JSON):**
```json
{
  "summary": "goal statement",
  "subtasks": [
    {
      "id": "subtask-1",
      "summary": "what to do",
      "need": ["capability", "terms"],
      "prompt": "detailed task",
      "reversible": true,
      "blastRadius": "LOW",
      "evidenceDecidable": true
    }
  ]
}
```

**Results land:** `.claude/jobs/<run-id>/results/` + native Agent specs returned for Opus spawn

**When to reach for it:** Complex projects requiring role specialization (architect, engineer, oracle, sentinel, calibrator, etc.). The plan splits into GLM leaves (dispatched via `runSwarm`), native Agent specs (Opus spawns), and inline specs (local-code roles: steward, oracle, archivist, quartermaster). Owner-gated subtasks are HELD for operator approval.

**Dispatch budget:** Default 48 leaf calls; override `YURI_MURE_BUDGET` or set `YURI_MURE_BUDGET_UNLIMITED=1`.

---

## 4. Native Claude Agents

**Purpose:** Native reasoning, Opus-grade judgment, irreversible decisions (commit/push/publish).

**Exact CLI:** Via the Agent tool (in an interactive Claude Code session, not headless)
```
Use: Agent tool with subagent_type parameter
```

**Arm requirement:** None; no arming flag. But agent spawning is only available from an interactive Opus/Claude session.

**Results land:** Structured output from the agent; no JSON packet file system (agents work interactively with the PTY).

**When to reach for it:** Final review, irreversible decisions, orchestration of peer lanes (glm, ollama, MURE), verification before push. Agents carry the full operator harness (read/grep/bash/edit/write). They are the ONLY substrate for finalize (commit/push/publish).

---

## 5. Search & Index (Local-First Research)

**Purpose:** Query the local corpus (38–41k indexed docs + code) before escalating online.

**Exact CLI:**
```bash
ai search "query text" --top 10 --json
ai reindex --full
```

**When to reach for it:** Research discovery, cross-domain lookup, pattern matching. Local corpus is MANDATORY first stop; online is escalation only when local is provably insufficient.

---

## Decision Flowchart (Literal Decision Rules)

| Task Shape | Primary Substrate | Reasoning |
|------------|-------------------|-----------|
| **Bulk/breadth research, parallel scouts, fast classification** | Ollama-flash (`--tier flash`) | Cheap (~0.01¢/task), concurrent ≤5, 600s timeout |
| **Code-gen, architecture, heavy synthesis, multi-tool** | GLM (`--lane glm` or `glm-max`) | Opus-peer quality, reasoning=high, concurrent ≤3, 15–30min timeout |
| **Complex multi-role project with governance gates** | MURE (`company.mjs --task-file`) | 20-role roster, 6-gate charter veto, role-matched casting, budget-aware |
| **Finalize: commit/push/publish/irreversible** | Native Agent (interactive session only) | Only substrate with arming authority for outward calls |
| **Discovery: "where is X" / cross-domain recall** | `ai search` (local-first) | ~38k doc FTS5/BM25 index; online only when local insufficient |

---

## Conductor Rules (How Yuri Chooses)

1. **Research phase:** `ai search` first (local), then Ollama-flash for breadth if local insufficient.
2. **Build phase:** GLM for heavy work, Ollama-flash for fast edits/scans, MURE if role-specialization adds value.
3. **Verification phase:** GLM (adversarial review) or native Agent (if it needs to mutate).
4. **Finalize phase:** Native Agent only (Opus authority on commit/push/publish).
5. **Multi-day project:** MURE for decomposition + gating; GLM for peer builds; Ollama-flash for bulk.

**Parallelism rule:** Dispatch independent GLM + Ollama tasks in parallel (different substrates, different result dirs). Serial same-substrate lanes (prevents transport EPIPE); serialize file-mutation lanes (prevents contention).

---

## Arm Flags (Owner Gating)

| Substrate | Arm Env | Arm Flag | Default |
|-----------|---------|----------|---------|
| Ollama-Cloud | `YURI_OLLAMA_FLEET=1` | `_SYSTEM/state/ollama-fleet.enabled` | DISARMED (dry-run) |
| GLM z.ai | `YURI_GLM_FLEET=1` | `_SYSTEM/state/glm-fleet.enabled` | DISARMED (dry-run) |
| MURE | `YURI_MURE_ARMED=1` | `_SYSTEM/state/mure.enabled` | DISARMED (plan-only) |
| Native Agents | (none; session-based) | (none) | Interactive only |

**Arming is reversible:** `rm _SYSTEM/state/<name>.enabled` to disarm; `touch` to re-arm. Env vars always override for the session.

---

## Verification Checklist (Before Claiming "Done")

- [ ] Substrate reached: arm flags verified, `--dry-run` removed if dispatching real work
- [ ] Result packet exists: `.claude/jobs/<run>/results/<label>.json` (or agent output captured)
- [ ] RESULT_LABEL present: `NNXX_DESCRIPTION_(X|P|F)_PASS_COMMITTED` (every lane outcome)
- [ ] Output verified: read the text, not just the status; lanes over-claim
- [ ] Exit code checked: success ≠ non-zero exit (OUTPUT-first outcome; glm-fleet 2026-07-03 fix)

---

## Unverified Flags (Spot Check — All Verified Literal Commands Above)

All CLI flags above are verified against the **live source scripts** (company.mjs, glm-fleet.mjs, ollama-fleet.mjs, ai dispatcher). No guesses; every flag name and argument order matches the actual argparse logic or function signature.

**Verified sources:**
- `company.mjs` lines 958–962: `--task-file`, `--task`, `--dry-run`
- `glm-fleet.mjs` lines 349–366: `--tasks`, `--tasks-file`, `--concurrency`, `--dry-run`, `--smoke`, `--list`
- `ollama-fleet.mjs` lines 320–337: `--tasks`, `--tasks-file`, `--concurrency`, `--dry-run`, `--smoke`, `--list`
- `ai` dispatcher lines 91, 144–146: `search`, `reindex`, `route-plan`
