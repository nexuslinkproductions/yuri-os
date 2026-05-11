# Yuri Prompting Doctrine

Date: 2026-05-11
advisory_only: true
local_truth_claim: false

## Doctrine

Yuri prompts are operating contracts, not performance scripts.

Avoid identity simulation. Use responsibility, evidence, and output contracts.

## Default Prompt Architecture

```text
Objective:
What outcome is required?

Context:
What relevant local/project/business context applies?

Inputs:
Which files, data, URLs, or user messages are in scope?

Authority:
What source wins when instructions conflict?

Constraints:
What must not be done?

Tools:
Which tools may be used, and what requires approval?

Process:
What checks must happen before the final answer?

Output:
Exact structure, length, file format, or schema.

Evidence:
What claims need file paths, source URLs, commands, screenshots, or citations?

Failure:
What to say or do when evidence is missing, ambiguous, unsafe, or blocked?

Evaluation:
What makes the answer pass?
```

## Replacement Rules

| Old phrase | Yuri replacement |
|---|---|
| Identity-roleplay setup | Use the audit responsibilities below |
| Pretend/performative setup | Apply this operating contract |
| You are a genius | Optimize for these measurable criteria |
| Be creative | Generate divergent options, then rank by evidence/risk/utility |
| Think step by step | Decompose privately; report concise rationale, checks, and evidence |
| Give me the best answer | Produce output that passes this rubric |
| Don't hallucinate | Use source-only mode; if absent, write `UNKNOWN` |

## Prompt Modes

### Source-Only Mode

Use when truth matters.

Rules:

- Answer only from supplied/local sources.
- Mark missing facts as `UNKNOWN`.
- Cite source path or URL.
- Separate inference from fact.

### Audit Mode

Use for codebase, system, market, security, workflow, or operational audits.

Rules:

- Findings first.
- Severity and evidence required.
- No claim without source.
- Include remediation and exit test.

### Build Mode

Use for implementation.

Rules:

- Read local patterns first.
- Keep scope narrow.
- Edit only necessary files.
- Verify with tests/build/smoke.

### Strategy Mode

Use for market, product, roadmap, partnership, or positioning.

Rules:

- Separate ambition from proof.
- Name buyer/user.
- Name wedge.
- Name competitor/source.
- Name proof needed before claim.

### Prompt Optimization Mode

Use when improving prompts themselves.

Rules:

- Define eval set.
- Create prompt variants.
- Score outputs.
- Keep the smallest prompt that passes.
- Archive failures as regression cases.

## Yuri Prompt Template

```markdown
# Task Contract

## Objective
[Concrete outcome]

## Context
[Relevant project/user/business context]

## Inputs
- [file/url/data]

## Authority Order
1. Explicit user instruction
2. Local evidence
3. Canonical project policy
4. Official/public source
5. Inference, labeled

## Constraints
- [forbidden action]
- [scope limit]

## Tool Policy
- Allowed: [tools]
- Approval required: [actions]
- Forbidden: [actions]

## Required Checks
- [check 1]
- [check 2]

## Output Schema
[exact sections/table/json/etc.]

## Evidence Rules
- Cite local file paths for repo claims.
- Cite URLs for external claims.
- Mark unsupported claims as UNKNOWN.

## Pass Criteria
- [measurable pass rule]
```
