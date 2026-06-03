# Trace to Skill — Analyst Protocols

Four specialized agents analyze the 20 runs in parallel. Each reads fresh, independently.

---

## Error Analyst

**Role:** Understand failures. Extract preventive rules.

**Input:**
- All runs where score < 7.0 (failures)
- Scores and evaluation feedback for each failure
- Task description and rubric

**Instructions:**

1. **Identify root causes** — Why did each failure fail?
   - Was it incomplete output?
   - Wrong approach to the problem?
   - Missed constraint?
   - Edge case not handled?

2. **Find patterns** — Do multiple failures share a common cause?
   - Example: 3 failures all missed a required constraint
   - Example: 2 failures misread the input

3. **Extract preventive rules** — What rule prevents this failure?
   - "Verify all constraints extracted before starting generation"

4. **Rank by severity** — Which failures would hurt most in production?
   - Missing critical constraints = critical
   - Missing required detail = high
   - Missing edge handling = medium
   - Missing polish = low

**Output Format:**

```markdown
## Error Analysis Report

### Failure Pattern #1: Missing Required Constraint
- **Affected runs:** #3, #12, #18
- **Scores:** 5.2/10, 4.8/10, 5.5/10
- **Root cause:** Generator didn't extract a required constraint from the brief
- **Preventive rule:** Always extract all constraints from the brief before generating
- **Severity:** Critical (output can't be used without it)

### Failure Pattern #2: Missed Edge Case
- **Affected runs:** #15, #17
- **Scores:** 6.1/10, 6.3/10
- **Root cause:** Generator assumed the ideal input case
- **Preventive rule:** Always handle the non-ideal case explicitly
- **Severity:** High (edge conditions are unpredictable)

[... continue for each pattern ...]

### Summary
- Total failures: 8 of 20 runs
- Distinct patterns: 4
- Most common: Missing required constraint (3 occurrences)
- Most severe: Critical constraints not addressed
```

---

## Success Analyst

**Role:** Understand what works. Extract success patterns.

**Input:**
- All runs where score ≥ 8.5 (high-scoring outputs)
- Evaluation feedback for each success
- Task description and rubric

**Instructions:**

1. **Identify success markers** — What makes these outputs excellent?
   - Clear, specific language?
   - Comprehensive detail?
   - Good structure?
   - Alignment with brief?

2. **Find common behaviors** — What do all/most top runs share?
   - Do they all read the brief multiple times?
   - Do they all check feasibility?
   - Do they all include contingencies?
   - Do they reference the brief explicitly?

3. **Distinctive moves** — What do top runs do that others don't?
   - Include rationales for each decision?
   - Add fallback options?
   - Note prerequisites or special requirements?

4. **Rank by impact** — Which behaviors matter most?
   - Explicit constraint handling = high impact (all top runs have it)
   - Constraint acknowledgment = medium impact (most top runs)
   - Decision rationale = low impact (some top runs)

**Output Format:**

```markdown
## Success Analysis Report

### Common Pattern #1: Explicit Constraint Handling
- **Runs:** #2, #5, #8, #11, #14, #19
- **Scores:** 9.1, 8.7, 8.9, 8.6, 8.8, 9.2
- **Behavior:** Every item has specific, measurable detail (not "some" or "later")
- **Impact:** Enables the output to be acted on. Essential for feasibility check.
- **Frequency:** 6/6 top runs (100%)

### Common Pattern #2: Constraint Acknowledgment
- **Runs:** #2, #8, #11, #14, #19
- **Scores:** 9.1, 8.9, 8.6, 8.8, 9.2
- **Behavior:** Output explicitly mentions "given the time budget..." or "with one resource..."
- **Impact:** Shows generator understood the brief, not just generated generically.
- **Frequency:** 5/6 top runs (83%)

### Common Pattern #3: Contingency Planning
- **Runs:** #2, #5, #11, #14
- **Scores:** 9.1, 8.7, 8.6, 8.8
- **Behavior:** Includes "If X fails, fall back to Y..." type contingencies
- **Impact:** Reduces surprises, makes output feel professional.
- **Frequency:** 4/6 top runs (67%)

### Distinctive Move #1: Backup Options
- **Runs:** #2, #19
- **Scores:** 9.1, 9.2
- **Move:** For each item, lists a primary AND a fallback option
- **Impact:** Shows depth of planning. Signals professionalism.
- **Frequency:** 2/6 top runs (33%)

### Distinctive Move #2: Prerequisite Notes
- **Runs:** #8, #14
- **Scores:** 8.9, 8.8
- **Move:** Specifies prerequisites or special requirements per item
- **Impact:** Helps with planning and risk reduction.
- **Frequency:** 2/6 top runs (33%)

### Summary
- **Behaviors to keep:** Explicit constraint handling, constraint acknowledgment
- **Behaviors to add:** Contingency planning, backup options
- **Optional enhancements:** Prerequisite notes, decision rationale
```

---

## Structure Analyst

**Role:** Understand optimal step sequences. Extract workflow.

**Input:**
- All 20 runs (both successes and failures)
- Scores for each run
- Task description

**Instructions:**

1. **Map the workflow** — What steps happen, in what order, in top runs?
   - Step 1: Read brief once? Multiple times?
   - Step 2: Extract constraints? In what order?
   - Step 3: Generate output? With what sub-steps?
   - Step 4: Verify output? Against what?

2. **Identify critical checkpoints** — Where do failures diverge?
   - Do failures skip a step that top runs always do?
   - Do failures do steps out of order?
   - Do failures do steps but incompletely?

3. **Find optimal sequence** — What order produces best results?
   - Extract the primary budget FIRST, then secondary constraints?
   - Generate list, then verify against the budget?
   - Or verify first, then generate?

4. **Tool use patterns** — What tools/techniques appear in top runs?
   - Do all top runs create a "constraint bucket" first?
   - Do all top runs do a feasibility check?
   - Do all top runs check alignment with brief at the end?

**Output Format:**

```markdown
## Structure Analysis Report

### Optimal Workflow (from top 6 runs)

**Phase 1: Input Analysis (Steps 1–3)**
1. Read brief completely (full context)
2. Extract constraints (budget, resources, requirements)
3. List all deliverables from brief

**Phase 2: Planning (Steps 4–5)**
4. Estimate effort per deliverable
5. Assign resources per deliverable (with backups)

**Phase 3: Assembly (Steps 6–7)**
6. Name roles and requirements
7. Add contingency plans (failure modes, timing, resources)

**Phase 4: Validation (Steps 8–9)**
8. Verify feasibility (can we do this within budget?)
9. Cross-check against brief for alignment

**Phase 5: Refinement (Step 10)**
10. Add rationale/notes for complex choices

This sequence appears in all top runs (#2, #5, #8, #11, #14, #19).

### Critical Checkpoint: Feasibility Check (Step 8)
- Failures often SKIP this step (or do it incompletely)
- Top runs always verify: "X items × Y effort each + overhead = Z total. Budget: Z. ✓"
- When skipped: Output has unrealistic estimates, scores 5–6/10

### Tool Use Patterns

**Pattern 1: "Constraint Bucket"**
- Top runs create explicit constraint summary
- Example: "Constraints: budget, resources, deadline, requirements"
- Fails absence of this bucket (scores drop 1–2 points)

**Pattern 2: Feasibility Test**
- Top runs do math: items × effort + overhead = total
- Fails: assume it works without verification

**Pattern 3: Brief Alignment Check**
- Top runs reference brief explicitly ("As noted in brief...")
- Fails: generic output, no clear brief connection

### Summary
- **Optimal sequence:** Input → Planning → Assembly → Validation → Refinement
- **Must include:** Constraint bucket, feasibility check, brief alignment
- **Optional:** Backup options, prerequisite notes, decision rationale
```

---

## Edge Analyst

**Role:** Understand boundary cases. Extract defensive checks.

**Input:**
- Adversarial runs (deliberately tricky inputs)
- All runs (to see where unexpected issues arise)
- Task description and rubric

**Instructions:**

1. **Identify edge cases** — What breaks the normal workflow?
   - Vague brief (an ambiguous term left undefined)
   - Contradictory constraints (more work than the budget allows)
   - Unusual requests (mutually exclusive requirements)
   - Missing information (brief doesn't specify a needed parameter)

2. **Find failure modes** — How does the generator fail in edge cases?
   - Does it generate anyway and hope?
   - Does it ask clarifying questions?
   - Does it make reasonable assumptions?
   - Does it note risks?

3. **Extract defensive checks** — What checks prevent failure?
   - "If brief is vague on X, ask upfront"
   - "If constraints contradict, prioritize by stated priority order"
   - "If the budget is tight, build a 20% buffer"
   - "If a parameter is unclear, assume the minimum and escalate risk"

4. **Rank by criticality** — Which edge cases matter most?
   - Correctness edge cases = critical
   - Feasibility edge cases = high
   - Detail edge cases = medium
   - Polish edge cases = low

**Output Format:**

```markdown
## Edge Analysis Report

### Edge Case #1: Vague Direction
- **Example:** "Make it professional and energetic"
- **Failure mode:** Generator creates generic output unaligned with intent
- **Defensive check:** If brief lacks specifics, ask: "Are there references/examples of what you want?"
- **Severity:** High (misaligned output = revisions + delays)

### Edge Case #2: Contradictory Budget Constraints
- **Example:** Brief asks for more deliverables than the budget allows
- **Failure mode:** Generator creates an unrealistic plan that can't be executed
- **Defensive check:** Always verify: total_effort_needed > budget. If exceeds, propose: (a) extend budget, (b) cut scope, (c) simplify
- **Severity:** Critical (the plan will fail)

### Edge Case #3: Unknown Resource Availability
- **Example:** Brief doesn't specify how many resources are available
- **Failure mode:** Generator assumes more resources than present, plan fails
- **Defensive check:** If resource count not specified, assume the minimum. Escalate as risk: "Recommend confirming available resources"
- **Severity:** High (affects feasibility)

### Edge Case #4: Failure Risk Not Mentioned
- **Example:** Brief doesn't mention what happens if a dependency fails
- **Failure mode:** Generator creates a single-path plan with no fallback
- **Defensive check:** For ALL dependencies, ask: "What's the contingency if this fails?" Suggest fallbacks
- **Severity:** Critical (unrecoverable without a fallback plan)

### Edge Case #5: Prerequisite Assumptions
- **Example:** Brief requires a specialized resource but doesn't confirm access or permissions
- **Failure mode:** Plan assumes the resource is available; in execution it is not
- **Defensive check:** For specialized resources, verify: "Do you have access? Do you have the required permissions?"
- **Severity:** High (the step can't be executed)

### Summary
- **Critical checks:** Correctness, feasibility, resources, failure paths, permissions
- **High checks:** Resource availability, directional clarity, budget verification
- **Medium checks:** Budget alignment, special requirements, contingencies
```

---

## How to Use These Protocols

### Running the Analysts

```bash
# Error Analyst
node analyst.js error-analyst \

# Success Analyst
node analyst.js success-analyst \

# Structure Analyst
node analyst.js structure-analyst \

# Edge Analyst
node analyst.js edge-analyst \
```

### Output

Each analyst produces a markdown report in the evidence directory:
- `error-analyst-report.md`
- `success-analyst-report.md`
- `structure-analyst-report.md`
- `edge-analyst-report.md`

These are then consolidated into a single SKILL.md file.

### Integration with Your Workflow

Once extracted, the skill becomes:

1. **Reference:** Read when doing similar work manually
2. **Prepend:** Agents prepend the skill to every generation
3. **Evolve:** Re-run Trace to Skill every 6 months with 50+ runs for deeper insights
