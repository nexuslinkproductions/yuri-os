---
name: aeonic-conclave-swarm
description: Aeonic Conclave protocol extension. Use this skill to govern Agent Loops, Swarm Orchestration, and inter-agent communication based on the "Self-Similar Fractal" model (RDT Stability -> Agent Stability -> Swarm Stability).
---

# Aeonic Conclave Swarm Protocols

Use this skill when interacting with the Aeonic Conclave (ENLIL, NABU, ENKI, INANNA) or when managing multi-agent handoffs and task execution within the `NUDIMMUD` OS.

## Core Workflows

### 1. Fractal Orchestration & Stability
Refer to [fractal-orchestration.md](references/fractal-orchestration.md) for details on:
- How the Agent Loop connects Swarm Orchestration and RDT.
- Why continuous state tracking in the `OS_KERNEL` is mathematically identical to constraining the spectral radius in Recurrent-Depth Transformers.

### 2. Swarm Handoff Protocols
To maintain stability and efficiency between agents:
- **Use the Kernel Handoff:** Always run `python3 _SYSTEM/OS_KERNEL/syscalls/kernel.py handoff <ID> <FROM> <TO> "Detailed context note"` when passing control to another member.
- **Context Compression:** Never pass raw files; synthesize a precise state summary for the receiving agent.

### 3. Preventing Hallucinatory Tool Loops
- Before multi-step execution, read the current task status from the kernel.
- **Update Frequently:** `python3 _SYSTEM/OS_KERNEL/syscalls/kernel.py task-update <ID> RUNNING` and eventually `COMPLETED`.
- **Log Decisions:** `python3 _SYSTEM/OS_KERNEL/syscalls/kernel.py mem-log "Fact"` for long-term Unified Memory Bank (UMB) retention.

### 4. GitNexus Impact Checks
- No core modifications by ENKI or INANNA may proceed without a `gitnexus_impact` scan. This serves as the "attention mechanism" for the whole swarm to prevent destabilization.

## References
- [Fractal Orchestration & Stability Guide](references/fractal-orchestration.md)
