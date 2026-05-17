# GAN Loop — Adversarial Generator/Evaluator

**Status:** Ready for deployment  
**Last updated:** 2026-04-19  
**Maintainers:** Marcel + Claudio (post-sync adjustable)

---

## What It Does

Generates shot lists and client briefs through an iterative feedback loop:

```
Your requirements
    ↓
[Generator creates content]
    ↓
[Evaluator scores against rubric]
    ↓
Score < 7.0? → [Generator reads feedback, improves]
    ↓
Score ≥ 7.0 OR Max iterations? → Final output ready
```

Result: High-quality, validated shot lists and briefs without manual back-and-forth.

---

## Quick Start

### Generate a Shot List

```bash
```

Input: A markdown file with shoot requirements  
Output: `shot-list_[date]_[id]-final.md` — ready to send to crew

### Generate a Client Brief

```bash
```

Input: Text file with client name, deliverables, timeline, budget  
Output: `brief_[date]_[id]-final.md` — ready to send to Claudio/Marc

---

## Files

| File | Purpose |
|------|---------|
| `shot-list-rubric.md` | Evaluation criteria for shot lists |
| `client-brief-rubric.md` | Evaluation criteria for briefs |
| `GENERATOR-SKILL.md` | Instructions for content creation agent |
| `EVALUATOR-SKILL.md` | Instructions for quality assessment agent |
| `orchestrator.js` | Loop coordinator (runs gen → eval → feedback cycles) |
| `outputs/` | Generated outputs organized by session ID |

---

## How It Works

### Phase 1: Generator Reads Brief
- Input: Your requirements (location, deliverables, timeline, crew needs)
- Output: First draft shot list or brief
- **Key:** Generator doesn't see the rubric (prevents "gaming" the evaluation)

### Phase 2: Evaluator Scores
- Input: Generated content + evaluation rubric
- Output: Score (1–10), pass/fail on binary gates, specific feedback
- **Key:** Evaluator reads fresh each iteration (no favoritism toward improvement)

### Phase 3: Feedback Loop (if needed)
- If score ≥ 7.0: Ship the output
- If score < 7.0 and iteration < 3: Send feedback back to generator
- Generator reads feedback, improves, loops back
- Max 3 iterations (then ships best version)

---

## Rubrics

### Shot List Rubric (`shot-list-rubric.md`)

**Binary Gates (all must pass):**
- Shoot date present
- Location named
- Time allotments per shot
- Equipment specified
- Crew requirements stated

**Weighted Dimensions:**
- Completeness (25%) — All scenes covered?
- Clarity (25%) — Can crew execute without questions?
- Feasibility (20%) — Realistic timeline and equipment?
- Client alignment (20%) — Does it match the brief?
- Risk mitigation (10%) — Backups and contingencies?

**Scoring:** 7.0+/10 = ship

---

### Client Brief Rubric (`client-brief-rubric.md`)

**Binary Gates (all must pass):**
- Deliverable specified (format, length, file type)
- Timeline clear (shoot date, delivery date, revisions)
- Budget mentioned
- Client name stated
- Creative direction defined

**Weighted Dimensions:**
- Completeness (25%) — All questions answered?
- Clarity (25%) — Could client greenlight on one read?
- Tone match (20%) — Matches relationship with Claudio/Marc?
- Confidence (15%) — Scope realistic?
- Next steps (15%) — Clear what happens next?

**Scoring:** 7.0+/10 = ship

---

## Example Workflow

### Scenario: MACL ONE Q2 Campaign Brief

1. **Create input file:**
   ```
   ```

2. **Run GAN loop:**
   ```bash
   ```

3. **Watch iterations:**
   - Iteration 1: Initial brief generated
   - Evaluator scores 6.2/10 (tone too formal, missing revision round count)
   - Iteration 2: Generator fixes both issues
   - Evaluator scores 7.5/10 ✓ PASS
   - Output saved to `outputs/brief_2026-04-19_abc123-final.md`

4. **Send to client:**
   ```bash
   ```

---

## Adjusting for Your Workflow

### Custom Rubrics

Both rubrics are adjustable. You and Claudio can:

1. **Add gates** — "Budget must include contingency"
2. **Change weights** — Prefer clarity over completeness for MACL ONE
3. **Adjust thresholds** — Pass at 6.5 instead of 7.0 if tight schedule
4. **Domain-specific versions** — Separate rubrics for Claudio vs. Marc vs. MACL

Example:
```bash
  ~/requirements.txt \
  ~/custom-brief-rubric-claudio.md
```

### Skipping the Loop

If you want generator-only (no evaluation):
```bash
# (Future feature: to be added)
node orchestrator.js brief ~/requirements.txt --no-loop
```

---

## Integration with Self-Evolving Hooks

Once GAN Loop generates briefs, corrections you make to the output get captured by the learning system:

- "no, don't use that tone" → finance.md learns "avoid formal register with MACL"
- "yes, add contingency to budget" → finance.md learns "always include budget contingency"

The two systems reinforce each other: GAN Loop generates, hooks learn from your corrections.

---

## Current Limitations (to build)

- [ ] Orchestrator currently logs flow, doesn't run Claude yet
- [ ] Need to integrate with Claude API or subagent dispatch
- [ ] outputs/ directory needs cleanup/archive workflow
- [ ] No UI — command-line only (add `/gan-brief` command later)

---

## Post-Sync Adjustments

Once you and Claudio sync:

1. **Review rubrics together** — Are gates appropriate for both?
2. **Define domain versions** — Different standards for different client types?
3. **Set passing score** — 7.0 or different threshold?
4. **Choose iteration limit** — 3 max, or fewer for tight schedules?
5. **Shared feedback** — Create template feedback language you both use

Example conversation:
- **Marcel:** "My briefs usually pass at 6.8, is that okay?"
- **Claudio:** "For you, 6.8 is fine. For sending to big clients, 7.2 minimum."
- **Action:** Create two rubrics, or adjust threshold per content type
