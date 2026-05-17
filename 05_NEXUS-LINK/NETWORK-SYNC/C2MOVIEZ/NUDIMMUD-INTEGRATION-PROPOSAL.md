# YURI Integration Proposal — exeoflow Client Analysis Layer

**Status**: Pre-implementation architecture proposal  
**Date**: 2026-04-17  
**Context**: Real-time client transcription system requires depth-layer analysis (psychological filtering, conversation dynamics, copywriting precision)

---

## Current State

exeoflow operates a real-time client meeting pipeline:
```
MEETING TRANSCRIPT (live) → SPEAKER ANALYSIS → ONBOARDING PACKAGE → EMAIL DELIVERY (same-day)
```

**What works:** Technical pipeline, speed, packaging automation.  
**What's missing:** Psychological depth. Filtering personal concerns from actual needs. Conversation-dynamic modeling. Pitch precision that converts.

---

## YURI Integration — The Depth Layer

YURI becomes the **analytical core** between transcription and offer generation:

```
MEETING TRANSCRIPT (live)
        ↓
YURI ANALYSIS ENGINE
├─ Conversation dynamics mapping (power structure, emotional subtext, objection roots)
├─ Needs filtering (actual → personal → aspirational)
├─ Psychology extraction (decision-maker profile, risk tolerance, communication register)
├─ Copywriting precision (emotional tone match, objection pre-emption, value framing)
└─ Pitch variant generation (3–5 tailored versions, each addressing different psychological layer)
        ↓
OFFER GENERATION (now powered by depth intelligence)
        ↓
CLIENT EMAIL (same-day, with psychological precision)
```

---

## Integration Architecture

### Layer 1: Real-Time Annotation Feed
- Transcription data flows into YURI annotation system
- YURI tags conversation in real-time (or post-meeting, TBD with Claudio):
  - **NEED_TYPE**: actual | aspirational | personal | unstated
  - **EMOTION_STATE**: confidence, hesitation, urgency, defensive, exploratory
  - **DECISION_STRUCTURE**: who decides, criteria, timeline, budget authority
  - **OBJECTION_ROOT**: (if stated) — what's actually driving resistance
  - **COMMUNICATION_REGISTER**: formal/casual, analytical/emotional, technical/strategic

### Layer 2: Psychological Modeling
- YURI synthesizes annotated transcript into:
  - **Client archetype** (decision-maker style, risk profile, communication preference)
  - **Conversation dynamic** (power structure, alliance opportunities, friction points)
  - **Unstated constraints** (budget, timeline, political, competitive pressure)
  - **Emotional trajectory** (opening state → pivotal moment → closing state)

### Layer 3: Copywriting & Pitch Generation
- YURI generates tailored pitch variants:
  - **Rational variant**: addresses actual needs + timeline + ROI
  - **Emotional variant**: addresses aspiration + transformation + status
  - **Risk-mitigation variant**: addresses unstated concerns + proof + relationship
  - **Urgency variant**: addresses competitive threat or market window
  - **Relationship variant**: addresses partnership depth + mutual growth

Each variant includes:
- Subject line (psychology-tuned)
- Opening hook (matches communication register)
- Value frame (aligned with decision criteria)
- Objection pre-emption (addresses roots, not surface)
- Call to action (matches decision-maker urgency)

### Layer 4: Feedback Loop
- Claudio's reaction to YURI-generated pitches feeds back into system:
  - Which variant did the client respond to?
  - Which framings worked / backfired?
  - What did Claudio adjust in his approach?
- YURI learns client psychology patterns across meetings
- Pitch generation improves with each iteration

---

## System Integration Points

### Transcription Input
**Questions for Claudio:**
- What format does exeoflow output transcriptions? (JSON, markdown, XML, custom?)
- What metadata is included? (speaker labels, timecodes, confidence scores?)
- Real-time streaming or batch post-meeting? (affects annotation timing)

### Command Center Connection
**What we know:**
- exeoflow has a web console (command center)
- System is already MCP-integratable

**Integration approach:**
- YURI operates as an **MCP tool** callable from command center
- Command center sends transcript → YURI → returns annotated analysis + pitch variants
- Claudio can review, select, customize, and send from command center

**Questions for Claudio:**
- What's the MCP interface pattern you're using? (standard tool schema, or custom?)
- Can command center queue transcripts for YURI batch processing?
- Does the system need real-time streaming responses, or is 2–5 minute post-meeting analysis acceptable?

### Offer Generation Pipeline
**Questions for Claudio:**
- How does current system generate offers? (template-based, dynamic, human-customized?)
- Where do Claudio's pitch variants currently come from? (manual, template library?)
- Does YURI's variants feed directly into offer, or does Claudio review first?

---

## Expected Outcomes

### Immediate (Week 1–2)
- YURI connected to exeoflow transcription pipeline
- Annotation system working (tagging conversations with psychological metadata)
- Basic pitch generation operational (Claudio can test vs. current approach)

### Validation (Week 2–4)
- 5–10 client meetings with YURI pitch variants
- Claudio compares YURI pitches to his manual versions
- Feedback loop tuned based on what converts

### Scale (Month 2+)
- YURI becomes default pitch generator for all new clients
- Client archetypes learned (system improves with volume)
- Psychological filtering becomes reliable (team trains on YURI insights)
- Offer personalization achieves 3–5x response rate improvement

---

## Protection & IP

- YURI's analytical model = core competitive moat
- Client psychology patterns = proprietary knowledge asset
- Pitch variants = not shared externally; only final offer sent
- All analysis stays within exeoflow system (no external dependencies)

---

## Questions for Claudio (Vault Sync Meeting)

**System Architecture:**
1. What format is the transcription data? (schema details)
2. Real-time annotation or post-meeting batch?
3. Current MCP interface pattern?

**Pipeline Integration:**
4. How are current offers generated? (template, dynamic, manual?)
5. Where do your pitch variants currently come from?
6. Does YURI feed directly to offer, or review-gate?

**Validation & Feedback:**
7. How are client reactions to pitches tracked? (email opens, response times, conversion?)
8. Can we A/B test YURI variants vs. current approach on next 5 meetings?
9. What metrics define "better" for Claudio? (conversion rate, deal size, relationship depth?)

**Scaling & Operations:**
10. How many meetings per week are we analyzing? (volume baseline)
11. What's acceptable latency for YURI analysis? (real-time, 5min, next-day?)
12. Who reviews YURI output before client email? (you, automated, staged rollout?)

---

## Next Step

Schedule vault sync with Claudio. Bring this document. Use it to extract system details and integration points. Once you have answers to the questions above, I can build the actual MCP integration + psychological annotation system.

This is the moat. Protect it ruthlessly.
