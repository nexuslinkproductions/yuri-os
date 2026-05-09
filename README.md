# NUDIMMUD — Operator System

**Marcel Spatz · Vienna**

NUDIMMUD is a unified operator system for running creative, technical, and business workflows from a single interface. It combines video production management, AI infrastructure engineering, financial operations, and premium tooling design into one integrated surface — not a collection of vaults, not a second brain, but a command center for multi-domain operation.

---

## Who It Is For

Built for Marcel Spatz, whose work spans video production, AI systems engineering, financial operations, and tooling design across multiple pipelines and geographies. By extension, NUDIMMUD is for anyone running a multi-domain creative or technical operation who needs a single surface to manage projects, dispatch agent workflows, track commitments, and surface live intelligence — without switching contexts across a dozen tools.

---

## Golden Path

Marcel opens the system. The interface shows active projects with real data — current shoot status, ticket load, system health. He inspects a project, dispatches a directive, reviews an AI-generated brief. The system logs the action, updates the relevant module, and the next time he opens it, the surface reflects what changed. Operator acts, system learns, loop continues.

---

## Core Surface

The system exposes a modular interface. The following surfaces are currently available in the UI:

- **NexusLink** — Operations hub, project staging, pipeline overview
- **Chronos** — Timeline and scheduling view
- **Oracle** — AI query and reasoning surface
- **Neural Forge** — Agent orchestration and model interaction
- **Bridge** — System integration and cross-module communication
- **Logos** — Project registry and structured documentation
- **Conclave** — Collaboration monitoring and swarm coordination
- **Tickets** — Task tracking and commitment management
- **Telemetry** — System health, load, sync, and heartbeat monitoring
- **Design Audit** — Visual review and design quality surface
- **Research / Physis** — Research reference and operational physics (resource, constraint, capacity tracking)

Additional sidebar entries (Trading HUD, Catalog, and several esoteric-reference toggles) exist in the interface but are non-core, archival, or belong to separate concerns. They are not part of the active operational surface.

## Root Canon

These files live at vault root by design. They are the system layer, not project content.

- Governance: [AGENTS.md](AGENTS.md), [AEONIC_PROTOCOL.md](AEONIC_PROTOCOL.md), [CODEX_PROTOCOL.md](CODEX_PROTOCOL.md), [LOCAL_EXECUTION_POLICY.md](LOCAL_EXECUTION_POLICY.md), [NEURAL_FORGE.md](NEURAL_FORGE.md), [YURI.md](YURI.md)
- Identity and memory: [identity.md](identity.md), [enki_state.md](enki_state.md), [memory-core.md](memory-core.md), [session_log.md](session_log.md), [session_prompt.md](session_prompt.md), [SOUL.md](SOUL.md), [USER.md](USER.md), [TOOLS.md](TOOLS.md)
- Doctrine and logs: [CLAUDE.md](CLAUDE.md), [CONCLAVE_COGNITIVE_LOG.md](CONCLAVE_COGNITIVE_LOG.md), [creative_codex.md](creative_codex.md), [DESIGN.md](DESIGN.md), [esoteric_codex.md](esoteric_codex.md), [GEMINI.md](GEMINI.md), [geopolitical_log.md](geopolitical_log.md), [HEARTBEAT.md](HEARTBEAT.md), [language_codex.md](language_codex.md), [nabu.md](nabu.md), [NUDIMMUD_AUDIT_README.md](NUDIMMUD_AUDIT_README.md)
- Navigation: [README.md](README.md), [STRUCTURE.md](STRUCTURE.md)

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite |
| Backend | Node.js, Express |
| Database | SQLite |
| Real-time | WebSocket |
| Animation | Framer Motion |
| 3D | Three.js, @react-three/fiber, @react-three/drei |

---

## Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

**NUDIMMUD means "the place between the stars."** A system that unifies operations across domains, seasons, and collaborators.
