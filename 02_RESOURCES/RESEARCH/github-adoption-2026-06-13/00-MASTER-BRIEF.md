# MASTER BRIEF — GitHub Competitive-Intel → YURI Adoption Mission

> **This is the single source of truth for every spawn on this mission.**
> Any agent (Anthropic, mimo, future phase worker) MUST read this file FIRST and operate from it.
> Created 2026-06-13. Owner: Marcel Spatz. Lane: Claude/Opus (router + verifier + finalizer).
> Status: LIVE. Update the Status Log at the bottom as phases close.

---

## 1. MISSION

Go through selected + trending GitHub repos, deep-scan them clean-room, compare each against YURI's existing mechanisms, find anything they do **genuinely better**, and adopt it as a YURI-native rebuild — **never a copy**. Goal is to close market gaps and **prepare YURI for commercial use soon**.

Marcel's exact framing: *"improve yuri with this online research on github. dont be shallow, i want depth and precision. if there is anything that was done better than we have, adopt it and learn. nothing copied. prepare yuri for commercial use soon. when implementing, always crossreference everything, simulate with quantum simulation, the wiring has to be attacked, the idea and build red team treated, hardened stress tested and hardened again then shipped."*

**Quality over speed. Depth over breadth. Honest verdicts over hype.** A trendy repo that is worse than what YURI already has gets called out, not adopted.

---

## 2. STAGED FLOW (owner-checkpointed — do NOT run straight through)

Marcel's sequence: **scan → [CHECKPOINT] → plan → simulate → refine → build → test → red-team → ship.**

| Phase | What | Gate |
|-------|------|------|
| 1. SCAN | Fetch + understand each repo; structured card; license; YURI-relevance + capability-first delta | Anthropic agents (have github + tools) |
| — CHECKPOINT — | Consolidate scan report, present to Marcel, **HOLD for greenlight** | **Owner gate** |
| 2. PLAN | Clean-room YURI-native adoption blueprints for greenlit items; exact wiring points | mimo peer + Anthropic |
| 3. SIMULATE | Quantum-hypothesis sim on adoption decisions (order-effects / non-commuting); izanagi counterfactuals on high-stakes | quantum-hypothesis-tracker.mjs |
| 4. REFINE | Fold sim + cross-ref findings back into the design | — |
| 5. BUILD | Implement greenlit items | **Owner gate per item** |
| 6. TEST | Verify each build against local evidence (real runs, not happy-path) | — |
| 7. RED-TEAM | Attack wiring + idea + build; stress-test; harden; harden again | adversarial-verification, shura |
| 8. SHIP | Owner approves; commit authority stays with Marcel | **Owner gate** |

Nothing auto-ships. No commit/push without explicit Marcel approval.

---

## 3. THE 16 TARGETS

| # | Repo | Domain | YURI subsystem it maps to |
|---|------|--------|---------------------------|
| 1 | backnotprop/plannotator | planning / plan-annotation | ExitPlanMode, plan_dispatch_gate, ai route-plan, writing/executing-plans, claude-protocol-guard |
| 2 | mvanhorn/last30days-skill | recency / activity-summary skill | EOT closeout, memory recall, openprocess-pool, session continuity, git-log synthesis |
| 3 | apple/container | OS-level containerization / sandboxing (Swift, macOS) | execution-domain-core, worktree isolation, bash-security-guard, protected-path deny-list, infinity-guard |
| 4 | chopratejas/headroom | LLM context / token headroom mgmt | tokenmaxxing, compact-optimizer, context-registry, brain-inject, energy-gate token budget |
| 5 | NVIDIA/SkillSpector | agent-skill inspection / static analysis | capability-scan.mjs, yuri-skill-loader, capabilities.json, skill-hash drift gate |
| 6 | NVIDIA/TensorRT-LLM | LLM inference optimization (GPU) — **patterns only, NOT GPU kernels** | llm-compat-contract, lane routing, concurrency governor |
| 7 | addyosmani/agent-skills | curated agent-skills library | .claude/skills taxonomy, triggers/frontmatter, command aliases, skill-creation.md |
| 8 | opencv/opencv | computer-vision lib — **LOW adoptability, mine API-discipline only** | visual-introspection (do NOT vendor CV code) |
| 9 | colbymchenry/codegraph | code-graph / code intelligence | GitNexus, circuitry graph, xref-query, propagation-scan, FTS5 index |
| 10 | Egonex-AI/Understand-Anything | comprehension / explain-anything | yuri-decode organ, codebase-to-course, cross-reference-navigation, brain-dump-decoder |
| 11 | Imbad0202/academic-research-skills | academic research skill pack | research_pipeline, deep-research, research-artifact-factory, ai search (FTS5 ~38k docs) |
| 12 | hardikpandya/stop-slop | anti-AI-slop quality gate | ai-slop-catalog, energy gate, claim-evidence ledger, prose-claim-extractor-3b, persona AI-slop floor |
| 13 | Leonxlnx/taste-skill | aesthetic taste / design judgment | design-master, frontend-design, japanese-aesthetics, layout=Ma, taste rules |
| 14 | raullenchai/Rapid-MLX | rapid Apple-Silicon (MLX) LLM inf/finetune — **orchestration patterns only** | qwen-local lane, gpt-oss-local-runtime, llm-compat local routing, concurrency governor |
| 15 | danielhanchen/bitsandbytes | quantization / mem-efficient compute (Unsloth fork) — **discipline only, YURI doesn't train** | energy/token budget accounting, computeU |
| 16 | marianfoo/sap-ai-mcp-servers | enterprise MCP servers (SAP AI) — commercial connector architecture | MCP integration (gitnexus MCP, claude_ai connectors), llm-compat, enterprise surface |

---

## 4. HARD CONSTRAINTS (non-negotiable — commercial prep)

- **CLEAN-ROOM.** Observe architecture / mechanisms / data-flow / naming discipline. **Never copy code, never paste source blocks, never reproduce verbatim logic.** Deliverables are YURI-native re-imaginings. Every output carries a clean-room attestation.
- **LICENSE DISCIPLINE.** Record each repo's exact license + commercial implication: `permissive-safe` (MIT/Apache/BSD), `attribution-required`, `copyleft-risk` (GPL/AGPL — contamination hazard), `proprietary-or-restricted` (Apple/NVIDIA custom terms), `no-license-found`. Copyleft/proprietary repos may still be studied for *ideas*, but flag patent/litigation risk for commercial shipping.
- **NO INSTALL, NO CLONE, NO BUILD.** Pure read-only intel. No npm/pip/cargo/swift install. No `git clone`. No building their repos.
- **CAPABILITY-FIRST.** Before proposing any adoption, run `capability-recall.mjs` + `xref-query.mjs`. If YURI already has it, say so and DROP it — propose only the genuine delta. (Mandate: `.claude/rules/capability_first.md`.)
- **PROTECTED PATHS — never read/write:** `backend/data/`, `.claude/state/`, `.claude/history/`, `.claude/file-history/`, `.env`, `node_modules/`, `.amp/`, secrets/keys.
- **OWNER AUTHORITY.** No commit/push without Marcel's explicit approval. No destructive commands. Scope writes to minimum files. HIGH/CRITICAL risk → owner approval first.
- **NO FABRICATION.** If a fetch fails, mark `fetchedOk:false` and say why. An invented scan card is worse than an honest miss. Separate claim from evidence; verify operational claims against live runtime.

---

## 5. LANE REALITY (verified 2026-06-13 — capabilities available to spawns)

| Lane | Status | How | Role |
|------|--------|-----|------|
| **Anthropic agents** (Workflow/Agent) | ✅ working, parallel, full tools | native | **Fetch-scan + reasoning + build.** Only lane with github network + tool use. |
| **mimo** (`mimo-v2.5-pro[1m]`, 1M ctx) | ✅ working | `ai llm mimo "<prompt>" --out <file>` (never `--max` below 131072; never pipe stdout) | **Peer co-analyst + writer.** Pure completion, `--no-tools` — CANNOT fetch. Loads full YURI stack (63KB) → use for independent second-opinion, capability-first grounding, report writing. |
| **deepseek** | ❌ DEAD here | — | `api.deepseek.com` is network-blocked in this sandbox (`AggregateError`, empty out, 2048-token cap). Do not route to it. Reported honestly to Marcel. |

**Network reality:** only `raw.githubusercontent.com` + `api.github.com` are on the curl allow-list. All other domains are hook-gated/blocked. Use `WebFetch` (load via `ToolSearch "select:WebFetch"`) as fallback for rendered github pages.

**Fetch protocol:** `raw.githubusercontent.com/<owner>/<repo>/HEAD/<path>` (HEAD = default branch). Metadata via ONE `api.github.com/repos/<owner>/<repo>` call. Huge repos (opencv, TensorRT-LLM, apple/container, bitsandbytes) → README + top-level structure + 1-2 docs only.

---

## 6. METHODOLOGY / QUALITY BAR

- **Cross-reference everything.** Every claim grounded in YURI evidence (capability ids, file refs, xref nodes). No invented paths/terms/counts.
- **Quantum simulation on decisions.** When adoption-decision evidence is order-sensitive or adopt/reject hypotheses are non-commuting → `quantum-hypothesis-tracker.mjs`. Izanagi counterfactuals on CRITICAL/HIGH-stakes paths.
- **Adversarial red-team.** Attack the wiring (gate conflicts, drift, protected-path violations, bypasses), the idea (is the gap real? is the repo actually better?), the build (clean-room integrity, license, no-install feasibility, scale/edge-cases). Default to skepticism; independent skeptic ≠ the designer.
- **Harden → stress → harden.** First-run success is a hypothesis, not proof.
- **Mechanism over assertion.** Explain what + why, not bare labels. Separate facts / inference / recommendation / blockers.

---

## 7. SPAWN PROTOCOL (how to ensure shared quality)

1. Every spawn reads THIS file first (path in its prompt).
2. Proportional loadout: heavy/architectural tasks get full context; trivial reads stay light (FB:BUILD-AGENT-CONTEXT-LOADOUT).
3. Structured output (schemas defined per phase). Clean-room attestation required on every card/design.
4. mimo gets the relevant fetched material + this brief's constraints injected (it can't read files in a workflow, so feed it inline).
5. Anthropic workflow agents are told to read this file by absolute path:
   `/Users/marcelspatz/YURI-OS-MUSUBI/02_RESOURCES/RESEARCH/github-adoption-2026-06-13/00-MASTER-BRIEF.md`
   (canonical casing is `RESEARCH`; the filesystem is case-insensitive so `research/` resolves to the same dir.)

---

## 8. MISSION ARTIFACTS (this folder)

- `00-MASTER-BRIEF.md` — this file (ground truth)
- `01-SCAN-REPORT.md` — consolidated scan cards (phase 1 output) [pending]
- `02-ADOPTION-BLUEPRINTS.md` — clean-room designs (phase 2) [pending]
- `03-SIM-REDTEAM.md` — quantum-sim + red-team verdicts (phase 3+7) [pending]
- `04-COMMERCIAL-ROADMAP.md` — final prioritized, owner-gated roadmap [pending]

---

## 9. STATUS LOG

- **2026-06-13** — Mission opened. Initial all-in-one workflow (scan+design+redteam+synth) launched then **KILLED** — misaligned with Marcel's staged sequence + missing repos.
- **2026-06-13** — Lanes verified: mimo (`ai llm mimo --out`) ✅; deepseek ❌ network-blocked. Documented in §5.
- **2026-06-13** — Repo set finalized at 16 (13 selected + Rapid-MLX + bitsandbytes + sap-ai-mcp-servers).
- **2026-06-13** — **SCAN phase running** (Workflow runId `wf_5e065364-212`, task `wuhs6lh2r`), 16 clean-room scan agents. Awaiting completion → mimo peer cross-check → owner checkpoint.
- **2026-06-13** — This master brief created at Marcel's standing request (one master doc per multi-spawn mission for shared ground truth).
- **2026-06-13** — SCAN phase COMPLETE. 16/16 cards, all `fetchedOk:true`, all clean-room attested. Consolidated → `01-SCAN-REPORT.md`. Headline: 0/16 adopt-wholesale; 4 Tier-1 builds (headroom CCR reversible-compression, SkillSpector skill-security gate, codegraph staleness+provenance, plannotator human-review sublane); 14/16 permissive license, 1 CC-BY-NC (patterns-only), 1 hollow fork. Agents correctly killed 4 wrong brief framings (last30days≠EOT, sap-ai-mcp≠connector-code, bitsandbytes fork hollow, Rapid-MLX≠finetune).
- **2026-06-13** — mimo peer cross-check DONE (`ai llm mimo`, live xref_query+read_file+grep). Went 1-for-3 on capability-first challenges; its claims re-verified by local grep/ls. REFUTED: "claim-cortex doesn't exist" (it does — claim-cortex/ledger/integrity-gate.mjs live) and "plannotator gate conflict bogus" (plan_dispatch_gate IS in .claude/hooks/claude-protocol-guard.mjs — mimo only grepped _SYSTEM/Scripts). CONFIRMED: codegraph staleness over-rated (xref-drift-scan.mjs + xref-query penalties exist) → demoted to Tier 1.5. Strategic wins adopted: prompt-as-firmware→policy-now; verification-as-infra=moat; cost-governance=launch table-stakes; R1-R5 red-team flags carried to Phase 2. Verdict appended to `01-SCAN-REPORT.md`.
- **2026-06-13** — Phase 1 CLOSED. Marcel GREENLIT ("1+2, go deep on all").
- **2026-06-13** — Phase 2 PLAN+SIM COMPLETE (`wf_99cbe42d-a34`, 13 agents, 1.6M tok). 6 blueprints + independent red-team + quantum-sim. Artifacts: `02-ADOPTION-BLUEPRINTS.md` (build spec), `03-SIM-REDTEAM.md` (sim + 7 cross-cutting risks + owner decisions). Quantum-sim verdict: build order is CLASSICAL file-contention (capabilities.json/skill-hash/closed-schema), NOT quantum-non-commuting (QQ=0) — refused to manufacture an effect. Red-team caught real design defects (false "reuse token-ledger math", 2 invalid RESULT_LABELs, phantom forward-wired code, orphan dual design-principles copy).
- **2026-06-13** — BUILD #1 SHIPPED: firmware-policy (Tier-0, safe-to-build). 4 clean-room edits — skill-creation.md (Step 6 failure-anchor/prompt-as-firmware + Step 7 anti-rationalization POINTING to writing-skills/SKILL.md, capability-first: not duplicated), feedback-ai-slop-catalog.md (+3 axes: false-agency, negative-listing, 5-dim revise-gate), design-principles.md (countable AI-Tell Catalog, canonical skills/ copy; .claude/skills copy is orphan). Self-corrected my own em-dash + "real"-crutch slop in the edits. Verified: no skill-hash drift, no capabilities.json touch, no gate collision.
- **2026-06-13** — CHECKPOINT 2 passed: Marcel "go all out, max reasoning".
- **2026-06-13** — BUILD PHASE COMPLETE (`wf_ebf5e7d0-362`, 5 worktree-isolated builds, 1M tok). All 6 items SHIPPED to main's working tree (UNCOMMITTED — no commit/push per floor). Verification on main: 173 tests green (0 fail), capability-scan --check OK (39 caps), skill-hash drift=0 unregistered=0 (240), 0 conflict markers, all hooks+modules parse, xref-query staleness banner live in smoke test. Integration method: copy new/clean files + `git merge-file` 3-way for main-dirty files (preserved in-flight queryInvariant; 4 union conflicts in xref-query hand-resolved) + capabilities.json regen ONCE on main. Armed states: skill-security ADVISORY, cost-admission DISARMED, human-review ADVISORY, ccr/staleness ACTIVE, firmware-policy policy. Ship record: `04-COMMERCIAL-ROADMAP.md`.
- **2026-06-13** — MISSION COMPLETE pending owner action. Owner-arming decisions (nothing blocks until decided): cost cap USD, human-review hard-block-vs-advisory, skill-security auto-block flip. Marcel holds commit. 5 worktrees persist as rollback (`git worktree remove` after review).
