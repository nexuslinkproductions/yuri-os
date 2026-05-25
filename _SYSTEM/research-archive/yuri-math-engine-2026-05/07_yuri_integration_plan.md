# YURI Integration Plan

Date: 2026-05-24
advisory_only: true
local_truth_claim: false

## Implemented First Slice

- Research archive placed under `_SYSTEM/research-archive/yuri-math-engine-2026-05/`.
- Math runtime files placed under `_SYSTEM/Scripts/math/`.
- Math lab files placed under `_SYSTEM/labs/math/`.
- Formula banks placed under `_SYSTEM/data/math/formula-banks/`.
- Context registry receives a mathematics packet.
- Supercharge gate receives math syntax/test/health checks.

## Promotion Flow

1. Source enters research archive.
2. Claim receives caveat and relevance classification.
3. Formula or algorithm becomes a typed artifact.
4. Tests define its proof obligations.
5. Core or adapter implementation passes deterministic checks.
6. Release gate includes math-health.
7. Only then can the result influence routing, memory, or formula-bank promotion.

## Operational Integration Targets

Near-term:

- algorithmic proof reports
- visual pathfinding lab
- formula-bank fixtures
- entropy/KL scoring utilities

Next:

- memory confidence scoring
- RAG conflict distribution shift scoring
- task DAG ordering
- route-cost recommendations

Later:

- Bellman-Ford for negative cost domains
- MCTS for long-horizon exploration
- SymPy formula validation
- theorem prover adapters
- EML parser and derivation visualizer

## Guardrail

The guardrail stops false promotion, not exploration. Advisory lanes may hypothesize. Codex/main verifies.
