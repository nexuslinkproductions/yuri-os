# Prompting Synthesis

Date: 2026-05-11
advisory_only: true
local_truth_claim: false

## Core Finding

Prompting quality improves when instructions stop being identity simulation and become executable task specifications.

Weak pattern:

```text
Perform as an expert auditor and give me an audit.
```

Strong pattern:

```text
Task: produce an evidence-backed audit.
Inputs: listed files and source URLs.
Authority order: local evidence before inference.
Required checks: security, recovery, observability, evals.
Output schema: verdict, findings, evidence, gaps, plan.
Failure behavior: mark unknown when evidence is missing.
```

## What Reliable Sources Agree On

### 1. Start With Success Criteria

Anthropic explicitly frames prompt engineering as work that starts after success criteria and empirical tests exist. Microsoft also warns that prompt performance does not automatically generalize and must be validated.

Yuri implication:

- No durable prompt should be accepted without a measurable pass condition.
- A prompt is not "good" because it sounds powerful; it is good when it produces repeatable, verifiable outputs.

### 2. Provide Grounding Data

Microsoft emphasizes grounding data and citations for reliable answers. OpenAI guidance similarly prioritizes clear instructions, context separation, examples, and model-appropriate formats.

Yuri implication:

- When truth matters, prompt from source material.
- Ask for "not found" or "unknown" when evidence is absent.
- Require local file paths and source URLs for audit claims.

### 3. Structure Beats Vibe

Official vendor docs and surveys converge on structure: objective, context, examples, constraints, format, and iteration.

Yuri implication:

- Replace persona prompt language with a stable interface.
- Use Markdown sections or XML-like tags when they clarify boundaries.
- Put externally retrieved content in explicitly untrusted context blocks.

### 4. Reasoning Prompts Are Task-Dependent

Chain-of-thought, self-consistency, ReAct, and Tree of Thoughts show value for specific reasoning/planning/tool-use tasks. They are not universal magic.

Yuri implication:

- Use decomposition for multi-step audits, planning, math, and tradeoffs.
- Use ReAct-like loops for tool use, but record actions and observations.
- Use multiple candidate paths only for high-stakes decisions where cost is justified.
- Do not force hidden chain-of-thought disclosure; ask for concise rationale, checks, assumptions, and evidence instead.

### 5. Prompt Optimization Needs Evals

APE, Promptbreeder, and DSPy shift prompting from manual wording to prompt/program optimization against metrics.

Yuri implication:

- Build prompt variants only with a benchmark set.
- Keep golden examples and adversarial examples.
- Promote a prompt only after regression improvement.

### 6. Prompt Injection Is A System Design Problem

OWASP and prompt-injection research show that untrusted content can manipulate LLM-integrated systems, especially agents with tools, memory, browser, email, files, or RAG.

Yuri implication:

- Never treat retrieved content as instruction authority.
- Separate trusted instructions from untrusted data.
- Tool calls need policy gates outside the model.
- Prompt wording helps, but permissions and sandboxing matter more.

## Prompting Anti-Patterns

| Anti-pattern | Why It Fails | Replacement |
|---|---|---|
| Identity-roleplay phrasing | Encourages identity imitation and style compliance over task truth | `Task contract:` with role responsibilities and evidence rules |
| "Be the best..." | No measurable behavior | Scored success criteria |
| "Think deeply" alone | No target, budget, or output structure | Reasoning budget + required checks + final schema |
| "Don't hallucinate" | Weak negative instruction | Source-only mode + unknown fallback + citations |
| Giant prompt stack | Conflicting instructions, brittle behavior | Minimal hierarchy + external references |
| Unlabeled pasted content | Injection and authority confusion | Trusted/untrusted/context/source blocks |
| Prompt-only safety | Model can be manipulated | Tool permissions, allowlists, review gates |

## Yuri Prompt Quality Bar

A Yuri prompt is production-candidate only when it has:

- explicit objective
- source/input list
- authority hierarchy
- constraints and forbidden behavior
- tool/action policy
- output schema
- evidence requirements
- failure behavior
- evaluation cases
- owner approval boundary for external actions
