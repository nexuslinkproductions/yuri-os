---
name: swarm-coordinator
description: Use for orchestrating multi-agent tasks using Coordination Graphs (CGs) and DAG-based offloading. Ideal for complex workflows requiring inter-agent communication, verification loops, and stateful transitions.
---

# Swarm Coordinator

Guidance for orchestrating agent swarms (ENLIL, NABU, ENKI, INANNA) using modern coordination patterns.

## Core Patterns

### 1. Coordination Graphs (CG)
- Model every task as a node in a Directed Acyclic Graph (DAG).
- Define dependencies between agent tasks.
- Use `run_shell_command` or dedicated agent dispatch tools to trigger parallel execution for independent nodes.

### 2. State Persistence
- Maintain a shared JSON state file for the swarm session.
- Agents MUST read the state at start and update it before completion.
- Use a `supervisor` role to check state health.

### 3. Verification Loops (Plan-Act-Validate)
- Before moving to the next node in the graph, the current agent MUST validate its output.
- If validation fails, use a "Critic" agent (INANNA) to analyze and loop back to the execution agent.

## Implementation Guide
- **Tool Selection**: Use `graphify` to understand the dependencies of the current codebase before dispatching agents.
- **Latency Management**: Prefer lightweight Wasm isolates or edge nodes for sub-tasks.