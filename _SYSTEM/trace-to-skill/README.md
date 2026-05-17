# Trace to Skill — Evidence-Based Skill Extraction

**Status:** Framework ready for deployment  
**Based on:** Alibaba's Trace2Skill research  
**Purpose:** Extract behavioral rules from task execution, codify as reusable skills

---

## What It Does

Instead of writing skills by hand, this system:

1. **Executes a task 20 times** across difficulty levels (easy → normal → hard → adversarial)
2. **Evaluates outputs** using rubrics (1–10 scoring)
3. **Analyzes all runs in parallel** with 4 specialized agents:
   - **Error Analyst:** "Why did failures fail? What preventive rules help?"
   - **Success Analyst:** "What made the best ones succeed?"
   - **Structure Analyst:** "What's the optimal step sequence?"
   - **Edge Analyst:** "What breaks? What defensive checks work?"
4. **Consolidates findings** into a SKILL.md file (your new, reusable skill)

**Result:** Your best instincts, extracted and codified.

---

## How It Differs from Hand-Written Skills

| Aspect | Hand-Written | Trace to Skill |
|--------|--------------|----------------|
| **Source** | Your memory/preference | Actual execution data |
| **Bias** | What you think works | What actually works |
| **Failure modes** | Guessed | Observed from 20 runs |
| **Edge cases** | Maybe covered | Tested explicitly |
| **Confidence** | Subjective | Evidence-based (N runs = rank) |

---

## The 20-Run Framework

### Difficulty Distribution

```
5 Easy runs
  - Simple inputs, ideal conditions
  - Establish baseline success (should all pass)
  - Example: shot list for straightforward commercial

8 Normal runs
  - Typical inputs, realistic constraints
  - Core skill demonstration
  - Example: shot list for multi-location campaign

4 Hard runs
  - Complex inputs, tight constraints
  - Stress-test the skill
  - Example: shot list for 1-day, 5-scene shoot with bad weather

3 Adversarial runs
  - Designed to break the skill
  - Edge cases, unusual requests
  - Example: shot list for "day/night same location with rain contingency"
```

### Scoring System

- **9–10:** Excellent. Production-ready without revision.
- **7–8:** Good. Minor issues, generally usable.
- **5–6:** Weak. Significant issues, needs work.
- **1–4:** Fail. Unusable as-is.

**Passing threshold:** 7.0+/10 (configurable per task)

---

## The 4 Analyst Agents

### 1. Error Analyst
**Focus:** Failed outputs (score < 7.0)

Questions:
- What went wrong in run #3, #7, #15?
- What root causes led to failures?
- What rule would prevent this failure?

Output:
```
Failed run #7: Score 4/10 (incomplete)
  Root cause: Generator didn't understand "one-day shoot, 5 scenes"
  Preventive rule: "Always extract scene count and time per scene from brief"
  
Failed run #15: Score 5/10 (unrealistic timings)
  Root cause: Didn't account for setup time between locations
  Preventive rule: "Add 15–20 min travel + setup time between location changes"
```

### 2. Success Analyst
**Focus:** High-scoring outputs (score ≥ 8/10)

Questions:
- What made runs #2, #8, #19 excellent?
- What specific decisions/behaviors enabled success?
- What patterns emerge across top runs?

Output:
```
Top runs (#2, #8, #19) share:
  - Explicit time allotments per shot (down to 5-min increments)
  - Named crew roles for each shot
  - Contingency plans for two failure modes
  - Equipment specified with backup options
  
Distinctive behaviors:
  - Top runs include "why this shot matters" notes
  - They reference the brief explicitly ("As noted in brief: outdoor scenes")
  - They list potential issues upfront
```

### 3. Structure Analyst
**Focus:** Step sequences and tool use

Questions:
- In what order should steps happen?
- Which tools/techniques appear in all top runs?
- What's the optimal workflow?

Output:
```
Optimal sequence (from top 8 runs):
  1. Extract scene list from brief (what are we shooting?)
  2. Identify constraints (time, location, crew, weather)
  3. Estimate time per scene (ask "how long for each?")
  4. Assign equipment per scene
  5. Name crew roles needed
  6. Add contingencies (weather, setup delays)
  7. Review against brief for alignment

Tool use patterns:
  - All top runs read brief 2–3 times (start, mid-sequence, final check)
  - All use a "constraint bucket" (location, time, crew, budget)
  - All explicitly test "can we do this in the time available?"
```

### 4. Edge Analyst
**Focus:** Boundary cases and adversarial inputs

Questions:
- What breaks when input is unusual?
- What defensive checks prevent failures?
- How to handle contradictions in the brief?

Output:
```
Edge case: "One-day shoot, 5 scenes, 2 locations, rain forecast"
  Failure mode: No indoor backups
  Defensive check: "For outdoor scenes in uncertain weather, always add indoor alternative"
  
Edge case: "Budget is tight, need all shots but limited crew"
  Failure mode: Unrealistic timings
  Defensive check: "For tight budgets, reduce setup time assumptions by 10%, add risk buffer"
  
Edge case: "Brief has vague creative direction"
  Failure mode: Generated list doesn't match intent
  Defensive check: "If brief lacks specifics, ask clarifying questions upfront"
```

---

## Output: SKILL.md

Consolidated into your skill file:

```markdown
# Shot List Generation Skill

**Confidence:** Evidence-based (20 runs)  
**Passing rate:** 85% (17 of 20 runs ≥ 7.0)  
**Last updated:** 2026-04-19  

## Core Rules (from success analysis)

1. Always specify time allotments down to 5-min increments
2. Name crew roles explicitly for each shot
3. Include contingency plans for weather and timing
4. Specify equipment with backup options
5. Reference brief constraints explicitly

## Failure Preventions (from error analysis)

- If brief is vague on scene count → Ask upfront
- If time budget is tight → Build 20% buffer
- If multi-location → Account for travel time
- If outdoor → Always add indoor alternative

## Edge Case Handlers (from edge analysis)

- Contradictions in brief? Prioritize: safety > budget > creative
- Weather risk? Offer 2 contingency approaches
- Tight crew? Reduce setup time by 10%, extend shoot hours if needed

## Optimal Workflow (from structure analysis)

1. Extract constraints (time, locations, crew, budget)
2. List all scenes with durations
3. Build equipment matrix
4. Assign crew per scene
5. Test feasibility (can we do it?)
6. Add contingencies
7. Final brief alignment check
```

---

## Running Trace to Skill

### Command

```bash
  shot-list-generation \
  --samples 20 \
```

### What Happens

1. **Generation Phase:** 20 runs of shot list generation (5 easy, 8 normal, 4 hard, 3 adversarial)
2. **Evaluation Phase:** Each output scored 1–10
3. **Analysis Phase:** 4 agents analyze in parallel (error, success, structure, edge)
4. **Consolidation Phase:** Merge findings into SKILL.md
5. **Output:** Final skill file + evidence directory for review

**Timeline:** ~30–60 min for full 20-run extraction (depending on Claude API latency)

---

## Evidence Tracking

All outputs saved for review:

```
├── run-01-easy.md         [Score: 8.2/10]
├── run-02-easy.md         [Score: 9.1/10]
├── ...
├── run-19-adversarial.md  [Score: 5.3/10]
├── run-20-adversarial.md  [Score: 6.8/10]
│
├── error-analyst-report.md
├── success-analyst-report.md
├── structure-analyst-report.md
├── edge-analyst-report.md
│
└── CONSOLIDATED-SKILL.md  [Final output]
```

You can review all runs, see why they scored as they did, and verify the rules extracted.

---

## Candidates for Extraction

Good tasks to trace:

| Task | Effort | Value | Notes |
|------|--------|-------|-------|
| Shot list generation | Medium | High | Core on-set skill |
| Call sheet creation | Low | High | Repeatable logistics |
| Invoice preparation | Medium | Medium | Finance/accuracy critical |
| Client email drafting | Low | High | Tone/communication |
| Project brief analysis | Medium | Medium | Planning foundation |

Start with **shot list generation** (core to your on-set work).

---

## Integration with Other Systems

### Self-Evolving Hooks + Trace to Skill

```
Self-Evolving Hooks learns from corrections:
  "no, don't forget weather contingencies"
  → Rule stored in learning/on-set.md
  
Later, Trace to Skill extracts skills from 20 runs:
  "All top runs include weather contingencies"
  → Rule stored in SKILL.md
  
Result: Same insight from two sources (learning + evidence)
  → More confident this is a real best practice
```

### GAN Loop + Trace to Skill

```
GAN Loop validates your briefs:
  Generator creates shot list
  Evaluator scores it
  
Generator uses Trace-to-Skill rules:
  "Include weather contingencies"
  "Specify equipment with backups"
  
Result: Tighter feedback loops, fewer iterations to pass
```

---

## Post-Extraction: Using Your Skill

Once SKILL.md is created:

1. **Manual use:** Read the skill, apply rules when generating shot lists
2. **Agent use:** Claude agents in GAN Loop reference your SKILL.md
3. **Integration:** Swarm system uses your skills for overnight automation
4. **Refinement:** After 3–6 months, re-trace the skill (50 runs) for deeper patterns

---

## Adjusting After Claudio Sync

Once you and Claudio review the extracted skills:

1. **Validate rules together** — Do these match your house standards?
2. **Mark client-specific rules** — Shot lists for MACL differ from C2MOVIEZ?
3. **Create variants** — Separate SKILL files for different clients?
4. **Refine thresholds** — Is 7.0 the right passing score, or different per client?

Skills are data files, not code — easy to version control and iterate together.
