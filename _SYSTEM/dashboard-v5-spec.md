## CODEX TASK SPEC

Goal: Rebuild /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html as a complete Yuri OS engineering system map. Shows HOW the system operates end-to-end with visual flow. Not a node graph. A live instrument for understanding system operation.

Problem to fix: Current file shows 8 agent hexagons only. Missing: NexusPulse pipeline, Symbiotic Pulse routing, all 12 routing lanes, 3-tier memory + MLM sandbox, hook pipeline, CI/CD gates, launchd services, self-improvement engine. All labels are 8px SVG text unreadable.

OUTPUT: Single file /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html — replace completely.

---

LAYOUT

Scrollable HTML document. Full-width sections stacked vertically. Fixed 48px header. Background #080808. Font: JetBrains Mono throughout, minimum 14px body text. No backdrop-filter. No glass cards. Each section has a 1px top border rgba(212,175,55,0.2). Section header 11px #D4AF37 letter-spacing 0.2em UPPERCASE. Body labels 14px #A8BCC6. Values 14px #F2E9D2. Status dots: #00e5bf RUNNING, #C95A3B THROTTLED/BLOCKED, rgba(255,255,255,0.25) IDLE.

---

SECTION 1 — HEADER (position:fixed, height:48px, z-index:100, background:#080808, border-bottom:1px solid rgba(212,175,55,0.15))

Left: "YURI OS" 14px #D4AF37 · "YURI" 11px #A8BCC6 · "main · ca0df14c" 11px #4A3B32
Right: soak ring SVG (r=12, 32% filled stroke #A8BCC6) · "16/50 SOAK" · "5/5 ●" pulsing #C95A3B · "TIER CRITICAL · PROTOCOL-CHANGE"

---

SECTION 2 — NEXUSPULSE: PER-TURN PIPELINE

Label: "NEXUSPULSE — SYMBIOTIC PULSE CORTEX · per-turn intelligence pipeline · fires on every non-trivial prompt"

Horizontal flow: 7 DOM boxes connected by SVG arrows (left to right, flex-wrap on narrow).

BOX 1 — USER PROMPT: user-prompt-submit.js fires → pulse-orchestrator.mjs spawned detached

BOX 2 — CLASSIFY (offload-contract.mjs):
  TRIVIAL   → [] no advisors · main thread direct
  STANDARD  → [DEEPSEEK] preflight
  COMPLEX   → [DEEPSEEK · OPENCLAW · HERMES_FC · CASSANDRA]
  CRITICAL  → [DEEPSEEK · OPENCLAW · HERMES_FC · CASSANDRA · SWARM · OBLITERATUS]

BOX 3 — ADVISOR FANOUT (parallel · Promise.allSettled):
  DEEPSEEK    model_advisor    deepseek-v4-flash/pro    60s timeout
  OPENCLAW    bridge_advisory  127.0.0.1:18789          60s · HIGH cap · QUARANTINED
  HERMES_FC   native_function  context pressure          no model
  CASSANDRA   native_function  strategic foresight       no model · cassandra-lite.js
  SWARM       swarm_dispatch   flash+pro parallel        60s timeout
  OBLITERATUS native_function  adversarial QA gate       critical only

BOX 4 — PULSE-BUS: ring buffer · 14 slots · 5min TTL · .claude/state/pulse-bus.json · consumed by main thread

BOX 5 — ENKI (main thread): reads pulse-plan.json + bus findings → decides routing + impl → final authority

BOX 6 — CODEX TWO-PHASE GATE: propose → pulse-codex-pending.json → .approved marker → HEAD SHA verify → apply

BOX 7 — BEACON: notify/notify+obsidian · throttled 5/session · pulse-beacon-state.json

Arrows: gold #D4AF37 solid for authority. Dashed animated #1E3A8A for data flow. Use inline SVG with marker-end arrowheads between boxes.

---

SECTION 3 — SYMBIOTIC PULSE: ROUTING LANES

Label: "SYMBIOTIC PULSE — ROUTING LANES · offload-contract.mjs → offload.sh · 12 lanes priority order"

Table or styled list. Columns: priority · lane name · model · type badge · scenario triggers.

1   code-local          qwen2.5-coder:7b         LOCAL    code-change · bug-triage
2   deepseek-v4-flash   deepseek/deepseek-chat   CLOUD    standard advisory · text analysis
3   deepseek-v4-pro     deepseek/deepseek-r1     CLOUD    complex reasoning · protocol review
4   triage-local        qwen2.5:7b               LOCAL    document-synthesis · research
5   summarize-local     qwen2.5:7b               LOCAL    data-extract · summarize
6   gpt-oss             gpt-oss-20b/120b         LOCAL    code-change · ui-change (local GPU)
7   codex-spark         gpt-5.3-codex            CODEX    read-only sandbox · dry-run only
8   codex-mini          gpt-5.4-mini             CODEX    workspace write · impl authority
9   codex               gpt-5.5                  CODEX    full workspace · max reasoning
10  openclaw            09OC deepseek/v4-flash   BRIDGE   bridge-only advisory · quarantined
11  swarm               flash + pro fan-out      SWARM    parallel dual advisory
12  kimi                moonshot/kimi-k2-6       CLOUD    cloud reasoning · long context
--  claude              claude-sonnet-4-6         LAST     last resort · advisory only

Type badge colors: LOCAL #76b900 · CLOUD #00e5bf · CODEX #9B59FF · BRIDGE #C95A3B · SWARM #64d8e6 · LAST rgba(255,255,255,0.3)

---

SECTION 4 — MEMORY ARCHITECTURE

Label: "MEMORY ARCHITECTURE · 3-tier tiered knowledge + SQLite kernel + MLM sandbox"

Three side-by-side tier columns + 2 full-width rows below.

TIER 1 HOT (in-context, instant):
  pulse-plan.json — tier, ensemble, codexPolicy, beacon level
  pulse-bus.json — advisor findings ring: 14 slots, 5min TTL
  Session context — active tool calls, current turn state

TIER 2 WARM (episodic, file reads):
  .claude/eot/ — boot packets, reflection reports, skill patches, ledgers
  session-journal.md — dated entries, compact hints, skill notes
  pulse-archive/ — daily WARN+/CASSANDRA/CORTEX findings with outcome_markers

TIER 3 COLD (semantic, search required):
  system-overlays/karpathy-llm-wiki/ — atomic wiki pages
  _SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/cross-reference-taxonomy.md
  _SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/prevention-rules.md

Full-width — KERNEL: _SYSTEM/OS_KERNEL/memory.db (SQLite) · kernel.py syscalls: mem-log · task-create · task-update · handoff

Full-width — MLM SANDBOX: isolated research zone · unapproved model outputs quarantined · promoted to COLD only after outcome_marker verification · never canonical without local verification

---

SECTION 5 — AGENT HIERARCHY

Label: "AGENT HIERARCHY — 8 canonical agents · authority chain"

Vertical list. Each row: agent ID 14px #D4AF37 · role · runtimeKind badge · authority level · trigger.

ENKI           Control plane — final authority        main-session     unrestricted              always active
OPENCLAW       Bridge advisory (channel surface)      bridge_advisory  HIGH cap · never impl      complex/critical · quarantined
HERMES_FC      Session coherence + context pressure   native_function  always-on                  every PostToolUse
ARGUS          Tool-call sequencing guard             native_function  always-on                  every PostToolUse
OBLITERATUS    Adversarial QA gate                    native_function  pre-promotion blocker       high-stakes only
CASSANDRA      Strategic foresight (no model)         native_function  advisory only               complex/critical
SWARM          Dual DeepSeek flash+pro fan-out        swarm_dispatch   advisory only               critical turns
OC_AGENT       Discord/Telegram channel surface       bridge_advisory  channel-native              channel events

---

SECTION 6 — SESSION LIFECYCLE: HOOK PIPELINE

Label: "SESSION LIFECYCLE — 30+ hooks across 5 phases"

Five columns. Phase label + hook filenames.

STARTUP: yuri-boot.js · token-session-init.js · palace-context-inject.js · soul-persona-inject.js · mnemosyne-seed.js

USER-PROMPT-SUBMIT: pulse-orchestrator.mjs · aeonic-enforce.js · claude-protocol-guard.js · scout-spawn.js · tirith-url-guard.js

PRE-TOOL-USE: bash-security-guard.js · tirith-url-guard.js · agent-spawn-guard.js · gitnexus-impact-check.js · context-gate.js

POST-TOOL-USE: token-tool-logger.js · scout-log-trim.js · session-checkpoint.js · pulse-bus-consume.js · nisaba-argus-dispatch.js

STOP: nisaba-on-stop.js · token-session-end.js · eot-background-start.js · compact-hint-write.js

---

SECTION 7 — CI/CD GATES

Label: "CI/CD GATES — pre-commit + GitNexus + Codex two-phase + Obliteratus"

Horizontal pipeline with pass/fail indicators:

PRE-COMMIT: offload-contract-regression.sh · dispatch-drift-check.sh
GITNEXUS: gitnexus_impact (blast radius before symbol edits) · gitnexus_detect_changes (before commit)
CODEX TWO-PHASE: propose → pulse-codex-pending.json → .approved marker → HEAD SHA verify → apply
OBLITERATUS GATE: required for protocol change · canonical state mutation · protected path · sandbox promotion

---

SECTION 8 — LAUNCHD SERVICES

Label: "LAUNCHD — 7 managed services · com.yuri.*"

Rows. Each: status dot · service name · PID/state · description.

RUNNING  shellservice           PID 816  Oracle terminal shell service · port 3098 · shellService.js
RUNNING  yuri-session-runtime   PID 819  Session runtime orchestrator
RUNNING  wiki-rag               PID 821  RAG search over karpathy wiki atoms
SCHED    lane-health            —        Routing lane health checker · periodic
SCHED    token-digest           —        Session token usage digest · periodic
SCHED    eot-refresh            —        EOT archive refresh · eot-archive.mjs --execute (PATCH 046)
IDLE     ollama-kv              —        Ollama KV cache manager

---

SECTION 9 — SELF-IMPROVEMENT ENGINE

Label: "SELF-IMPROVEMENT ENGINE — soak calibration · EOT pipeline · skill patches"

Sub-block 1 — SOAK CALIBRATION:
  Current: 16/50 turns — arc gauge SVG 32% fill
  Gate at 50: classifier tuning eligible
  Gate at 200+: full calibration loop
  Method: pulse-archive outcome_markers vs CASSANDRA/DEEPSEEK predictions → classifier drift

Sub-block 2 — EOT PIPELINE:
  Phase 1 Evidence inventory · Phase 2 Timeline · Phase 3 Claim audit · Phase 4 Ledger
  Phase 5 Improvement review · Phase 5.5 MANGEKYO hardening · Phase 6 Skill patches
  Phase 7 Self-improvement update · Phase 7.5 LLM-wiki atoms · Phase 8 Boot packet
  Phase 9 Synthesis · Phase 10 pulse-archive promotion
  Workers: Haiku 4.5 run_in_background for mechanical phases · main thread for synthesis

Sub-block 3 — ACTIVE SKILL PATCHES:
  EOT-013: Verify mtime before retry on Codex SKIPPED_OR_RATE_LIMITED
  EOT-014: Force split prompts >100 lines under OUTPUT_CAP into <80-line sub-prompts
  EOT-015: Pre-supply canonical IDs to advisor agents — mark renames forbidden

---

VISUAL RULES (non-negotiable)

Background #080808 everywhere. No white.
Font JetBrains Mono only. 14px minimum ALL body text. 11px section labels only.
Colors: #D4AF37 gold (authority/headers/ENKI) · #1E3A8A blue (data flow) · #A8BCC6 mist (body labels) · #F2E9D2 bone (values) · #C95A3B fire (gates/throttled/quarantine) · #00e5bf cyan (running/live) · #76b900 local · #9B59FF codex · #64d8e6 swarm
Section border-top: 1px solid rgba(212,175,55,0.2). Padding: 32px horizontal, 24px vertical.
NO backdrop-filter. NO box-shadow on sections. NO rounded corners except status badges (2px max).
Hover on section: border-top → rgba(212,175,55,0.5).
Flow arrows in Section 2: SVG polylines with arrowhead marker-end. Gold solid authority. Blue dashed animated data.
Header position:fixed. Main content padding-top:56px.
External: JetBrains Mono from Google Fonts only.
