# BLUEPRINT 2: Claude Opus 4.7
*Architecture, capabilities, and integration*

**House:** Blueprints  
**Esoteric:** Mercury/Hod  
**Cost:** $1.00–5.00 per task  
**Timeline:** Variable (5min–1hour per execution)

---

## I. CORE INSIGHT

Opus 4.7 offers meaningful improvement in coherence, cross-domain reasoning, and reliability—especially in expensive-to-fail agentic loops.

---

## II. ENRICHMENT: BEHAVIORAL DIFFERENCES FROM OPUS 4.6

### A. Self-Verification Instinct
- Pauses before acting; asks clarifying questions
- Flags uncertainty explicitly
- Won't claim expertise in unknown domains
- Result: Fewer confident-but-wrong answers

### B. Coherence in Loops
- Maintains logical thread through 7–12 turn agentic workflows
- Degrades gracefully after turn 15 (context rot)
- Signal: output becomes generic, verbose, or repetitive beyond 15 turns → new session needed

### C. Cross-Domain Strength
- Seamlessly switches between cyber, legal, enterprise, creative, scientific contexts
- Holds multiple frameworks simultaneously (esoteric + technical + business)
- Result: Better synthesis work

### D. Conservative Claiming
- Less prone to hallucinating confidence in novel domains
- More likely to admit limits
- Asks for clarification rather than guessing

---

## III. TOKEN BUDGET & COST MODELING

| Task Class | Token Range | Cost | Example |
|------------|------------|------|---------|
| Concept explanation | 800–2000 | $0.20–0.40 | "Explain the Sefirot" |
| Single-file code review | 3000–6000 | $0.60–1.20 | "Review this 200-line module" |
| Security audit (full codebase) | 50k–150k | $10–30 | "Find vulnerabilities in production code" |
| Multi-document synthesis | 100k–250k | $20–50 | "Read 10 research papers; synthesize framework" |

**Effort parameter costs:**
- `high`: $0.40–0.80 per task
- `xhigh`: $1.00–3.00 per task (default)
- `max`: $5.00–15.00+ per task

---

## IV. CREATIVE DOMAIN INTEGRATION

**Multimodal (2576px resolution):**
- Dashboard interpretation (dense metrics, layout analysis)
- Visual direction critique (composition, color, subject positioning)
- Storyboard analysis (narrative flow, visual continuity)
- Design system review (consistency, accessibility, intent)

**Cost:** 2576px = 3.5x tokens vs 768px
- Use full resolution for color/detail-critical work
- Downsample to 1024px for screenshots (detail preserved, cost optimized)
- Use 1280px for wireframes (sufficient for feedback)

---

## V. SAMPLING & PARAMETERS

**Best practice:** Remove non-defaults. Model defaults are superior.

| Parameter | Default | Override? | When? |
|-----------|---------|-----------|-------|
| temperature | 1.0 | Only for creative variation | Design direction exploration |
| top_p | (omitted) | Only for edge case exploration | Testing model boundaries |
| top_k | (omitted) | No | Leave alone |
| max_tokens | Set upfront | Yes | Enforce ceiling to control cost |

---

## VI. AGENTIC LOOP RESILIENCE

```
Turn 1-5:  Focused, high signal
Turn 5-10: Attention spreads; some drift
Turn 10-15: Stale details compete with current task
Turn 15+:  Contextual amnesia begins

Action:
  Turns 1-7: Continue if productive
  Turns 7-12: /rewind if wrong path; /compact if bloated
  Turns 12+: /clear and new session
```

---

## VII. FAILURE MODES (OPUS-SPECIFIC)

| Failure | Signal | Fix |
|---------|--------|-----|
| Code hallucination | Untested code generation | Add test gate (tests must pass) |
| Analysis overconfidence | Claims certainty in novel domain | Use validation (external review, fact-checking) |
| Context collapse | Output becomes generic | /rewind or new session |
| Instruction inflation | Task grows with each turn | /rewind to original scope |

---

## VIII. CYBER SAFEGUARDS OPACITY

**Known blocks:**
- Active exploit code (CVE exploitation)
- Credential stuffing tutorials
- Zero-day deployment guides

**Gray zone (context-dependent):**
- Vulnerability research (allowed)
- Penetration testing (with consent + scope)
- Security tool usage (allowed)

**Workaround:** Frame requests as defense (bug bounty, hardening).

---

## IX. DEPLOYMENT PROTOCOL

```
Step 1: Comprehensive brief (upfront, not iterative)
  └─ Include: files to review, constraints, success metrics
  
Step 2: Invoke with effort level + token ceiling
  └─ max_tokens: Set this always
  
Step 3: Let Opus work (deliberation is the feature)
  └─ Avoid steering until turn 5+
  
Step 4: Validate output (tests, review, etc.)
  └─ Gates are mandatory
  
Step 5: Ship or /rewind if wrong path
```

---

## X. REAL-WORLD EXAMPLES (MARCEL)

**Example 1: Security Audit (Nexus Link Website)**
- Scope: Full site code review for vulnerabilities
- Invocation: "Read these files. What are the security risks?"
- Cost: $15–30
- Timeline: 20 minutes
- Validation: Run security scans to verify findings

**Example 2: Color Science Consultation**
- Scope: Should we use DaVinci Resolve or Premiere Pro color?
- Invocation: "Explain the difference. What's the trade-off for commercial work?"
- Cost: $1–2
- Timeline: 5 minutes

**Example 3: Business Strategy (C2MovieZ Partnership)**
- Scope: How should we structure pricing for new service offering?
- Invocation: "Analyze market, competitors, margins. What's our positioning?"
- Cost: $3–5
- Timeline: 15 minutes

---

**Status**: ACTIVE  
**House**: Blueprints  
**Last updated**: 2026-04-18
