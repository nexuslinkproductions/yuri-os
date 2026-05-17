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
   - Example: 3 failures all missed weather contingencies
   - Example: 2 failures misread the timeline

3. **Extract preventive rules** — What rule prevents this failure?
   - "Always specify time allotments down to 5-min increments"
   - "If outdoor shoot, always add indoor contingency"
   - "Verify all constraints extracted before starting generation"

4. **Rank by severity** — Which failures would hurt most in production?
   - Missing safety details = critical
   - Missing equipment specs = high
   - Missing contingencies = medium
   - Missing polish = low

**Output Format:**

```markdown
## Error Analysis Report

### Failure Pattern #1: Missing Time Allotments
- **Affected runs:** #3, #12, #18
- **Scores:** 5.2/10, 4.8/10, 5.5/10
- **Root cause:** Generator didn't ask "how long per shot?"
- **Preventive rule:** Always extract per-shot duration from brief before generating
- **Severity:** Critical (shoot can't execute without timings)

### Failure Pattern #2: No Weather Contingency
- **Affected runs:** #15, #17
- **Scores:** 6.1/10, 6.3/10
- **Root cause:** Generator assumed clear weather
- **Preventive rule:** For outdoor shoots, always propose indoor alternatives
- **Severity:** High (weather is unpredictable on location)

[... continue for each pattern ...]

### Summary
- Total failures: 8 of 20 runs
- Distinct patterns: 4
- Most common: Missing time allotments (3 occurrences)
- Most severe: Safety/crew considerations not addressed
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
   - Include "why this shot" rationales?
   - Add equipment backup options?
   - Note crew experience requirements?

4. **Rank by impact** — Which behaviors matter most?
   - Explicit time allotments = high impact (all top runs have it)
   - Constraint acknowledgment = medium impact (most top runs)
   - Creative rationale = low impact (some top runs)

**Output Format:**

```markdown
## Success Analysis Report

### Common Pattern #1: Explicit Time Allotments
- **Runs:** #2, #5, #8, #11, #14, #19
- **Scores:** 9.1, 8.7, 8.9, 8.6, 8.8, 9.2
- **Behavior:** Every shot has specific duration (e.g., "12–15 min" not "some time")
- **Impact:** Enables crew to plan. Essential for feasibility check.
- **Frequency:** 6/6 top runs (100%)

### Common Pattern #2: Constraint Acknowledgment
- **Runs:** #2, #8, #11, #14, #19
- **Scores:** 9.1, 8.9, 8.6, 8.8, 9.2
- **Behavior:** Output explicitly mentions "given the 4-hour window..." or "with 1 location..."
- **Impact:** Shows generator understood the brief, not just generated generically.
- **Frequency:** 5/6 top runs (83%)

### Common Pattern #3: Contingency Planning
- **Runs:** #2, #5, #11, #14
- **Scores:** 9.1, 8.7, 8.6, 8.8
- **Behavior:** Includes "If weather bad, move scene X indoors..." type contingencies
- **Impact:** Reduces on-set surprises, makes brief feel professional.
- **Frequency:** 4/6 top runs (67%)

### Distinctive Move #1: Equipment Backup Options
- **Runs:** #2, #19
- **Scores:** 9.1, 9.2
- **Move:** For each shot, lists primary AND backup equipment
- **Example:** "Red Komodo (primary), Arri Mini (if RED unavailable)"
- **Impact:** Shows deep production knowledge. Signals professionalism.
- **Frequency:** 2/6 top runs (33%)

### Distinctive Move #2: Crew Experience Notes
- **Runs:** #8, #14
- **Scores:** 8.9, 8.8
- **Move:** Specifies crew experience level or special skills needed
- **Example:** "Drone operator: commercial experience required, 50+ hours"
- **Impact:** Helps with crew hiring/safety planning.
- **Frequency:** 2/6 top runs (33%)

### Summary
- **Behaviors to keep:** Time allotments, constraint acknowledgment
- **Behaviors to add:** Contingency planning, equipment backups
- **Optional enhancements:** Crew experience notes, creative rationale
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
   - Extract time budget FIRST, then location, then crew?
   - Generate list, then verify against time budget?
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
2. Extract constraints (time, location, crew, budget)
3. List all scenes/deliverables from brief

**Phase 2: Planning (Steps 4–5)**
4. Estimate time per scene
5. Assign equipment per scene (with backups)

**Phase 3: Assembly (Steps 6–7)**
6. Name crew roles and requirements
7. Add contingency plans (weather, timing, crew)

**Phase 4: Validation (Steps 8–9)**
8. Verify feasibility (can we do this in the time available?)
9. Cross-check against brief for alignment

**Phase 5: Refinement (Step 10)**
10. Add rationale/notes for complex choices

This sequence appears in all top runs (#2, #5, #8, #11, #14, #19).

### Critical Checkpoint: Feasibility Check (Step 8)
- Failures often SKIP this step (or do it incompletely)
- Top runs always verify: "X scenes × Y min each + setup = Z hours. Budget: Z hours. ✓"
- When skipped: Output has unrealistic timings, scores 5–6/10

### Tool Use Patterns

**Pattern 1: "Constraint Bucket"**
- Top runs create explicit constraint summary
- Example: "Constraints: 4h shoot, 2 locations, 1 gaffer, outdoor + indoor"
- Fails absence of this bucket (scores drop 1–2 points)

**Pattern 2: Feasibility Test**
- Top runs do math: scenes × time + overhead = total
- Fails: assume it works without verification

**Pattern 3: Brief Alignment Check**
- Top runs reference brief explicitly ("As noted in brief...")
- Fails: generic output, no clear brief connection

### Summary
- **Optimal sequence:** Input → Planning → Assembly → Validation → Refinement
- **Must include:** Constraint bucket, feasibility check, brief alignment
- **Optional:** Equipment backups, crew notes, creative rationale
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
   - Vague brief (what does "natural light" mean exactly?)
   - Contradictory constraints (5 scenes in 2 hours)
   - Unusual requests (shoot in two time zones simultaneously)
   - Missing information (brief doesn't specify crew size)

2. **Find failure modes** — How does the generator fail in edge cases?
   - Does it generate anyway and hope?
   - Does it ask clarifying questions?
   - Does it make reasonable assumptions?
   - Does it note risks?

3. **Extract defensive checks** — What checks prevent failure?
   - "If brief is vague on X, ask upfront"
   - "If constraints contradict, prioritize: safety > budget > creative"
   - "If time is tight, build 20% buffer"
   - "If crew count unclear, assume minimum and escalate risk"

4. **Rank by criticality** — Which edge cases matter most?
   - Safety edge cases = critical
   - Feasibility edge cases = high
   - Detail edge cases = medium
   - Polish edge cases = low

**Output Format:**

```markdown
## Edge Analysis Report

### Edge Case #1: Vague Creative Direction
- **Example:** "Make it look professional and energetic"
- **Failure mode:** Generator creates generic shot list unaligned with client intent
- **Defensive check:** If brief lacks visual specifics, ask: "Are there references/examples of the look you want?"
- **Severity:** High (misaligned output = revisions + delays)

### Edge Case #2: Contradictory Time Constraints
- **Example:** "5 scenes, 2 locations, 2 hours" (actually needs 4 hours)
- **Failure mode:** Generator creates unrealistic shot list, crew can't execute
- **Defensive check:** Always verify: total_time_needed > budget_time. If exceeds, propose: (a) extend hours, (b) cut scenes, (c) simplify shots
- **Severity:** Critical (production will fail)

### Edge Case #3: Unknown Crew Availability
- **Example:** Brief doesn't specify how many crew available
- **Failure mode:** Generator assumes more crew than actually present, schedule fails
- **Defensive check:** If crew count not specified, assume minimum (camera only). Escalate as risk: "Recommend adding grip + gaffer"
- **Severity:** High (affects feasibility)

### Edge Case #4: Weather Risk Not Mentioned
- **Example:** Outdoor shoot, brief doesn't mention weather contingencies
- **Failure mode:** Generator creates outdoor-only shot list, rain arrives, shoot is lost
- **Defensive check:** For ALL outdoor shoots, ask: "What's your contingency if weather is bad?" Suggest indoor alternatives
- **Severity:** Critical (shoot is unrecoverable without indoor plan)

### Edge Case #5: Equipment Assumptions
- **Example:** Brief says "drone shot" but doesn't specify who operates or permits
- **Failure mode:** Shot list assumes drone is available; on set, no operator or no airspace clearance
- **Defensive check:** For specialized equipment (drone, crane, steadicam), verify: "Do you have operator? Do you have permits?"
- **Severity:** High (shot can't be executed)

### Summary
- **Critical checks:** Safety, feasibility, crew, weather, permits
- **High checks:** Equipment availability, creative clarity, time verification
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
3. **Collaborate:** Share with Claudio for feedback and refinement
4. **Evolve:** Re-run Trace to Skill every 6 months with 50+ runs for deeper insights
