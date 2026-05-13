# Yuri Campaign Intake Protocol

Reusable campaign surface for complex Yuri work. Use this when a task is larger than a single fix and needs owner intent, product taste, risk posture, acceptance criteria, and execution tradeoffs captured before implementation.

## Campaign Directory Shape

Each campaign lives at:

```text
_SYSTEM/campaigns/<campaign-id>/
  00-questionnaire.md
  01-answers.md
  02-decisions.md
  03-execution-plan.md
  04-acceptance-checklist.md
  05-postmortem.md
  06-<domain-doctrine>.md
```

## Questionnaire Depth

Pick the smallest useful depth:

| Complexity | Question Count | Use When |
|---|---:|---|
| Small | 10-15 | One feature, known users, low risk |
| Medium | 16-30 | Multi-screen feature, data model changes, product taste matters |
| High | 31-50 | Multi-subsystem campaign, compliance/safety risk, user workflow ambiguity |

## Rules

- Questions should offer options first; free text is optional.
- Answers become decisions, not trivia.
- Unanswered items get a recommended default and an explicit `pending_owner_confirmation` marker.
- Campaign artifacts are local evidence for implementation plans, but repo state and tests still outrank campaign text.
- No public or external action is authorized by a campaign artifact alone.

Optional doctrine files are allowed when a campaign needs a durable quality bar for a specific subsystem, such as copywriting, visual design, compliance, data quality, or evaluation.
