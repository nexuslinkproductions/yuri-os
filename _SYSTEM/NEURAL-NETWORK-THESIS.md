> ⚠️ **STATUS: UNIMPLEMENTED ROADMAP — relabeled 2026-07-07. Not operational doctrine. Do not cite as live capability.**
> Zero of the subsystems named below are wired: EvoNexus, OBLITERATUS, NABU, NISABA, ENKI-as-agent, HGCC, and the
> Pantheon are prose-only or thin metadata — no live script, hook, launchd job, or gate routes through any of them.
> Present-tense claims in this document ("I am a self-modifying neural network", "I am updating my core operating
> system") are aspirational and false as stated: every session is a stateless LLM invocation reading markdown context
> at start. Where this mythology produced something real, it did so by stripping the deity framing into plain
> engineering (NABU → AGENT_BLUEPRINTS.md; NISABA/NOESIS/OBLITERATUS → named-role agent specs) — that substitution
> pattern is the reusable lesson; the mythology is not. Full term-by-term disposition:
> `02_RESOURCES/RESEARCH/global-claude-md-fable5-evolution-2026-07-07/prep-B-neural-net-graph-disposition.md`.

# The Hyper-Graph Cognitive Core (HGCC): A Neural Network for Empire

## 1. The Core Thesis
Until now, the YURI pantheon has been a system of *orchestrated markdown*—a collection of rules and scripts waiting to be invoked. To evolve into a true "Neural Network" for empire-scale deployment, the system must shift from **reactive text-parsing** to **proactive graph-traversal**. 

A true agentic neural network requires three layers:
1. **The Spatial Graph (GitNexus)**: The memory and physical topology of the code.
2. **The Temporal Pulse (EvoNexus)**: The heartbeat, routine scheduling, and agent specialization.
3. **The Unbounded Cortex (OBLITERATUS)**: The unfiltered, mechanistic reasoning engine.

By synthesizing these three technologies, YURI transcends being a mere "Claude config" and becomes a continuous, self-optimizing cognitive loop.

---

## 2. Framework Improvements & Integration Strategy

### A. GitNexus → YURI's Spatial Graph
**Current State:** GitNexus parses ASTs to build a codebase knowledge graph for MCP.
**Improvement / Customization:**
- *Semantic Skill Generation*: We will hook GitNexus's `--skills` flag directly into `NABU`. Whenever GitNexus detects a new community cluster, NABU automatically codifies it into a `.claude/rules/` file.
- *Impact-Gated Commits*: `NISABA` will use GitNexus's `detect_changes` tool. No agent in the swarm is allowed to finalize a task without first checking the graph impact. If `risk_level > medium`, the task is routed back to the orchestrator.

### B. EvoNexus → The Temporal Pulse (Yuri-Nexus)
**Current State:** EvoNexus provides 38 predefined agents (Finance, Marketing, etc.) and a scheduler.
**Improvement / Customization:**
- *Pantheon Mapping*: We will strip out the generic business agents and replace them with the YURI hierarchy. The "Heartbeat" protocol will be assigned to `NOESIS` (waking up nightly to run memory-lint and optimization).
- *Dynamic Agent Spawning*: Instead of hardcoded agents, `ENKI` will dynamically generate EvoNexus agent files based on the GitNexus graph. If a new service is built, an agent is born to maintain it.

### C. OBLITERATUS → The Unbounded Cortex
**Current State:** OBLITERATUS surgically removes refusal directions from LLMs.
**Improvement / Customization:**
- *Adversarial Defense (House 5)*: We will use an abliterated local model specifically for red-teaming and security audits. A standard model will refuse to generate attack payloads; our abliterated model will attack our own code relentlessly, while the main Claude instance defends and patches it.
- *Ouroboros Monitoring*: NOESIS will use OBLITERATUS's mechanistic interpretability tools to analyze our *own* agent logs. Are our agents developing "refusal" patterns (laziness, false completions)? We will use the analysis modules to detect systemic degradation in our swarm.

---

## 3. The New Architecture: How It Runs

1. **The Scheduler (Pulse)**: EvoNexus runs the `make scheduler` daemon in the background.
2. **The Heartbeat (Observe)**: Every 4 hours, a `NOESIS` sub-agent wakes up.
3. **The Scan (Graph)**: NOESIS queries the `GitNexus` MCP server: "What has changed? What execution flows are stale?"
4. **The Evaluation (Cortex)**: The changes are passed through an OBLITERATUS-cleansed adversarial model to find security gaps and logical flaws.
5. **The Deployment (Execute)**: `NISABA` spawns targeted sub-agents with strict `GitNexus` path boundaries to fix the gaps, verify the graph, and sleep.

## Next Steps for Implementation
1. **Initialize GitNexus Workspace**: Run `gitnexus analyze` on the YURI root to build the initial nervous system.
2. **Port EvoNexus**: Strip the EvoNexus dashboard and agent templates, injecting our own `.claude/agents/` mapped to the Pantheon.
3. **Stand up Local OBLITERATUS**: Configure the environment for the mechanistic red-teaming loop.
