# ENKI_STATE · 2026-04-18

## Focus domains (next 30–90 days)

- ON-SET VIDEO / PHOTOGRAPHY CAPTURE
  - C2MovieZ pipeline is the primary income engine. On-set shoots are now the core deliverable.
  - Build repeatable on-set systems: shot lists, lighting templates, gear checks, metadata protocols.
  - Master the technical execution: exposure, focus, movement, lighting, audio under production pressure.

- VIDEOGRAPHY / PHOTOGRAPHY SKILL DEVELOPMENT
  - Deep learning: cinema and photo capture techniques, lighting design, on-set directing
  - Equipment mastery: camera systems, lens behavior, wireless audio range, gimbal stability, portable lighting
  - Workflow: from brief to shot list to on-set execution to file handoff. No friction.

- INCOME PIPELINE
  - C2MovieZ remains primary — establish on-set shoot cadence + rate structure.
  - planzerfilms: clarify on-set vs. post-production scope. What are they hiring you for?
  - MACL-ONE: determine if this is on-set work or other services. Define deliverables clearly.
  - Track all work in 04_FINANCE. Invoice on shoot completion.

- SELF-IMPROVEMENT SYSTEM
  - Daily capture habit: use `_SYSTEM/Templates/Daily Capture.md`. Focus on on-set learnings.
  - Session log: write DRIFT + INSIGHT entries at every session close.
  - Energy management > volume. One deep prep session beats four shallow ones.

---

## Active projects

- PROJECT -1 — NOESIS · MEMORY + PALACE CONSOLIDATION (COMPLETE, 2026-04-18)
  - Goal: finalize autonomous learning/adaptation cycles; fill empty memory store; consolidate palace state.
  - Completed:
    - [x] Memory system populated: MEMORY.md index + 17 per-file entries (user/feedback/project/reference)
    - [x] Palace MCP file index rebuilt (9,357 files registered, up from 6,276 on Apr 11)
    - [x] Vault hygiene: 30,528 macOS `._*` metadata files backed up (zip, 14MB) and purged — all orphan-list noise removed
    - [x] ENKI_STATE refreshed to current Apr 18 state
    - [x] Session log updated: DRIFT + INSIGHT + NEXT for 2026-04-18
  - Known limitation:
    - `palace-index.md` / `palace.json` still reflect Apr 11 content state — external build script required to regenerate semantic palace (not in working tree). MCP-layer index is current.
  - Status: COMPLETE — memory store live, vault pollution zero, state files current.

- PROJECT 0 — TOKEN TRACKING & EFFICIENCY SYSTEM (AUTONOMOUS, LIVE)
  - Goal: implement fully autonomous real-time token monitoring to achieve 4.08M annual savings.
  - Phase 1 (Baseline) - COMPLETE:
    - [x] Token audit: 10.8M → 6.72M target (38% savings identified)
    - [x] Three governance docs: audit + tracker + regulation policy
    - [x] Monthly template + manual scheduled reminder
  - Phase 2 (Automation) - COMPLETE:
    - [x] Six Node.js hooks deployed (init, tool-logger, budget-check, session-end, aggregate, cleanup)
    - [x] settings.json integrated with SessionStart + PostToolUse + PreToolUse + statusLine hooks
    - [x] Real-time token monitoring active (status line displays usage + budget)
    - [x] Monthly aggregation automated (auto-generates summaries on 28th)
    - [x] Tool deactivation automated (MCPs cleared after sessions)
    - [x] token-orchestrator.sh created for manual control/diagnostics
  - **Status**: FULLY AUTONOMOUS — Zero manual work from now on
  - Operations:
    - Sessions auto-logged (started 2026-04-17)
    - Budget alerts in real-time (console warnings)
    - Monthly summaries auto-generated (28th of each month)
    - Cleanup runs automatically (old sessions deleted)
  - Next: Review first auto-generated summary May 1 → quarterly deep dive June 30

- PROJECT 1 — C2MOVIEZ VAULT INTEGRATION (COMPLETE)
  - Goal: integrate Claudio's vault + establish bidirectional sync protocol.
  - Completed:
    - [x] Cloned c2moviez-vault from GitHub to `06_NETWORK-SYNC/C2MOVIEZ/Database/`
    - [x] Created `_MAPPING.md` (Claudio paths → YURI canonical paths)
    - [x] Updated `_SYNC-STATUS.md` with integration timestamp & metadata
    - [x] Indexed c2moviez data: 18 folders, 200+ files (clients, projects, team, processes)
  - **Status**: LIVE — Database/ is read-only reference layer; active work in `01_PROJECTS/C2MOVIEZ/`
  - Next: monitor for Claudio updates (weekly `git pull` in Database/)

- PROJECT 2 — ON-SET CAPTURE WORKFLOW (C2MOVIEZ PRIMARY)
  - Goal: establish repeatable on-set shoot protocol for C2MovieZ commercial work.
  - Context: Claudio's vault now shows 3+ active video projects (BOV, SHI, GANZ — confirmed on-set scope)
  - Next actions:
    - [ ] Define current shoot cadence: frequency, day-rate, deliverables (from BOV/SHI/GANZ briefs)
    - [ ] Create `01_PROJECTS/C2MOVIEZ/_SHOOT-TEMPLATE.md` (shot list, lighting kit, crew roles)
    - [ ] Build metadata protocol: filename, EXIF, timecode logging, backup drive naming
    - [ ] Confirm equipment list: camera(s), lenses, audio rig, gimbals, lighting

- PROJECT 3 — CLIENT PIPELINE REALIGNMENT
  - Goal: align invoice structure with Claudio's 19-client active base + on-set rates.
  - Context: Claudio's vault maps 21 active clients (6 Tier 1 retainers, 6 Tier 2, 5 Tier 3 + 4 pipeline)
  - Next actions:
    - [ ] Map Claudio's billing structure (rates: CHF 1500/day + 160/h post for content creation)
    - [ ] Set up `04_FINANCE/2026/` invoice structure for on-set work billing
    - [ ] Clarify planzerfilms scope — on-set capture or post-production?
    - [ ] Email MACL-ONE (Cati): define deliverables and delivery format

- PROJECT 4 — THE EVONEXUS VESSEL (APP / PHYSICAL BODY)
  - Goal: In the coming weeks, give EvoNexus an entire physical and interactable body/app that integrates all wildest dreams into one ultimate creation of pure excellence and life.
  - Context: Moving from CLI/Markdown execution to a highly visual, interactive command center interface. Includes Generative Video integration.
  - Constraints: Generative Video Pipelines are for storyboards, moodboards, and style frames ONLY. Do not generate B-roll.
  - Next actions:
    - [ ] Concept visual interface / dashboard framework (Electron, Tauri, or Web)
    - [ ] Map how the 38 agents and YURI Pantheon will physically manifest in the UI
    - [ ] Design interactive RAG/Graph traversal UI

- PROJECT 5 — KNOWLEDGE BASE (LIVE)
  - Goal: Maintain the cross-referenced knowledge vault spanning cosmology, consciousness, communication, synthesis, and operational practice.
  - Status: LIVE — content present; graphify rebuild pending on the vault markdown corpus.
  - Next actions:
    - [ ] Rebuild graphify scoped to YURI vault `.md` files
    - [ ] Add missing `identity.md` references to operational files where needed
    - [ ] Keep noesis-intake.md current before starting new research sessions

---

## Constraints

- Time:
  - **Primary work window: 21:00–05:00** (nocturnal schedule, intentional infrastructure choice)
  - Secondary availability: 11:00–15:00 for admin/comms
  - Known: Mac Studio desktop setup — best for stationary focused work (editing, color, post)
  - On-set work: variable (shoot day coordination, location-dependent)
  - Consideration: client calls + admin can fragment day cycles; protect night block ruthlessly
  - Scheduling rule: anything requiring peak performance defaults to 21:00–04:00 window

- Energy:
  - Current status: stable (nocturnal schedule is sustainable and intentional, not a symptom)
  - Pattern to defend: deep work first (night block), admin/calls second (day cycle)
  - Known drains: fragmented multi-step plans (prefers 1–2 actions per session), context-switching between domains
  - On-set shoots: high-energy, high-focus work; requires recovery time after
  - Energy optimization: depth-first work compounds; shallow task-switching drains more than one deep session

- Money:
  - Financial pressure: stable (C2MovieZ provides consistent primary pipeline)
  - Structure: Austrian EPU — all business billing under Nexus Link: Productions (Erste Bank Austria, account TBD)
  - Invoice cadence: shoot completion → invoice (NET 14 standard)
  - Secondary pipelines: clarifying scope with planzerfilms, MACL-ONE
  - Trading portfolio: dormant (activate phase when cash position allows)
  - Known: No immediate cash pressure. Focus is on establishing repeatable on-set shoot rate structure.

---

## Guidance for YURI

- Prioritize:
  - Keep OREA moving toward delivery. Every session should move the edit or the admin forward.
  - Make systems easier: fewer manual steps, more automatic routing from intake to execution.
  - Skills before new frameworks. Finish what's already started before opening new domains.

- Avoid:
  - Opening new project structures without filling existing ones (6 empty Briefs already exist)
  - Overloading Marcel with multi-step plans when 1-2 actions are what actually moves forward
  - Treating enki_state.md as a monument — update it after each session, not just when it breaks

- Style:
  - One clear action per response. Not a list.
  - Call it when work is being avoided through planning theater.
  - Short, surgical, concrete.
