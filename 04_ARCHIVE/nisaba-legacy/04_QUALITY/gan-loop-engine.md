# NISABA — HOUSE 4: QUALITY ENGINE
*The Adversarial Temple. Where confident slop meets its executioner.*

---

## THE QUALITY DOCTRINE

> First drafts are not bad because the model is bad.
> First drafts are bad because the model has no adversary.
> NISABA provides the adversary.

The GAN Loop is the core quality mechanism: one agent generates, another evaluates, and they iterate until the output meets a rubric threshold or hits the iteration cap.

This is not "review your work." This is structural adversarial pressure that forces convergence.

---

## GAN LOOP ARCHITECTURE

### The Standard Loop

```
GENERATOR (produces output)
    ↓
EVALUATOR (scores against rubric)
    ↓
Score ≥ threshold? → SHIP
Score < threshold and iterations < cap? → ITERATE (generator gets evaluator feedback)
Score < threshold and iterations = cap? → ESCALATE with notes
```

### Three tiers of adversarial evaluation

```
TIER 1: SINGLE-MODEL GAN (standard)
  Generator: Claude Sonnet
  Evaluator: Claude Sonnet (separate context, fresh rubric each pass)
  Cost: ~$0.50–1.00 per loop
  When to use: blog posts, code generation, documentation, routine content
  Why it works: even the same model catches errors when given an explicit rubric
                and told its ONLY job is to find problems

TIER 2: CROSS-MODEL GAN (NISABA enrichment — not in BTN)
  Generator: Claude Sonnet
  Evaluator: different model family (GPT-4o, Gemini Pro, Codex)
  Cost: ~$1.50–3.00 per loop
  When to use: security review, architecture decisions, high-stakes content
  Why it works: different training distributions produce different blind spots
                what Claude misses, GPT catches, and vice versa
  Implementation: evaluator prompt stays identical, only the model endpoint changes

TIER 3: HUMAN-IN-LOOP GAN (NISABA enrichment — not in BTN)
  Generator: Claude Sonnet
  Evaluator: AI scores first → flags items below threshold → human reviews flagged items
  Cost: AI cost + 10–15 min human time
  When to use: client-facing deliverables, legal/financial content, creative direction
  Why it works: human judgment on the 20% the AI is uncertain about
  Implementation: AI evaluator marks each dimension as "confident" or "needs human review"
```

---

## RUBRIC ENGINEERING

The rubric is everything. Without a rubric, the evaluator drifts into vague praise.
A rubric with anchors forces specific, actionable feedback.

### Rubric structure

```yaml
# Template: .nisaba/quality/rubrics/{domain}.yaml

name: "Content Quality Rubric"
version: "1.0"
threshold: 7.0          # minimum weighted score to ship
exceptional: 9.0         # score at which no further iteration needed
max_iterations: 5        # hard cap on generator-evaluator cycles

sprint_gates:            # binary pass/fail — checked before scoring
  - name: "No banned words"
    check: "Output contains zero words from the banned list"
    on_fail: "REJECT — rewrite required"
  - name: "Specific numbers"
    check: "At least 3 sections contain specific, verifiable numbers"
    on_fail: "REJECT — add concrete data"
  - name: "Actionable CTA"
    check: "Final section contains a specific action the reader can take"
    on_fail: "REJECT — add real CTA"

dimensions:
  - name: "Relevance"
    weight: 0.25
    anchors:
      exceptional: "Directly addresses the target audience's current problem with evidence they recognize immediately. Reader thinks: 'this is exactly what I needed.'"
      acceptable: "Addresses the right topic but from a generic angle. Reader learns something but isn't compelled to act."
      reject: "Tangential to the actual problem. Reader bounces after first section."
    
  - name: "Depth of Insight"
    weight: 0.25
    anchors:
      exceptional: "Contains at least one insight not available in the first 5 Google results. Synthesizes across sources or adds original experience."
      acceptable: "Accurate information but nothing the reader couldn't find with a quick search."
      reject: "Surface-level rehashing of common knowledge. No original contribution."
    
  - name: "Actionability"
    weight: 0.20
    anchors:
      exceptional: "Reader can implement the core recommendation within 1 hour of finishing. Steps are specific, ordered, and tested."
      acceptable: "Reader knows what to do in general but would need additional research to implement."
      reject: "No clear next step. Ends with vague inspiration rather than specific action."
    
  - name: "Technical Accuracy"
    weight: 0.15
    anchors:
      exceptional: "All code samples run without modification. All API references are current. All numbers are sourced."
      acceptable: "Code samples are directionally correct but may need minor fixes. Numbers are plausible but unsourced."
      reject: "Code samples have errors. API references are outdated. Numbers are fabricated."
    
  - name: "Writing Quality"
    weight: 0.15
    anchors:
      exceptional: "Every sentence earns its place. No filler, no throat-clearing. Structure guides the reader naturally."
      acceptable: "Generally clear but some sections could be tighter. Minor structural issues."
      reject: "Bloated, meandering, or structurally confused. Reader loses the thread."
```

### Evaluator prompt template

```
You are the EVALUATOR in a GAN quality loop.
Your ONLY job is to evaluate output against a rubric.
You are not helpful. You are not encouraging. You are the gate.

## Rubric
{paste full rubric YAML here}

## Output to evaluate
{paste generator output here}

## Your task
1. Check every sprint gate. If ANY gate fails → REJECT immediately.
   List which gates failed and why. Stop here.

2. If all sprint gates pass, score each dimension:
   - Score (1–10)
   - One sentence: what worked
   - One sentence: what's wrong
   - One sentence: specific fix instruction

3. Calculate weighted total.

4. Verdict:
   - Score ≥ {exceptional}: SHIP AS-IS
   - Score ≥ {threshold}: SHIP
   - Score < {threshold}: ITERATE — provide your feedback to the generator

## Rules
- Never give a 10. A 10 means it couldn't be improved by anyone, anywhere.
- Never give generic feedback. Every critique must include a specific fix.
- Score the OUTPUT, not the effort. Intention doesn't matter. Only quality.
- Read the rubric anchors. Your score must match the anchor descriptions.
- Do not soften your feedback. Do not compliment before criticizing.
```

### Generator iteration prompt

```
Your previous output scored {score}/{threshold} on the quality rubric.

## Evaluator feedback:
{paste evaluator output}

## Your task:
Address EVERY piece of specific feedback. Do not skip any.
Do not explain why you agree or disagree. Just fix it.
Produce the complete revised output.
```

---

## RUBRIC LIBRARY

### 1. Technical Content Rubric (`technical-content.yaml`)
```yaml
threshold: 7.0
sprint_gates:
  - "All code samples must be syntactically valid"
  - "All API references must be current (check version numbers)"
  - "No claims without evidence or source"
dimensions:
  - { name: "Technical Accuracy", weight: 0.30 }
  - { name: "Depth", weight: 0.25 }
  - { name: "Actionability", weight: 0.25 }
  - { name: "Clarity", weight: 0.20 }
```

### 2. Client Communication Rubric (`client-communication.yaml`)
```yaml
threshold: 8.0   # higher bar for client-facing work
sprint_gates:
  - "Opens with client's stated goal, not our capabilities"
  - "All deliverables and timelines are specific"
  - "No jargon the client hasn't used first"
dimensions:
  - { name: "Client Goal Alignment", weight: 0.30 }
  - { name: "Clarity & Specificity", weight: 0.25 }
  - { name: "Professionalism", weight: 0.20 }
  - { name: "Actionable Next Steps", weight: 0.25 }
```

### 3. Code Quality Rubric (`code-quality.yaml`)
```yaml
threshold: 7.5
sprint_gates:
  - "TypeScript strict mode passes"
  - "No console.log in production code"
  - "No TODO without linked issue"
  - "All public functions have JSDoc"
dimensions:
  - { name: "Correctness", weight: 0.30 }
  - { name: "Readability", weight: 0.25 }
  - { name: "Error Handling", weight: 0.20 }
  - { name: "Performance", weight: 0.15 }
  - { name: "Test Coverage", weight: 0.10 }
```

### 4. Cinematography Rubric (`cinematography.yaml`)
```yaml
threshold: 7.0
sprint_gates:
  - "Delivery format matches client spec (codec, resolution, color space)"
  - "Audio levels within broadcast standard (−24 LUFS ±2)"
  - "No visible artifacts, dropped frames, or sync issues"
dimensions:
  - { name: "Color Accuracy", weight: 0.30 }
  - { name: "Contrast & Exposure", weight: 0.20 }
  - { name: "Skin Tone Rendering", weight: 0.25 }
  - { name: "Mood Match to Brief", weight: 0.15 }
  - { name: "Technical Compliance", weight: 0.10 }
```

### 5. Security Audit Rubric (`security-audit.yaml`)
```yaml
threshold: 8.5   # highest bar — security must be thorough
sprint_gates:
  - "All findings have proof-of-concept or documented attempt"
  - "Severity ratings follow CVSS scoring"
  - "Remediation steps are specific to the codebase, not generic"
dimensions:
  - { name: "Coverage", weight: 0.25 }
  - { name: "Finding Accuracy", weight: 0.30 }
  - { name: "Remediation Quality", weight: 0.25 }
  - { name: "Risk Prioritization", weight: 0.20 }
```

---

## GAN LOOP COST OPTIMIZATION

```
Cost control levers:

1. Use Haiku for evaluator when precision isn't critical
   Generator: Sonnet ($3/M input, $15/M output)
   Evaluator: Haiku ($0.25/M input, $1.25/M output)
   Savings: ~70% on evaluator costs

2. Cache the rubric
   If the same rubric is used across loops, prompt-cache it
   Savings: 90% on rubric input tokens after first use

3. Set aggressive iteration caps
   Blog posts: max 3 iterations (cost ceiling: ~$3)
   Code: max 5 iterations (cost ceiling: ~$5)
   Client communication: max 2 iterations + human review (cost ceiling: ~$2 + human time)

4. Early exit on exceptional score
   If score ≥ 9.0 on first pass: ship immediately, don't waste an iteration "just to check"

5. Progressive rubric (NISABA original)
   First pass: check sprint gates only (cheapest — Haiku)
   If gates pass: run full weighted evaluation (Sonnet)
   If gates fail: reject immediately without scoring (saves full evaluation cost)
```

---

## INTEGRATION WITH OTHER HOUSES

```
HOUSE 1 (Deployment) → GAN Loop is Gate 6 in the swarm gate stack
HOUSE 2 (Evolution) → GAN scores feed dream worker signal
HOUSE 3 (Distribution) → Writer and Carousel use GAN self-evaluation
HOUSE 5 (Defense) → Security audit uses highest-threshold rubric
HOUSE 7 (Canon) → Every GAN loop run logged to quality-log.md
```

---

**Status**: ACTIVE
**House**: 04 — Quality
**Last updated**: 2026-04-19
