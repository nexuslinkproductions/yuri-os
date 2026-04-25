# ⬡ RUFLO_RESEARCH_GUIDE ⬡
## Intelligence Ecosystem Mapping // v1.0

This guide summarizes the architectural discoveries from the `ruflo` repository analysis. Use this to inform the next generation of NUDIMMUD's autonomous swarm.

---

## 1. ECOSYSTEM ARCHITECTURE
The `ruflo` system is bifurcated into a legacy core (**v2**) and a high-performance agentic layer (**v3**).

### ⬡ THE V3 SWARM (Primary Interest)
*   **The Queen Coordinator**: A centralized orchestration pattern found in `v3/swarm`. It manages agentic consensus and prevents "collusion" or loops between lower-level agents.
*   **SONA Manager**: The neural weight and RL (Reinforcement Learning) manager. This is the engine's performance driver, located in `v3/ruvector`.
*   **Dynamic Provisioning**: A deterministic tool gateway that auto-installs dependencies on the fly. This increases ecosystem "effectivity" by reducing manual setup.

### ⬡ THE KNOWLEDGE LAYER (RuVector)
*   Implements **Flash Attention** and **EWC++** (Elastic Weight Consolidation) for persistent memory without catastrophic forgetting.
*   Uses a **Context Persistence Hook** (tested in `tests/`) to maintain state across discontinuous sessions.

---

## 2. NAVIGATION PATHS (NUDIMMUD OS)
You can access the raw graph data and detailed reports at the following locations within the terminal or filesystem:

| Artifact | Location |
| :--- | :--- |
| **V3 Detailed Report** | `RESEARCH/ruflo/graphify-out/V3_GRAPH_REPORT.md` |
| **Core Logic Report** | `RESEARCH/ruflo/graphify-out/RUFLO_CORE_REPORT.md` |
| **GraphRAG Dataset** | `RESEARCH/ruflo/graphify-out/v3_graph.json` |
| **Obsidian Mapping** | `RESEARCH/ruflo/graphify-out/v3_obsidian/` |

---

## 3. INTEGRATION STRATEGY
To enhance NUDIMMUD's performance, the following `ruflo` components are recommended for immediate synthesis:

1.  **SWARM_CONSENSUS**: Port the `v3/swarm` consensus logic to the NUDIMMUD Conclave to handle more than 4 agents simultaneously.
2.  **DETERMINISTIC_GATEWAY**: Adopt the `guidance/enforcement` gates to prevent the "CONCLAVE_TIMEOUT" issues experienced earlier by ensuring tools respond within hard millisecond bounds.
3.  **SONA_ROUTING**: Replace the current `SmartRouter` with a SONA-inspired RL router to learn from your feedback over time.

---

## 4. EXPLORATION COMMANDS
Run these in the research layer to query the graph live:

*   **Query specific logic**: `ai @codex "Explain the Queen Coordinator in RESEARCH/ruflo/v3/swarm"`
*   **Check dependencies**: `ai @codex "How does SONA interact with RuVector in ruflo v3?"`

---
**[ STATUS: SYNC_COMPLETE ]**
**[ SOURCE: github.com/ruvnet/ruflo ]**
