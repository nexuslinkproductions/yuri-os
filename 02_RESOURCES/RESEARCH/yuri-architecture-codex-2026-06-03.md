# YURI Architecture Codex — Complete Circuit-Level Map (2026-06-03)

**The single source of truth for how YURI is wired.** Built from a 10-agent circuit-level dissection (fire-order, call-graph, data-flow, brain+spine, loops, energy-pipeline, dormancy/gaps) cross-referenced with the 267-mechanism spectrum. Indexed in the FTS5 corpus — `ai search "<topic>"` retrieves any part.

> **Root finding (the thesis of this whole document):** YURI is **~built, ~half-wired.** 267 mechanisms exist; *observability is live* (traces collected, state snapshotted); but *enforcement and the closed feedback loops are dormant* — built but never activated. The architecture works; it needs **activation + closed-loop wiring**, much of it low-effort. The hard part is done.

---

## 1. The shape (the spine made LOUD)

YURI is not a skills harness. It is a **nervous system** with four organs wrapped around any agent runtime:
- **The Spine — the Symbiotic Pulse.** A micro-gate that fires on *every visible input* (user msg, self-proposal, tool result, docked-LLM output): source → decode intent → rank authority → notice risk → separate claims-from-evidence → choose continue/verify/ask/block. Most of YURI's safety and correctness comes from this silent gate running everywhere — it is the substrate that makes everything else trustworthy.
- **The Brain — `brain-inject`.** Assembles the `<yuri-brain>` context block every session: stable Zone-A (identity, SOUL rules, curated memory, hardware) + volatile Zone-C (live energy/cortex/risk/lane-health). Cache-aware (Zone-A is byte-stable for prompt-cache reuse).
- **The Conscience — the Energy Instrument.** A Lyapunov work-dynamics function measuring ΔU per action (9 epistemic terms, non-offsettable vetoes).
- **The Memory — two-track + FSRS subconscious.** Governed canonical ledger + behavioral auto-memory + a science-curved forgetting/consolidation loop.

The 267 mechanisms (see [mechanism-spectrum-267](yuri-mechanism-spectrum-267-2026-06-03.md)) hang off these four organs across 9 layers.

---

## 2. The heartbeat (fire-order per lifecycle event — the circuit diagram)

This is exactly what fires when, verified from `.claude/settings.json` + the hooks.

**SessionStart** → `token-session-init` (token accounting) → **`brain-inject`** (loads SOUL/MEMORY/cortex/fingerprint/neuron-state/roadmap/geass → injects `<yuri-brain>`) → `musubi-protocol-ingest` (MUSUBI_PROTOCOL.md → session-state) → *async:* `startup-offload` (skills index), `scout-orchestrator` (scout bus), `eot-background-start`.

**UserPromptSubmit** (per turn) → `user-prompt-submit`: detect handoff intent + trivial-skip → spawn **`yuri-recall`** (prior-turn-lag subconscious cue recall, detached) → consume `brain:stale` sentinel → detect skill auto-triggers → emit `<brain-update>` + recall + skill hints + EOT signal.

**SubagentStart** → `soul-persona-inject` (9 SOUL rules → `<soul-persona>`) → `yuri-sentinel-start` (agent observation log). *Every subagent gets the persona — this is why fan-out agents stay on-voice.*

**PreToolUse** (the 11-step gauntlet, every tool) → `pre-tool-gate` (delegation advisory) → **`bash-security-guard`** (download-exec/.env/credential blocks; resolves operator role) → **`operator-write-guard`** (Write/Edit protected-path + role, symlink realpath defense) → `tirith-url-guard` (URL risk) → `claude-protocol-guard` (control-packet/route-plan gates) → `pre-tool-use` (context-pressure → compact hint; memory-bus) → `musubi-protocol-enforce` → **`yuri-risk-lite`** (catastrophic hard-block) → `token-budget-check` → [Grep/Glob/Bash] `gitnexus-hook` → [Agent] `agent-spawn-guard`.

**PostToolUse** → `post-tool-use` (session-state: tools/files/skills) → `scout-orchestrator` → `token-tool-logger` → `session-checkpoint` (30-min snapshot) → **`energy-tick`** (ΔU measurement) → [Bash] gitnexus staleness.

**Stop** → `yuri-sentinel-stop` → `token-session-end` (weekly accumulator) → `memory-session-write` (MEMORY.md) → `token-status` (statusline) → **`yuri-dream`** (build dream prompt → dream-queue).

---

## 3. The 9 layers
Energy & Math (28) · Memory & Subconscious (27) · Retrieval & Knowledge (28) · Governance & Safety (28) · Cognition & Persona (32) · Learning & Continuity (31) · Skills & Orchestration (28) · Token & Session (28) · Hidden/Meta (31). **Full inventory:** [mechanism-spectrum-267](yuri-mechanism-spectrum-267-2026-06-03.md).

---

## 4. State & data-flow (the key artifacts — who writes, who reads)
| Artifact | Written by | Read by | Role |
|---|---|---|---|
| `.claude/state/session-state.json` | token-init, musubi-ingest, post-tool-use | brain-inject, pre-tool-use, risk-lite, scout, session-reflect | live session: ctx%, branch, tools/files/skills, aversions |
| `_SYSTEM/OS_KERNEL/memory.db` | memory-kernel | brain-inject, recall | Track A canonical (156 memories / 4,581 items / 12 consolidations) |
| `~/.claude/projects/*/memory/` | direct Write, memory-session-write | brain-inject, recall | Track B behavioral + MEMORY.md index |
| `_SYSTEM/OS_KERNEL/memory-cold.db` | kagami-consolidator | yuri-recall | subconscious cold store — **EMPTY (0 rows, dormant)** |
| `_SYSTEM/OS_KERNEL/search-index.db` | yuri-search-index | yuri-search / `ai search` | FTS5 corpus (~39k docs) |
| `_SYSTEM/state/energy-trace/*.jsonl` | yuri-energy-trace | study/health/dashboard only | gate verdicts — **no enforcement reader** |
| `_SYSTEM/state/energy-session/*.json` | energy-tick | energy-tick next tick | rolling depth + surprise band |
| `cortex-state.json` / pulse-bus | pulse hooks | brain-inject | cross-turn accumulated risk (30-min decay) |
| `events.jsonl` (Kagami) | memory-kernel etc. | closeout, miners | append-only control-plane log |
| `_SYSTEM/learning/global.md` | *nobody* | brain-inject | learned rules — **EMPTY since 2026-04-19 (broken write-side)** |
| `skill-hash-registry.json` / `skill-index.json` | yuri-skill-loader / hand | skill-loader, agent-index test | skill integrity + canonical index |

---

## 5. The energy pipeline + the enforcement seam (the single most important gap)
**Flow:** PostToolUse → `energy-tick` (gated by `YURI_ENERGY_OBSERVABILITY=1`) → `tickAndTrace` → salience(SKIP/WORK/CRITICAL) → `applyTransition` → `computeU` + `computeDeltaU` + `gateProposal` (hard-veto eta=100 + structural-floor theta=10 + soft-threshold) → decision → Privacy-Gated JSONL trace + session snapshot.

**THE SEAM:** the gate decides accept/reject **in PostToolUse — after the tool already ran.** The verdict is written to trace. **No PreToolUse hook reads it to block.** The protected-path *deny* that actually works is a separate deterministic deny-list (`operator-write-guard` + settings), NOT the energy gate. So the conscience *measures* but does not *act*. Closing it = one new PreToolUse hook that reads the prior verdict/snapshot and returns `{continue:false}` on reject. Only **5 of 9 terms** fire in live traffic (dead: entropy, KL-proper, info-gain, staleness — staleness ζ=0 because evidence carries no `halfLife`).

**Loop status:** session-continuity ✓closed · evidence-credit ✓closed · protected-path veto ⚠partial (computes, doesn't block) · **verdict→enforcement ✗OPEN (the unconnected point).**

---

## 6. DORMANCY REGISTER — built but not wired (the "silently dormant", with effort)
| Component | State | To activate | Effort |
|---|---|---|---|
| **Subconscious consolidator** | LaunchAgent runs daily but `--dry-run` default; cold store 0 rows | set `YURI_SUBCONSCIOUS_EXECUTE=1` in the plist | **LOW** |
| **global.md learning loop** | session-reflect reads corrections, never writes rules; empty since Apr 19 | add aggregate-and-append after journal write (regex/freq, 2+ session confidence, 90-day retire) | **LOW** |
| **Neuron-loop (nightly 9-phase)** | LaunchAgent registered, **0 invocations (exit -1, never ran)** | debug plist (node path/deps: synthesis/fingerprint/hn-digest), force `launchctl start`, verify ledger | **MED** |
| **Energy ACTION mode** | observability-only; verdict never blocks; 4 dead terms | new PreToolUse hook reads verdict → deny on eta veto / advisory on others (graduated); populate dead terms via formula-bank + halfLife | **HIGH** |
| **Anime-DNA gates** (domain/guard/zenkai/pattern/clone) | skills exist, **0 invocations**, no trigger detection | add complexity/risk detection in PreToolUse/UserPromptSubmit to auto-invoke; stage-gate enforcement | **MED** |
| **Lane calibration feedback** | overconfidence_gap computed weekly, routing hardcoded ignores it | offload-contract reads calibration, demotes overconfident lanes | **MED** |
| **Semantic retrieval / cross-domain engine** | embedding infra scaffolded, context-router keyword-only, corpus near-empty | hybrid FTS5+sqlite-vec seam, vector rank alongside BM25 | **HIGH** |
| **Offload runner** | route-plan works, nothing spawns runner | NOTE: native-only op is *retiring* offload — likely intentional-dead; confirm before wiring | **HIGH/moot** |
| **session-checkpoint.json / scout-errors.log** | silent writes, no readers, no rotation | add hung-session reader + log rotation, or remove writes | **LOW** |

---

## 7. BROKEN / BUGS register
1. **`session-reflect.js:93-98` dedup bug — HIGH.** Unanchored `.replace('## Session Notes\n', ...)` re-appends notes every Stop → 12 duplicate blocks per SKILL.md, ~720 lines spam after ~20 sessions, blocks clean commit. **Fix:** line-based `lines.splice()` anchored insertion. Then one-time cleanup of accumulated spam across the 22 SKILL.md files. *(This is the root cause of the spam we excluded from commit `ce0cfdb0`.)*
2. **26/31 hooks untested — HIGH.** Only 5 have tests (bash-guard, protocol-guard, write-guard, scout-runner, persona-inject). Critical untested: session-reflect, memory-bus, post-tool-use, token-*. Add smoke tests.
3. **`.codex/plugin-creator` churn + `settings.json.bak-cwdfix` orphan — LOW.** Clarify .codex boundary (track/ignore); delete the .bak.

---

## 8. ROADMAP — activation + competitor-adopt (prioritized by effort)
**Quick wins (LOW, do first):** flip subconscious `--execute` · fix session-reflect dedup + clean spam · wire global.md learning write-side · cumulative-trajectory energy metrics (rolling ΔU/reversal-count + halfLife backfill → unlocks the dead ζ term) · document OS-containment seam (sit on OpenShell, YURI already does the work) · delete orphan .bak.
**Medium:** debug neuron-loop plist (revives the whole learning loop) · formula-bank scenario picker → **pluggable evaluator terms** into computeU (NeMo/regex/PII detectors as new terms) · lane-calibration feedback into routing · anime-DNA auto-trigger detection · continuous adversarial red-team wired to neuron-loop phase 1b (revive `yuri-action-mode-study` → feed back into weights) · MCP-transport governance shim.
**High:** **flip the energy gate to enforcing ACTION mode** (graduated ΔU bands deny/steer/warn/log — the #1 strategic lever, turns the moat from measured to active) · hybrid FTS5+sqlite-vec semantic seam · regulatory crosswalk (NIST/ISO/OWASP/MITRE/EU-AI-Act — bites **2026-08-02** — tag energy-trace records to frameworks, monthly compliance export).

**Competitive context** (see [competitive-landscape](yuri-competitive-landscape-code-level-2026-06-03.md)): no competitor has the energy instrument or cognition layer; ResonantOS (closest mirror) is vapor; the field enforces where YURI observes (flip ACTION mode) and has OS sandboxes YURI should complement not rebuild.

---

## 9. How to use this Codex
- **Recall any part:** `ai search "<topic>"` (this doc + the 4 companion research docs are indexed).
- **Companions:** [operating-map](yuri-operating-map-2026-06-03.md) (compact agent reference) · [mechanism-spectrum-267](yuri-mechanism-spectrum-267-2026-06-03.md) · [adaptation-map](yuri-musubi-one-openclaw-adaptation-map-2026-06-03.md) · [competitive-landscape](yuri-competitive-landscape-code-level-2026-06-03.md).
- **For the ship (MUSUBI ONE):** the dormancy register is the activation backlog; the quick-wins make the moat *live* before packaging as the OpenClaw adapter.
