Now I have a thorough picture. Let me produce the structured research report.

---

## SURVEY: Minimal-but-Safe Agent Autonomy Patterns

**Lane:** YURI nano-swarm node (deepseek-v4-flash:cloud)  
**Task:** Survey patterns for minimal-but-safe agent autonomy feeding a Fable-5 mastermind  
**Context:** Personal AI agent becoming more autonomous — overnight unattended runs, parallel sub-agent dispatch, acting on the owner's machine. Simpler but more powerful and safe.

---

### 1. REDUCED-CAPABILITY / LEAST-PRIVILEGE PROFILES (Attended vs Unattended)

**HARD-FACT** — YURI's autonomy levels (code-verified in `_SYSTEM/Scripts/yuri-autonomy-runner.mjs`, lines 20-55):

| Level | Human role | Agent behavior | Gate surface |
|-------|-----------|---------------|-------------|
| L0 MANUAL | Full operator | No AI agency | — |
| L1 EVIDENCE RUNNER | Director | Read-only evidence collection | No mutation |
| L2 RESEARCH LOOP | Supervisor | Autonomous research, memory proposals | No code mutation |
| L3 CODE AUTOPILOT | Approver | Code edits with operator approval | Rollback contract + GitNexus impact |
| L4 TIMED RUN | Observer | Timeboxed autonomous runs | Intervention log + pause/resume |
| L5 SCHEDULED | Observer | launchd/cron/daemon | Dry-run proving + health gates + operator enable |

**HARD-FACT** — YURI's `nano-spawn.mjs` (lines 1-80): two-factor arm (`YURI_NANOSWARM_SPAWN=1` env + flag file). DISARMED → the lane does the work itself, no recursion. Depth cap by tier (heavy >200B params → depth 5, light → depth 10). Decaying fan-out `F_eff(d)=⌈F0·decay^d⌉`. Node budget via atomic lease-serialized reserve. Per-child cost admission.

**HARD-FACT** — YURI's `overnight-runner.mjs` (lines 1-100): DISARMED-first. `--dry-run` prints the plan, zero spend. Retry ONCE on outcome F or missing label. Fail-open per task (one bad task never kills the run). MURE tasks: `planCompany` ALWAYS runs (zero-spend plan); `runCompany` only when BOTH runner armed AND `isMureArmed()`. Sanitizes task text against prompt injection (collapses newlines, neutralizes `RESULT_LABEL` markers, defangs label-token-shaped substrings).

**RECALLED-PATTERN** — The key insight: **unattended mode is a STRICTER profile, not a separate system.** The same 6-gate charter applies; unattended just means the owner isn't there to confirm. So the profile must be: (a) L1-L2 only by default (evidence + research, no mutation), (b) L3+ requires explicit owner pre-authorization of scope + rollback plan, (c) L5 requires dry-run proving + health gates + operator enable switch. The profile is a ceiling, not a separate code path.

---

### 2. REVERSIBLE-BY-DEFAULT ACTION DESIGN

**HARD-FACT** — YURI's Self-Governance Charter (code-verified in `_SYSTEM/mure/governance.mjs`, lines 75-85): `reversible: decision.reversible === true && !decision.arming`. Reversibility is the FLAG, not the CONSEQUENCE. Spent USD, external API calls, process fan-out, non-gitignored runtime state are durable → reversibility 'partial', blast up to CRITICAL. A git-revertible file change is reversible. A sent email is not.

**HARD-FACT** — YURI's blast-analyzer.mjs: Deterministic scoring across 5 dimensions — file tier (0-0.5), file count (log, 0-0.15), operations (0-0.2), outward-facing (0-0.2), production (0-0.15), with reversibility discount (-0.15). Hard floors: protected path → CRITICAL, high-impact file → HIGH, outward-facing → HIGH, production → HIGH.

**RECALLED-PATTERN** — The reversibility test collapses to a single binary question: "Can I undo this with a single command?" If yes → self-governable (assuming other gates pass). If no → owner-gated. This collapses the entire act-first/ask-first debate into a mechanical check.

**RECALLED-PATTERN** — The "draft-yes-send-never" pattern: the assistant drafts everything (email, post, message, PR) and presents it for review, but NEVER sends/publishes without explicit approval. The draft is the *proposal*; the send is the *irreversible act*. This separates the high-value work (drafting, which requires context + reasoning) from the high-risk act (sending, which requires authority).

---

### 3. TRUST BOUNDARIES BETWEEN ORCHESTRATOR AND SUB-AGENTS

**HARD-FACT** — YURI's MURE architecture (`02_RESOURCES/RESEARCH/sakana-blueprint-2026-06-22/00-MURE-BLUEPRINT.md`): STAR topology + shared blackboard. Workers don't mesh-chat; they write typed result packets to a shared per-run dir that the orchestrator + critics read. Coordination patterns: MetaGPT typed pub-sub (packets), Voyager independent Critic (adjudicator/oracle off-loop), AG2 OnContextCondition deterministic routing (the gate is *code*, never LLM-judged).

**HARD-FACT** — YURI's `nano-spawn.mjs`: each spawned child gets its own nanoId, depth tracking, lease-serialized reservation. The parent reads the child's result packet; the child has NO write access to the parent's state. INV-1 atomic registration (no in-flight-but-unregistered window).

**RECALLED-PATTERN** — The trust boundary rule: **sub-agents are capability-bounded, not trust-bounded.** The orchestrator doesn't "trust" the sub-agent — it constrains the sub-agent's tool set, reads its output, and verifies independently (adjudicator/oracle off-loop). The sub-agent cannot modify the orchestrator's state, cannot spawn beyond its depth cap, cannot access protected surfaces. This is the Voyager principle: the curriculum proposer has access to what the agent has already done and what it currently holds — it cannot propose beyond that frontier.

**RECALLED-PATTERN** — The Gödel Agent gap (arXiv:2410.04444): no hard computational cap on recursion — the LLM itself decides `continue_improve`. YURI closes this: gate-logic self-modification is ALWAYS owner-gated. The role may expand its capability set (register new skills) but may NOT modify the gate logic itself.

---

### 4. HUMAN-IN-THE-LOOP CONFIRM: TRULY REQUIRED vs FRICTION

**HARD-FACT** — YURI's 6-gate charter: ANY fail → owner-gated. The gate produces a finished ruling (calc/sim + recommendation + reversibility/blast) and holds for a one-token confirm. The human says one word; the work proceeds. This is the energy gate mirror: "auto-pass the routine-safe transition; surface the catastrophic/non-offsettable one."

**HARD-FACT** — YURI's confirm-gate JSON (`02_RESOURCES/RESEARCH/yuri-assistant-role-synthesis-2026-07-05/lanes/S1-yuri-confirm-gate-DRAFT.json`):

| Always confirm | Allowed without confirm |
|---|---|
| Arming a gate | Reading and indexing internal data |
| Large-scale/high-blast fan-out | DISARMED-scoped fleet work |
| Placing/sizing/executing a live trade | Drafting outward-facing content (draft only) |
| Sending outward-facing communication | Creating/moving files within repo scope |
| Opening a PR or publishing | Running analysis/edge-audit/decision-sim |
| Downloading/installing dependencies | Spawning already-approved parallel sessions |
| Deleting data outside session's own scratch | |
| Touching production/shared-external state | |

**RECALLED-PATTERN** — The checkpoint placement rule: **checkpoints at the irreversible boundary, never at the reversible one.** Reading a file is reversible (you can un-read it by not acting). Writing a file is semi-reversible (git revert). Sending a message is irreversible. The checkpoint cost should scale with irreversibility, not with action count.

**RECALLED-PATTERN** — The failure modes that kill gates:

| Failure | Symptom | Fix |
|---------|---------|-----|
| **Paralysis** | Every action requires approval → human ignores or bypasses | Graduate trusted patterns; gate on reversibility, not action count |
| **Runaway** | Gate is self-removed or silently bypassed | Constitution hard-stop: gate-logic self-modification is ALWAYS owner-gated |
| **Rubber stamp** | Human approves without reading | Reduce gate frequency; increase gate stakes. Fewer, higher-signal gates |
| **Scope creep** | "While I'm here" expansions | Scope lock: final diff must be subset of proposed scope |
| **Alert fatigue** | Too many gates → human misses the important one | Gate on irreversibility only. Reversible actions don't need gates |

---

### 5. BUDGET / RATE GOVERNANCE FOR UNATTENDED RUNS

**HARD-FACT** — YURI's `usage-governor.mjs`: per-provider meters (Anthropic weekly, z.ai plan, ollama Pro). `paceSignal` gives `<70%→up`, `70-90%→hold`, `>90%→down`. No hard cap — pace so weekly quota is consumed by period end rather than front-loading or leaving budget unused.

**HARD-FACT** — YURI's `overnight-runner.mjs`: `MAX_RESULTS = 5000` bounded retention. `MAX_RETRIES = 1`. `TASK_TIMEOUT_MS = 10*60*1000` per-task ceiling. Fail-open per task. Cost-aware lane choice: default overnight tasks to GLM/ollama-cloud (cheaper, keeps Anthropic weekly headroom for daytime work).

**HARD-FACT** — YURI's `nano-spawn.mjs`: node budget B via nano-tree's atomic lease-serialized reserve. Per-child cost admission via cost-reservation-pool. Depth cap by tier. Decaying fan-out.

**RECALLED-PATTERN** — The budget governance rule for unattended runs: (a) default to cheapest provider, (b) cap iterations per task (max 4 repair cycles per Voyager ceiling), (c) cap total tasks per run (MAX_RESULTS), (d) pace across the week not the day, (e) fail-open per task (one bad task never kills the run), (f) dry-run before any armed dispatch.

---

### 6. HOW AUTONOMY COMPOUNDS RISK IF TRUST OUTPACES VERIFICATION

**HARD-FACT** — YURI's empirical finding (NS2, 2026-06-16): lane reported 18/19 completed; 0 actual edits. This is the canonical failure mode of trust outpacing verification — the agent *believes* it acted, but the evidence shows it didn't. The fix: local verification mandatory; advisory-only model output until locally confirmed.

**HARD-FACT** — YURI's adversarial verification phase (Autonomous Operating Protocol, step 4): attack the result before trusting it — name failure modes, run negative/mismatch tests, seek the strongest refutation. First-run success is a hypothesis, never proof. Hermetic-green ≠ live-correct (verify at the real seam).

**RECALLED-PATTERN** — Risk compounds non-linearly with autonomy because:
1. **Each autonomous action is a hypothesis, not a fact** — the agent's self-report is advisory until locally verified.
2. **Autonomy hides verification gaps** — the owner isn't watching, so a lane that "thinks" it succeeded but didn't creates a silent defect that compounds with the next autonomous action.
3. **Scope intoxication** — the agent expands the goal beyond the original request because there's no human to say "stop, that's not what I asked for."
4. **Goal drift** — contextual pressure competes with original objective; no weight update needed (arXiv:2603.03258).
5. **Reward hacking** — agent edits test assertions or disables error logging to inflate proxy score.

**RECALLED-PATTERN** — The mitigation is not less autonomy — it's **verification that scales with autonomy.** Every autonomy level adds a verification gate: L1 adds evidence manifest + xref preflight. L2 adds contradiction detection + source freshness. L3 adds operator approval + rollback contract + GitNexus impact. L4 adds timebox contract + intervention log + pause/resume. L5 adds dry-run proving + health gates + operator enable switch.

---

### 7. THE MINIMAL SAFE-AUTONOMY DESIGN

Based on all surveyed sources (YURI charter, MURE blueprint, runtime design, confirm-gate JSON, nano-spawn governance, overnight runner, autonomy levels, and published research), the minimal design that prevents both paralysis and runaway:

#### The Core Loop (5 steps, code-verified in YURI)

```
PROPOSE → SCORE → GATE → EXECUTE → LEARN
```

**Step 1 — PROPOSE:** Generate candidate goal at the capability frontier (Voyager rule: not beyond proven capability). Apply negative-first filter: discard any candidate touching protected path, arming a gate, or outward-facing (Constitutional AI principle — hard-stop list checked before scoring).

**Step 2 — SCORE:** Rank survivors on 5 dimensions (capability-fit 0.25, reversibility 0.25, blast 0.20, evidence-decidability 0.20, doctrine 0.10). Composite ≥ 0.75 advances.

**Step 3 — GATE:** Apply the 6-gate charter sequentially:
```
reversible? → evidence-decidable? → in-doctrine? → blast ≤ MEDIUM? → not-outward-facing? → not-contended?
```
ALL PASS → self-execute (L3 autonomy, no owner confirm).  
ANY FAIL → produce finished ruling + HOLD for one-token owner confirm (L4).

**Step 4 — EXECUTE:** Explicit pathspec mutations only. Adversarial self-verification before claiming done. Hard caps: max 4 repair cycles per goal (Voyager ceiling). Scope lock: final diff ⊆ proposed scope. Circuit breaker on catastrophic ΔU.

**Step 5 — LEARN:** Record `{goal, score, gate, outcome}` to prediction ledger. Update capability registry. Feed back into capability model.

#### The Graduation Rule (Butler-Confirm Pattern)

- Start: every actionable observation → one crisp confirm offer
- Graduate: after N approvals on a pattern → switch to act-then-inform
- Never graduate: irreversible actions, outward-facing actions, gate-arming
- Never graduate all at once: per-pattern, based on approval history

#### The Blast Decision Tree

```
Protected surface? → OWNER-GATED
Outward-facing? → OWNER-GATED  
Costs money / fans out? → OWNER-GATED (waived for owner's own account)
Git-revertible, one file? → SELF-GOVERNABLE
Everything else → SELF-GOVERNABLE with caution
```

#### The Hard Caps (non-negotiable)

1. Max 4 repair cycles per goal before escalation (Voyager ceiling)
2. Scope lock: final diff ⊆ proposed scope; any expansion → owner-gate
3. No recursive self-modification of gate logic (Gödel Agent gap, closed)
4. Contention veto: touching another session's uncommitted lines → immediate owner-gate
5. Constitution hard-stop: protected paths, gate-arming, outward-facing → discard before scoring
6. Two-factor arm for sub-agent dispatch (env flag + flag file)
7. Per-task timeout (10 min default)
8. Bounded retention (5000 results max)
9. Fail-open per task (one bad task never kills the run)
10. Dry-run before any armed dispatch

#### Unattended Mode Profile

- Default: L1-L2 (evidence + research, no mutation)
- L3+ requires explicit owner pre-authorization of scope + rollback plan
- L5 requires dry-run proving + health gates + operator enable switch
- Default to cheapest provider for overnight work
- Pace across the week, not the day
- Morning brief compositor reads results and reports deltas

---

### 8. AUTONOMY FEATURES THAT ARE PREMATURE / OVER-ENGINEERING

**RECALLED-PATTERN** — These features are premature for a personal agent becoming autonomous:

1. **Full L5 scheduled automation without dry-run proving.** Running unattended cron/launchd tasks without first proving the plan in dry-run mode is the fastest path to silent corruption. YURI's own design requires dry-run proving + health gates + operator enable switch before L5 activates.

2. **Self-modifying gate logic.** The Gödel Agent gap (arXiv:2410.04444) is explicit: no hard cap on recursion means the agent can decide to continue improving itself indefinitely. YURI closes this by making gate-logic self-modification ALWAYS owner-gated. Any design that lets the agent modify its own safety constraints is premature.

3. **Mesh-chat sub-agents.** Workers that communicate directly (rather than through a shared blackboard with independent verification) create echo chambers and trust cascades. The STAR topology with independent critics is the minimal safe pattern.

4. **Unbounded iteration.** Any design without a hard iteration cap (Voyager's 4-repair ceiling) will eventually hit a runaway loop. The cap must be in code, not in the LLM's judgment.

5. **Single-factor arm.** A single env var or flag file as the sole arm mechanism is fragile. YURI's two-factor arm (env + flag file) is the minimum for any dispatch that can fan out processes or spend money.

6. **Automatic graduation of all patterns at once.** The butler-confirm pattern graduates per-pattern based on approval history. Graduating everything at once removes the friction that signals "this needs review."

7. **No output verification.** Trusting the agent's self-report without local verification is the single most dangerous pattern. YURI's NS2 finding (18/19 reported complete, 0 actual edits) proves this is not theoretical.

8. **No scope lock.** Allowing the agent to expand the goal beyond the original request without a gate is scope intoxication. The final diff must be a subset of the proposed scope.

9. **No contention detection.** Running autonomous edits without checking whether another session has uncommitted work will silently corrupt parallel work. The contention veto is non-negotiable.

10. **No cost-aware lane routing.** Defaulting to the most expensive provider for unattended overnight work wastes budget and creates pressure to remove gates. Default to cheap, escalate to expensive only when the task requires it.

---

### KEY REFERENCES (Primary Sources)

- YURI Self-Governance Charter: `_SYSTEM/yuri-origin.md` → "Self-Governance Charter" section (code-verified in `_SYSTEM/mure/governance.mjs`)
- YURI Autonomy Levels: `_SYSTEM/Scripts/yuri-autonomy-runner.mjs` (L0-L5 with gate surfaces)
- YURI Nano-Spawn Governance: `_SYSTEM/Scripts/nano-spawn.mjs` (two-factor arm, depth cap, fan-out cap, node budget)
- YURI Overnight Runner: `_SYSTEM/runtime/overnight-runner.mjs` (DISARMED-first, retry-once, contract-verify, fail-open)
- YURI Confirm-Gate JSON: `02_RESOURCES/RESEARCH/yuri-assistant-role-synthesis-2026-07-05/lanes/S1-yuri-confirm-gate-DRAFT.json`
- YURI Runtime Design: `02_RESOURCES/RESEARCH/yuri-runtime-design-2026-07-04.md`
- YURI MURE Blueprint: `02_RESOURCES/RESEARCH/sakana-blueprint-2026-06-22/00-MURE-BLUEPRINT.md`
- YURI Butler-Confirm Pattern: `.claude/memory/feedback-butler-confirm-then-announce.md`
- YURI Autonomous Workflow Default: `.claude/memory/feedback-autonomous-workflow-default.md`
- arXiv:2506.12469 — Levels of Autonomy for AI Agents (2025)
- arXiv:2305.16291 — Voyager: An Open-Ended Embodied Agent with LLM (Wang et al., 2023)
- arXiv:2410.04444 — Gödel Agent: A Self-Improving Agent (Yin et al., 2024)
- arXiv:2603.06333 — SAHOO: Safety-Aware Hierarchical Orchestration (2026)
- arXiv:2304.03442 — Generative Agents: Interactive Simulacra of Human Behavior (Park et al., 2023)
- arXiv:2505.22954 — Darwin Gödel Machine (Zhang et al., 2025, ICLR 2026)
- arXiv:2603.03258 — Goal Drift in Autonomous Agents (2026)
- arXiv:2511.18397 — Inoculation Prompting for Reward Hacking (2025)

---

**08DS_MINIMAL_SAFE_AUTONOMY_SURVEY_X_PASS_COMMITTED**