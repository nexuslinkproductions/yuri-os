# System Integration Map

**Created:** 2026-04-19  
**Systems:** Self-Evolving Hooks + GAN Loop  
**Status:** Both systems live and integrated

---

## How They Work Together

### System 1: Self-Evolving Hooks
**Purpose:** Learn from your corrections, become better over time  
**Location:** `/learning/` + `.claude/hooks/`  
**Lifespan:** Continuous (every session)

**Flow:**
```
You work on task
  ↓
Claude generates output
  ↓
You correct: "no, don't do X"
  ↓
Hook captures correction
  ↓
After 3+ sessions: Dream worker detects pattern
  ↓
Rule written to learning file (e.g., finance.md)
  ↓
Next session: Rule prepends as <mnemosyne> block
  ↓
Claude sees rule, follows it automatically
```

**Result:** Better outputs with fewer corrections over time.

---

### System 2: GAN Loop
**Purpose:** Validate high-stakes content before sending to clients  
**Location:** `/gan-loop/`  
**Lifespan:** On-demand (whenever you need assured quality)

**Flow:**
```
You have a brief to send
  ↓
You provide requirements file
  ↓
Generator creates content (doesn't see rubric)
  ↓
Evaluator scores against rubric (7.0+/10 = pass)
  ↓
Score < 7.0? → Generator reads feedback, improves
  ↓
Loop (max 3 iterations)
  ↓
Final output ready to send
```

**Result:** Validated, client-ready content before it leaves your hands.

---

## Integration Points

### When Hooks Feed GAN Loop

```
Session with Self-Evolving Hooks:
  You generate a brief
  Reviewer says: "no, too formal for this client's tone"
  Hook captures: "don't use formal tone with Client A"
  ↓
Later, you run GAN Loop for Client A's brief:
  Generator creates brief (still might be formal)
  Evaluator scores tone: 6/10 (too formal)
  ↓
But WAIT — Hooks system has learned "Client A tone = casual"
  ↓
Question: Should <mnemosyne> block prepend to GAN Loop evaluator?
  → YES. Evaluator sees your learned rule.
  ↓
Result: Evaluator catches the formal tone faster (maybe iteration 1 instead of 2)
```

### When GAN Loop Feeds Hooks

```
GAN Loop generates output (e.g., a project brief):
  Evaluator gives feedback: "add a fallback plan"
  Generator improves, now includes contingencies
  ↓
You review final output, correct something:
  "no, the fallback should name a specific alternative approach"
  ↓
Hook captures this correction
  ↓
Dream worker sees pattern (contingencies matter)
  ↓
Next time you request a brief via GAN Loop:
  Evaluator has learned: always ask for specific alternatives
  ↓
Result: More detailed briefs with less back-and-forth
```

---

## Workflow Integration: Real Example

### Scenario: Generate a Client Brief → Learn → Generate Again

**Week 1: Day 1 - First GAN Loop Run (Pre-Learning)**

```
INPUT: Client A Q2 campaign requirements.txt
  ↓
GAN Loop:
  Generator creates brief
  Evaluator scores: 7.2/10 (PASS)
  Output saved
  ↓
YOU review output, notice: "opening paragraph still too corporate"
  ↓
You say to Claude: "rewrite that opening, more casual"
  Claude fixes it
  ↓
Self-Evolving Hook captures: "don't use corporate tone with Client A"
  Stores in learning/client-comms.md
```

**Week 1: Day 5 - Dream Worker Runs**

```
After 4h idle + 3 sessions + 2 same corrections:
  Dream worker detects: "Client A tone = casual, not corporate"
  Writes rule to client-comms.md:
    - "Avoid corporate register (explain, implement, utilize) with Client A. Use casual, direct language."
```

**Week 2: Day 3 - Second GAN Loop Run (Post-Learning)**

```
INPUT: New Client A brief (similar scope)
  ↓
Before Generator runs:
  Hook system loads learning/client-comms.md
  <mnemosyne> block prepends: "Client A tone = casual, not corporate"
  ↓
Generator creates brief (now aware of Client A's tone preference)
  ↓
Evaluator scores tone: 8/10 (was 7/10 before learning)
  Overall score: 7.6/10 (same inputs, better output)
  ↓
RESULT: Same brief quality achieved faster, with less iteration
```

---

## Control Flow Diagram

```
┌─────────────────────────────────────────┐
│  Your Daily Work (Sessions)             │
│  - Generate content                     │
│  - Make corrections ("no, fix this")    │
│  - Approve outputs ("yes, exactly")     │
└─────────────────────────────────────────┘
         ↓                        ↓
    CONTINUOUS              ON-DEMAND
    (Every Session)         (When you need it)
         ↓                        ↓
┌─────────────────────────────────────────┐
│  Self-Evolving Hooks                    │
│  - Capture your corrections             │
│  - Store as signals in sessions.jsonl   │
│  - Dream worker detects patterns        │
│  - Write rules to learning/ files       │
└─────────────────────────────────────────┘
         ↓                        ↓
  Learning accumulates    Rules prepend to
  over time (Week 1–4)    next session via
                          <mnemosyne> block
                                 ↓
                          Claude sees your
                          learned rules at
                          session start
         ↓                        ↓
         └──────────┬────────────┘
                    ↓
         ┌──────────────────────────┐
         │  GAN Loop                │
         │  (On-demand)             │
         │                          │
         │  1. You provide brief    │
         │  2. Generator creates    │
         │  3. Evaluator scores     │
         │  4. Loop if < 7.0        │
         │  5. Output ready         │
         └──────────────────────────┘
                    ↓
         ┌──────────────────────────┐
         │  Client-Ready Output     │
         │  - Validated (7.0+/10)   │
         │  - Ready to send         │
         │  - Incorporates learned  │
         │    rules from Hooks      │
         └──────────────────────────┘
```

---

## Adjustments After Collaborator Sync

**Week 3–4: You + a collaborator align**

### Self-Evolving Hooks
- Review learning files together
- Decide which rules apply broadly vs. just your workflow
- Adjust thresholds in `config.json` (e.g., 2→3 corrections for rule)
- Create domain versions (e.g., rules for one collaborator's work differ from another's)

### GAN Loop
- Review rubrics together
- Adjust binary gates (do they match your house standards?)
- Change weights (does clarity matter more than completeness for a given client?)
- Create client-specific versions (e.g., a separate rubric per client account)

---

## Command Quick Reference

### Self-Evolving Hooks

```bash
# Check what's been learned

# See sessions captured

# Adjust thresholds
```

### GAN Loop

```bash
# Generate brief
  brief ~/requirements.txt

# Use custom rubric
  brief ~/requirements.txt ~/my-custom-rubric.md

# Check outputs
```

---

## Design Philosophy

Both systems follow the same principle: **externalize decision-making**.

**Self-Evolving Hooks:** Externalize learning → rules files  
- Decision: "What corrections do I make repeatedly?"
- Storage: `learning/*.md` files
- Reuse: Rules prepend to every session

**GAN Loop:** Externalize quality standards → rubric files  
- Decision: "What makes content 'good'?"
- Storage: Rubric markdown files
- Reuse: Same rubric, tight feedback loops

When you and a collaborator sync, you're literally aligning these external decision systems. Not arguing philosophy — comparing actual files, rule lists, rubric gates.

---

## Next Steps

1. **Use Self-Evolving Hooks for 1 week** — Let it capture corrections
2. **Try GAN Loop on a real brief** — See the validation flow in action
3. **After collaborator sync** — Adjust both systems together
4. **Build on them** — Distribution agents, Trace to Skill, etc. all use the same foundation

Both systems are now **live and ready to use**.
