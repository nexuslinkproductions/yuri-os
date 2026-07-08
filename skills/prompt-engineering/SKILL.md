---
name: prompt-engineering
description: "Design, audit, and optimize prompts as task contracts with evidence, constraints, tool policy, output schemas, and evals. Use when the user asks for prompts, system instructions, prompting strategy, prompt quality, prompt optimization, RAG instructions, tool-agent instructions, or asks to avoid identity-roleplay phrasing."
scope: harness
invocation: ability
---

# Prompt Engineering

## Rule

Prompts are task contracts, not performance scripts.

Do not use identity-simulation or pretend-role phrasing. Replace it with objective, responsibility, evidence, constraints, output schema, and pass criteria.

## Quick Workflow

1. Define the objective and user outcome.
2. Name inputs and authority order.
3. Separate trusted instructions from untrusted context.
4. Add constraints, tool policy, and approval gates.
5. Specify output schema.
6. Add evidence rules and unknown/failure behavior.
7. Add pass criteria or an eval checklist.

## Default Template

```markdown
# Task Contract

## Objective
[Concrete outcome]

## Context
[Relevant context]

## Inputs
- [files, URLs, data, messages]

## Authority Order
1. Explicit user instruction
2. Local evidence
3. Canonical project policy
4. Official/public source
5. Inference, labeled

## Constraints
- [scope and forbidden behavior]

## Tool Policy
- Allowed: [tools]
- Approval required: [actions]
- Forbidden: [actions]

## Required Checks
- [checks before final output]

## Output Schema
[exact sections, table, JSON, or Markdown]

## Evidence Rules
- Cite local paths for repo claims.
- Cite URLs for external claims.
- Mark unsupported claims as `UNKNOWN`.

## Pass Criteria
- [measurable success conditions]
```

## Replacement Patterns

| Avoid | Use |
|---|---|
| Identity-roleplay setup | Use these audit responsibilities |
| Pretend/performative setup | Apply this operating contract |
| Think step by step | Decompose internally; report concise rationale, checks, and evidence |
| Don't hallucinate | Source-only mode; write `UNKNOWN` when unsupported |
| Be creative | Generate options, then rank by evidence, risk, reversibility, and utility |

## Modes

- Source-only: answer only from supplied/local sources; cite evidence; mark gaps.
- Audit: findings, severity, evidence, remediation, exit test.
- Build: read local patterns, scope edits, verify.
- Strategy: separate ambition from proof; name buyer, wedge, competitor, proof.
- Optimization: create variants, run evals, promote only measurable winners.

## References

See [REFERENCE.md](REFERENCE.md) for source-backed doctrine, security rules, and eval policy.

## Session Notes

- 2026-06-16 — Designs, audits, and optimizes prompts as task contracts with evidence, constraints, tool policy, output schemas, and evals. Use when the user asks for prompts, system instructions, prompting strategy, prompt quality, prompt optimization, RAG instructions, tool-agent instructions, or asks to avoid identity-roleplay phrasing.
