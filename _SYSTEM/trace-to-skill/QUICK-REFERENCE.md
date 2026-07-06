# Trace to Skill — Quick Reference

**What:** Extract evidence-based skills from your best work  
**How:** Run task 20 times, analyze patterns with 4 agents  
**Result:** Codified SKILL.md file with rules, workflows, edge handlers  
**Time:** 20–30 min per task (20 runs)  

---

## Commands

```bash
# Extract a task skill

# Extract brief skill

# Extract invoice skill
```

---

## Output

```
/skills/[task-id]/SKILL.md
  ├── Core Rules (from success analysis)
  ├── Failure Prevention (from error analysis)
  ├── Optimal Workflow (from structure analysis)
  └── Edge Case Handlers (from edge analysis)

/trace-to-skill/evidence/[task-id]/
  ├── run-01-easy.md through run-20-adversarial.md
  ├── error-analyst-report.md
  ├── success-analyst-report.md
  ├── structure-analyst-report.md
  ├── edge-analyst-report.md
  └── CONSOLIDATED-SKILL.md
```

---

## The 20 Runs

| Type | Count | Purpose |
|------|-------|---------|
| Easy | 5 | Baseline success |
| Normal | 8 | Typical workflow |
| Hard | 4 | Stress test |
| Adversarial | 3 | Find breaking points |

Expected pass rates:
- Easy: 90–100% (establish baseline)
- Normal: 70–80% (typical quality)
- Hard: 40–60% (find limits)
- Adversarial: 20–40% (find breaking points)

---

## The 4 Analysts

| Analyst | Asks | Produces |
|---------|------|----------|
| Error | Why did failures fail? | Preventive rules |
| Success | What makes winners win? | Core rules & patterns |
| Structure | What's the optimal sequence? | Workflow & checkpoints |
| Edge | What breaks? | Defensive checks |

---

## Using Your Extracted Skill

### Manual
1. Open SKILL.md
2. Follow "Optimal Workflow" section
3. Apply "Core Rules" as you work

### Agent (GAN Loop)
1. Prepend SKILL.md to generator prompt
2. Generator follows rules
3. Output quality improves

### Automated (Swarm)
1. Swarm reads your SKILL.md
2. Swarm uses it for overnight processing
3. You wake to validated outputs

---

## Confidence Levels

| Samples | Confidence |
|---------|-----------|
| 20 | Good (finds patterns) |
| 50 | Strong (validates patterns) |
| 100+ | Very strong (mature skill) |

Start with 20, re-run with 50+ after 3–6 months.

---

## Next Steps

1. **Extract a task skill**
   ```bash
   node orchestrator.js task-generation
   ```

2. **Review SKILL.md** — Does it match your intuition?

3. **Use in GAN Loop** — Prepend to generator prompts

4. **Validate on real project** — Does it work?

5. **Integrate with other systems** (Hooks, Swarm, Distribution)

---

## Files

| File | Purpose |
|------|---------|
| `config.json` | Task definitions & parameters |
| `orchestrator.js` | Runs 20 tasks, coordinates analysis |
| `ANALYST-PROTOCOLS.md` | Instructions for 4 agent types |
| `README.md` | Full documentation |
| `USAGE-GUIDE.md` | Detailed walkthrough |
| `QUICK-REFERENCE.md` | This file |
