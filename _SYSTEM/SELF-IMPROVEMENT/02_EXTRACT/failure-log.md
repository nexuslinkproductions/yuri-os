# Failure Log — 7-Rung Ladder

> STATUS: TEMPLATE-ONLY (wave-3 L.3) — no failures have ever been logged here and no
> script writes to this path. The ladder below is the intended process, not a record.

Failures are routed upward until they become prevention rules.

## The Ladder

1. **Signal** — What happened?
2. **Cost** — What did it waste or risk?
3. **Mechanism** — What process created the miss?
4. **Pattern** — Has this appeared before?
5. **Framing** — Was the question itself wrong?
6. **Prevention** — What rule would stop recurrence?
7. **Compounding** — Where does the rule get installed?

## Entry Template

```markdown
# YYYY-MM-DD | Domain | Cost

1. Signal:
2. Cost:
3. Mechanism:
4. Pattern:
5. Canonical tag(s):
6. Prevention:
7. Compounding target / cross-domain analogs:
```

## Escalation

- Same mechanism twice: write a prevention rule.
- Same framing miss once in a high-cost domain: write a prevention rule immediately.
- Raw entries are archived after weekly consolidation.
