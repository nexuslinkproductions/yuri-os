# Neural Forge & Ollama Cloud Orchestration

> Reference doc. Promoted from `.claude/skills/neural-forge-orchestration.md`.

## 1. Context
The **Neural Forge** is a hybrid local/cloud inference system for YURI-OS-MUSUBI. It uses a local Ollama daemon as the primary engine and **Ollama Cloud** as a high-availability fallback.

## 2. Model Registry & Naming
Always check the registry in `backend/src/services/neuralService.ts` before querying a model.
- **Liberated Models**: Most models use the `-liberated` suffix (e.g., `claude-3-5-sonnet-liberated`, `qwen-3-5-72b`).
- **Cloud Suffix**: Appending `:cloud` to any model ID forces routing to Ollama Cloud.
- **Auto-Fallback**: If local Ollama is down, the system automatically routes requests to Cloud using predefined mappings in `neuralForgeService.ts`.

## 3. Operational Protocols
- **Connection Check**: Use `GET /api/neural/status` to check the health of both bridges.
- **Strategic Audits**: Use the `ProjectAnalyzer` for complexity scoring and agent routing.
- **Failure Recovery**: If both bridges are down, the system returns simulated reasoning nodes (`ENLIL`, `NABU`, `ENKI`, `INANNA`) to maintain UI stability.

## 4. Maintenance
- **Database**: The `agents` table requires `parent_agent_id` for hierarchical swarm logic.
- **Environment**: `OLLAMA_CLOUD_API_KEY` and `OLLAMA_CLOUD_ENDPOINT` must be present in `.env`.

## 5. Never Do
- **NEVER** get stuck searching for models without checking the `liberated` registry first.
- **NEVER** assume a model ID exists without verification.
- **NEVER** ignore `MODEL_NOT_FOUND` errors; verify the `neuralService` initialization logic.
