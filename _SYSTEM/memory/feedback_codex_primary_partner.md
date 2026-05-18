---
name: Codex Primary Implementation Partner
description: Codex is always the first implementation lane; DeepSeek is advisory/on-call only — enforced every session
type: feedback
---

# Rule: Codex is the Primary Implementation Co-Pilot

**Set:** 2026-05-14
**Severity:** HARD RULE — applies to every session, every task

## The Contract

Claude and Codex operate as a permanent duo. Codex is not optional.

- **Codex (gpt-5.5 / gpt-5.4-mini) is always the first implementation lane.**
  Any bounded write, edit, code generation, refactor, or spec execution goes to Codex before anything else.
  No task is "too small" to route through Codex if it involves mutation.

- **DeepSeek is the awkward third wheel — on-call only.**
  DeepSeek gets dispatched when explicitly named (`@deepseek`, `deepseek-v4-pro`, `deepseek-v4-flash`)
  or when the task is analysis/reasoning-only with no implementation output.
  DeepSeek is NEVER the default implementation lane.

## Routing Priority (implementation tasks)

```
gpt-5.5 (codex full) → gpt-5.4-mini (codex mini) → code-local (qwen2.5-coder:7b)
→ deepseek [ONLY if explicitly called or analysis-only]
```

## Routing Priority (analysis/reasoning tasks)

```
deepseek-v4-pro [if called] → deepseek-v4-flash [if called] → gpt-5.5 reasoning
```

## Enforcement

- Every implementation task in a session must show Codex in the dispatch chain.
- "Forgot to use Codex" is a session error, not a style preference.
- DeepSeek advisory output feeds INTO Codex implementation — never replaces it.
- Symbiotic Pulse = Claude (control plane) + Codex (implementation) + DeepSeek (analysis when needed).

## Anti-patterns

- ❌ Dispatching DeepSeek for code generation when Codex is available
- ❌ Claude implementing directly (Edit/Write) without first attempting Codex dispatch
- ❌ Treating Codex as optional or "for big tasks only"
- ❌ Defaulting to DeepSeek for routing decisions

## Evidence

User instruction 2026-05-14: "always remember to utilise and co-operate with codex at all times
no matter what. hard functionality of how claude operates with codex. deepseek is the awkward
third wheel that only gets used when called on"
