# 01 — SCAN REPORT (Phase 1 output)

> Consolidated clean-room scan of 16 GitHub repos vs YURI. Phase 1 of the staged mission (see `00-MASTER-BRIEF.md`).
> Source: 16-agent Anthropic workflow (runId `wf_5e065364-212`, 1.4M tokens, all `fetchedOk:true`, all clean-room attested) + mimo peer cross-check.
> **No design/build yet — this is the scan + verdict for the owner checkpoint.** Nothing ships without Marcel's greenlight.

## How to read

Every repo got a structured card: what it is, architecture, standout mechanisms, license + commercial implication, YURI's existing equivalent (capability-first), the honest delta, and an adopt verdict. Tiers below rank by **(value × market-gap) ÷ effort**, license-gated for commercial ship.

Hard truth up front: **0 of 16 are "adopt wholesale."** 14 are MIT/Apache (clean), 1 is CC-BY-NC (commercial blocker → patterns only), 1 is a hollow fork. Most are *pattern mines*, not dependencies — which is correct: YURI already out-engineers most of these on enforcement. The value is in ~9 specific mechanisms YURI genuinely lacks.

---

## VERDICT TABLE

| # | Repo | License | Tier | Verdict | The one thing worth taking |
|---|------|---------|------|---------|----------------------------|
| 1 | chopratejas/headroom | Apache-2.0 | **1** | BUILD | **CCR reversible compression** (compress + cache original + retrieval sentinel) |
| 2 | NVIDIA/SkillSpector | Apache-2.0 | **1** | BUILD | 16-cat skill threat taxonomy + AST/taint/OSV; **foreign-skill install gate** |
| 3 | colbymchenry/codegraph | MIT | **1** | BUILD | **Never-stale watcher + per-file staleness banner**; provenance-tagged graph edges |
| 4 | backnotprop/plannotator | Apache-2.0 | **1** | BUILD | Human-review plan/diff annotation sublane + **Plan-Diff across resubmissions** |
| 5 | NVIDIA/TensorRT-LLM | Apache-2.0 | 2 | FOLD | Two-stage scheduler + **cost-to-completion reservation admission** |
| 6 | Imbad0202/academic-research-skills | **CC-BY-NC** | 2 | PATTERN-ONLY | Claim-faithfulness grounding + **quantified concession-threshold** protocol |
| 7 | Egonex-AI/Understand-Anything | MIT | 2 | FOLD | **LLM-alias-tolerant schema + auto-fix**; Louvain-community fan-out batching |
| 8 | mvanhorn/last30days-skill | MIT | 2 | FOLD | **Prompt-as-firmware** (LAWs tied to dated failures); resolve-before-search |
| 9 | marianfoo/sap-ai-mcp-servers | MIT | 2 | MINE | **Layered fail-soft license resolver** (4-source + content→SPDX) |
| 10 | addyosmani/agent-skills | MIT | 3 | FOLD | **Anti-rationalization tables** (excuse\|rebuttal) per skill |
| 11 | hardikpandya/stop-slop | MIT | 3 | FOLD | "False agency" rule + negative-listing tell + 5-dim revise-gate |
| 12 | Leonxlnx/taste-skill | MIT | 3 | FOLD | Hex-precise AI-tell blacklist + **countable design-audit gate** |
| 13 | apple/container | Apache-2.0 | 4 | REJECT | (note only) CAuditToken/XPC per-hop caller-identity auth |
| 14 | opencv/opencv | Apache-2.0 | 4 | REJECT | Nothing — every discipline lesson YURI already implements |
| 15 | raullenchai/Rapid-MLX | Apache-2.0 | 4 | REJECT* | cloud_router marginal-token-cost spillover (~50 LOC); *poss. backend swap |
| 16 | danielhanchen/bitsandbytes | MIT | 4 | NOT-ADOPTABLE | Hollow fork (0 original commits); domain YURI excludes |

---

## TIER 1 — BUILD (genuine gaps, license-clean, high leverage)

### 1. headroom → reversible context compression (`CCR`)
- **What it is:** a production content-compression layer (Rust hot path + Python/TS) that shrinks tool outputs / logs / code / RAG chunks 60–95% *before* they reach the model, reversibly. 25.7k★, Apache-2.0, pushed scan-day.
- **The gap:** YURI's `compact-optimizer` is a one-way lossy hint; `tokenmaxxing`/`token-ledger` are spend-discipline + bookkeeping. **YURI has no engine that mechanically shrinks the bytes and can un-drop them.**
- **Take (clean-room):** (a) **CCR** — compress lossily but cache the original + inject a retrieval sentinel `<<ccr:HASH N_offloaded>>` so nothing is permanently lost; the model calls retrieve on demand. This upgrades compaction from destructive to recoverable and fits YURI's "evidence is retrievable" ethos. (b) **CacheAligner** — a detector that flags volatile tokens (UUIDs/timestamps/JWTs) leaking into the KV-cache-hot prefix; YURI states "keep the preamble stable" as prose in CLAUDE.md but has no mechanism enforcing it.
- **Wiring:** `compact-optimizer`, `context-registry.json`, `brain-inject`, the energy-gate token budget.
- **Caveat:** Headroom is Python/Rust/proxy-shaped; YURI is Node/.mjs/hook-shaped → concept transfer, not vendoring.

### 2. SkillSpector → "is this foreign skill safe to install?" gate
- **What it is:** NVIDIA's LangGraph "Semgrep-for-agent-skills" — 16-category threat taxonomy, real AST behavioral analysis, taint source→sink, live OSV.dev CVE lookup, SARIF output, SAFE/CAUTION/DO_NOT_INSTALL verdict. 4k★, Apache-2.0. (Caveat: several analyzers labeled "stub" — headline 64-pattern number partly aspirational.)
- **The gap:** `corpus-security-scan.mjs` is **7-category regex only**; the skill-hash drift gate only guards skills YURI **already authored**. YURI has **no gate for ingesting a hostile foreign skill** — and YURI's own 2026-05 cyber audit already proposed building exactly this. NVIDIA shipped it: build-from-scratch wedge weakened, **upgrade-and-differentiate** path strengthened.
- **Take (clean-room):** the 16-category taxonomy (with severity/remediation strings — facts, not copyrightable code) + the AST/taint/OSV mechanism *designs* → upgrade `corpus-security-scan.mjs`. Add an acquisition-time install gate. SARIF output is table-stakes if YURI ever externalizes this commercially.
- **Wiring:** `corpus-security-scan.mjs`, `capability-scan.mjs`, skill-hash registry.

### 3. codegraph → never-stale index + provenance-tagged edges
- **What it is:** local SQLite+FTS5 code knowledge graph over MCP (tree-sitter, 20+ langs), with native-OS file-watcher auto-sync + heuristic cross-language edge synthesis. MIT, ~48k★, pushed scan-day. **Near-duplicate of YURI's bundled GitNexus** — so the engine is a reject, but three mechanisms run the *other* way.
- **The gap (the steal):** **staleness handling.** codegraph stays fresh-by-default (FSEvents/inotify watcher, debounced re-index) and when a file is mid-reindex it prepends a ⚠️ banner telling the agent to read it directly, plus connect-time content-hash reconciliation. This **directly attacks the exact pain xref-query hit this very session** ("gitnexus 1 commit behind → STALE, structural hits downranked"). YURI goes stale and silently downranks; codegraph stays fresh and signals the residual honestly.
- **Also:** (b) **provenance tags on synthesized/heuristic edges** so the energy gate can *discount guessed dynamic-dispatch hops* — a perfect fit for YURI's claim/evidence discipline applied to graph edges. (c) the eval-tuned finding that *more MCP tools cost agent context*.
- **Wiring:** GitNexus index lifecycle, `xref-query.mjs`, the energy gate.

### 4. plannotator → optional human-review plan/diff sublane
- **What it is:** local browser human-in-the-loop review surface; hooks the **same `PermissionRequest:ExitPlanMode` slot YURI's `plan_dispatch_gate` owns**, but inverts it to a blocking visual annotation step that ships structured markdown feedback back to the agent. 6.2k★, Apache-2.0. Also: Plan-Diff across resubmissions; exit-0/stdout-JSON verdict contract.
- **The gap:** YURI has **zero human-in-the-loop annotation surface** and no plan-diff-across-revisions. Both are real for commercial use (a buyer wants a "review my agent's plan before it runs" surface).
- **Take (clean-room):** a YURI-native optional human-review sublane + Plan-Diff on revision. The exit-0/stdout-JSON contract rhymes with YURI's Lane Result Grammar.
- **⚠ WIRING CONFLICT (red-team flag now):** both want the same ExitPlanMode hook. A human-blocking browser step fights YURI's autonomous lane-routing and continuous-PTY launch shape. → must be **mutually exclusive** with the autonomous routing gate, toggled, never both live.

---

## TIER 2 — FOLD (real, narrower)

- **5. TensorRT-LLM — admission/scheduling shape.** Split scheduling into *capacity admission* (can this fit the budget?) vs *per-tick selection* (what runs now); add a **no-partial-admit cost-to-completion reservation** before dispatch. YURI's governor caps by concurrency *count*, not reserved token/money cost — and Marcel burns 40M+ tok/mo against real weekly caps. GPU internals (kernels, KV transceiver, batching) irrelevant. Fold into `llm-compat-contract` + `local-concurrency.mjs`.
- **6. academic-research-skills — claim grounding + concession protocol.** *CC-BY-NC: commercial blocker → patterns only, never copy.* (a) claim-faithfulness verification against external authoritative indexes turns YURI's abstract claim-cortex into a real anti-hallucination engine *if* a research/citation deliverable lane ships. (b) **quantified Devil's-Advocate concession-threshold** (must score a rebuttal ≥4 to concede, no consecutive concessions, frame-lock detection) — a testable upgrade to `adversarial-verification`/`shura`, which assert adversarial stance but have no concession-resistance metric.
- **7. Understand-Anything — trust-LLM-structure safely.** **Alias-tolerant schema + sanitize/auto-fix-before-validate** (maps LLM-hallucinated enum variants back to canonical, clamps ranges) → directly transferable to `yuri-decode`/`graph-unify`. Plus **Louvain-community batching** of LLM fan-out (cluster work by import-graph community before dispatch) — a concrete upgrade to YURI's flat fan-out.
- **8. last30days-skill — prompt-as-firmware.** Maps to **sales-intel (coldAcquisition) + deep-research, NOT EOT** (brief framing was wrong). Best transferable discipline: **prompt-as-firmware** — each skill LAW annotated with the exact dated production run where the model violated it + the structural fix. Direct answer to YURI's skill-contract drift + brain-inject anchoring. Also: resolve-before-search entity resolution; engagement-weight vectors + per-author-cap diversity on top of RRF.
- **9. sap-ai-mcp-servers — license resolver.** Repo is an awesome-list, **not connector code** (brief was wrong). The mineable piece: a **layered fail-soft license resolver** (REST → /license → raw LICENSE text→SPDX inferencer → HTML scrape) — sharpens *this scanner's own* license accuracy, which today leans on a single GitHub-API field. Bookmark the SAP MCP landscape map *if* an enterprise SAP surface is ever pursued.

---

## TIER 3 — FOLD (convention, ~15 min each, all MIT)

- **10. agent-skills (Addy Osmani) — anti-rationalization tables.** A 2-col `excuse | rebuttal` table baked into every skill's anatomy, targeting the model talking itself out of discipline. Zero-dep, prompt-only. Fold the convention into `skill-creation.md`. ~70% of the rest overlaps what YURI already has with stronger deterministic enforcement.
- **11. stop-slop — 3 missing prose axes.** Pure content. Fold into `feedback-ai-slop-catalog`: (a) **"false agency"** (inanimate subjects doing human verbs → name the human actor), (b) negative-listing/rhetorical-striptease as a named tell, (c) the 5-dimension scored revise-gate shape. No mechanism to adopt.
- **12. taste-skill — countable design audit.** Hex-precise banned-palette/AI-tell blacklist + a **COUNTABLE pre-flight gate** (eyebrow density, consecutive zigzag sections, em-dash = fail) that could seed a real **executable design-tell linter** — YURI has design skills but no mechanical taste scorer. Fold negative-pattern catalog into `design-principles.md`. Don't let landing-page React rules contaminate HUD/Kagami surface discipline.

---

## TIER 4 — REJECT (capability-first / domain mismatch)

- **13. apple/container** — wrong layer (hypervisor VM isolation vs agent-tool governance), macOS-26-only platform floor, can't ship a VM. Residual note only: CAuditToken/XPC **per-hop caller-identity auth** as a model for hardening the agent-dispatch trust-root beyond today's fail-open lexical guard. Half-day design note, not a project.
- **14. opencv** — domain mismatch (CV pixels); the `visual-introspection` name overlap is a red herring (YURI's is architecture-graph analysis). Every discipline lesson (HAL stable-contract-over-backend, doc-as-taxonomy, maturity-gated promotion, uniform error contract) YURI **already implements** in its own idiom. No delta.
- **15. Rapid-MLX** — orchestration already matched/beaten by `yuri-slm-worker` (governor + single-flight + backpressure) + `llm-compat-queue` (lane ceiling/lease). One net-new idea: **cloud_router's marginal-(post-cache)-token-cost local→cloud spillover** trigger (~50 LOC, additive to llm-compat routing). Separately worth a *deployment* eval later (Ollama→Rapid-MLX backend swap, claimed 2.3× concurrent throughput on identical weights) — but that needs an install, out of scope here.
- **16. bitsandbytes (danielhanchen fork)** — **hollow fork**: `ahead_by:0, behind_by:4, total_commits:0`, README byte-identical to upstream. GPU model-training domain YURI explicitly excludes. Only transferable idea (per-block-local normalization so a spike doesn't flatten dynamic range) is **already covered** by computeU's L∞ max-severity term + per-claim non-offsettability. Track upstream only if YURI ever enters local-model cost modeling.

---

## CROSS-REPO PATTERNS

1. **Trending repos independently triangulate YURI's three real weak spots:** one-way compaction (headroom), index staleness (codegraph), foreign-skill security (SkillSpector). When three unrelated hot repos point at the same gaps, those gaps are real — prioritize them.
2. **"Discipline as countable rules, not vibes"** recurs across last30days (prompt-as-firmware), agent-skills (anti-rationalization tables), taste-skill (countable pre-flight), stop-slop (5-dim rubric), academic-research (FNR/FPR gold sets). YURI already does this in claim/energy gates; the pattern wants to extend into **skills, design, and prose**.
3. **Staleness/provenance honesty as a shared value** — codegraph banners, last30days stale-clone check, Understand gitCommitHash, codegraph heuristic-edge tags. The common instinct: *signal the residual instead of silently serving a stale/guessed answer.* Maps cleanly onto YURI's claim-vs-evidence doctrine.
4. **Multi-harness distribution** (last30days, agent-skills, Understand, plannotator, codegraph) drives the big star counts — and is **irrelevant to YURI** (closed single-operator OS). Don't be dazzled by stars; several 40k★ repos are thinner on engineering than they look.
5. **License reality for commercial ship:** 14/16 permissive (MIT/Apache = safe). **1 hard blocker** (academic-research, CC-BY-NC → patterns only). **1 hollow** (bitsandbytes fork). YURI has no robust license-attribution helper today — patch #9 fixes that for future scans.

## COMMERCIAL-READINESS GAPS (what specifically gates a launch)

- **Foreign-skill security gate** (SkillSpector) — shipping a skill ecosystem commercially without an install-time security verdict is a liability. Highest commercial urgency.
- **Reversible context compression** (headroom CCR) — token economics at scale is a direct cost line; recoverable compaction is a selling point.
- **Human-in-the-loop plan review** (plannotator) — enterprise buyers want a "review before the agent acts" surface; YURI has none.
- **License-attribution hygiene** (sap-ai-mcp resolver) — needed so YURI's own outputs/catalogs are provably clean-room.

---

## CAPABILITY-FIRST PROOF (what we DROPPED because YURI already has it)

Honest accounting — these are *not* gaps; YURI equals or beats them, so they were dropped from the build list:
- **Code-intelligence engine** (codegraph) → GitNexus + xref-query (fused FTS5+circuitry+spectrum) is richer. Kept only the staleness + provenance patterns.
- **CV / discipline lessons** (opencv) → llm-compat-contract, @capability registry, propose→decide→ledger, Evidence Contract Grammar already implement every lesson.
- **Local-lane orchestration** (Rapid-MLX) → yuri-slm-worker + llm-compat-queue match/beat it. Kept only the spillover trigger.
- **Quantization/budget normalization** (bitsandbytes) → computeU L∞ + per-claim non-offsettability already cover the one idea.
- **SDLC skills, verification gates, design intake** (agent-skills, academic-research, taste-skill) → YURI's deterministic hooks/energy-gate/ledger + design-master intake out-enforce their prose. Kept only the specific net-new conventions.

---

## NEXT — OWNER CHECKPOINT

Phase 1 (scan) is done. **Holding for Marcel's greenlight before Phase 2 (plan).** Decision needed:
1. **Confirm the Tier-1 build set** (CCR compression · skill-security gate · staleness+provenance · human-review sublane) — or re-rank.
2. Which to take into the **plan→simulate→build** pipeline first. Recommendation: **SkillSpector upgrade + codegraph staleness** first (highest commercial-urgency × lowest wiring risk), then headroom CCR, then plannotator (carries the ExitPlanMode wiring conflict — needs the most design care).
3. Anything to drop or add.

---

## mimo PEER CROSS-CHECK (verified against local evidence)

mimo ran an independent pass with **live tools** (`xref_query` + `read_file` + `grep` against YURI source). Its capability-first challenges were then **re-verified by direct grep/ls** — because model output is advisory until local evidence confirms (this cuts both ways). Result: mimo went **1-for-3** on its capability-first challenges; its strategic framing is the real prize.

### mimo's capability-first challenges — verified
| mimo claim | Local-evidence verdict | Effect on report |
|------------|------------------------|------------------|
| "claim-cortex doesn't exist — you'd build from scratch" (academic-research #6) | **REFUTED.** `claim-cortex.mjs` + `claim-ledger.mjs` + `claim-integrity-gate.mjs` + `prose-claim-extractor.mjs` are live in `_SYSTEM/Scripts/`, wired into `yuri-energy.mjs`/`energy-tick-core.mjs`. mimo's grep missed them. | #6 stays an **upgrade** (add external-source grounding *onto* the existing cortex), not a build-from-scratch. License block (CC-BY-NC) still holds → patterns only. |
| "plan_dispatch_gate conflict is bogus — gate doesn't exist" (plannotator #4) | **REFUTED.** `plan_dispatch_gate`/`ExitPlanMode`/`post-plan-dispatch` live in `.claude/hooks/claude-protocol-guard.mjs` + `post-tool-use.js`. mimo grepped only `_SYSTEM/Scripts`, missing `.claude/`. | The ⚠️ ExitPlanMode hook-conflict flag on #4 **STANDS**. plannotator stays the highest-wiring-risk item. |
| "codegraph staleness over-rated — infra already exists" (#3) | **CONFIRMED.** `xref-drift-scan.mjs` exists (+ test); `xref-query.mjs` applies staleness penalties; `task-queue.mjs` does HEAD/stateHash STALE checks; gitnexus hook checks `behind===0`. | **#3 demoted to Tier 1.5 — targeted extension, not a build.** Real gap narrows to: per-file content-hash reconciliation *at query time* (not just HEAD-level drift) + provenance-tagged heuristic edges. ~days, not weeks. |

### mimo's strategic contributions — adopted
- **Single highest-leverage = prompt-as-firmware (#8), as POLICY, today.** Promote out of Tier 2: every skill-authoring rule should tie to a dated real failure + a test against it + versioned failure-anchors → self-healing, regression-proof skill library. Zero code, pure `skill-creation.md` policy. mimo rates this "worth more than half the Tier-1 builds combined." Agreed.
- **Cross-pattern A — "verification-as-infrastructure is the commercial moat."** All four Tier-1 items are verification surfaces (CCR verifies cache stability, SkillSpector verifies foreign-skill safety, codegraph verifies index freshness, plannotator verifies plan quality). **Build filter for the whole mission: does this tighten YURI's deterministic verification of non-deterministic LLM behavior? If yes, build; if not, it waits.**
- **Cross-pattern C — cost-governance is commercial table-stakes.** Promotes the TensorRT cost-to-completion admission gate (#5) from "fold" toward a launch requirement — usage-based pricing needs a budget-reservation gate, not just `token-ledger` tracking.
- **taste-skill (#12) — promote consideration** if a design-review deliverable is part of the commercial offer: a mechanical taste-tell linter becomes a pre-delivery quality gate, not a nice-to-have.

### mimo red-team flags (carry into Phase 2 design)
- **R1 — CCR cache-prefix detection is provider-specific** (Anthropic prompt-caching ≠ OpenAI ≠ local). Decide provider-agnostic (just compression) vs provider-aware (per-provider adapters) before designing.
- **R2 — SkillSpector AST/taint adds a trust dependency.** Avoid "install Semgrep first" — ship a minimal JS-native AST walker for JS/TS + Python + Bash, regex-fallback the rest, to keep the no-install/commercial posture.
- **R3 — cost-reservation can deadlock autonomous workflows** (reserve step 1, discover step 2 exceeds remaining budget → stuck). Needs release-and-reacquire with rollback, not static reservation.
- **R4 — plannotator's absence is an unpriced commercial risk.** Mid-execution human-in-the-loop checkpoints are a sales requirement for regulated verticals (finance/healthcare/legal). If launch targets enterprise, #4 blocks whole verticals.
- **R5 — verification-vs-external-evidence hole.** claim-cortex exists, but it ladders *internal* evidence; the energy gate rejects *transitions*, not *claims against external authoritative sources*. The academic-research grounding pattern (4-index citation verification) is the missing external-grounding layer if YURI claims to be a reliable research/analysis product. (R5's spirit survives the claim-cortex correction.)

### Net verdict shift after cross-check
- **Tier 1 build set holds at 3** (headroom CCR, SkillSpector gate, plannotator sublane); **codegraph drops to Tier 1.5** (targeted xref-drift-scan extension).
- **prompt-as-firmware promoted to "adopt as policy now"** (Tier 0 — zero-code, do immediately on greenlight).
- **cost-admission gate (#5) promoted** toward launch-blocker given usage-based pricing.
- Revised ship order (mimo + verified): **(0) prompt-as-firmware policy → (1) SkillSpector skill-security gate → (2) headroom CCR + cache-prefix detector → (3) cost-to-completion admission gate → (4) codegraph per-file-hash extension → (5) plannotator human-review sublane (most design care, ExitPlanMode conflict).**

