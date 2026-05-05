# HOUSE OF GOVERNANCE
*How work gets routed, validated, and escalated*

**Purpose:** Governance prevents chaos when multiple blueprints operate simultaneously.

---

## Three Core Systems

### 1. ROUTING LOGIC (`routing.md`)
- **Sonnet** for: speed-critical, well-defined scope, high volume
- **Opus** for: ambiguous, high-stakes, novel domains
- **Subagent** when: parallel work needed, isolation required
- **Human override** when: confidence threshold breached

**Precedence:** CLAUDE.md rules > recent decisions > historical patterns

### 2. QUALITY GATES (`quality-gates.md`)
- Type checking (TypeScript strict mode)
- Linting (code style, conventions)
- Testing (unit, integration, E2E)
- Security (SAST, dependencies, secrets)
- Manual review (human checkpoint)

**Gate behavior:** Hard failure. No warnings. No overrides without escalation.

### 3. AUDIT TRAIL (`audit-trail.md`)
- Every major decision: who, when, why, alternatives
- Every blueprint: cost, outcome, lessons
- Every escalation: what, why, resolution
- Monthly audit: governance effectiveness review

---

## Files in This House

- `README.md` (this file)
- `routing.md` — Agent assignment logic
- `quality-gates.md` — Validation checkpoints
- `conflict-resolution.md` — When agents disagree
- `audit-trail.md` — Decision provenance

---

**Status**: ACTIVE  
**House**: Governance (Hod — Order, Rule)  
**Last updated**: 2026-04-18
