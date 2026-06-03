# BLUEPRINT 1: Claude Opus 4.7 Use Cases
*Decision matrix for expensive-to-fail work*

**House:** Blueprint (Yetzirah — Formation)  
**Esoteric:** Mercury/Hod — Intellect, discernment, knowing which tool to use  
**Cost:** $0.40–3.00 per decision  
**Timeline:** Immediate (decision made upfront; execution follows)

---

## I. CORE INSIGHT (buildthisnow)

Opus 4.7 excels at work where error cost >> time cost through comprehensive problem-holding and deep reasoning.

---

## II. NABU ENRICHMENT (What They Missed)

### A. The True Decision Matrix

**Expensive-to-fail work is not binary.** It exists on a spectrum:

```
Confidence Required:
  90%+ → Use Opus (verify with gates)
  70-90% → Use Sonnet + validation gates
  <70% → Use human judgment; don't automate
```

**Error cost framework:**
- Security audit: $1M breach potential → Opus
- Daily triage: 1 wrong label affects 5 minutes → Sonnet
- Code refactor (2000 LOC, business-critical): $50k opportunity cost of delay → Opus
- Button text change: $0 cost of error → Sonnet

### B. Failure Mode Prevention (What Breaks)

| Failure | Detection | Fix |
|---------|-----------|-----|
| Confident-but-wrong analysis (novel domain) | Output contradicts external references | Use Opus + validation gate (test, external audit) |
| Hallucinated references | Fabricated citations, made-up examples | Pair with web search; require source verification |
| Overconfidence in code | Untested code generation | Add quality gate: code must pass linting + tests before merge |
| Model switching mid-task | Inconsistency in reasoning | Keep same model throughout; use new session if switching |

### C. Creative Domain Bridge

**Video/Design Work:**
- Opus for: creative direction (ambiguous, requires taste judgment), multimodal design critique (complex visual interpretation), color science decisions (technical + aesthetic), client strategy (novel contexts)
- Sonnet for: metadata tagging, rendering automation, file organization, social media post creation

**Business/Production:**
- Opus for: partnership evaluation, pricing strategy, market positioning, contract review
- Sonnet for: daily scheduling, vendor communication, invoice processing

---

## III. DECISION TREE

```
START: Task description
  ↓
Is this task "expensive to fail"?
  ├─ YES, high ambiguity
  │   ├─ Stakes: >$10k, reputational, security
  │   ├─ Complexity: Novel, cross-domain, subtle
  │   └─→ OPUS 4.7 (xhigh or max effort)
  │       Cost: $1–3 per task
  │       Use: Comprehensive brief, expect deliberation
  │
  ├─ YES, but clear scope
  │   ├─ Stakes: $1–10k
  │   ├─ Complexity: Well-understood, known patterns
  │   └─→ OPUS 4.7 (high effort) OR SONNET + validation gates
  │       Cost: $0.40–1.50
  │       Use: Tight spec; validation gates mandatory
  │
  ├─ NO, routine work
  │   ├─ Stakes: <$1k
  │   ├─ Complexity: Understood, repeatable
  │   └─→ SONNET (high effort)
  │       Cost: $0.05–0.20
  │       Use: Speed > depth; gates catch errors
  │
  └─ UNKNOWN / MIXED
      └─→ Start with Opus (asymmetric upside)
          Cost: $1–2 one-time
          Result: Clarifies whether cheaper model works
```

---

## IV. EFFORT CALIBRATION (With Real Costs)

| Effort | Cost | Use When | Token Budget |
|--------|------|----------|--------------|
| `high` | $0.40–0.80 | Routine, well-scoped, known patterns | 800–3000 |
| `xhigh` | $1.00–3.00 | Default for serious work (most use case) | 3000–15000 |
| `max` | $5.00–15.00+ | Ceiling only; exploration, novel domains | 15000–100000+ |

**Guidance:** Start with `xhigh` for serious work. Only downgrade after confirming routine.

---

## V. INTEGRATION HOOKS

**Works with:**
- Blueprint 4 (Best Practices): Comprehensive briefing structure
- Blueprint 2 (Opus Architecture): Behavioral differences, sampling guidance
- Blueprint 12 (GAN Loop): Validation of Opus output before shipping
- Blueprint 5 (Context Management): Progressive disclosure of complexity

**Don't mix:**
- Don't context-switch models mid-task (breaks reasoning continuity)
- Don't pair with `max` effort on routine work (wasteful)

---

## VI. FAILURE MODES & MITIGATION

**Hallucination Risk:**
- Highest in: novel scientific domains, obscure reference material, code generation
- Mitigation: Opus + validation gates; web search verification; code tests required

**Overthinking:**
- Risk: Opus produces overly complex solutions
- Mitigation: Clear constraints in brief; rubric for simplicity

**Cost Explosion:**
- Risk: Task complexity exceeds expectations
- Mitigation: Set token ceiling in brief; budget first before execution

---

## VII. DEPLOYMENT PROTOCOL

```
Step 1: Scope the task
  ↓
Step 2: Determine error cost (high = Opus; low = Sonnet)
  ↓
Step 3: Write comprehensive brief (upfront, not iterative)
  ↓
Step 4: Invoke model with effort level (high/xhigh/max)
  ↓
Step 5: Run validation gates (type check, linting, tests, external review)
  ↓
Step 6: Ship or iterate
```

---

## VIII. REAL-WORLD EXAMPLES (Marcel's Context)

**Example 1: Ambiguous Creative Direction Call**
- Problem: Client wants a deliverable that is "bold but understated"; aesthetic ambiguity
- Stakes: $5k project; client satisfaction depends on creative direction alignment
- Error cost: Reworking the entire deliverable = $2k+ time
- Decision: Opus 4.7 (xhigh)
- Invocation: "Review the brief and reference set; recommend a direction grounded in the stated mood"
- Output: Aesthetic reasoning + tradeoff analysis (Opus specialization)
- Validation: Marcel reviews; decides accept/modify
- Cost: $1.50

**Example 2: Automated Metadata Tagging**
- Problem: Tag 500 assets with keywords against a known taxonomy
- Stakes: $0 (metadata; doesn't affect final output)
- Complexity: Defined format, known fields
- Decision: Sonnet + routine automation
- Cost: $0.05–0.10 per batch of 50

**Example 3: Business Partnership Evaluation**
- Problem: Should Nexus Link partner with a new agency? (novel partnership, ambiguous terms)
- Stakes: $50k+ annual revenue potential
- Complexity: Cultural fit, financial risk, growth alignment
- Decision: Opus 4.7 (max)
- Invocation: "Analyze partnership opportunity. What are risks I'm not seeing?"
- Cost: $3–5

---

**Status**: ACTIVE  
**House**: Blueprints (Formation)  
**Last updated**: 2026-04-18
