# Trace to Skill — Usage Guide

---

## Quick Start

### Run Shot List Extraction

```bash
node orchestrator.js shot-list-generation
```

**What happens:**
1. Generates 20 test runs (5 easy, 8 normal, 4 hard, 3 adversarial)
2. Evaluates each run (1–10 score)
3. Analyzes all runs with 4 agents in parallel
4. Consolidates findings → SKILL.md

**Output:**
```
```

**Timeline:** ~20–30 minutes (depending on Claude API latency)

---

## Understanding the 20-Run Analysis

### Difficulty Levels

**Easy (5 runs):** Baseline success
- Simple brief, clear requirements, no constraints
- Should all pass (≥7.0/10)
- Establishes "what success looks like in ideal conditions"

**Normal (8 runs):** Typical workflow
- Realistic brief, typical constraints
- Expecting ~75% pass rate
- Core skill demonstration

**Hard (4 runs):** Stress test
- Complex requirements, tight timeline, multiple constraints
- Expecting ~50% pass rate
- Tests edge-case handling

**Adversarial (3 runs):** Break the skill
- Intentionally tricky inputs (vague brief, contradictions, unusual requests)
- Expecting ~30% pass rate
- Identifies limits and failure modes

### Why 20?

- **5 easy:** Enough to establish baseline (1 failure = just noise)
- **8 normal:** Enough to find patterns in typical case
- **4 hard:** Enough to stress-test without excessive effort
- **3 adversarial:** Enough to identify edge cases without overkill

Total confidence with N samples:
- 20 runs: Good confidence (identifies patterns)
- 50 runs: Strong confidence (validates patterns)
- 100+ runs: Very strong confidence (mature skill)

---

## Reading the Extracted Skill

### Structure of SKILL.md

```markdown
# [Task Name]

**Confidence:** Evidence-based (20 runs)
**Pass rate:** 85% (17/20 ≥ 7.0/10)
**Average score:** 7.6/10

## Core Rules (from success analysis)
- What all high-scoring runs share
- Behaviors that enable success

## Failure Prevention (from error analysis)
- Why failures fail
- Defensive checks to prevent failures

## Optimal Workflow (from structure analysis)
- Step-by-step execution sequence
- Critical checkpoints and tool use

## Edge Case Handlers (from edge analysis)
- Boundary conditions and how to handle them
- Defensive checks for unusual inputs
```

### How to Use It

**Scenario 1: Manual use (you writing a shot list)**
1. Open SKILL.md
2. Follow "Optimal Workflow" section
3. Apply "Core Rules" and "Failure Prevention" as you work
4. Refer to "Edge Case Handlers" if you encounter unusual constraints

**Scenario 2: Agent use (Claude generating a shot list)**
1. Prepend SKILL.md to Claude's prompt
2. Claude reads rules and follows them
3. Output incorporates all learned best practices

**Scenario 3: GAN Loop integration**
1. Generator agent reads SKILL.md before creating content
2. Evaluator has fewer gate failures (because generator follows rules)
3. Feedback loops become tighter (fewer iterations to pass)

---

## Interpreting Analyst Reports

### Error Analyst Report

**Shows:**
- Which runs failed (score < 7.0)
- Why they failed (root cause analysis)
- How to prevent similar failures

**Action items:**
- Add preventive rules to your SKILL.md
- If a failure mode appears 2+ times, it's a real pattern
- Highest-severity failures = must have rules

**Example:**
```
Failure Pattern: Missing Time Allotments
  Affected runs: #3, #12, #18 (3 occurrences)
  Root cause: Generator didn't extract per-shot duration
  Preventive rule: "Always ask: how long for each shot?"
  Severity: Critical
  
Action: Add rule to SKILL.md "Core Rules" section
```

### Success Analyst Report

**Shows:**
- Which runs scored ≥8.5/10
- What they share (common behaviors)
- What makes them exceptional (distinctive moves)

**Action items:**
- "Common patterns" = required for all outputs
- "Distinctive moves" = nice-to-have enhancements

**Example:**
```
Common Pattern: Explicit Time Allotments
  Runs: #2, #5, #8, #11, #14, #19 (6/6 top runs)
  Behavior: Every shot has specific duration (e.g., "12–15 min")
  Impact: Enables crew to plan. Essential.
  
Action: Make this a "Core Rule" — required for all outputs
```

### Structure Analyst Report

**Shows:**
- Optimal step sequence
- Critical checkpoints
- Tool use patterns

**Action items:**
- Follow the optimal workflow for consistency
- Never skip critical checkpoints
- Use tool patterns (constraint bucket, feasibility check) explicitly

**Example:**
```
Optimal Workflow:
  1. Read brief
  2. Extract constraints
  3. List scenes
  4. Estimate time per scene
  5. Assign equipment
  6. Add contingencies
  7. CRITICAL CHECKPOINT: Verify feasibility
  8. Cross-check against brief
  9. Refine details

Missing step 7 → output fails feasibility → score drops
```

### Edge Analyst Report

**Shows:**
- Boundary conditions and how they fail
- Defensive checks for unusual inputs
- Critical vs. optional safeguards

**Action items:**
- Add edge case handlers to SKILL.md
- Critical edge cases → non-negotiable rules
- Medium edge cases → conditional rules

**Example:**
```
Edge Case: Contradictory Time Constraints
  Example: "5 scenes, 2 hours" (actually needs 4)
  Failure mode: Unrealistic shot list, crew can't execute
  Defensive check: "If total_time > budget, propose: (a) extend, (b) cut, (c) simplify"
  Severity: Critical
  
Action: Add to "Edge Case Handlers" section
```

---

## Integration Points

### With Self-Evolving Hooks

```
Week 1: Use GAN Loop to generate shot lists
  → You make corrections ("add weather contingency")
  → Hooks capture corrections
  → Dream worker learns patterns

Later: Run Trace to Skill on shot list generation
  → Analyst finds: "All top runs include weather contingencies"
  → Same insight from two sources (learning + evidence)
  → Confidence increases: this IS a best practice
```

### With GAN Loop

```
Before: GAN Loop generator has no special knowledge
  → Generator creates shot lists (generic quality)
  → Evaluator scores them (70–75% pass rate)
  → Many feedback loops needed

After: GAN Loop generator reads your SKILL.md
  → Generator follows "Core Rules" and "Optimal Workflow"
  → Output quality improves (80–90% pass rate)
  → Fewer iterations to pass evaluation
```

### With Autonomous Swarm

```
Swarm runs overnight while you sleep
  → Swarm needs to process shot lists, invoices, etc.
  → Swarm reads your SKILL.md files
  → Swarm executes tasks following codified best practices
  → You wake to validated outputs
```

---

## Running Multiple Tasks

Once shot list is extracted, repeat for other tasks:

```bash
# Extract client brief skill
node orchestrator.js client-brief-generation

# Extract invoice skill
node orchestrator.js invoice-preparation

# Extract call sheet skill (if added to config)
node orchestrator.js call-sheet-generation
```

Each produces its own SKILL.md file.

**Result:**
```
/skills/
├── shot-list-generation/SKILL.md
├── client-brief-generation/SKILL.md
├── invoice-preparation/SKILL.md
└── call-sheet-generation/SKILL.md
```

---

## Advanced: Custom Task Extraction

### Add a New Task


```json
{
  "id": "call-sheet-generation",
  "name": "Generate detailed call sheet",
  "description": "Creates crew call sheet with timings, locations, contact info",
  "inputType": "project-data",
  "outputType": "call-sheet",
  "difficulty_distribution": { "easy": 5, "normal": 8, "hard": 4, "adversarial": 3 },
  "evaluation_rubric": "/path/to/rubric.md",
  "passing_score": 7.0,
  "analysts": ["error", "success", "structure", "edge"]
}
```

Then run:
```bash
node orchestrator.js call-sheet-generation
```

---

## Limitations & Future

**Current:**
- Orchestrator logs the analysis flow
- Needs Claude API integration to actually run 20 tasks
- Analyst reports are templates (need real agent implementation)

**Next:**
- Wire orchestrator to Claude API for generation + evaluation
- Deploy 4 analyst agents with real analysis logic
- Auto-consolidation from analyst reports → SKILL.md
- Version control and comparison (re-extract every 6 months)

**After Claudio Sync:**
- Review extracted skills together
- Mark client-specific variants (MACL rules ≠ C2MOVIEZ rules)
- Create domain variations (on-set shot lists vs. editorial briefs)
- Agree on re-extraction schedule

---

## Workflow: From Nothing to Codified Skill

**Day 1:**
```bash
node orchestrator.js shot-list-generation
```
→ Framework runs, generates 20 sample runs, analyzes them

**Day 1–2:** Review

- Read `SKILL.md` — does it match your intuition?
- Review all 20 runs in `evidence/` — do the scores feel right?
- Read analyst reports — any surprises?

**Day 2–3:** Validate

- Use SKILL.md on a real project — does it work?
- Make corrections to rules if needed
- Share with Claudio for feedback

**Week 2:** Integrate

- Prepend SKILL.md to Claude generators
- Use in GAN Loop evaluation
- Refine based on real usage

**Month 3:** Re-extract

- Run with 50 samples (deeper analysis)
- Compare with original extraction
- Identify evolved practices

**Month 6+:** Production skill

- SKILL.md is now your documented best practice
- Auto-prepended to all related generation tasks
- Version controlled with Claudio
- Reference for training new team members
