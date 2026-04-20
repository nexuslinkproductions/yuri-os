# HOUSE OF RESILIENCE
*Systems fail. We recover. We don't stay broken.*

**Purpose:** Survival when systems fail. Rapid detection and recovery.

---

## Four Recovery Layers

### 1. FAILURE DETECTION
- Silent failure (no output) → check cron logs, API status
- Semantic error (wrong output) → quality evaluator rubric
- Constraint drift (agent writes outside assigned files) → file audit
- Cost explosion (2x+ baseline) → token usage tracking
- Memory conflict (rules contradict) → conflict detection scan

### 2. FALLBACK PROCEDURES
- Blueprint fails → use simpler validation until debugged
- Agent breaks → route work to human or backup agent
- Learning corrupts → revert to last known-good state

### 3. ROLLBACK & RECOVERY
- Detect corruption → identify last-good state → restore → verify
- Backup strategy: Git history (code), Auto Memory history (rules)
- Time to rollback: <5 minutes

### 4. CANARY TESTING
- New rule: test on 5% of work first
- Monitor: success rate, cost per execution
- Graduated rollout: 5% → 25% → 100% over 3 days
- Abort threshold: if success drops >10%, rollback immediately

---

## Failure Response Template

```
Failure detected: [describe what went wrong]

Detection method: [how we knew]
Severity: Critical / High / Medium

Fallback activated: [immediate action]

Investigation: [root cause]

Resolution: [fix applied]

Prevention: [what changed to prevent recurrence]

Timeline: [when did this happen, how long until resolution]
```

---

## Files in This House

- `README.md` (this file)
- `failure-detection.md` — How to know something broke
- `fallback-procedures.md` — What to do when blueprint fails
- `rollback.md` — Undoing corrupted state
- `canary-testing.md` — Safe deployment of new rules
- `disaster-recovery.md` — Multi-region failover (future)

---

**Status**: ACTIVE  
**House**: Resilience (Gevurah — Strength, Protection)  
**Last updated**: 2026-04-18
