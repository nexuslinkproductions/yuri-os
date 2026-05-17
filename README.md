# YURI-OS-MUSUBI

**Private operator system. Not open source.**

**Marcel Spatz · Nexus Link Productions · Vienna**

---

YURI-OS-MUSUBI is the command center for running creative, technical, and business operations from a single surface. It unifies video production pipeline management, AI agent infrastructure, financial operations, and premium tooling design — built and operated by one person, across multiple domains, continuously.

The name: **MUSUBI** (結び) — the binding force. The principle that connects domains, timelines, and creative energy into a coherent whole.

---

## What It Is

A live operator system with a React/WebGL frontend, Node.js backend, SQLite knowledge layer, and a persistent AI agent infrastructure running on Claude Code, Codex, and DeepSeek. The vault holds 6,000+ operational notes across all active domains. Everything is interconnected, versioned, and automated.

This is not a template. Not a framework. Not a showcase for methodology. It is a working system, documented here for continuity.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Framer Motion, Three.js |
| Backend | Node.js, Express, SQLite |
| Real-time | WebSocket |
| Agent infrastructure | Claude Code (control plane), Codex, DeepSeek, local Ollama |
| Knowledge layer | Obsidian vault, MCP server, palace index |
| Code intelligence | GitNexus (96K+ symbols, 300 execution flows) |
| Automation | 14 LaunchAgents, PM2, scheduled sentinels |

---

## Vault Structure

```
_SYSTEM/            System configuration, authority contracts, automation
00_COMMAND-CENTER/  Active HQ — home, status, daily operations
01_PROJECTS/        All client and internal projects
02_AREAS/           Ongoing responsibilities — health, brand, learning
03_RESOURCES/       Research, references, design radar
04_FINANCE/         Financial operations by year
05_NEXUS-LINK/      Nexus Link Productions — identity, brand, strategy
06_KNOWLEDGE-BASE/  Curated knowledge — cosmology, consciousness, synthesis
07_ARCHIVE/         Completed work, deprecated content
08_NETWORK-SYNC/    External network sync layer
backend/            Express API + SQLite services
src/                React frontend (HUD surfaces)
Scripts/            Automation, agents, routing, health checks
```

---

## Agent Layer

- **Yuri Sentinel** — autonomous daemon (33-min heartbeat), health, memory synthesis
- **Pulse Cortex** — per-turn complexity classification and multi-advisor dispatch
- **Codex** — primary implementation agent under CLAUDE CONTROL PACKET protocol
- **DeepSeek** — analysis and parallel implementation lane
- **GitNexus** — code intelligence: impact analysis, symbol graph, execution flows

Claude Code is the control plane. All agents operate under authority-bounded contracts.

---

## Run Locally

```bash
npm run dev        # frontend — http://localhost:5173
npm run dev:backend  # backend — http://localhost:3004
```

---

*Private repository. YURI-OS-MUSUBI — the place between the stars.*
