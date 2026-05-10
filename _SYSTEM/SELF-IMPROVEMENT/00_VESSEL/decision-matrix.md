# Decision Matrix — Agent vs Coworker & Priority Scoring

> Every task needs a mode. Decide before you start.

## 1. Agent vs Coworker Decision Tree

```
Is the task deterministic (well-defined inputs → known outputs)?
├── YES → Can it be done without human context/values?
│   ├── YES → Is the failure cost < 15 min to fix?
│   │   ├── YES → AGENT (full automation)
│   │   └── NO → COWORKER (human must approve output)
│   └── NO → COWORKER (human context required)
└── NO → Is the task creative/ambiguous/first-time?
    ├── YES → COWORKER (human must guide)
    └── NO → COWORKER by default (when unsure, keep human in loop)
```

### Quick Reference Table

| Task Type | Mode | Notes |
|-----------|------|-------|
| Formatting, renaming, batch operations | AGENT | Deterministic, reversible |
| Research with known sources | AGENT | Verified output, low risk |
| Research with unknown sources | COWORKER | Needs human judgment |
| Drafting (template-based) | AGENT | Human reviews before use |
| Drafting (creative) | COWORKER | Human must set direction |
| Bug fixing (well-scoped) | AGENT | Tests verify correctness |
| Bug fixing (ambiguous) | COWORKER | Root cause may be wrong |
| Strategic planning | COWORKER | Never automate strategy |
| Email triage | COWORKER | Relationship risk |
| Scheduling | AGENT | Reversible, preference-based |
| Personal journal/reflection | NEVER | Sacred — no agent touches this |
| Identity-level decisions | NEVER | "Who am I?" is human-only |

## 2. Priority Scoring System

Use the **4-factor urgency score** to rank tasks. Each factor 1–5.

```
URGENCY = (Impact × 0.4) + (Time Sensitivity × 0.3) + (Effort × 0.15) + (Blocking × 0.15)
```

### Factor Definitions

**Impact (weight: 0.4)**
| Score | Description |
|-------|-------------|
| 5 | Revenue, client deadline, irrecoverable opportunity |
| 4 | Major project milestone, reputation-affecting |
| 3 | Significant progress, delayed but not critical |
| 2 | Nice-to-have, quality-of-life improvement |
| 1 | Cosmetic, optional, "someday" |

**Time Sensitivity (weight: 0.3)**
| Score | Description |
|-------|-------------|
| 5 | Must be done today |
| 4 | Must be done this week |
| 3 | Must be done this month |
| 2 | Flexible timing |
| 1 | No deadline |

**Effort (weight: 0.15) — Lower is HIGHER priority**
| Score | Description |
|-------|-------------|
| 5 | < 15 minutes (quick win) |
| 4 | < 1 hour |
| 3 | < 3 hours |
| 2 | < 1 day |
| 1 | > 1 day (big project) |

**Blocking (weight: 0.15)**
| Score | Description |
|-------|-------------|
| 5 | Blocks 3+ other tasks |
| 4 | Blocks 1-2 other tasks |
| 3 | Blocks nothing, but unblocked by this task |
| 2 | Independent task |
| 1 | No dependencies either way |

### Priority Bands

| Score Range | Priority | Action |
|-------------|----------|--------|
| 4.0 – 5.0 | CRITICAL | Do now. Delay only if burning building. |
| 3.0 – 3.9 | HIGH | Do today. Move everything else. |
| 2.0 – 2.9 | MEDIUM | This week. Fit around critical work. |
| 1.0 – 1.9 | LOW | When everything else is done. |

### Quick-score shortcuts

```
Client deliverable due today?    → AUTOMATIC CRITICAL (4.5+)
Internal improvement, no rush?   → LOW (< 2.0)
Quick win, unblocks team?        → HIGH (Likely 3.5+)
Creative deep work, no deadline? → MEDIUM (2.0–2.9)
```

## 3. Risk Classification

Classify every task before acting. Risk determines how much oversight is needed.

| Risk Level | Reversibility | Examples | Oversight Required |
|------------|--------------|----------|--------------------|
| **LOW** | Fully reversible (< 5 min undo) | Renaming files, formatting, batch operations | None — agent can run immediately |
| **MEDIUM** | Reversible with effort (< 1 hour undo) | Drafting emails, scheduling, generating content | Human review before send |
| **HIGH** | Costly or impossible to reverse | Deleting data, making commitments, publishing publicly, strategic decisions | Human approval required + 2-min review pause |
| **CRITICAL** | Irreversible, or affects identity/relationships | Identity statements, personal letters, major financial decisions, public reputation | Human does it — agent only provides data |

### Risk Escalation Protocol

If you classify a task as HIGH or CRITICAL risk:
1. Write a brief to the human explaining: what, why, alternatives, worst-case outcome
2. Do NOT take action — present the brief and wait
3. Let the human make the call

## 4. Probabilistic Decision Core

Use this layer when a task involves uncertainty, competing paths, route selection, opportunity ranking, or risk acceptance.

### Forecast vs Goal vs Plan

| Layer | Question | Rule |
|-------|----------|------|
| Forecast | What is likely to happen? | Estimate from base rates and evidence |
| Goal | What do we want to happen? | State separately from likelihood |
| Plan | What action changes the odds? | Choose by expected value and cost of error |

### Predictability Check

Before assigning probability, score the forecastability:

| Factor | Better forecast when... |
|--------|--------------------------|
| Factor understanding | The drivers are known and stable |
| Data availability | Prior cases or reliable measurements exist |
| Future similarity | Past conditions still resemble the decision context |
| Observer effect | The forecast does not materially change the outcome |

If two or more factors are weak, use `not_estimable` or a broad range instead of a precise number.

### Operational Estimate Template

```text
Decision:
Outcome estimated:
Time horizon:
Base rate:
Signals for:
Signals against:
Probability:
Confidence:
Cost if wrong:
Reversibility:
Expected value:
Action:
Calibration log required:
```

### Action Thresholds

| Condition | Action |
|-----------|--------|
| High confidence + positive expected value + reversible | Proceed |
| Medium confidence + positive expected value + reversible | Proceed with checkpoint |
| Low confidence + high cost if wrong | Gather evidence |
| Any confidence + HIGH/CRITICAL risk | Escalate to human |
| Weak predictability + fake precision risk | Mark `not_estimable` |

### Calibration

When the outcome can be checked later, log it in `_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/probability-calibration-log.md`.

For binary outcomes, use Brier score:

```text
Brier = (forecast_probability - outcome)^2
```

Outcome is `1` if the event happened and `0` if it did not.

## 5. Energy-Aware Scheduling

Marcel's schedule demands precision. Night block (21:00–04:00) is peak. Daytime is lighter.

### Energy Zones

```
Zone 1: PEAK (21:00–04:00)
  └─ Deep creative work, complex problem-solving, synthesis
  └─ Assign: CRITICAL or HIGH priority, high-complexity tasks

Zone 2: MODERATE (15:00–21:00)
  └─ Active recovery, lighter work, gym, admin
  └─ Assign: MEDIUM priority, low-complexity tasks, reviews

Zone 3: LOW (11:00–15:00)
  └─ Admin, communications, context-switching
  └─ Assign: LOW priority, batch operations, inbox processing
```

### Task-to-Energy Mapping

| Task Type | Best Zone | Worst Zone |
|-----------|-----------|------------|
| Creative production (editing, writing, filming) | Zone 1 | Zone 3 |
| Strategic thinking / framework design | Zone 1 | Zone 2 |
| Research / reading | Zone 1 or 2 | Zone 3 |
| Admin / email / light comms | Zone 3 | Zone 1 |
| Planning / review | Zone 2 | — |
| Learning / study | Zone 1 or 2 | Zone 3 |

### Scheduling Command

Before scheduling a task, check:
1. **What zone am I in?** (Current time → energy zone)
2. **What priority is this task?** (Score formula above)
3. **Does the task-zone match?** If not → defer or reschedule

**Rule:** Never spend Zone 1 on Zone 3 tasks. If you do, file it in `02_EXTRACT/failure-log.md` for wasting peak energy on low-value work.

---

## Quick Start — What to Do Right Now

1. **Look at your next task**
2. **Run Agent vs Coworker** → which mode?
3. **Score priority** → how urgent?
4. **Estimate uncertainty** → probability, confidence, cost of error
5. **Classify risk** → how careful?
6. **Check energy zone** → am I in the right headspace?
7. **Go** or **Defer** — now you know.
