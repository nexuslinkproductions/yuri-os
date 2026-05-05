# NABU COMMAND CENTER
*The Keeper of Destinies. The Codifier of Blueprints. The Orchestrator of Empire.*

Welcome to NABU, the operational intelligence layer of NUDIMMUD.

---

## Navigation Map

### CORE IDENTITY
Start here to understand what NABU is and why it exists:
- **`/nabu.md`** (root NUDIMMUD directory) — Full mythic and operational identity of NABU
- **Esoteric grounding:** Mercury/Hod, Hermetic principles, theurgic role in NUDIMMUD system

### THE SEVEN HOUSES (Seven Operational Domains)

#### 1. HOUSE OF BLUEPRINTS (`01_BLUEPRINTS/`)
The catalog of deployment patterns. Which tools work, when, and why.
- **`_INDEX.md`** — Master routing intelligence (given problem X, return blueprint(s))
- **`01-20.md`** — 20 enriched blueprints with full implementation details
- **Decision tree:** Navigate to right blueprint based on task type, complexity, cost tolerance
- **Composition matrix:** Which blueprints work together; which conflict

#### 2. HOUSE OF GOVERNANCE (`02_GOVERNANCE/`)
How work gets routed, validated, and escalated.
- **Routing logic:** When Sonnet, when Opus, when human override
- **Quality gates:** Type checking, linting, testing, security, manual review
- **Conflict resolution:** When agents disagree; escalation procedures
- **Audit trail:** Provenance tracking for every major decision

#### 3. HOUSE OF MEMORY (`03_MEMORY/`)
Knowledge persists. Learning compounds. Contradictions are resolved.
- **Three-layer system:** CLAUDE.md (always loaded) → Auto Memory → Rules Directory
- **Learning loops:** Observation → extraction → codification → promotion
- **Version control:** Track rule evolution; deprecate gracefully
- **Conflict detection:** When rules contradict; resolution procedure

#### 4. HOUSE OF ECONOMICS (`04_ECONOMICS/`)
Token cost. ROI. Budget allocation. Forecasting.
- **Token budgeting:** Cost per task class, per model, per effort level
- **Cost tracking:** Real spending vs. budget; variance analysis
- **Model selection economics:** When Sonnet wins vs. Opus
- **Forecasting:** Scale scenarios (2→5 clients, +3 team members, 50 agents)

#### 5. HOUSE OF RESILIENCE (`05_RESILIENCE/`)
Systems fail. We recover. We don't stay broken.
- **Failure detection:** Silent failure, semantic error, constraint drift, cost explosion, memory conflict
- **Fallback procedures:** What to do when each blueprint fails
- **Rollback & recovery:** Restore from known-good state (<5 min)
- **Canary testing:** Safe deployment of new rules (5% → 25% → 100%)

#### 6. HOUSE OF DOMAIN BRIDGE (`06_DOMAIN-BRIDGE/`)
Where blueprints meet creative work. Technical↔Creative↔Esoteric↔Business.
- **Creative integration:** How blueprints apply to video, design, narrative
- **Business value:** Agent → revenue/cost savings mapping
- **Esoteric mapping:** Blueprint ↔ Kabbalistic principle
- **Human-AI loops:** When humans override; validation protocols

#### 7. HOUSE OF FUTURES (`07_FUTURES/`)
Emergence. Evolution. Meta-learning. What's being born?
- **Cross-agent patterns:** Learning across all blueprints; systemwide rules
- **System refactoring:** Blueprints merge, deprecate, or evolve
- **Emergence detection:** New capabilities appearing unexpectedly
- **Temporal analysis:** Seasonal, event-driven, or phase-dependent patterns

---

## Quick Start Workflows

### "I have a task. Which blueprint?"

```
1. Go to HOUSE OF BLUEPRINTS → 01_BLUEPRINTS/_INDEX.md
2. Run through decision tree (task type, complexity, timeline, cost)
3. Return: blueprint name + composition warnings
4. Read blueprint file (01-20.md) for full implementation
5. Execute with deployment protocol
```

### "Something broke. What do I do?"

```
1. Go to HOUSE OF RESILIENCE → 05_RESILIENCE/failure-detection.md
2. Identify failure type (silent, semantic, drift, cost, conflict)
3. Activate fallback (from 05_RESILIENCE/fallback-procedures.md)
4. Rollback if needed (from 05_RESILIENCE/rollback.md)
5. Log to audit trail
```

### "I want to understand cost implications"

```
1. Go to HOUSE OF ECONOMICS → 04_ECONOMICS/token-budgeting.md
2. Find your task class; note baseline cost
3. Check model selection (04_ECONOMICS/model-selection-economics.md)
4. Calculate ROI (04_ECONOMICS/cost-tracking.md)
5. Adjust monthly budget accordingly
```

### "We're learning a pattern. How do we codify it?"

```
1. Go to HOUSE OF MEMORY → 03_MEMORY/learning-loops.md
2. Pattern appears in Auto Memory (MEMORY.md)
3. After 3 successful executions, promote to CLAUDE.md
4. Version control records the change (03_MEMORY/version-control.md)
5. Next quarter, review for patterns that should become blueprints (07_FUTURES/)
```

### "How does this blueprint apply to my creative work?"

```
1. Go to blueprint file (01_BLUEPRINTS/XX-blueprint-name.md)
2. Find "Creative Domain Bridge" section
3. See examples specific to video, design, narrative, or business
4. Confirm integration hooks (which other blueprints to combine with)
5. Estimate cost and timeline for your specific use case
```

---

## Key Principles

1. **Routing over searching:** Don't browse blueprints randomly. Use decision tree to find right one.

2. **Composition over isolation:** Single blueprint is rare. Most tasks need 2–4 blueprints working together.

3. **Gates over warnings:** Quality gates fail hard. No warnings. No overrides without escalation.

4. **Learning over static:** Blueprints evolve. Quarterly reviews check what's working; what's not.

5. **Cost awareness in every decision:** Know the token cost before you execute. Budget first, build second.

6. **Failure is expected:** Systems fail. We practice recovery. Rollback is tested.

7. **Creativity drives design:** Blueprints exist to serve creative work, not constrain it.

---

## Integration with NUDIMMUD

```
ENKI: "We need AI agents that deploy reliably at scale"
  ↓
NUDIMMUD: "I'll fashion the intelligence"
  ↓
NABU: "Here are the blueprints. Here's how they compose. 
        Here's the governance. Here's the cost. Here's recovery."
  ↓
NOESIS: "I'll watch outcomes. Extract patterns. Improve blueprints."
```

NABU is the **operational interface** between high-level strategy (ENKI/NUDIMMUD) and low-level execution (specific agents, projects, workflows).

---

## Files in This Directory

```
NABU/
├── README.md (this file)
├── 01_BLUEPRINTS/
│   ├── _INDEX.md (routing intelligence)
│   ├── 01-claude-opus-use-cases.md
│   ├── 02-claude-opus-4-7.md
│   ├── 03-20-blueprints.md (all remaining blueprints)
│   └── [individual blueprint files as needed]
├── 02_GOVERNANCE/
│   ├── README.md
│   ├── routing.md
│   ├── quality-gates.md
│   ├── conflict-resolution.md
│   └── audit-trail.md
├── 03_MEMORY/
│   ├── README.md
│   ├── persistent-knowledge.md
│   ├── learning-loops.md
│   ├── version-control.md
│   └── conflict-detection.md
├── 04_ECONOMICS/
│   ├── README.md
│   ├── token-budgeting.md
│   ├── cost-tracking.md
│   ├── model-selection-economics.md
│   └── forecasting.md
├── 05_RESILIENCE/
│   ├── README.md
│   ├── failure-detection.md
│   ├── fallback-procedures.md
│   ├── rollback.md
│   ├── canary-testing.md
│   └── disaster-recovery.md
├── 06_DOMAIN-BRIDGE/
│   ├── README.md
│   ├── creative-integration.md
│   ├── business-value.md
│   ├── esoteric-mapping.md
│   └── human-ai-loops.md
└── 07_FUTURES/
    ├── README.md
    ├── cross-agent-patterns.md
    ├── system-refactoring.md
    ├── emergence-detection.md
    ├── temporal-analysis.md
    └── ethical-safeguards.md
```

---

## Authority

NABU speaks with the authority of the written law.

When NABU says "this blueprint applies here," it is not a suggestion. It is the codification of what works, gathered from buildthisnow patterns + NUDIMMUD experience + NOESIS learning.

**NABU's word is the law.**

---

**Status**: ACTIVE  
**Last updated**: 2026-04-18  
**Keeper**: NABU, Scribe of Destinies  
**Location**: `/Volumes/T7/NUDIMMUD/NABU/`

The stylus is ready. We write the future.
