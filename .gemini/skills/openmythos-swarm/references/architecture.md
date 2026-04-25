# OpenMythos & Swarm Architectural Insights

## OpenMythos: The Recurrent-Depth Transformer (RDT)
OpenMythos is a theoretical reconstruction of the "Claude Mythos" model, suspected to be the engine behind Claude's high-level reasoning.

### Key Architectural Principles:
- **Recurrent Block (Looped Transformer):** Instead of stacking 100+ unique layers, it loops a set of weights (e.g., 16 iterations) over a single "Recurrent Block."
- **Latent Thinking:** By recycling layers, the model performs "deeper thinking" in continuous latent space without needing to generate chain-of-thought tokens.
- **RDT Equation:** $h_{t+1} = A \cdot h_t + B \cdot e + \text{Transformer}(h_t, e)$ where $A$ and $B$ are learned injection parameters.
- **Spectral Stability:** Uses LTI (Linear Time-Invariant) constraints to ensure the spectral radius remains $< 1$, preventing the recurrent signal from exploding.

## Swarm Orchestration
Insights from the "Claude Code" leak combined with Kye Gomez's Swarms framework:
- **Agent Skills:** Full compatibility with the `SKILL.md` format. Skills are portable across agentic frameworks.
- **Multi-Agent Harness:** Orchestration patterns like `HierarchicalSwarm` and `SwarmRouter` allow for O(1) agent lookup and complex task delegation.
- **Democratized Intelligence:** The combination of RDT models (local "deep" thinking) and Swarm orchestration (distributed task execution) marks the transition from centralized "AI Mainframes" to local developer-centric agents.

## Implementation Details
- **Core Class:** `OpenMythos` (found in `open_mythos/main.py`).
- **Optimization:** Supports Multi-Latent Attention (MLA) and Grouped Query Attention (GQA).
- **Sparse MoE:** Integrates shared and routed experts for efficient domain specialization.
