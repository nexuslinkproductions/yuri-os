# The Fractal Orchestration Model

## Conceptual Bridge: RDT -> Agent -> Swarm
The stability and efficiency of the Aeonic Conclave rely on recognizing the "Self-Similar Fractal" nature of the system:
1. **The Core (RDT / Latent Thinking):** At the lowest level, the model recycles layers to refine a thought. **Stability Requirement:** Spectral Stability (Mathematical bounds on state changes).
2. **The Agent Loop (Execution):** The agent loops through `Model -> Tool -> Observe -> Model`. **Stability Requirement:** The `OS_KERNEL` memory database. Without logging state changes (`task-update`, `mem-log`), the agent loop explodes into infinite repetitive tool calls (hallucinations).
3. **The Swarm (The Conclave):** The swarm loops through its specialized members (`ENLIL -> NABU -> ENKI -> INANNA`). **Stability Requirement:** The **Unified Memory Bank (UMB)** and formal handoffs. 

## Communication & Collaboration Protocols
To prevent degradation across swarm handoffs and maintain "Spectral Stability" at the macro level, all agents MUST adhere to these operational rules:

### 1. The Handoff (The Swarm Router)
When one Conclave member finishes a phase and passes control:
- **Mandatory Syscall:** You MUST use the OS Kernel to formalize the baton pass: `python3 _SYSTEM/OS_KERNEL/syscalls/kernel.py handoff <ID> <FROM> <TO> "Detailed context note"`
- **Context Compression:** Do not pass raw, unsummarized data. Condense your findings into a clear state update for the next agent.

### 2. State Anchoring (Preventing Loop Explosions)
To ensure the Agent Loop remains stable (analogous to $r < 1$ in an RDT equation):
- **Pre-Flight Check:** Before executing a destructive or complex multi-step action, read the current task state from the kernel.
- **Continuous Logging:** Update the task status to `RUNNING` when starting, and `COMPLETED` when done. 
- **Episodic Commits:** If a critical decision is made or a bug is solved, commit it immediately using `mem-log`.

### 3. GitNexus Impact Awareness
Efficiency in a swarm means not stepping on each other's toes.
- **Never operate blindly.** Always use `gitnexus_impact` to assess the blast radius of a change before `ENKI` or `INANNA` modify core logic. This serves as the structural "attention mechanism" across the swarm.

## Summary
By treating Swarm Handoffs, Agent Tool Loops, and Model Latent Thinking as different scales of the exact same mechanism, we achieve maximum efficiency. The `OS_KERNEL` memory state is the damping factor that keeps the swarm stable and productive.
