---
name: swarm-coordination
description: Advanced LLM swarm coordination using graph-based state machines, standardized handoffs, and tiered memory management. Use when orchestrating multiple agents (ENLIL, NABU, ENKI, INANNA) or managing complex, multi-step agentic workflows.
---

# Swarm Coordination Protocol

This skill provides the operational framework for coordinating the NUDIMMUD Conclave and other agentic swarms.

## 1. Graph-Based Orchestration

Avoid linear pipelines. Treat workflows as state machines (graphs) where agents are nodes and handoffs are edges.

- **Nodes**: Specific agents or model instances (ENLIL, NABU, etc.).
- **Edges**: Conditional transitions based on output validation.
- **Cycles**: Allowed for iterative refinement (e.g., Code -> Lint -> Fix -> Test).
- **Human-in-the-loop**: A specialized node that waits for user feedback before proceeding.

### State Object Schema
Maintain a global state object passed between nodes:
```json
{
  "task_id": 123,
  "history": [...],
  "current_node": "ENKI",
  "outputs": {
    "architect": "...",
    "code": "..."
  },
  "metadata": {
    "cost": 0.45,
    "confidence": 0.92
  }
}
```

## 2. Standardized Handoff Protocol

Every handoff must be registered in `OS_KERNEL/memory.db` and include:
1. **Context Snapshot**: Minimal necessary context to avoid token bloat.
2. **Success Criteria**: Clear definition of done for the receiving agent.
3. **Escalation Path**: What to do if the receiving agent fails.

Use `handoff` syscall:
```bash
python3 _SYSTEM/OS_KERNEL/syscalls/kernel.py handoff <task_id> <from> <to> "<note>"
```

## 3. Tiered Memory Management

Prevent "context drift" by managing what stays in the active window.

- **Layer 1 (Working)**: Current task instructions + last 3 turns + relevant code snippets.
- **Layer 2 (Episodic)**: Summaries of previous sessions/tasks (fetched from `memories` table).
- **Layer 3 (Semantic)**: Canonical project rules and facts (CLAUDE.md, .cursorrules).

**Pruning Rule**: When context exceeds 80% of model limit, summarize the conversation history and replace it with the summary.

## 4. Conclave Roles

- **ENLIL (Architect)**: High-level strategy, task decomposition, final review.
- **NABU (Scribe)**: Documentation, rule syncing, memory management.
- **ENKI (Craftsman)**: Code generation, refactoring, implementation.
- **INANNA (Guardian)**: Adversarial evaluation, security audit, quality gates.

## 5. Decision Tree for Swarms

1. **Decompose**: ENLIL breaks task into sub-tasks.
2. **Assign**: NABU routes tasks to best-fit agents based on `complexity-router`.
3. **Execute**: ENKI/Others perform work in isolated branches or files.
4. **Validate**: INANNA checks work against constraints.
5. **Merge**: ENLIL approves and integrates.
