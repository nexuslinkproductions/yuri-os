# Prep B — Neural-Net + Knowledge-Graph Disposition

*Scope: `_SYSTEM/NEURAL-NETWORK-THESIS.md`, `_SYSTEM/YURI-COGNITION.md`, `_SYSTEM/Scripts/fleet-router-mlp.mjs`, `_SYSTEM/mure/DRILLDOWN_WIRING.md` (§MLP Bandit Contract), `_SYSTEM/Scripts/yuri-knowledge-graph.mjs`, `_SYSTEM/Scripts/yuri-graph-unify.mjs`. All greps excluded `.claude/worktrees/` and `node_modules/`.*

## Part A — Term-by-term wiring disposition

| Term | Classification | Evidence |
|---|---|---|
| **EvoNexus** | PARTIALLY-WIRED (thin) | Only hits: external vendored repo ingested for research (`ingestResearch.ts:25-27`), a cosmetic demo-project seed row (`database.ts:589-630`), a decay-model status string (`liquidMemoryService.ts:45,104-106`). Zero hits in `_SYSTEM/Scripts/` or any of the 16 active `com.yuri*` launchd jobs. |
| **OBLITERATUS** | PARTIALLY-WIRED | Live spec `.claude/agents/yuri-gate.md` (stable alias `obliteratus`) + a die-graph node. **Gap:** zero matches in `_SYSTEM/Scripts/`, `.claude/hooks/`, `.claude/settings.json`; claimed route source `llm-compat-contract.mjs` contains no reference; no hook selects this gate. Prior audit doc: "NO hook \| NO \| NO — metadata only." |
| **NABU** | PARTIALLY-WIRED (distilled successor only) | Full mythology lives only in archived/knowledge-base docs. One live descendant: `_SYSTEM/AGENT_BLUEPRINTS.md` ("distilled from legacy NABU/NISABA," deity framing entirely stripped, zero NABU machinery invoked). |
| **NISABA** | PARTIALLY-WIRED | 8/12 live `.claude/agents/*.md` carry "House: NISABA House NN" as role-flavor metadata only. The real scheduled `neuron-loop.mjs` writes to a `nisaba/learning/` path but its pipeline is architecturally unrelated to anything nisaba-legacy describes. The actual "Seven Houses" swarm/dream/GAN-loop system is 100% archived. |
| **ENKI** | PARTIALLY-WIRED (semantic bait-and-switch) | Live: `.codex/adapters/yuri-offload-mcp.mjs:241` tags memory logs `--agent ENKI` — but per `identity.md:128`, "ENKI-HUMAN: Marcel Spatz" — an attribution string for the **human operator**, not an autonomous agent. The thesis's actual claim (ENKI auto-generates agent files from GitNexus diffs) has zero implementation. |
| **HGCC** | PROSE-ONLY | Exactly 2 hits repo-wide: the thesis doc's own title, and a comment inside already-archived dead code. No class/constant/config/script/graph-node anywhere live. Most isolated, purely decorative term of the set. |
| **Pantheon** | PROSE-ONLY | Informal shorthand only. The one literal candidate (`deities` SQL table) is confirmed EMPTY (0 rows) per the repo's own cutover runbook; that backend was slated for full removal. |

**Aside:** `NOESIS` → `.claude/agents/yuri-linter.md` is the clearest live translation of this mythology (real agent-definition file, registered `"runtime_kind": "scheduled_function"` in `agent-manifest.json`) — but no launchd plist among the 16 active jobs is actually named for it; the only script that ever invoked it is archived. Real identity file, real manifest entry, zero proven live trigger — the strongest single case of the pattern below.

### Does the architecture actually work the way the two docs claim?

- *"I am not a static orchestrator... I am a self-modifying neural network"* (`YURI-COGNITION.md:4`) — **CONFIRMED false as literally stated.** Every session is a stateless LLM invocation reading markdown context at session start (the global CLAUDE.md's own words: "Each session, you wake up fresh. These files are your memory."). No gradient descent over this session's own weights. Conflating "an MLP exists somewhere in this repo" (`fleet-router-mlp.mjs` — narrow, advisory, fleet-dispatch-only) with "I am a neural network" is a category error.
- *"I am updating my core operating system... writing my own cognitive architecture"* (`YURI-COGNITION.md:33`) — **CONFIRMED not realized.** The live global CLAUDE.md has no Aversion Memory, no OBLITERATUS-named QA routing, and GitNexus anchoring is the plain instruction "run `gitnexus_impact` before editing" — not the described paradigm shift. The actual 2026-07-05 rewrite moved the **opposite** direction: leaner, not more mythic subsystems.
- **Direct tension with the persona's own anti-pattern:** persona.md's "Risks to counter" lists, verbatim, "mythic framing outrunning implementation." Both docs assert present-tense operational capability while their own closing section is an unstarted TODO list ("Next Steps for Implementation: 1. Initialize GitNexus Workspace..."). Not hypothetical — `.retired-kagami-2026-07-05/` and `.retired-overseer-2026-07-05/` show this exact failure mode already played out twice, two days before this session.

## Verdict

**RELABEL, do not archive.** Tag both docs with an explicit banner ("UNIMPLEMENTED ROADMAP — zero of the named subsystems are wired; see disposition report") rather than delete, because: (a) every term with a live descendant got there by *stripping the deity framing to plain engineering* (NABU → `AGENT_BLUEPRINTS.md`, NISABA/NOESIS/OBLITERATUS → named-role agent specs with structured contracts, no swarm mythology) — that substitution *pattern* is worth preserving, the mythology is not; (b) archiving erases the paper trail that a genuinely real, differently-named system already does a modest fraction of what these docs imagine. Do NOT keep-as-is: both currently read as present-tense operational claims inside `_SYSTEM/` (same directory as live scripts) — exactly the "broken instructions from unverified aspirational content" risk the 2026-07-05 CLAUDE.md lean-down was created to eliminate.

## Part B — `fleet-router-mlp.mjs`: real current state

**12 input features** (confirmed, cross-confirmed in `DRILLDOWN_WIRING.md:163-178`): `complexity`, `blastRadius`, `capabilityMatch`, `historicalSuccess`, `quotaPressure`, `evidenceDecidability`, `expectedToolTurns`, `recursionDepth`, `isHeavyReasoning`, `isBulkCensus`, `isSecurityAudit`, `isNativeOnly`. Architecture: 12→8 (ReLU, He/Kaiming)→1 linear.

**Armed?** CONFIRMED YES — `_SYSTEM/state/mlp-learn.enabled` exists (0B touch-flag, mtime Jul 6 17:36).

**State files:** `mlp-learn.enabled` (0B, Jul 6); `prediction-ledger.jsonl` (84,156B / 266 lines, Jul 1); `fleet-router-weights.json` (3,262B, Jul 1).

**Trained? CONFIRMED, precisely nuanced.** On-disk weights file is stale `version:1` (predates the Jul-6 fix). Live execution of `node fleet-router-mlp.mjs --weights` returns a completely different `version:2` vector, confirming `loadWeights()` correctly discards the stale v1 file via `initWeights()` re-init (deterministic seeded He/Kaiming) exactly as the fix intends. **Net: the fix is live and correct, but the model is currently practically UNTRAINED** — v1 discarded, no v2 weights persisted yet. 266 ledger rows are available for a fresh training pass via `train-fleet-router-from-ledger.mjs` whenever desired.

**Jul-6 opus-fleet-v2 Fable review (`git show 18322046`) — per-fix live verification:**

| Fix | Claimed | Live? |
|---|---|---|
| C2 CRITICAL — version gate in `loadWeights` | Re-init to v2 on load if stale | **CONFIRMED LIVE** — static read + runtime execution both confirm. |
| H4 HIGH — `applyAffinityMatrix` join/dirname `ReferenceError` | Fixed to `path.join`/`path.dirname` | **CONFIRMED LIVE** — matches diff exactly, nothing else changed in that file. |
| M1 MEDIUM — `STEER_FAMILY.glm` missing `'cline'` | "Added so cline-routed suggestions pass the whitelist" | **CONFIRMED NOT LIVE — commit message oversold the diff.** The commit touches only the H4 line. `STEER_FAMILY` was introduced by an earlier commit (`36ce9fa8`, 17 min prior) already without `'cline'`, and remains that way at HEAD (`company.mjs:293-296`, no uncommitted local edit either). **This specific claimed fix was never applied.** |

Governance posture unaffected: router remains strictly advisory, hard 6-gate charter always overrides its suggestions.

## Part C — `yuri-knowledge-graph.mjs`: BUILT_AT + gitignore facts

**BUILT_AT hardcoding — CONFIRMED genuinely hardcoded**, single literal `const BUILT_AT = '2026-07-04'` at line 43, zero date-computation anywhere in the write path (unlike sibling `yuri-graph-unify.mjs`, which supports `--stamp`). `git log -p -S"BUILT_AT"` shows exactly one commit (`4befac34`, 2026-07-04) ever touched this line — never edited since. **[ORCHESTRATOR NOTE: fixed during this same pass — line 43 now computes `new Date().toISOString().slice(0,10)` dynamically; rebuilt, confirmed `builtAt: 2026-07-07` correctly self-reported.]**

**Gitignore / tracked status:** `git check-ignore` → NOT gitignored (no pattern matches). `git ls-files` → NOT tracked (never committed). `git status --porcelain` → untracked working-tree artifact (693,132B / ~677KB before this pass's rebuild).

**Integration honesty finding (bonus):** `xref-query.mjs` (the "FUSED front-door" CLAUDE.md's Wayfinding section instructs sessions to run first) does **not** import `yuri-knowledge-graph.mjs` at all — the graph is a real, standalone, CLI-queryable artifact, genuinely cited in live prose, but not import-level fused with the other front-door despite both being framed as one retrieval system. Smaller-scale instance of the same "prose says integrated, code says standalone" pattern documented in Part A. Flag as a residual/deferred item, not something this pass should silently paper over or silently fix (out of scope — a real fusion would need its own design pass).
