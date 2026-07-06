# YURI: Architectural & Systems Overview
**Classification:** Confidential / Internal Operations
**Purpose:** A comprehensive, in-depth documentation of the YURI Neural Empire—its core systems, capabilities, safety measures, and strategic roadmap.

---

## 1. Executive Summary: What is YURI?

YURI is not a typical codebase, a simple wrapper for Claude, or a standard automation tool. It is a **Self-Evolving Neural Empire**—a hyper-automated digital agency operating as a multi-agent swarm. 

Instead of relying on a single AI model to execute tasks sequentially (which leads to context rot and hallucination), YURI breaks complex operational tasks down and distributes them to specialized AI "workers." These workers operate within a strictly governed environment, guided by an autonomous heartbeat, spatial graph memory, and rigorous safety protocols. 

---

## 2. The Core Pantheon (The Swarm Logic)

YURI routes tasks through five foundational sub-systems, known as the Pantheon. Each persona acts as an independent sub-agent with a strict operational boundary.

*   **ENKI (The Strategist):** Handles high-level creative direction, project planning, and the synthesis of client briefs.
*   **YURI (The Architect):** The execution layer. Handles the actual generation of code, file sorting, proxy structure generation, and physical vault construction.
*   **NABU (The Codifier):** The routing intelligence. Determines which specific operational blueprint to use for a given task, estimating token costs, and managing governance.
*   **NISABA (The Measurer):** The deployment goddess. Oversees the sub-agents during execution, measures code quality, and operates the testing protocols.
*   **NOESIS (The Learner):** The background researcher and linter. Wakes up autonomously to analyze execution failures, consolidate rules, and extract new best practices.

---

## 3. Core Architectural Systems

YURI runs on an ecosystem of local Node.js and Python infrastructures that provide it with unprecedented situational awareness.

### 3.1. Spatial Graph Memory (GitNexus)
Standard AI systems "forget" project details when the conversation resets. YURI uses **GitNexus**, a local engine that indexes all 95,000+ files in the vault into a mathematical Graph. 
*   **Impact Analysis:** Before an agent modifies any system, it queries GitNexus to determine the "blast radius" of the change, ensuring it knows exactly what upstream files or downstream clients will be affected.
*   **The Palace Rebuild:** A Python script (`palace-rebuild.py`) runs nightly to extract all standard and Wikilinks across the vault, keeping the graph perfectly synced.

### 3.2. Multimedia RAG & Video Ingestion (VideoDB)
YURI's Retrieval-Augmented Generation (RAG) is not limited to text. Using the local **VideoDB** skill integration, YURI can native ingest raw video files, YouTube URLs, and RTSP live streams.
*   **Capabilities:** The swarm automatically transcribes audio, builds semantic scene indexes, and pulls exact timestamps from ingested media.

### 3.3. Autonomous Execution (EvoNexus Heartbeat)
YURI is biologically active. It does not wait for a user prompt to function.
*   **The Pulse:** A Node.js background scheduler (`heartbeat-scheduler.js`) runs a `setInterval` loop. Every 4 hours, it wakes up the NOESIS Linter to perform background maintenance, clean up redundant code, and generate Daily Briefings inside `HOME.md`.

---

## 4. Safety Measures & Governance

Deploying autonomous agents carries the risk of recursive looping, token exhaustion, or codebase corruption. YURI employs military-grade safeguards.

### 4.1. The "Aversion Memory" Protocol
When an agent fails a task, the system does not simply roll back the code. Before rewinding, a NOESIS sub-agent extracts the exact reason for the failure and permanently writes it to the **Aversion Memory** log. This inoculates the entire swarm against making the same architectural mistake twice.

### 4.2. Adversarial Quality Loops (OBLITERATUS)
Standard QA bots suffer from compliance bias—they want to tell the user the code is good. For high-stakes operations, YURI spawns an **OBLITERATUS-inspired Adversarial Agent**. This agent's sole instruction is to ruthlessly attack the logic, find catastrophic vulnerabilities, and try to break the system without polite constraints.

### 4.3. Autonomous Token & Budget Control
Operating an AI swarm costs money (API Tokens). Project 0 implemented a fully autonomous real-time token tracking system.
*   **Hooks:** Six separate Node.js scripts intercept every tool use, tracking token expenditures in real-time.
*   **Caps:** If a sub-agent enters a recursive loop or exceeds the allocated dollar budget for the session, the system automatically terminates the process, preventing runway API costs.

---

## 5. Active Implementations

*   **Automated Routines:** Two executable routines (`morning-briefing.js` and `graph-optimizer.js`) actively manage the health of the vault and provide the user with daily action summaries.
*   **Node.js Lifecycle Hooks:** The system tracks the exact start and stop times of every active agent within the `.claude/hooks/` architecture, providing a live registry of "who" is working on what.

---

## 6. Strategic Roadmap (The Next 90 Days)

### PROJECT 4: The EvoNexus Vessel (Physical Dashboard)
Currently, YURI operates via the command line and Markdown documents. The immediate trajectory is to construct the **EvoNexus Vessel**—a fully visual, interactive app (Electron/Next.js) acting as the Command Center. This will allow Marcel to visually track the Swarm, view the GitNexus node map, and drag-and-drop workflows in real time.
