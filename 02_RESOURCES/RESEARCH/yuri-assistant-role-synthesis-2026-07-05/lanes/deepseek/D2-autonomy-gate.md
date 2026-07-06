# SURVEY: Confirm-Gate / Autonomy-Threshold Design for Agentic Assistants

**Lane:** YURI nano-swarm node (deepseek-v4-flash:cloud)  
**Task:** D2 from `yuri-assistant-role-synthesis-2026-07-05/lanes/deepseek-tasks.json`  
**Context:** Yuri = personal AI assistant, front-end to a founder's AI-OS. Solidify role, avoid over-engineering.

---

## 1. THE CORE TENSION: Act-First vs Ask-First

Every agentic assistant faces one design decision that determines everything else: **who decides whether to act?**

**HARD-FACT** — Anthropic's "Building Effective Agents" (Dec 2024): "The most successful implementations weren't using complex frameworks or specialized libraries. They were building with simple, composable patterns." The key pattern: **augmented LLM** (LLM + tools + retrieval) as the base unit, with agentic behavior (tool-use loops) layered only when needed. Most tasks should be **workflows** (predictable code paths), not agents.

**HARD-FACT** — arXiv:2506.12469 (Feng et al., 2025): Five levels of autonomy defined by the *human role*:
| Level | Human role | Agent behavior |
|-------|-----------|---------------|
| L0 | Operator | No AI agency |
| L1 | Collaborator | Rule-based, human directs |
| L2 | Consultant | Autonomous sub-tasks, human consulted |
| L3 | Approver | Agent proactive, human approves |
| L4 | Observer | Full autonomy, emergency stop only |

**HARD-FACT** — YURI's own Self-Governance Charter (2026-06-14, code-verified in `_SYSTEM/mure/governance.mjs`): A decision is SELF-GOVERNABLE only when ALL SIX hold — reversible, evidence-decidable, in-doctrine, blast≤MEDIUM, not-outward-facing, not-contended. ANY fail → OWNER-GATED (produce finished ruling + HOLD for one-token confirm). This maps to L3-L4 boundary.

**RECALLED-PATTERN** — The "butler-confirm-then-announce" pattern (`.claude/memory/feedback-butler-confirm-then-announce.md`): Start with one crisp confirm offer per actionable observation. As approval history accumulates on a given pattern, **graduate that pattern** to act-then-inform. Never graduate all at once. Never graduate irreversible actions without a gate. This is the *graduated trust* model — the only pattern that avoids both paralysis and runaway.

**RECALLED-PATTERN** — YURI's autonomous workflow default (`.claude/memory/feedback-autonomous-workflow-default.md`): The full protocol (GROUND → dispatch → sim → mechanism hygiene) runs autonomously by default, self-initiated, self-sized. But ARMING gates + high-blast recursive fan-out still gate to owner. Autonomy does NOT override the charter.

---

## 2. REVERSIBILITY-BASED GATING — The Sharpest Rule

The single most important insight across all surveyed sources: **gate on reversibility, not on action type.**

**HARD-FACT** — YURI's charter (governance.mjs, line 75-85): `reversible: decision.reversible === true && !decision.arming`. Reversibility is the FLAG, not the CONSEQUENCE. Spent USD, external API calls, process fan-out, non-gitignored runtime state are durable → reversibility 'partial', blast up to CRITICAL. A git-revertible file change is reversible. A sent email is not.

**HARD-FACT** — YURI's blast-analyzer.mjs: Deterministic scoring across 5 dimensions — file tier (0-0.5), file count (log, 0-0.15), operations (0-0.2), outward-facing (0-0.2), production (0-0.15), with reversibility discount (-0.15). Hard floors: protected paths → CRITICAL, high-impact files → HIGH, outward-facing → HIGH, production → HIGH. The governance gate in governance.mjs is the FINAL authority, not the analyzer.

**RECALLED-PATTERN** — The reversibility test is a single binary question: "Can I undo this with a single command?" If yes → self-governable (assuming other gates pass). If no → owner-gated. This collapses the entire act-first/ask-first debate into a mechanical check.

**RECALLED-PATTERN** — Filing-autonomy.mjs extends this: auto-execute only when risk==LOW AND refCount≤3 AND basenameOnlyCount==0 AND zero protected ref-hosts AND not pinned/protected AND target does not exist. Capped at K=10 moves per run. Everything else queues for owner. Stricter AND than energy-enforce's OR — file relocation has larger blast radius.

---

## 3. HUMAN-IN-THE-LOOP CHECKPOINTS — Where They Go, Where They Don't

**HARD-FACT** — Anthropic's guidance: "Explicit human escalation for consequential actions." The checkpoints belong at **mutation boundaries** (write, commit, send, publish, delete), not at observation boundaries (read, search, analyze, propose).

**HARD-FACT** — YURI's governed autonomy sprint plan (2026-06-07): L1 (evidence runner) and L2 (research loop) are safe defaults — no checkpoints needed. L3 (code autopilot) requires explicit operator approval + rollback readiness. L4 (timed run) adds intervention logging + checkpoints + pause/resume. L5 (scheduled automation) requires dry-run proving + health gates + operator enable switch.

**RECALLED-PATTERN** — The checkpoint placement rule: **checkpoints at the irreversible boundary, never at the reversible one.** Reading a file is reversible (you can un-read it by not acting). Writing a file is semi-reversible (git revert). Sending a message is irreversible. The checkpoint cost should scale with irreversibility, not with action count.

**RECALLED-PATTERN** — Voyager's self-verifier (Wang et al., 2023): up to 4 iterative repair rounds before the task is abandoned. This is a **soft checkpoint** — the agent self-checks, but with a hard iteration cap. YURI maps this: max 4 repair cycles per sub-goal before mandatory escalation.

---

## 4. "DRAFT-YES-SEND-NEVER" — The Asymmetric Approval Pattern

**HARD-FACT** — This is the pattern where the assistant drafts everything (email, post, message, PR) and presents it for review, but NEVER sends/publishes without explicit approval. The draft is the *proposal*; the send is the *irreversible act*.

**RECALLED-PATTERN** — This pattern works because it separates the high-value work (drafting, which requires context + reasoning) from the high-risk act (sending, which requires authority). The assistant does what it's good at; the human does what only they can do.

**RECALLED-PATTERN** — The pattern fails when: (a) the human stops reviewing drafts (becomes a rubber stamp), (b) the assistant starts sending without waiting (drift), or (c) the draft quality is so low the human rewrites everything (waste). Mitigation: (a) graduate trusted patterns to act-first, (b) hard gate on send, (c) improve draft quality through feedback loops.

**RECALLED-PATTERN** — YURI's butler-confirm pattern is the *inverse* of draft-yes-send-never: for *observations* (noticing something actionable), the assistant offers to act with one crisp confirm. The human says "yes" or "no" in one token. This is lower-friction than full draft-review because the action is reversible (adding a to-do, capturing a note).

---

## 5. BLAST-RADIUS CLASSIFICATION — The Deterministic Taxonomy

**HARD-FACT** — YURI's blast-analyzer.mjs defines four tiers:

| Tier | Score | Description | Example |
|------|-------|-------------|---------|
| LOW | 0-0.33 | Reversible, isolated, no external reach | Edit a test file |
| MEDIUM | 0.34-0.66 | Scoped changes, reversible, local impact | Edit a control-plane script |
| HIGH | 0.67-0.90 | Broad scope, some external reach, irreversible | Edit high-impact file, outward-facing |
| CRITICAL | 0.91+ | Production/shared state/outward-facing/protected | Touch .env, send email, modify gate logic |

**HARD-FACT** — Hard floors override blended scores: protected path → CRITICAL, high-impact file → HIGH, outward-facing → HIGH, production → HIGH, control-plane script → MEDIUM floor. A single protected file forces CRITICAL regardless of other LOW signals.

**RECALLED-PATTERN** — The blast classification collapses to a simple decision tree for a solo operator:
1. Does it touch a protected surface? → CRITICAL → owner-gated
2. Does it send/publish/post? → HIGH → owner-gated
3. Does it cost money or fan out processes? → HIGH → owner-gated
4. Is it git-revertible and scoped to one file? → LOW → self-governable
5. Everything else → MEDIUM → self-governable with caution

---

## 6. KEEPING THE GATE FROM BECOMING PARALYSIS OR RUNAWAY

**HARD-FACT** — YURI's charter explicitly addresses this: "HOLD is itself a valid self-governed decision — owner-gated ≠ paralysis." The gate produces a finished ruling (calc/sim + recommendation + reversibility/blast) and holds for a one-token confirm. The human says one word; the work proceeds.

**HARD-FACT** — The energy gate mirror: "auto-pass the routine-safe transition; surface the catastrophic/non-offsettable one." Most decisions should be routine-safe. The gate should be invisible for the 90% case and loud for the 10% that matters.

**RECALLED-PATTERN** — The failure modes that kill gates:

| Failure | Symptom | Fix |
|---------|---------|-----|
| **Paralysis** | Every action requires approval → human ignores or bypasses | Graduate trusted patterns; gate on reversibility, not action count |
| **Runaway** | Gate is self-removed or silently bypassed | Constitution hard-stop: gate-logic self-modification is ALWAYS owner-gated (Gödel Agent gap, explicitly closed in YURI) |
| **Rubber stamp** | Human approves without reading | Reduce gate frequency; increase gate stakes. Fewer, higher-signal gates |
| **Scope creep** | "While I'm here" expansions | Scope lock: final diff must be subset of proposed scope |
| **Alert fatigue** | Too many gates → human misses the important one | Gate on irreversibility only. Reversible actions don't need gates |

**RECALLED-PATTERN** — The SAHOO invariants (arXiv:2603.06333): Goal Drift Index (GDI < 0.44), constraint predicate satisfaction (zero-tolerance halt), regression-risk budget. These operate in sequence; constraint violation has absolute priority. YURI maps GDI to `computeU` ΔU energy gate.

---

## 7. THE SHARPEST MINIMAL RULE-SET FOR A SOLO OPERATOR

Based on all surveyed sources, the minimal rule-set that prevents both paralysis and runaway:

### The Six Gates (YURI Charter, code-verified)

1. **Reversible?** — Can I undo this with one command? (git revert, unset env, delete file)
2. **Evidence-decidable?** — Is the right answer settled by local evidence, not preference?
3. **In-doctrine?** — DISARMED-first, capability-first, mutation contract, protected surfaces, adversarial verify
4. **Blast ≤ MEDIUM?** — Does NOT arm a gate, spend money, fan out processes, or touch production/shared-external state
5. **Not outward-facing?** — No email/post/PR/publish
6. **Not contended?** — Does NOT sweep another session's uncommitted work

ALL PASS → self-execute. ANY FAIL → produce finished ruling + HOLD for one-token confirm.

### The Graduation Rule (Butler-Confirm Pattern)

- Start: every actionable observation → one crisp confirm offer
- Graduate: after N approvals on a pattern → switch to act-then-inform
- Never graduate: irreversible actions, outward-facing actions, gate-arming
- Never graduate all at once: per-pattern, based on approval history

### The Blast Decision Tree

```
Protected surface? → OWNER-GATED
Outward-facing? → OWNER-GATED  
Costs money / fans out? → OWNER-GATED
Git-revertible, one file? → SELF-GOVERNABLE
Everything else → SELF-GOVERNABLE with caution
```

### The Hard Caps (non-negotiable)

1. Max 4 repair cycles per goal before escalation (Voyager ceiling)
2. Scope lock: final diff ⊆ proposed scope; any expansion → owner-gate
3. No recursive self-modification of gate logic (Gödel Agent gap, closed)
4. Contention veto: touching another session's uncommitted lines → immediate owner-gate
5. Constitution hard-stop: protected paths, gate-arming, outward-facing → discard before scoring

---

## BUILD LIST (patterns worth adopting for Yuri)

| Pattern | Source | Why |
|---------|--------|-----|
| **Reversibility-first gating** | YURI charter + all surveyed | Collapses act-first/ask-first into a mechanical check |
| **Graduated trust (butler-confirm → act-inform)** | YURI feedback-butler-confirm | Avoids both paralysis and runaway; per-pattern, not all-at-once |
| **Draft-yes-send-never for outward actions** | Industry pattern | Separates high-value drafting from high-risk sending |
| **Blast-radius decision tree** | YURI blast-analyzer.mjs | Deterministic, no LLM judgment needed |
| **One-token confirm for owner-gated items** | YURI charter | Finished ruling + one word from human = no paralysis |
| **Scope lock (diff ⊆ proposed scope)** | YURI + SAHOO | Prevents scope creep without blocking legitimate work |
| **4-repair-cycle ceiling** | Voyager + YURI | Prevents runaway loops without blocking iterative improvement |
| **Negative-first filter (constitution hard-stop)** | Constitutional AI + YURI | Check what NOT to do before scoring what TO do |
| **Capability-bounded goal proposal** | Voyager curriculum | Don't propose beyond proven capability frontier |
| **Self-verifier with iteration cap** | Voyager + YURI | Attack own output before claiming done |

---

## CUT LIST (over-engineering traps to avoid)

| Trap | Why to cut | Alternative |
|------|-----------|------------|
| **Full autonomy framework before trust** | Framework-before-need kills momentum | Start with augmented LLM + simple gates; add layers only when friction appears |
| **Multi-agent orchestration for a solo operator** | Unnecessary complexity; one assistant + one human is the unit | Single assistant with tool-use loop; multi-agent only when task genuinely requires parallel specialization |
| **Formal verification of every gate decision** | Overkill for reversible actions; gates on irreversibility are sufficient | Deterministic blast check + one-token confirm for the irreversible boundary |
| **Memory system before usage patterns exist** | Gold-plating; you don't know what to remember until you've used it | Start with session continuity + explicit save/forget; add structured memory when forgetting actually hurts |
| **Dashboard/reporting before real data** | Building visualization for hypothetical metrics | Ship first, measure second, dashboard third |
| **Scheduled automation before dry-run proving** | Automating untested behavior compounds errors | Dry-run first, health gates second, scheduler third |
| **Role-based access control for a single user** | Premature abstraction; one human = one authority | Simple owner-gated vs self-governable binary; add roles when collaborators appear |
| **Formal goal-generation curriculum (Voyager-style)** | Too heavy for a personal assistant; the human brings the goals | Human proposes intent; assistant proposes execution path; gate decides |
| **Separate approval UI/UX** | Another surface to maintain; adds latency | One-token confirm in the conversation itself |
| **Full SAHOO GDI with semantic distance computation** | Expensive, fragile, overkill for reversible actions | Simple blast check + scope lock covers 95% of drift cases |

---

## RESULT_LABEL

```
08DS_AUTONOMY_GATE_SURVEY_X_PASS_COMMITTED
```