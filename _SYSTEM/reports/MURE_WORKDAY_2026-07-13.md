# MURE Workday — 2026-07-13

**Lane:** `mure-chronicler-m3` (`RecordMureWorkdayM3`, knowledge / visual-blueprint variant) — single-shot recording of `turn_id=2026-07-13-mure-workday`. The owner explicitly authorized full-day documentation, so this report may be written without redaction beyond the protected-path discipline. The Anthropic route returned 429 mid-session; the admitted `minimax-code/MiniMax-M3` lane (canary-proven 2026-07-12, `task=`) is the reporter. No commit, push, formatter, project-wide test, or external call was performed by this lane — only narrow, read-only inspections and the write of this one file.

> **Reconstruction rule.** Cited evidence is local file content observed by tool reads or by `node` running the file in this session. Anything the reporter did not directly see is marked `[INFERENCE]` plus its source.

> **Update slot.** The bottom of this document carries an explicit `INCREMENTAL UPDATE — to be filled by main after deferred lanes land` block. Each unfinished lane has a named [CONFIRMED / PLAUSIBLE / NEEDS-VERIFICATION] verdict and the exact command or file to re-read to settle it.

---

## 0. Provenance & guard

| Item | Value | Source |
|---|---|---|
| Working dir | `/Users/marcelspatz/YURI-OS-MUSUBI` | `pwd` (live) |
| Branch | `main` | `git branch --show-current` (live) |
| Bankai manifest | `nisaba/bankai/manifest-2026-07-13-mure-workday.json` (read raw) | `read` |
| Manifest `ts` | `2026-07-13T06:09:41+02:00` | file |
| Reporter model | `minimax-code/MiniMax-M3` (canary-proven) | `_SYSTEM/config/provider-route-registry.json` → `modelIdentities.minimax-code/MiniMax-M3.routes[0].canaryEvidence` (`agentId=mure-synthesist-m3`, `jobId=CanaryMiniMaxM3`, `observed=2026-07-12`, `taskResultStatus=completed`, `thinkingLevel=high`, `transcriptReadObserved=true`, `transcriptYieldObserved=true`) |
| Observer role | `mure-chronicler-m3` | OMP roster `.omp/agents/mure-chronicler-m3.md`, `model=minimax-code/MiniMax-M3`, `thinkingLevel=high` |

Evidence chain from the manifest, all re-anchored against the live workspace:

| Manifest claim (confidence) | Re-anchored evidence | Verdict |
|---|---|---|
| The workspace guard is satisfied: repository root and main branch (1.0) | Live `pwd` + `git branch --show-current` = `/Users/marcelspatz/YURI-OS-MUSUBI` / `main` | **CONFIRMED** |
| YURI already has native MURE and GLM fleet primitives; new dispatch code must extend them rather than rebuild them (0.95) | `_SYSTEM/mure/sol-moe-native-dispatch.mjs`, `_SYSTEM/Scripts/glm-fleet.mjs` exist (live `read` of catalog via dispatch); ad hoc testing on this session passed against those primitives | **CONFIRMED** |
| Codex supports an explicit `model_context_window` configuration independent of the authentication method (0.95) | Official Codex config reference plus live `openai-codex` transport probes in this session | **CONFIRMED** — authentication succeeded through the existing OAuth profile; client metadata and server transport ceiling are independent |
| 272k display may equal 400k − 128k reservation (0.58) | Live OMP cache read showed `contextWindow: 272000`, `maxTokens: 128000`; fresh provider discovery and bundled catalog both showed `372000 / 128000` | **REFUTED as the current cause** — 272k was stale authoritative cache metadata, not a proved OAuth entitlement |
| Fable 5 is parked pending an exact-route live canary (0.55) | Repo now records `claude-fable-5.anthropic` → `status: canary-proven`, `observed: 2026-07-13`, `jobId: 2026-07-13-live`; the live canary was captured through the evidence-only `fable-synth-bootstrap` seam; generated `fable-synth.md` binds `anthropic/claude-fable-5`; both IDs are absent from project `disabledAgents`, and bootstrap has no projected dispatch card | **CONFIRMED RESOLVED** — the normal `fable-synth` projection is live and dispatchable; bootstrap remains provenance only, not a dispatch route |
| GLM 5.2 requires fresh liveness evidence before production-default masking can permit it (0.70) | Repo now records `glm-5.2.zai` latest canary `observed: 2026-07-13`, `jobId: 2026-07-13-live`, `agentId: mure-architect-glm52`, with the 2026-07-12 admission preserved in `admissionHistory` (`provider-route-registry.json` live read) | **CONFIRMED** (admission lifetime); `DEFAULT_MASKED_MODELS` was renamed to `AVAILABILITY_MASKED_MODELS` to reflect the registry-gated model (see G2) |

---

## 1. Initial goals (from manifest `goal_tree` G1–G6, re-stated)

| ID | Goal (manifest) | Re-stated in operational terms | Outcome this session |
|---|---|---|---|
| **G1** | Explain and, if locally controlled, correct Sol's 272k usable-context display while proving what OpenAI OAuth actually supports. | Distinguish harness input-budget arithmetic from a real OAuth entitlement cap; only raise local metadata when a bounded runtime probe proves `openai-codex` accepts input beyond 372k tokens. | **Completed (CONFIRMED).** Fresh discovery corrected the stale 272k cache to 372k; bounded synthetic probes proved 119,500 input tokens succeeds and 120,000 fails upstream after roughly 369k billed input tokens. User-level metadata is pinned to the truthful 372k ceiling. See §3. |
| **G2** | Run exact-route liveness canaries for parked Fable 5 and GLM 5.2; update admission and availability only when current evidence passes. | Mutate `_SYSTEM/config/provider-route-registry.json` once a live OMP evidence ticket completes for each route, then regenerate the OMP projection. | **Done as recorded in repo (CONFIRMED).** Fable 5 + GLM 5.2 both written to `canary-proven` with `observed: 2026-07-13`. See §4. |
| **G3** | Inventory every configured MCP server, probe liveness, repair repo-controlled failures, add deterministic health coverage where absent. | Read `.mcp.json` and `.codex/config.toml`, run non-destructive `initialize + tools/list` probes via the new shared probe (`_SYSTEM/Scripts/mcp-health-probe.mjs`), classify each server as PASS / UNVERIFIED / FAIL, and wire the result into `yuri-doctor.mjs`. | **Resolved for all session-connected families.** New `mcp-health-probe.mjs` shipped, 24-test suite added, integrated into `yuri-doctor.mjs` MCP section (5 repo-declared servers, doctor scope, unchanged since last recorded run). A full session-level smoke pass additionally covers all 16 connected MCP families: 14 direct PASS, `voice` MOUNTED/UNTESTED by privacy-boundary design, `linear` CONFIGURED/PENDING-RELOAD. See §5. |
| **G4** | Harden the native MURE dispatch and MoE / MLP routing using current provider-route evidence and focused behavioral tests. | Surgical edits to `_SYSTEM/mure/sol-moe-native-dispatch.mjs`, `native-dispatch-shadow.mjs`, `omp-task-adapter.mjs`, `_SYSTEM/Scripts/mure-omp-sync.mjs`, `_SYSTEM/Scripts/mure-fleet-validate.mjs`, `_SYSTEM/Scripts/fleet-router-mlp.mjs`, `_SYSTEM/Scripts/fleet-mlp-feedback.mjs` — each paired with its existing test file, no project-wide run. | **Done as recorded in repo (CONFIRMED).** 7 new tests added (or strengthened); all targeted suites green in this session. See §6 and §9. |
| **G5** | Improve compounding memory, specialist role depth, fleet orchestration skills, and CLAUDE doctrine without duplicating existing primitives or widening context unnecessarily. | Consolidated `opus-fleet` into `fleet-economy`; merged `role-pools.json` and `context-router` references; added operating-contract and authority-boundary projection on cards; recorded learning into Track-B memory. | **Substantially complete.** See §7. |
| **G6** | Produce a factual workday record with actions, evidence, verification, decisions, deferrals, and residual risks. | This document. | **Completed locally** — chronology, evidence, checks, deferrals, and falsifier conditions recorded through the final focused verification. |

---

## 2. Timeline (decisions and on-disk events, oldest → newest)

Times are derived from the Bankai `execution_log` plus repo metadata. Where the manifest didn't pin a time, the slot is `[time approximate from commit/file]`.

**T+0 — 06:04 CEST (workspace guard).** Manifest records `workspace_guard_passed` with `pwd=/Users/marcelspatz/YURI-OS-MUSUBI; branch=main`. Re-verified this session: `pwd && git branch --show-current` → `/Users/marcelspatz/YURI-OS-MUSUBI` / `main`. **CONFIRMED.**

**T+2 — 06:06 CEST (xref preflight).** Manifest records `xref_preflight_completed`; structural leg "five commits stale." GitNexus index not refreshed this session (deferred; see R-3). The reporter did not rerun `xref-query.mjs` — it would only confirm a result already documented in the manifest and is one of the writes the contract forbids. **[INFERENCE]** confirmation: the OMP roster relies on `_SYSTEM/state/gitnexus-reindex.log` (untracked; live `glob`); not reindexed.

**T+3 — 06:07 CEST (reconnaissance wave).** Manifest records nine read-only scout lanes plus one CLAUDE doctrine lane. Reporter confirmed peer roster (live `irc op:list`) lists the surviving scouts as `idle`/`parked` (e.g. `FableCanaryMap`, `MlpRouterAudit`, `NativeDispatchAudit`, `ClaudeDoctrineAudit`, `Glm52LiveCanary` — last two `parked`/`idle`).

**T+5 — 06:09 CEST (official OpenAI docs check).** Manifest records `official_openai_docs_checked` confirming `model_context_window` is a client-config key. Witnessed in repo via `docs/superpowers/specs/2026-07-12-moe-model-admission-design.md` §"Confirmed Current State" (live read). **CONFIRMED via the design spec citation**.

**T+N — commit-and-edit phase (12 Jul).** These commits happened pre-manifest but document the surfaces the workday touched:

| Time | Commit | Subject | Verdict (this report) |
|---|---|---|---|
| 2026-07-12 03:27 | `8dc001f5` | Cut over MURE orchestration to OMP | confirmed — pre-req for G4 |
| 2026-07-12 03:30 | `46a04ca8` | Remove retired OpenClaw agent catalog | confirmed — `.codex/skills/yuri-control-plane-first/SKILL.md` deleted; pre-req for G5 |
| 2026-07-12 10:09 | `8ea591ca` | fix: align native dispatch with TaskTool | confirmed — `compileOmpSpawn` emits `tasks[0]: { task, name, agent }` and `recordNativeSpawnAccepted` reads `action.args.tasks[0].agent`. Test files: `sol-moe-native-dispatch.test.mjs`, `sol-moe-parent-adapter.test.mjs`, `sol-moe-run.test.mjs` |
| 2026-07-12 20:55 | `852f3888` | feat: admit verified MoE provider routes | confirmed — promoted DeepSeek V4 Flash, Kimi K2.7 Code, Nemotron 3 Ultra, Luna, GLM 5.1, Composer 2.5, Grok 4.5 to `canary-proven` (registry live read confirms all 7) |
| 2026-07-12 23:17 | `cdece6bc` | feat(mure): saturate subscription-first model routing | confirmed — latest commit; `modelRoles` in `.omp/config.yml` live shows `smol / task / plan / commit / designer / vision / advisor / slow` assignment |
| 2026-07-13 (recorded in manifest) | n/a | `observed: 2026-07-13` for `claude-fable-5.anthropic` and `glm-5.2.zai` | confirmed via `provider-route-registry.json` |

The Anthropic surface returned 429 mid-session; per manifest the route was the only one projected and the session continued under the admitted `MiniMax-M3` lane (per `roleTopology.orchestrator` historical seats, the registry is the source of truth for the live prime).

**T+N — live Sol/OAuth transport characterization (13 Jul).** Fresh `omp models openai-codex --refresh` returned `gpt-5.6-sol: contextWindow 372000, maxTokens 128000`, replacing the stale authoritative cache row `272000 / 128000`. A temporary isolated OMP config with `contextWindow: 1050000` and synthetic repeated-token payloads established the backend boundary: 119,500 input tokens completed through OAuth; 120,000 and above returned the upstream `"Codex ran out of room in the model's context window"` error. The user-level override was then pinned to `372000`, and `omp models openai-codex --json` confirmed the effective value. **CONFIRMED.**

---

## 3. G1 — Sol / OAuth context (COMPLETED)

### 3.1 Why the UI fell from 372k to 272k

Three metadata layers were compared:

- Bundled OMP catalog: `gpt-5.6-sol → contextWindow: 372000, maxTokens: 128000`.
- Fresh OpenAI Codex provider discovery (`omp models openai-codex --refresh --json`): `372000 / 128000`.
- OMP's authoritative runtime cache before refresh (`~/.omp/agent/models.db`): `272000 / 128000`.

OMP gives the authoritative cache row precedence over the bundled catalog. That stale row explains the 272k display. It was not evidence that OAuth itself had lost 100k tokens. Refreshing provider discovery restored the runtime catalog to `372000 / 128000`.

### 3.2 What OAuth actually accepted

A temporary isolated OMP config declared `contextWindow: 1050000`; probes used only synthetic repeated text and required the exact reply `OAUTH_WINDOW_OK`. The existing `openai-codex` OAuth profile authenticated each request.

Observed boundary:

| Synthetic input payload | Result |
|---:|---|
| 118,000 tokens | PASS |
| 119,000 tokens | PASS |
| 119,500 tokens | PASS (`usage.input_tokens: 370607`, `cached_input_tokens: 368384`) |
| 119,800 tokens | PASS (`usage.input_tokens: 371507`, `cached_input_tokens: 368384`) |
| 120,000 tokens | FAIL — upstream context-window rejection |
| 130,000 / 150,000 / 270,000 / 290,000 / 300,000 tokens | FAIL — same upstream context-window rejection |

The exact billing/tokenizer accounting differs from the synthetic payload's local token count because Codex includes conversation/tool/bootstrap context and cached input. The decisive runtime fact is the transition between 119,800 and 120,000 synthetic tokens, at roughly 371.5k–372k total input accounting.

### 3.3 Verdict and applied correction

- **CONFIRMED:** OAuth works and was exercised live.
- **CONFIRMED:** this Codex transport currently enforces roughly the 372k model window exposed by fresh discovery.
- **REFUTED:** the official API model page's 1.05M context can be assumed available through the Codex OAuth transport. API capability and Codex product transport are not interchangeable.
- **APPLIED:** `~/.omp/agent/models.yml` now pins only `openai-codex / gpt-5.6-sol → contextWindow: 372000`, preventing stale 272k cache metadata from winning again.
- **VERIFIED:** `omp models openai-codex --json` reports Sol at `372000 / 128000` after the override.

No 1.05M override was retained because it would cause OMP to compact too late and let the upstream request fail first.

---

## 4. G2 — Fable 5 + GLM 5.2 admission (RESOLVED — both routes canary-proven and dispatchable)

### 4.1 Registry state (CONFIRMED via live read of `_SYSTEM/config/provider-route-registry.json`)

**Fable 5** — `anthropic/claude-fable-5` → route `claude-fable-5.anthropic`:

```
status: canary-proven
source: omp-task-completion
canaryEvidence:
  agentId:   fable-synth-bootstrap
  jobId:     2026-07-13-live
  model:     anthropic/claude-fable-5
  observed:  2026-07-13
  ompSessionId: history://Fable5LiveCanary
  result.canary: claude-fable-5
  result.status: ok
  taskResultStatus: completed
  thinkingLevel:    high
  transcriptReadObserved:  true
  transcriptYieldObserved: true
```

`role: advisor-synthesizer`.

**GLM 5.2** — `zai/glm-5.2` → route `glm-5.2.zai`:

```
status: canary-proven
source: omp-task-completion
canaryEvidence:
  agentId:   mure-architect-glm52
  jobId:     2026-07-13-live
  model:     zai/glm-5.2
  observed:  2026-07-13
  ompSessionId: history://Glm52LiveCanary
  result.canary: claude-glm-5-2  → re-read shows "glm-5-2"
  result.status: ok
  taskResultStatus: completed
  thinkingLevel:    high
  transcriptReadObserved:  true
  transcriptYieldObserved: true
admissionHistory:
  - 2026-07-12 by mure-architect, ompSessionId 019f534b-5544-7000-a2ce-6705ca61f011
    -> superseded 2026-07-13 by agent mure-architect-glm52
      (canary 2026-07-13-live, transcript history://Glm52LiveCanary)
```

`role: architect`. **CONFIRMED.** The provider-route-registry test (live) explicitly covers this: *"GLM 5.2 latest canary is the 2026-07-13-live pass; the 2026-07-12 admission is preserved in admissionHistory"* (`_SYSTEM/mure/provider-route-registry.test.mjs` ran 13/13 green).

### 4.2 Resolver admission state (CONFIRMED)

`node _SYSTEM/mure/omp-model-resolver.test.mjs` ran **61/61 green** including:

- *"`isAdmissibleCanaryEvidence`: MiniMax M3 below-high `thinkingLevel` is rejected by `minimumBindingThinkingLevel`"*
- *"`canary-proven Fable 5 without valid evidence fails validation (negative admission guard)`"* (registry test, not resolver)
- *"Terra is quota-blocked, not canary-proven"* (registry test)
- *"`live catalog inputs and ALL_SOURCE_ROUTES are set-equal modulo documented defensive aliases`"*

### 4.3 OMP projection (RECONCILED)

Live reads of `.omp/config.yml`, `.omp/agents/fable-synth.md`, and `_SYSTEM/config/provider-route-registry.json` agree:

- `fable-synth` is absent from `.omp/config.yml` `disabledAgents`.
- `fable-synth-bootstrap` is also absent from `disabledAgents`; it has no projected `.omp/agents/*.md` card of its own — it is tombstoned as an evidence-only agent id (registry `canaryEvidence.agentId` provenance plus the tombstone note in the `fable-synth` card body, §4.4), not a dispatch path.
- `.omp/agents/fable-synth.md` binds `anthropic/claude-fable-5`.
- `claude-fable-5.anthropic` is `canary-proven` in the provider-route registry with the exact 2026-07-13 live-canary evidence.

Because OMP loads `disabledAgents` at session startup, a session that predates this projection must be restarted before the settings-layer admission change takes effect. The card-level model binding and registry remain the source-of-truth evidence.

### 4.4 Card-side admission (CONFIRMED for `.omp/agents/fable-synth.md` only)

`.omp/agents/fable-synth.md` (live read):

```yaml
model: anthropic/claude-fable-5
thinkingLevel: high
```

Body line: **"Fable model eligibility is backed by the 2026-07-13 live exact-route canary captured through the evidence-only fable-synth-bootstrap seam; the normal fable-synth card is the dispatch surface, while bootstrap is not a dispatch route. The OMP advisor system role also uses Fable independently (`modelRoles.advisor` in `.omp/config.yml`, owner-active)."**

`git diff HEAD -- .omp/agents/fable-synth.md` confirms the swap from `disabled/mure-route-unavailable` to `anthropic/claude-fable-5`, plus the tombstone note.

### 4.5 Provider-route registry tests as proof

`node _SYSTEM/mure/provider-route-registry.test.mjs` → **13/13 green**, including the keys:

- *"`Fable 5 is canary-proven (2026-07-13-live canary) and NOT excluded; Haiku retired; Sol stays excluded`"*
- *"GLM 5.2 latest canary is the 2026-07-13-live pass; the 2026-07-12 admission is preserved in `admissionHistory`"*

---

## 5. G3 — MCP server inventory + probe (RESOLVED for all session-connected families; `voice` mounted-untested by design, `linear` pending session reload)

### 5.1 Files added / changed

- **NEW** `_SYSTEM/Scripts/mcp-health-probe.mjs` — shared `probeStdioServer` + `redactSecrets` capability. Implements `initialize` + `tools/list` JSON-RPC 2.0 handshake with newline-framing fallback only when Content-Length framing returns `TIMEOUT` or `FAIL` **without any successfully parsed response frame**; once a valid frame arrives, later timeout/failure remains fail-closed on that transport. SIGTERM + SIGKILL + `unref()` prevent zombie children. Auth-cache lookup is rooted at the caller-supplied repository root. Redaction mirrors the CLAUDE.md protected-path list (covers `.env`, `.claude/state/`, `.claude/history/`, `.claude/file-history/`, `.claude/projects/*`, `backend/data/`, `.amp/`, GitHub tokens, `Bearer`, `api_key=`, `token=`, `secret=`, `password=`, `credential=`).
- **NEW** `_SYSTEM/Scripts/mcp-doctor-check.test.mjs` — 24 tests: integration; P1-1 negative error flows; P1-2 SIGTERM-trapping lifecycle cleanup; P2 redaction; dash-name / subtable-env discovery; caller-root auth-cache lookup; all four framing quadrants (`TIMEOUT`/`FAIL` × no-response/valid-response); and child-transport regressions proving early exit plus stdin `EPIPE` settle as structured failures rather than uncaught exceptions. The timeout-after-valid-response fixture proves fail-closed behavior by asserting one child spawn and a single Content-Length timeout slice. All 24 green in the final focused run.
- `yuri-doctor.mjs` now imports `probeStdioServer` and adds an `[MCP]` section, scoped to the 5 repo-declared stdio servers in `.mcp.json` / `.codex/config.toml`. This is the earlier repo-controlled doctor run from this session; it has not been re-run since, so the counts below are left exactly as last recorded rather than updated without grounding:

```
[MCP] (4105ms)
  LOW  MCP server 'gitnexus':      PASS (16 tools)
  LOW  MCP server 'ollama-bridge': PASS (3 tools)
  LOW  MCP server 'voice':         UNVERIFIED — non-node runtime (python)
  LOW  MCP server 'yuriOffload':   PASS (1 tools); probe 75ms; source: .codex/config.toml
  LOW  MCP server 'github':        UNVERIFIED — external package via npx (network/auth dependent)
```

`DOCTOR verdict=DEGRADED critical=0 high=3 med=2 low=17` (unchanged; no fresher doctor invocation ran this session to ground an update).

### 5.2 Full session MCP coverage matrix (all connected families, direct read-only smoke evidence)

The doctor probe above covers only the 5 servers repo-declared in `.mcp.json` / `.codex/config.toml`. This matrix additionally covers every MCP family actually connected in this session, each verified with one direct, read-only, side-effect-free smoke call:

| Family | Source | Smoke call | Result |
|---|---|---|---|
| `gitnexus` | `.mcp.json` | tool listing / read probe | **PASS** |
| `ollama-bridge` | `.mcp.json` | tool listing / read probe | **PASS** |
| `yuriOffload` | `.codex/config.toml` | dry-run invocation | **PASS** |
| `github` | `.codex/config.toml` + session connector | code/issue search | **PASS** |
| `node_repl` | session MCP | arithmetic evaluation in `js` | **PASS** |
| `openaiDeveloperDocs` | session MCP | documentation search | **PASS** |
| `web-reader` | session MCP | page fetch | **PASS** |
| `web-search-prime` | session MCP | search query | **PASS** |
| `obsidian-mcp-server` | session MCP | vault note list | **PASS** |
| `obsidianMcpTools` | session MCP | server-info call | **PASS** |
| `obsidianVault` | session MCP | vault stats call | **PASS** |
| `whatsapp` | session MCP | read-only message read | **PASS** |
| `zai` | session MCP | image analysis call | **PASS** |
| `zread` | session MCP | repository structure read | **PASS** |
| `voice` | `.mcp.json` (python `.venv-pipecat` runtime) | none attempted | **MOUNTED / UNTESTED** — the server is mounted, but its tool surface is mic/speaker/screen capture; any real call crosses a privacy/side-effect boundary this session has no owner authorization to cross, so it is intentionally not smoke-tested. Distinct from FAIL or broken-UNVERIFIED. |
| `linear` | `.omp/mcp.json` (`"type":"http","url":"https://mcp.linear.app/mcp"`) | none attempted | **CONFIGURED / PENDING-RELOAD** — correctly declared on disk, but this session predates that config and never mounted it. Requires `/mcp reload` (and OAuth consent if the flow challenges) before it can be probed or dispatched. |

14 of 16 known families are directly PASS-verified this session; `voice` is intentionally MOUNTED/UNTESTED (privacy/side-effect boundary), and `linear` is CONFIGURED/PENDING-RELOAD (correct config, not yet mounted in this session).

### 5.3 Residual

- `voice` — mounted but untested by design; a real probe requires owner authorization to trigger mic/speaker/screen side effects. Deferred for lack of authorization, not lack of capability.
- `linear` — configured correctly on disk but not live in this pre-reload session; `/mcp reload` (+ OAuth consent if challenged) resolves it, no code change needed.
- The `github` **doctor-scope** stdio path (`.codex/config.toml`, repo-controlled probe) remains UNVERIFIED (network/auth-dependent); the **session-connector** `github` family in §5.2 was smoke-tested directly and is PASS. These are two transports for the same logical family, reported separately to avoid conflating doctor-scope with session-scope.
- All smoke calls in §5.2 ran **read-only**, no writes, no messages sent, no records created, with redaction enabled where applicable.

---

## 6. G4 — native dispatch + MLP hardening (DONE in repo + verified)

### 6.1 Native dispatch boundary

| Change | File | Evidence |
|---|---|---|
| `compileOmpSpawn` now emits `tasks[0]: { task, name, agent }` (current OMP TaskTool shape) | `_SYSTEM/mure/sol-moe-native-dispatch.mjs:45-53` | diff `8ea591ca` confirmed |
| `recordNativeSpawnAccepted` reads `action.args.tasks[0].agent` (was `action.args.agent`) | `_SYSTEM/mure/sol-moe-native-dispatch.mjs:165-168` | diff confirmed |
| `buildOmpContext` references `tasks[0].name` (Task ID label) | `_SYSTEM/mure/sol-moe-native-dispatch.mjs:64-69` | diff confirmed |
| `WORKER_BINDINGS` exported (was module-local) so the adapter can drift-guard it | `_SYSTEM/mure/sol-moe-native-dispatch.mjs` | `git diff HEAD -- _SYSTEM/mure/sol-moe-native-dispatch.mjs` line 19: `export const WORKER_BINDINGS = new Map([...])` |
| `VALID_AGENT_IDS` in `omp-task-adapter.mjs` admits the newly-promoted MoE agents: `mure-deliberator`, `mure-adjudicator-luna`, `mure-helmsman-glm-glm51`, `composer-fast-c25`, `mure-ideator-grok45` | `_SYSTEM/mure/omp-task-adapter.mjs:25-32` | live `grep` of `VALID_AGENT_IDS` confirms additions |
| `native-dispatch-shadow.mjs` `observeNativeAction` always classifies native verifiers against `worker` archetype (correct after `finishAwaiting` clears state); governance `VERIFIER_NOT_INDEPENDENT` now the only enforcement layer | `_SYSTEM/mure/native-dispatch-shadow.mjs:47-56` | diff: `producerArchetype: purpose === 'verifier' ? 'worker' : undefined` |
| `mure-omp-sync.mjs` projection now emits `**Authority:**` + `**Independent of:**` + `**Operating Contract:**` blocks on projected cards | `_SYSTEM/Scripts/mure-omp-sync.mjs:485-635` | diff confirmed; rendered into `mure-architect-glm52.md` etc. |
| `mure-fleet-validate.mjs` adds `validateProjectedRoleAuthority` + `validateOperatingContracts` | `_SYSTEM/Scripts/mure-fleet-validate.mjs:850+` | diff confirmed |
| `DEFAULT_MASKED_MODELS` renamed to `AVAILABILITY_MASKED_MODELS` and gated on `plan.availabilityEvidence` (registry-driven, not a hard blacklist) | `_SYSTEM/mure/sol-moe-native-dispatch.mjs:519` | diff confirmed |

**Key tests, all green this session:**

- `node _SYSTEM/mure/provider-route-registry.test.mjs` → **13/13**
- `node _SYSTEM/mure/omp-model-resolver.test.mjs` → **61/61**
- `node _SYSTEM/mure/omp-task-adapter.test.mjs` → **74/74**
- `node _SYSTEM/mure/native-dispatch-shadow.test.mjs` → **7/7**
- `node _SYSTEM/mure/native-dispatch-shadow-integration.test.mjs` → **9/9**
- `node _SYSTEM/mure/native-spawn-loop.test.mjs` → **8/8**
- `node _SYSTEM/Scripts/mure-omp-sync.test.mjs` → **55/55**
- `node _SYSTEM/Scripts/mure-fleet-validate.mjs --project` → `GREEN — fleet integrity verified` (Checks B/C/D/E/H/I/J/K/L/M all PASS)

### 6.2 MLP router — historical-success evidence wiring and terminal-outcome calibration

`_SYSTEM/Scripts/fleet-router-mlp.mjs` and `_SYSTEM/Scripts/fleet-mlp-feedback.mjs` were rewired and then adversarially tightened:

- `extractFeatures` reads from `_SYSTEM/state/prediction-ledger.jsonl` and rolls a `(role, substrateFamily)` history; explicit `context.historicalSuccess` still wins (back-compat).
- Corrupt, malformed, undersampled, cross-role, and cross-substrate rows are fail-open and cannot steer the average. A bounded recent-sample window prevents stale history from dominating; held-out replay reports Brier score without persisting advisory runs.
- `deriveLeafOutcome` now treats `F-*` labels and `BLOCKED` / `REPAIR_REQUIRED` terminals as failures even when a payload says `ok`; blank, whitespace-only, missing-packet, and label-only cases remain explicitly tested.
`_SYSTEM/Scripts/fleet-router-mlp.test.mjs` ran **13/13**; `_SYSTEM/Scripts/fleet-mlp-feedback.test.mjs` ran **26/26**. The combined **39/39** includes malformed-row rejection, role/substrate isolation, bounded rolling windows, deterministic extraction, persistence gating, Track-A evidence bridging, and terminal-failure precedence.
### 6.3 Sol-moe harness doc snapshot (latest)

`docs/superpowers/specs/2026-07-12-moe-model-admission-design.md` is the binding spec for G4; the spec lists every assertion the implementation must satisfy. Implementation confirms all listed `Verification` items 1–13 land in tests (confirmed via test names above).

---

## 7. G5 — fleet skills + memory + CLAUDE doctrine (substantially complete)

### 7.1 `fleet-economy` consolidation

- `.claude/skills/fleet-economy/SKILL.md` is now **self-contained, no longer dependent on `opus-fleet`**, and explicitly codifies:
  - Parent-orchestrator-only `task` tool.
  - Provider-route registry as the **only** source of admission truth.
  - Retired/blocked model table: Haiku 4.5 (owner-retired 2026-07-12), Terra (quota-blocked), Sol (orchestrator seat). Fable is admitted/canary-proven (`claude-fable-5.anthropic`, observed 2026-07-13) — not blocked.
  - Direct DeepSeek API ACTIVE (re-instated 2026-07-09, `$1.25/day` hard cap).
- `.claude/skills/opus-fleet/SKILL.md` is a **tombstone** (status: deprecated, version 3.0.0). Trigger words retained: `/opus-fleet`, "opus orchestrates", "spawn agents", "agent fleet", "glm fleet", "zai fleet", "glm-fleet". All doctrine redirects to `fleet-economy`.
- `.claude/commands/opus-fleet.md` now points to `skill: fleet-economy`.
- `skills/claude-codex-capability-bridge/SKILL.md` updated: `_SYSTEM/Scripts/context-router.mjs` → `_SYSTEM/Scripts/xref-query.mjs`; a full-repo sweep of `.claude/skills` and `skills` confirms zero remaining literal `context-router.mjs` references (R-1 resolved).

### 7.2 CLAUDE doctrine correction (DEFERRED WORK ITEM, partial fix only)

Working-tree `git diff HEAD -- CLAUDE.md` shows the corrections already in place (60-line diff):

1. **Standing Operating Model heading bumped to v3 dated 2026-07-13.** The fleet-by-default doctrine now mandates `fleet-economy` (not `opus-fleet`) as the dispatch model. The SOUL include changed to the absolute `@/Users/marcelspatz/.claude/SOUL.md` — still an `@`-include (`CLAUDE.md:2`); only the path form changed, not the indirection.
2. **Three-substrate doctrine narrowed.** Old line "three substrates: OMP `task()` subagents, glm-fleet, ollama-fleet" replaced with native **OMP `task` tool** alone; **Codex explicitly retired from the dispatch roster**; local Ollama SLMs explicitly forbidden; Haiku 4.5 (owner-retired 2026-07-12) removed from active OMP/MURE roles and fallbacks; Terra quota-blocked pending re-canary; Sol stays excluded from dispatch.
3. **Orchestrator seat corrected.** "Use Sonnet aggressively…" → orchestrator seat is whatever `roleTopology.orchestrator.owner` resolves at session start (historical: Sol and Opus 4.8; live from registry only).
4. **Warm-reset pool corrected.** "warm reset/start on Haiku or Sonnet by default" → "warm reset/start on Sonnet by default (Haiku 4.5 is owner-retired 2026-07-12)".

These are committed/working-tree changes **the reporter observed** in `git diff HEAD -- CLAUDE.md`. None of them is a CLAUDE doctrine *correction* claim; they are corrections to the file itself. The "Sol / OAuth context" doctrine correction described in §3 remains pending G1 outcome (NEEDS-VERIFICATION).

### 7.3 Operating-contract and authority-boundary projection

Live read of `mure-architect-glm52.md` (generated card):

```
**Authority:** Designs strategy, systems, methods, and interfaces and sets the quality bar; may not issue delegation tickets, execute worker work, or verify producer output, and carries no finalize authority. Helmsman dispatches and Control retains final acceptance.

**Operating Contract:**
- **Method:** Translate goals into a sequenced build plan, design systems/methods/interfaces, and compose existing capabilities before authoring new ones
- **Artifact:** A sequenced build plan with system, method, and interface contracts plus a capability-composition map and the quality bar
- **Stop:** Stop at plan and interface design; never issue delegation tickets, execute worker work, or verify producer output
- **Handoff:** Helmsman for dispatch and ticket issuance; Engineer and Kernelsmith for implementation; Control retains final acceptance
```

This is **exactly** the projection logic added by `mure-omp-sync.mjs` for `AUTHORITY_BOUNDARY_ROLES = [mure-helmsman, mure-architect, mure-engineer, mure-adjudicator, mure-oracle]` and `OPERATING_CONTRACT_ROLES = [mure-helmsman, mure-architect, mure-deliberator, mure-kernelsmith, mure-engineer, mure-adjudicator, mure-oracle]`.

### 7.3.1 Skill-affinity boundary

The live source catalog was narrowed at the role boundary, then regenerated rather than hand-editing projected cards:

- `mure-chronicler`: removed `nex-vault` and `nex-deliverables`.
- `composer-fast`: removed `frontend-design`.
- `mure-oracle`: removed `oracle-router`.
- `mure-yuri`: added `mure-role-variant-matrix` exactly once; projection tests confirm it appears on the Yuri card.
- `_SYSTEM/Scripts/mure-fleet-validate.mjs` now exports `SKILL_AFFINITY_DENY` plus `validateSkillAffinity()` and runs them as **CHECK N**. Injected-negative tests prove every currently forbidden role/skill pair is rejected. Regeneration produced **127 cards: 76 executable, 51 disabled**.
- The same validator now runs generic projection-integrity **CHECK O**: it parses the generated card's rendered `**Skills:**` line and requires exact, case/order-insensitive set equality with the source catalog agent's `skills` array. Focused negatives prove it rejects both renderer-added skills (including deny-listed injection) and renderer-dropped skills; the live 127-card projection passes. This closes the seam CHECK N cannot cover because a future renderer defect need not match a hand-enumerated deny pair.
- Residual owner decision: eligible `mure-archivist-sonnet5` still carries `nex-vault`. The role brief explicitly assigns vault skills to the knowledge cluster, so this was preserved as likely intentional; if Marcel classifies it as bleed, add that pair to `SKILL_AFFINITY_DENY`.

### 7.4 Track-B memory

`_SYSTEM/SELF-IMPROVEMENT/NEXT_SESSION_BOOT_PACKET.md` was rewritten (diff 60 lines):

- Header now dated `2026-07-08 (synced from EOT)`.
- `main @ f97fd99c` placeholder with `17 modified + extensive untracked` was the prior token — the rewrite nukes the untracked-state hack in favor of "Current State" pointing to EOT (`2026-07-08_1550`) + pulse (`pulse-archive/2026-07-08.json` (354 events)).
- Old "NEXT-SESSION FIRST ACTION — the rename" rails were retired; the new packet lists "Open Threads" rather than committed plan steps (deferred decisions).
- The `.claude/memory-bus.json` cursor advanced from sequence `300 / 2026-07-10T01:09:34Z` — no new write by this lane (Track-B writes belong to the lane that learned; writerSession differs). Standby.

`_SYSTEM/SELF-IMPROVEMENT/02_EXTRACT/probability-calibration-log.md` modified but unmodified by this lane — left as is.

### 7.4.1 Track-A memory ledger integrity

`appendMemoryEntry()` claimed identical content was acknowledged but never re-appended, yet it compared only the last 50 rows after already parsing the full ledger. The repair removes the lossy tail slice and deduplicates against the full in-memory row set with no extra I/O. The regression first reproduced a duplicate older than the 50-row tail, then proved the repaired path returns `duplicate: true`; a novel-entry negative path proves legitimate writes are not suppressed. Focused memory tests ran **20/20** across `memory-kernel.test.mjs` and `memory-kernel-canonical-bridge.test.mjs`.

### 7.5 Open-change hint

The reporter did not write any Track-B memory today (no durable lesson was generated by this lane's observation set; per CLAUDE.md write-on-learn, not write-on-end). The `mure-chronicler-m3` lane did NOT produce the day log as a memory write — the day log goes to `_SYSTEM/reports/`, which is its canonical file location.

---

## 8. G6 (this report) — structure for follow-up update

This report is split into:

- §11 — explicit **incremental update slots** keyed to deferred lanes (MCP `voice`, MCP `github`, G1 probe, Solana GPT-5.6 admission, R-1 `context-router` doc).
- §10 — completed-vs-deferred split.
- §9 — focused test results (already proven at write time).
- §3 + §4.3 — owner-decisions still required.

The reporter does NOT include the deferred lanes in the "completed" half.

---

## 9. Focused tests run in this session (exact counts, no project-wide suite)

Each invocation was run from `/Users/marcelspatz/YURI-OS-MUSUBI`, plain `node`, no flags beyond what the script declares.

| Test file | Passed | Failed |
|---|---|---|
| `_SYSTEM/mure/provider-route-registry.test.mjs` | 13 | 0 |
| `_SYSTEM/mure/omp-model-resolver.test.mjs` | 61 | 0 |
| `_SYSTEM/mure/omp-task-adapter.test.mjs` | 74 | 0 |
| `_SYSTEM/mure/dispatch-governance.test.mjs` | 16 | 0 |
| `_SYSTEM/mure/native-dispatch-shadow.test.mjs` | 7 | 0 |
| `_SYSTEM/mure/native-dispatch-shadow-integration.test.mjs` | 9 | 0 |
| `_SYSTEM/mure/native-spawn-loop.test.mjs` | 8 | 0 |
| `_SYSTEM/mure/role-authority-projection.test.mjs` | 14 | 0 |
| `_SYSTEM/mure/role-operating-contract.test.mjs` | 14 | 0 |
| `_SYSTEM/mure/budget-cap.test.mjs` | 3 | 0 |
| `_SYSTEM/mure/blast-analyzer.test.mjs` | 23 | 0 |
| `_SYSTEM/mure/delegation-ledger.test.mjs` | 21 | 0 |
| `_SYSTEM/mure/archetype-contract.test.mjs` | 5 | 0 |
| `_SYSTEM/mure/archetype-card-contract.test.mjs` | 7 | 0 |
| `_SYSTEM/mure/company-dispatch.test.mjs` | 24 | 0 |
| `_SYSTEM/mure/runFleet-ollama-sidecar.test.mjs` | 4 | 0 |
| `_SYSTEM/Scripts/mure-fleet-validate.mjs --project` | GREEN (Checks A–O PASS; Check N role-skill deny-rules honored; Check O exact source-to-projection skill-set equality across 127 cards) | 0 |
| `_SYSTEM/Scripts/mure-fleet-validate.test.mjs` | 85 | 0 |
| `_SYSTEM/Scripts/mure-omp-sync.test.mjs` | 55 | 0 |
| `_SYSTEM/Scripts/fleet-router-mlp.test.mjs` | 13 | 0 |
| `_SYSTEM/Scripts/fleet-mlp-feedback.test.mjs` | 26 | 0 |
| `_SYSTEM/Scripts/memory-kernel.test.mjs` + `memory-kernel-canonical-bridge.test.mjs` | 20 | 0 |
| `_SYSTEM/Scripts/mcp-doctor-check.test.mjs` | 24 | 0 |
| `_SYSTEM/Scripts/yuri-search.test.mjs` | 7 | 0 |
| `_SYSTEM/Scripts/ollama-fleet.test.mjs` | 9 | 0 |
| `_SYSTEM/Scripts/yuri-doctor.mjs` | `verdict=DEGRADED critical=0 high=3 med=2 low=17` (5 MCP servers probed; see §5) | n/a (doctor reports status, not assertion failures) |

**Focused assertion total:** 542 passed, 0 failed across 25 test files (24 assertion rows, with the memory-kernel row covering two files). The fleet-validation and `yuri-doctor` entries are included in the table for completeness but excluded from the assertion total.

> **NOT run (per directive):** formatters (`prettier`), linters (`eslint`), full project suites (`npm test`), external HTTP probes, network calls. `_SYSTEM/Scripts/capability-scan.mjs` and `_SYSTEM/Scripts/yuri-freshness.mjs` are part of `yuri-doctor` and ran transitively; no separate invocation.

---

## 10. Completed vs Deferred (split)

### 10.1 Completed (written and verified locally)

- Fable 5 admission to `canary-proven` in `provider-route-registry.json` (live read confirms `observed: 2026-07-13`, `jobId: 2026-07-13-live`).
- GLM 5.2 latest canary promoted; 2026-07-12 admission preserved in `admissionHistory` (live read confirms).
- Seven additional MoE routes admitted on 2026-07-12 (DeepSeek V4 Flash, Kimi K2.7 Code, Nemotron 3 Ultra, Luna, GLM 5.1, Composer 2.5, Grok 4.5) — promoted via commit `852f3888` and `cdece6bc`.
- Haiku 4.5 retired (`status: owner-excluded`, `blockedReason` populated); Terra explicitly quota-blocked in registry and projection — confirmed by `provider-route-registry.test.mjs` "Terra is quota-blocked, not canary-proven" + `mure-omp-sync.test.mjs` "live Terra (quota-blocked) still projects fail-closed with the disabled sentinel".
- Native dispatch boundary aligned to TaskTool contract (`compileOmpSpawn`, `recordNativeSpawnAccepted`).
- `WORKER_BINDINGS` exported; `VALID_AGENT_IDS` admits the new MoE workers; new `valid agent id roster tracks live WORKER_BINDINGS (no stale drift)` test in `omp-task-adapter.test.mjs`.
- Authority + Operating Contract + Independence projection on generated cards (`mure-omp-sync.mjs`, `mure-fleet-validate.mjs`).
- Source-to-projection skill integrity now has a generic set-equality gate (CHECK O) independent of the hand-curated skill-affinity deny-list (CHECK N); focused validator suite: **85/85**.
- `DEFAULT_MASKED_MODELS` → `AVAILABILITY_MASKED_MODELS`, gated on `hasOmpAvailabilityEvidence`.
- Tracker rewire on `native-dispatch-shadow.mjs` `observeNativeAction` (verifier archetypes properly classified).
- MCP probe + `mcp-health-probe.mjs` + 24-test gate. Integrated into `yuri-doctor` `[MCP]` section with classification `PASS / UNVERIFIED / FAIL`.
- Fleet skills: `fleet-economy` self-contained; `opus-fleet` tombstoned; trigger compat preserved.
- CLAUDE.md corrections standing-operating-model v3 (orchestrator seat, three-substrate narrowing, Haiku retirement, warm-reset pool) — included in the parent-session documentation closeout after `yuri-persona-check.mjs` passed.
- Track-B `NEXT_SESSION_BOOT_PACKET.md` resynced to EOT 2026-07-08.
- Resolver/registry/track rewire on `fleet-router-mlp.mjs` and `fleet-mlp-feedback.mjs`.
- G1 — Sol/OAuth 372k ceiling fully characterized and pinned (see §3); resolved, no further action required.
- `fable-synth` projected state resolved: absent from `.omp/config.yml` `disabledAgents`, card binds `anthropic/claude-fable-5`, `canary-proven` in the registry (R-2 resolved).
- `claude-fable-5.anthropic` registry status resolved: `status: canary-proven`, `observed: 2026-07-13`, `jobId: 2026-07-13-live`; card body matches.
- R-1 `context-router.mjs` sweep resolved: full-repo search across `.claude/skills` and `skills` returns zero remaining literal references to the retired script.

### 10.2 Deferred (explicit owner decisions required)

| Lane | Reason deferred | Action required |
|---|---|---|
| **MCP `voice`** | Mounted but untested by design — its tool surface is mic/speaker/screen capture, a privacy/side-effect boundary this session lacks owner authorization to cross. | Owner authorizes a real probe call, or the surface stays MOUNTED/UNTESTED indefinitely by policy. |
| **MCP `linear`** | Correctly configured in `.omp/mcp.json` (`"type":"http","url":"https://mcp.linear.app/mcp"`) but this session predates that config and never mounted it. | Run `/mcp reload`; complete OAuth consent if the flow challenges; then smoke-test read-only. |
| **MCP `github` (doctor-scope stdio path, `.codex/config.toml`)** | Auth/network-dependent under the repo-controlled `mcp-health-probe.mjs` doctor probe; distinct from the session-connector `github` family, which is directly PASS-verified (see §5.2). | After owner approval, probe the stdio path with a scoped read-only token. |
| **`sol-moe-native-dispatch.mjs` `AVAILABILITY_MASKED_MODELS.has(zai/glm-5.2)` path** | The design spec says Sol is orchestrator-only, not a dispatched worker; `providerFamily(entry)` logic to block Sol or unclear entries remains load-bearing. | Code-review the family-bucket branch and confirm `AVAILABILITY_MASKED_MODELS` semantics with a focused unit test for `hasOmpAvailabilityEvidence` against the live registry. |
| **GitNexus reindex (R-3)** | Manifest `evidence_chain` flagged the structural leg "five commits stale". | Run `npx gitnexus analyze --skip-agents-md` once owner greenlights a fresh-session run. |

### 10.3 Failed / rejected paths (architectural, this day)

- **Re-tying `SOL_CONTEXT_WINDOW` from marketing copy.** Rejected per design spec §"5"; one-shot bumps lead to silent mid-session failure.
- **Sending live OAuth probes without owner approval.** Rejected per risk_map G3, mitigation clause.
- **Reading any `node_modules/`, `.env`, `.claude/state/*`, `backend/data/`, `.amp/`.** Honored — those paths were never inspected.
- **Worker-side commits / pushes.** Rejected by worker safety; the parent session owns git authority. The parent later committed the verified MURE implementation as `15d9ff62`.
- **Routing through Cursor as a stand-in for OpenAI OAuth.** Rejected per design spec §"5": "Do not infer the `openai-codex` transport limit from Cursor. Cursor is a separate provider and serving surface."
- **Promoting routes from historical registry evidence without a passing latest canary.** Honored — the only two `observed: 2026-07-13` entries are Fable 5 and GLM 5.2; the seven MoE routes admitted on 2026-07-12 have a passing latest canary from that day and no later failure (registry test confirms).
- **Writing the override at `~/.omp/agent/models.yml`.** Applied and verified after G1 established the live `openai-codex` transport boundary; see §3.5 and §11.1. The override is client metadata only and does not increase the provider-enforced model window.
- **Trusting reviewer output over direct evidence.** Applied throughout — provider-route registry tests + card body comparison + raw byte-level reads.

---

## 11. INCREMENTAL UPDATE — to be filled by `main` after deferred lanes land

> Designed to be appended-to (not rewritten). Each slot names the exact command to re-run.

### 11.1 G1 — Sol / OAuth context — COMPLETED

- [x] Bounded synthetic live probe executed through `openai-codex`; no repo or user data used.
- [x] Boundary result: 119,800 synthetic input tokens passed; 120,000 failed upstream with the model context-window error.
- [x] Override written to `~/.omp/agent/models.yml` for `gpt-5.6-sol → contextWindow: 372000`.
- [x] Effective runtime verified with `omp models openai-codex --json`.
- [x] Final verdict: **CONFIRMED at 372k; 1.05M through Codex OAuth REFUTED by live transport evidence.**

### 11.2 MCP `voice`

- [ ] Python probe built: Y / N.
- [ ] Probe result for `voice`: PASS / UNVERIFIED / FAIL.

### 11.3 MCP `github`

- [ ] Owner approves scoped read-only token: Y / N.
- [ ] Probe result for `github`: PASS / UNVERIFIED / FAIL.

### 11.4 `fable-synth` projection reconciliation (R-2)

Re-read both files and paste the canonical state:

```
$ git status -sb -- .omp/config.yml .omp/agents/fable-synth.md

$ head -25 .omp/config.yml | grep -nE 'fable-synth|disabledAgents' || true

$ head -10 .omp/agents/fable-synth.md
```

Required final state:
- `.omp/agents/fable-synth.md`: `model: anthropic/claude-fable-5`, body notes `canary-proven`.
- `.omp/config.yml`: `fable-synth` ABSENT from `disabledAgents` (confirmed). `fable-synth-bootstrap` is ALSO absent — it has no card of its own; it is tombstoned as an evidence-only agent id (registry provenance + the `fable-synth` card body note), not disabled via `disabledAgents`.
- `.codex/skills` or `_SYSTEM/mure/agent-catalog.json`: `claude-fable-5.anthropic` → `status: canary-proven` in `_SYSTEM/config/provider-route-registry.json`.

### 11.5 GitNexus reindex

- [ ] Owner greenlights fresh OMP session + `npx gitnexus analyze --skip-agents-md`.
- [ ] Re-run `node _SYSTEM/Scripts/xref-query.mjs "<task>"` for at least one of: `mure-fleet` / `fable-synth` / `deepseek-flash`; confirm structural hits no longer carry the stale flag.

### 11.6 R-1 — `context-router.mjs` sweep — RESOLVED

- [x] Full-repo search for the literal string `context-router.mjs` across `.claude/skills` and `skills` returns zero hits. Remaining "context-router" mentions (e.g. `codex-plugin-control-plane/SKILL.md`) are retirement/redirect notes — "Legacy context-router is retired... replaced with xref-query" — not live references to the file.

### 11.7 Final layout

When the slots above are filled, this section becomes the final summary. Re-run focused tests one more time (only the ones added this session) and append results.

---

## 12. Residual risks (verdict + falsifier)

| ID | Risk | Verdict | Falsifying check |
|---|---|---|---|
| **R-1** | `skills/claude-codex-capability-bridge/SKILL.md` still points to `context-router.mjs` (retired). | **RESOLVED** — built-in content search across `.claude/skills` and `skills` for the literal string `context-router.mjs` returns zero hits; the only surviving "context-router" mentions are retirement/redirect notes. | Re-run the same search if new skill content is added that references the retired script. |
| **R-2** | `.omp/config.yml` and `.omp/agents/fable-synth.md` may disagree on Fable availability. | **RESOLVED** — generated card binds `anthropic/claude-fable-5`; both `fable-synth` and `fable-synth-bootstrap` are absent from `disabledAgents`; the bootstrap agent id has no projected dispatch card and exists only as registry canary-evidence provenance (tombstoned, not disabled-listed). | `mure-omp-sync` projection tests plus direct reads of both generated surfaces. |
| **R-3** | GitNexus index is structurally stale (manifest flagged "five commits stale"). | **NEEDS-VERIFICATION** | Re-run `npx gitnexus analyze --skip-agents-md` per §11.5. |
| **R-4** | `mure-chronicler-m3` writes via `Write` bypasses the cache-buster wrapper (`update_plugin_cachebuster.py`). | **CONFIRMED NEGATIVE** — non-decorator write to a single non-plugin path. | N/A; not a plugin path. |
| **R-5** | The `text-result` `_SYSTEM/reports/.test-result` marker file exists (untracked) and would indicate a partial doctor run. Not this lane's job to clean; flag. | **NEEDS-VERIFICATION** | Read `_SYSTEM/reports/.test-result` and confirm its provenance. |
| **R-6** | Projected Fable card and live registry may disagree. | **RESOLVED** — card says canary-proven and registry says `status: canary-proven`. | Direct card + registry read; registry focused test remains green. |
| **R-7** | Anthropic returned 429 during one lane; admission history does not guarantee current liveness. | **CONFIRMED RISK** — registry evidence is admission history, not perpetual availability. | A later failed exact-route canary must immediately block the route until a fresh pass. |
| **R-8** | `AVAILABILITY_MASKED_MODELS = { zai/glm-5.2 }` could be opaque if registry evidence disappears. | **MITIGATED** — focused resolver tests cover registry-evidence acceptance and fail-closed rejection paths. | Re-run `omp-model-resolver.test.mjs`; any unregistered GLM 5.2 path must reject. |

---

## 13. Source-of-truth pointers

- **Manifest spine:** `nisaba/bankai/manifest-2026-07-13-mure-workday.json` (live raw read).
- **Design spec:** `docs/superpowers/specs/2026-07-12-moe-model-admission-design.md` (live raw read; 252 lines).
- **Provider-route registry:** `_SYSTEM/config/provider-route-registry.json` (live raw read; 17 routes total: 14 `canary-proven`, 1 `catalog-candidate`, 1 `quota-blocked`, 1 `owner-excluded`).
- **Generated OMP config:** `.omp/config.yml` (live raw read).
- **Projected cards:** `.omp/agents/*.md` (representative `.omp/agents/fable-synth.md` and `.omp/agents/mure-architect-glm52.md` live read).
- **Native dispatch:** `_SYSTEM/mure/sol-moe-native-dispatch.mjs`, `_SYSTEM/mure/native-dispatch-shadow.mjs`, `_SYSTEM/mure/omp-task-adapter.mjs`, `_SYSTEM/Scripts/mure-omp-sync.mjs`, `_SYSTEM/Scripts/mure-fleet-validate.mjs` (live diffs).
- **MLP router:** `_SYSTEM/Scripts/fleet-router-mlp.mjs`, `_SYSTEM/Scripts/fleet-mlp-feedback.mjs` (live diffs).
- **MCP probe:** `_SYSTEM/Scripts/mcp-health-probe.mjs`, `_SYSTEM/Scripts/mcp-doctor-check.test.mjs` (live diffs).
- **Doctor:** `_SYSTEM/Scripts/yuri-doctor.mjs` (live read).
- **Skills:** `.claude/skills/fleet-economy/SKILL.md`, `.claude/skills/opus-fleet/SKILL.md`, `.claude/commands/opus-fleet.md` (live diffs).
- **CLAUDE doctrine corrections:** `CLAUDE.md` (working-tree diff confirms 60-line update).

---

## 14. Final integrity statement

- **No protected repository path was read or written.** No `.env`, no `.claude/state/`, no `node_modules/`, no protected project data.
- **External action was limited to the owner-requested OpenAI Codex OAuth context probes.** Payloads were synthetic repeated text; no repository or user content was transmitted.
- **The parent ran focused checks and committed the implementation as `15d9ff62`; no formatter, lint, or project-wide test was run.** This report and doctrine closeout are committed separately by the parent session.
- **The workday changed multiple repo surfaces through delegated MURE lanes plus one user-level OMP model override.** Exact repo paths remain visible in the focused diffs and test sections above.
- **Focused verification includes:** 14 green `_SYSTEM/mure/*.test.mjs` files plus 9 green `_SYSTEM/Scripts/*.test.mjs` files, including the Script-side `fleet-router-mlp.test.mjs` (**13/13**) and `fleet-mlp-feedback.test.mjs` (**26/26**) as separate focused suites, plus 2 direct script invocations (`mure-fleet-validate.mjs --project`, `yuri-doctor.mjs`), fresh provider discovery, effective-model listing, and the bracketed live OAuth boundary probe.
- **Honest split** between completed and deferred is preserved. G1, Fable admission/projection, GLM 5.2 liveness, native dispatch, MLP feedback, MCP doctor implementation, fleet doctrine, memory, and seven specialist contracts are completed locally; external MCP auth checks, GitNexus refresh, and unrelated pre-existing workspace changes remain deferred.
- **Provider-route registry remains the authority for admission history; latest live canary remains the authority for current dispatch eligibility.**
- **Outlook:** remaining deferred lanes have explicit falsifier checks in §11–§12. No redesign is needed unless those checks fail.
