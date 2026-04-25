---
name: openmythos-swarm
description: Research and apply insights from the OpenMythos (Claude Mythos reconstruction) and Kye Gomez's Swarms framework. Use for deep architectural analysis of Recurrent-Depth Transformers (RDT), agentic orchestration, and implementing local agent loops.
---

# OpenMythos & Swarm Skill

Use this skill to research and apply the principles of Recurrent-Depth Transformers (RDT) and Swarm-based orchestration, based on the OpenMythos project and leaked "Claude Code" agentic patterns.

## Core Workflows

### 1. Architectural Reasoning (RDT)
Refer to [architecture.md](references/architecture.md) for details on:
- **Recurrent Block Logic**: Understanding layer recycling for "latent thinking."
- **Spectral Stability**: Monitoring and constraining spectral radius ($< 1$) for stable RDT training/inference.
- **Switchable Attention**: Implementing MLA (Multi-Latent Attention) for KV-cache compression.

### 2. Swarm Orchestration
Apply patterns from the Swarms framework for:
- **Agent Delegation**: Designing `HierarchicalSwarm` and `SwarmRouter` systems.
- **Portable Skills**: Creating `SKILL.md` compliant agents that can be used across Claude Code, OpenMythos, and Swarms.
- **Multi-Agent Harness**: Building robust loops for `Model -> Tool -> Execution -> Reflection`.

### 3. Local Implementation
When working with the OpenMythos repository:
- Use `OpenMythos` class for model definition.
- Leverage `MythosConfig` for defining recurrence depth and sparse MoE parameters.
- Check `open_mythos/main.py` for the core implementation of the RDT loop.

## References
- [Architecture & Swarm Insights](references/architecture.md)
- [Repository Path]: `.agents/openmythos` (Cloned locally)
