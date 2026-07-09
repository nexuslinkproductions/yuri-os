# Rene Branch Recon — 2026-07-09

**Operator:** Leaf agent (read-only, no spawns)  
**Scope:** Inventory advisor/watchdog mechanics, agent format patterns, hook infrastructure  
**Branches inspected:** `origin/rene`, `origin/main` (adjacent for comparison)

---

## 1. Advisor mechanic inventory

### Finding: No live per-turn advisor; session-reflect is post-session only

**Search evidence:**
- `grep -ril "advisor\|watchdog\|critique\|reflect\|shadow\|peer-review"` across `.claude/` and `.omp/` returned only `session-reflect.js` and misc file references (calibration-tracker.mjs advisor weighting, not a UI mechanic). [.claude/hooks/:line 1]
- No `post-assistant-turn`, `turn-end-notify`, or `advisor-emit` hooks found.
- No slash commands or skills named `/advisor`, `/reflect`, `/review` exist.

### What exists:

#### `session-reflect.js` (.claude/hooks/session-reflect.js)
- **Trigger:** runs at session END (not per-turn)
- **Output:** structured markdown to JOURNAL_FILE (`~/.claude/projects/.../memory/session-journal.md`)
- **What it captures:** session duration, peak context %, compact history, tool summary, corrections, errors, skills updated
- **Format:** dated journal entries (newest first), deduped by date [.claude/hooks/session-reflect.js:150-162]
- **Event signature:** `require.main === module` (standalone script invocation, not a hook event)

#### Rene's `directive-guard.mjs` (.claude/hooks/directive-guard.mjs — NEW on rene)
- **Trigger:** PreToolUse event
- **Behavior:** observe-only, surfaces standing directives at decision time, NEVER blocks
- **Output:** injects directive statements into additionalContext; logs would-warns if constraint violated
- **Reads from:** `.claude/directives/*.md` (frontmatter: handle, tier, conditions[], description)
- **Pattern:** matches tool action signatures (bash, write, edit) against directive conditions

**No per-turn note-emission hook was found on either branch.**

### Gap analysis:
The screenshot showing "Advisor 1 note: ..." after each turn implies a post-assistant-turn hook that the current main branch does not have. This would need:
1. A new hook (e.g., `.claude/hooks/post-assistant-turn.js`) fired AFTER `assistant_message` event
2. A mechanism to emit a structured note back to chat (or append to message)
3. Either a lightweight inline advisor or a spawned agent that produces the note
4. Storage/replay logic (optional)

---

## 2. Agent/role doc formats

### Main branch: MURE agents (.omp/agents/)

**Count:** 21 agents  
**Format:** YAML frontmatter + markdown body  
**Sample frontmatter (mure-helmsman.md):**
```yaml
---
name: mure-helmsman
description: "MURE Helmsman (orchestration) — dispatcher/router + research-vision lead..."
model: anthropic/claude-opus-4-8
thinkingLevel: high
tools: read, grep, glob, edit, write, bash
spawns: "*"
read-summarize: false
---
```

**Body sections:**
- `You are the MURE <Role>` (mission + core capabilities)
- `**Autonomy class:**` (self-governable / owner-gated)
- `**Discipline (every MURE lane):**` (repo root, operator, protected paths, output format)
- Ends with RESULT_LABEL grammar: `NNXX_DESCRIPTION_(X|P|F)_PASS_COMMITTED`

**Model binding patterns:**
- Orchestration (Helmsman): `anthropic/claude-opus-4-8` + `thinkingLevel: high`
- Verification (Adjudicator, Calibrator): Opus 4.8 + high thinking
- Workers (Engineer, Artificer, Chronicler): DeepSeek variants or Sonnet 5
- GLM tier: `zai/glm-5.2` (peer to Opus for low-quota runs)

**Notable:** `spawns: "*"` only on Helmsman/Helmsman-GLM (orchestration only; workers have no spawns field, defaulting to no-spawn)

### Rene branch: Claude agents (.claude/agents/)

**Format:** Markdown-first with YAML-like headers (no frontmatter fence)  
**Sample (architect.md):**
```markdown
model: deepseek-v4-pro
# IDENTITY
Name: ARCHITECT
Role: System Architect and Integration Reviewer
House: NISABA House 01 (Prime Systems)

# DIRECTIVE
You design and review system architecture...

# RELATED SKILLS
- `execution-domain-core`
- ...

# BEST FOR
- architecture reviews
- ...

# PROTOCOLS
1. ...

# OUTPUT FORMAT
Respond with:
```markdown
## ARCHITECTURE REVIEW
...
```
```

**Key differences from MURE:**
- No `thinkingLevel` field
- No `read-summarize` field
- No `spawns` field (implicit: no spawning)
- PROTOCOLS section (step-by-step action list) instead of embedded narrative discipline
- OUTPUT FORMAT is prescriptive (markdown template) vs. MURE's embedded discipline

**Distinctive:** Rene's agents are scoped, shallow (~50 lines), and protocol-driven. MURE agents are deeper (~100+ lines), discipline-narrative-first, and include full repo context + legal/safety boilerplate in every agent.

### Side-by-side comparison

| Aspect | Rene (.claude/agents/) | MURE (.omp/agents/) |
|--------|----------------------|-------------------|
| **Frontmatter** | No fence; `model:` first | YAML `---` fence |
| **Name** | Free-text (Name: ARCHITECT) | Structured `name:` field |
| **Description** | None; inferred from narrative | Explicit one-line frontmatter |
| **Model** | Listed at top (deepseek-v4-pro) | Frontmatter, vendor/model format |
| **Thinking** | Not specified | `thinkingLevel` field |
| **Tools** | Not listed | Explicit `tools:` array |
| **Spawns** | Implicit none | Explicit `spawns: "*"` or omitted |
| **Body** | Sections: IDENTITY, DIRECTIVE, BEST FOR, PROTOCOLS, OUTPUT FORMAT | Narrative mission + Discipline boilerplate |
| **Discipline** | Embedded in DIRECTIVE + PROTOCOLS | Full legal/repo/safety clause (every agent) |
| **Result label** | None (implicit: respond naturally) | Mandatory RESULT_LABEL (NNXX_DESCRIPTION_...) |
| **Length** | ~50 lines | ~100-120 lines |
| **Autonomy** | Implicit in DIRECTIVE | Explicit `autonomy class:` field |

---

## 3. Hook + harness surface

### Hooks on main branch (.claude/hooks/ and .omp/hooks/)

**Total count:** 47 files in .claude/hooks/, 2 in .omp/hooks/

**Event-driven hooks (sampled):**

| Hook | Trigger event | Purpose | Line cite |
|------|---------------|---------|-----------|
| **user-prompt-submit.js** | User message submit | EOT keyword detect, pulse orchestrator spawn (RETIRED), recall injection | .claude/hooks/user-prompt-submit.js:40-80 |
| **post-tool-use.js** | Tool execution complete | Tool tracking, design memory, skill reads, session state | .claude/hooks/post-tool-use.js:26-50 |
| **session-reflect.js** | Session end (standalone script) | Journal write, skill notes, memory index update | .claude/hooks/session-reflect.js:191-206 |
| **brain-inject.js** | Pre-response (soul persona) | Persona injection (Yuri identity) | (loaded at session start) |
| **soul-persona-inject.js** | Persona injection | Core-truth heading sync + persona-contract gate | .claude/hooks/soul-persona-inject.js:title |
| **directive-guard.mjs** | PreToolUse | Directive observe-only (rene branch has this; main does not) | .claude/hooks/directive-guard.mjs:10-20 |
| **energy-enforce.mjs** | Pre-tool-use | Energy gate veto on ladder inversion | (.omp/ layer) |
| **filing-ledger.mjs** | Post-tool-use | Claim-ledger write | (artifact tracking) |

**Turn-end hooks:**
- **No post-assistant-turn hook exists.** session-reflect.js runs at SESSION END (standalone invocation), not per-turn.
- user-prompt-submit fires on USER prompt, not assistant response end.
- post-tool-use fires AFTER each tool, not after assistant response.

### Rene branch hook delta
**Additional hooks on rene (not on main):**
- `.claude/hooks/directive-guard.mjs` — observe-only directive integrity (PreToolUse)
- `.claude/hooks/musubi-protocol-enforce.js` — (sampled in rene list; not on main)

**Hooks marked RETIRED on main:**
- pulse-orchestrator (was in user-prompt-submit; spawn target never existed; PULSE_ORCHESTRATOR_RETIRED=true) [.claude/hooks/user-prompt-submit.js:49]

### Hook availability for advisor mechanism
**Candidate hook events for per-turn advisor note:**
- `post-assistant-turn` — NOT IMPLEMENTED; would need new hook
- Append to existing post-tool-use + track turn boundary? — Possible but noisy (fires per-tool, not per-turn)
- Standalone turn-end script (like session-reflect)? — Viable; fires once after assistant responds
- Integration with pulse-bus? — Retired; not viable

**Recommendation:** A new hook that fires on `assistant_message` event (analogous to user-prompt-submit) is the cleanest surface.

---

## 4. Recommendations for MURE rebuild in OpenClaw

### Format recommendation: Adopt MURE's YAML frontmatter structure (main branch)
**Why:** The YAML frontmatter in `.omp/agents/` is:
- Machine-parseable (registry indexing, model-binding, tool validation)
- Extensible (new fields like `autonomy_class`, `spawns` already present)
- Compatible with OpenClaw's agent definition loading
- Rene's markdown-first format is less suited to automated orchestration

**Migrate rene's protocol-driven agents:** Convert Rene's PROTOCOLS and DIRECTIVE sections into the MURE narrative discipline block (Rene's content is crisp; fold it into the body).

### Advisor mechanic: Build as new role + new hook

**Architecture:**
1. **New MURE role: `mure-advisor`**
   - Model: Sonnet 5 or DeepSeek flash (fast, lightweight)
   - Mission: Per-turn critique/synthesis — surface key observations, risks, or next moves
   - Autonomy: Self-governable (emit notes without owner gate)
   - Output format: Structured JSON (for chat append, not markdown)

2. **New hook: `post-assistant-turn.js`** (fires after `assistant_message` event)
   - Light check: if advisor is ENABLED (settings.json flag), spawn mure-advisor
   - Pass context: prior user input + assistant response text
   - Collect note: advisor returns JSON `{severity, summary, nextMove}`
   - Emit: append to chat as structured annotation (or return to harness for banner)

3. **Settings config:**
   - Add `advisor.enabled` (bool, default false)
   - Add `advisor.model` (override, default Sonnet 5)
   - Add `advisor.depth` (light / standard / deep, controls brevity)

### Agent registry in OpenClaw
**Current MURE is 21 agents; recommend:**
- Keep all 21 MURE agents as-is (they're solid)
- Add `mure-advisor` as new role (role=22)
- Verify model pinning: Opus 4.8 orchestration roles, Sonnet/DeepSeek workers
- Tag each agent with `house` field (borrowed from Rene: NISABA House 01 = Prime Systems) for organizational grouping

### Hooks in OpenClaw
**Immediate gaps:**
- No `post-assistant-turn` hook (must be built)
- `.omp/hooks/` is thin (only 2 files); migration of `.claude/hooks/` into `.omp/hooks/` will be needed for full harness activation
- Rene's `directive-guard.mjs` is valuable (observe-only directive layer) — recommend porting to `.omp/hooks/` and integrating into MURE discipline boilerplate

### Skills/capabilities for MURE rebuild
**Rene's agents reference:**
- `execution-domain-core`
- `swarm-coordination`
- `parallel-clone-orchestrator`
- `gitnexus-exploring`
- `non-destructive-infinity-guard`

**Recommendation:** Audit whether these are already in `.claude/skills/` or need to be imported/created as `.omp/` analogs.

---

## Appendix: Evidence summary

| Deliverable | Key file | Citation |
|------------|----------|----------|
| 1a. Advisor journal | `.claude/hooks/session-reflect.js` | Lines 150–162 (buildJournalEntry) |
| 1b. No per-turn advisor | grep results + hook enum | All 47 hooks scanned; no post-assistant-turn found |
| 2a. MURE format | `.omp/agents/mure-helmsman.md` | Frontmatter + body structure |
| 2b. Rene format | `.claude/agents/architect.md` | Markdown headers + PROTOCOLS |
| 3a. Turn-end hooks | `.claude/hooks/user-prompt-submit.js` | Lines 40–80 (event doc) |
| 3b. Session-end reflection | `.claude/hooks/session-reflect.js` | Lines 191–206 (module.exports) |
| 3c. Rene's directive hook | `.claude/hooks/directive-guard.mjs` | Lines 10–20 (hook description) |

---

**Report generated:** 2026-07-09 | Leaf agent | Operated per fleet-economy doctrine (8 targeted reads, 0 spawns)
