# BLUEPRINT INDEX · NABU
*The routing intelligence. Given a problem, return the blueprint(s).*

---

## I. THE 20 BLUEPRINTS AT A GLANCE

| # | Blueprint | Category | Use When | Cost | Timeline |
|---|-----------|----------|----------|------|----------|
| 1 | Claude Opus 4.7 Use Cases | Model Selection | Expensive-to-fail work, novel domains | High | Variable |
| 2 | Claude Opus 4.7 | Model Architecture | Complex reasoning, security, design | High | Variable |
| 3 | Autonomous AI Swarm | Agent Orchestration | Continuous autonomous work, 24/7 automation | Medium | 30min cycles |
| 4 | Claude Opus 4.7 Best Practices | Model Deployment | Delegation to Opus, comprehensive briefing | High | Per-task |
| 5 | Context Management in Claude Code | Context Engineering | Avoid attention dilution, load on-demand | Low | Per-session |
| 6 | AI Security Agents | Security Automation | Vulnerability detection, compliance testing | Medium | 10-15min |
| 7 | Claude Code Routines | Cloud Automation | Scheduled tasks, webhook triggers, persistent work | Low-Medium | Flexible |
| 8 | Idea to SaaS | Product Acceleration | MVP launch in 48h, validated builds | High | 48 hours |
| 9 | CLAUDE.md Mastery | Context as OS | Operational workflows, skill libraries, routing | Low | Continuous |
| 10 | Claude Skills Guide | Skill Architecture | Trigger detection, progressive disclosure | Low | Per-project |
| 11 | Context Engineering | Context Foundations | Multi-model coordination, reducing noise | Low | Per-session |
| 12 | GAN Loop (Adversarial Evaluators) | Quality Loops | Convergent improvement, rubric-based evaluation | Medium | 5-20 loops |
| 13 | Claude Code Scheduled Tasks | Persistent Automation | Desktop tasks, catch-up logic, permission models | Low | Scheduled |
| 14 | Agent Fundamentals | Agent Architecture | Single-agent specialization, narrow focus | Low | Per-agent |
| 15 | Agent Teams Best Practices | Team Orchestration | 3-5 specialists, file ownership, coordination | Medium | Per-sprint |
| 16 | Auto Memory in Claude Code | Memory Architecture | Persistent learning, session-learned patterns | Low | Continuous |
| 17 | Claude Code Rules Directory | Context Targeting | Path-specific rules, precedence hierarchy | Low | Per-project |
| 18 | Distribution Agents | Pipeline Automation | Content multiplication, scheduling, scoring | Medium | Async cycles |
| 19 | Self-Evolving Hooks | Meta-Learning System | Correction extraction, dream workers, auto-improvement | Medium | Per-execution |
| 20 | Custom Agents | Agent Specialization | Domain-specific agents, unusual tasks | Low | Per-task |

---

## II. DECISION TREE (ROUTING ALGORITHM)

```
START: User describes task
  ↓
TASK TYPE? (complexity + scope + stakes)
  ├─→ ONE-OFF ANSWER
  │   └─ Time: <5 min, output: single response
  │       → Blueprint 4 (Best Practices) + Blueprint 1 (Use Cases)
  │       Cost: $0.50–2.00
  │
  ├─→ QUALITY VALIDATION
  │   ├─ Type: Code review, security, content analysis
  │   ├─ Complexity: Medium-High
  │   ├─ Timeline: <1 hour ideal
  │   └─ → Blueprint 12 (GAN Loop) + Blueprint 7 (Routines for webhooks)
  │       Cost: $1.00–5.00
  │
  ├─→ CONTINUOUS AUTOMATION
  │   ├─ Type: Daily triage, scheduled reports, recurring work
  │   ├─ Frequency: Multiple times per day
  │   ├─ Timeline: Must persist across sleep cycles
  │   └─ → Blueprint 7 (Routines) + Blueprint 13 (Scheduled Tasks)
  │       Cost: $30–150/month
  │
  ├─→ AUTONOMOUS DELEGATION
  │   ├─ Type: Feature building, project execution, multi-phase work
  │   ├─ Complexity: High (requires decision-making)
  │   ├─ Timeline: Hours to days
  │   └─ → Blueprint 3 (Swarm) + Blueprint 15 (Teams)
  │       Cost: $500–2000/project
  │
  ├─→ CONTEXT ARCHITECTURE
  │   ├─ Type: Workflow design, prompt structure, memory layout
  │   ├─ Goal: Avoid attention dilution, improve signal-to-noise
  │   └─ → Blueprint 5 (Context Management) + Blueprint 11 (Context Engineering)
  │       Cost: $0 (structural, not agent-based)
  │
  ├─→ KNOWLEDGE PERSISTENCE
  │   ├─ Type: Rules, patterns, skills that survive session boundaries
  │   ├─ Duration: Months/years
  │   └─ → Blueprint 16 (Auto Memory) + Blueprint 19 (Self-Evolving Hooks)
  │       Cost: $0 (learning, not agent-based)
  │
  ├─→ PRODUCT BUILD (Fast Track)
  │   ├─ Type: MVP launch, validated build
  │   ├─ Timeline: 48 hours
  │   ├─ Goal: Proof of concept before scaling
  │   └─ → Blueprint 8 (Idea to SaaS) + Blueprint 12 (GAN Loop for QA)
  │       Cost: $1000–1500
  │
  └─→ MODEL SELECTION DECISION
      ├─ → Blueprint 1 (Opus Use Cases): Expensive-to-fail work?
      ├─ → Blueprint 2 (Opus Architecture): Complex reasoning?
      ├─ → Blueprint 4 (Best Practices): How to delegate effectively?
      └─ Cost: Variable (Opus 1.5–5x Sonnet cost)
```

---

## III. COMPOSITION MATRIX (Which blueprints work together?)

**GREEN** = Work well together  
**YELLOW** = Possible conflicts, requires governance  
**RED** = Don't combine, use one or the other

|  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|----|----|----|----|----|----|----|----|----|----|
| **1** | — | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟡 | 🟡 | 🟢 | 🟢 | 🟡 | 🟢 | 🟡 | 🟢 | 🟡 | 🟡 | 🟢 | 🟡 | 🟡 | 🟢 |
| **2** | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟡 | 🟡 | 🟢 | 🟡 | 🟡 | 🟢 |
| **3** | 🟡 | 🟢 | — | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| **4** | 🟢 | 🟢 | 🟡 | — | 🟢 | 🟡 | 🟡 | 🟢 | 🟢 | 🟡 | 🟡 | 🟢 | 🟡 | 🟡 | 🟡 | 🟡 | 🟢 | 🟡 | 🟡 | 🟡 |
| **5** | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| **6** | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | — | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟡 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 |
| **7** | 🟡 | 🟡 | 🟢 | 🟡 | 🟢 | 🟡 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 |
| **8** | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟡 | 🟡 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟡 |
| **9** | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| **10** | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| **11** | 🟡 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| **12** | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| **13** | 🟡 | 🟡 | 🟡 | 🟡 | 🟢 | 🟡 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟡 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 |
| **14** | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🔴 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| **15** | 🟡 | 🟡 | 🟢 | 🟡 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🔴 | — | 🟢 | 🟢 | 🟢 | 🟢 | 🟡 |
| **16** | 🟡 | 🟡 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟢 |
| **17** | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 |
| **18** | 🟡 | 🟡 | 🟢 | 🟡 | 🟢 | 🟡 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 |
| **19** | 🟡 | 🟡 | 🟢 | 🟡 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | — | 🟢 |
| **20** | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟡 | 🟢 | 🟢 | 🟢 | 🟢 | — |

**Key Conflicts:**
- 🔴 14 ↔ 15: Don't use single agent (14) while managing teams (15); choose one pattern
- 🟡 1 & 2 ↔ 3: Model selection and swarm coordination both have strong opinions; clarify priority
- 🟡 4 ↔ 15: Comprehensive brief (4) and team splitting (15) can create coordination overhead; use hybrid carefully

---

## IV. SELECTION QUICK REFERENCE

**I need to automate something recurring:**
→ Blueprint 7 (Routines) + Blueprint 13 (Scheduled Tasks)

**I need to build a product fast:**
→ Blueprint 8 (Idea to SaaS) + Blueprint 12 (GAN Loop for QA)

**I need to improve code quality:**
→ Blueprint 12 (GAN Loop) + Blueprint 6 (Security Agents)

**I need help making a decision:**
→ Blueprint 1 (Use Cases) + Blueprint 2 (Opus Architecture) + Blueprint 4 (Best Practices)

**I have complex creative work to delegate:**
→ Blueprint 3 (Swarm) + Blueprint 15 (Teams) + Blueprint 5 (Context Management)

**I want to extract lessons from what I'm doing:**
→ Blueprint 16 (Auto Memory) + Blueprint 19 (Self-Evolving Hooks)

**I need to organize my workflow:**
→ Blueprint 9 (CLAUDE.md Mastery) + Blueprint 10 (Skills Guide) + Blueprint 17 (Rules Directory)

---

## V. COST EXAMPLES

**Monthly automation budget: $300**

| Mix | Blueprints | Cost | Value |
|-----|-----------|------|-------|
| Light | 7 (Routines) + 13 (Scheduled) | $80 | 10 hours automation |
| Medium | + 12 (GAN Loop) + 6 (Security) | $200 | 20 hours + quality assurance |
| Heavy | + 3 (Swarm) + 15 (Teams) | $300 | 40+ hours + autonomous features |

---

## VI. INTEGRATION EXAMPLES

**Example 1: CI/CD Pipeline Automation**
```
User's need: "Automatically review PRs, run tests, deploy if passing"

Blueprint selection:
  Blueprint 7 (Routines) ← GitHub webhook on PR
  Blueprint 12 (GAN Loop) ← Generator reviews code; evaluator validates
  Blueprint 3 (Swarm) ← If multiple PRs, route to specialists
  Blueprint 6 (Security Agents) ← Scan for vulnerabilities
  Blueprint 9 (CLAUDE.md) ← Define rules for "auto-deploy-safe"
  Blueprint 5 (Context) ← Load only changed files, not full codebase

Cost: $150–200/month
Timeline: 3–7 min per PR
Success rate: 85–95% after calibration
```

**Example 2: Content Multiplication for Creative Work**
```
User's need: "Turn one video clip into 10 social media posts"

Blueprint selection:
  Blueprint 18 (Distribution Agents) ← Pipeline of specialists
  Blueprint 20 (Custom Agents) ← Create agent for captions, hashtags, timing
  Blueprint 5 (Context) ← Load only one clip at a time
  Blueprint 7 (Routines) ← Schedule posting across platforms
  Blueprint 16 (Auto Memory) ← Learn which post types perform best
  Blueprint 19 (Self-Evolving Hooks) ← Improve based on engagement

Cost: $50–100/month
Timeline: 2 hours for initial setup; then automated
Value: 10 hours content creation per week saved
```

---

**Status**: ACTIVE  
**Last updated**: 2026-04-18  
**Authority**: House of Blueprints, Keeper of Patterns
