# YURI LLM Compatibility Lane — Manual

> **Purpose.** The construction reference + operating manual + provenance ledger + decision log for the LLM compatibility lane (formerly "offload"). Read this before extending, dispatching, or debugging a lane so the subsystem develops *consistently over time* instead of drifting. Every contract records WHERE its mechanism came from and WHY it is shaped that way, so nothing gets re-derived, re-guessed, or quietly broken. This is the spec the lanes conform to — build *to* this manual. Companion to the circuitry `BUILD-MANUAL.md`; same change-propagation law (code → graph → manual → re-verify → reindex).
>
> **Status legend:** ✅ built+verified · 🔨 in progress · ⏳ planned · ⚠️ has an open defect
>
> **Companion surfaces:** [`RUNBOOK.md`](RUNBOOK.md) (live ops) · [`.claude/config/models.json`](../.claude/config/models.json) → `llm_compat_lanes` (frontier roster) + `local` (local SLM policy) · `Scripts/llm-lane.mjs` (frontier core) · `Scripts/ollama-lane.mjs` (local SLM runner) · `Scripts/lane-core-hooks.mjs` (the seam) · `Scripts/llm-compat.sh` (the dispatcher) · `Scripts/llm-compat-contract.mjs` (routing) · the `routing_lanes` sector + `CMD_LLM` node in `yuri-graph-state.json`.

---

## 1. What it is

The single compatibility surface that lets an **external frontier model or local SLM operate as a native-equivalent YURI advisory lane** — not a dumb API call. Three frontier reasoning lanes today are plain openai chat endpoints → **one code path** (`llm-lane.mjs`, ~405 lines). Local Ollama SLMs use `ollama-lane.mjs`. Both runners wire calls into the YURI core through `lane-core-hooks.mjs` so a lane call fires the *same* machinery a native operator turn fires (energy ΔU, memory recall, evidence ledger, symbiotic pulse) — from **inside** the dispatch. The model's mental model: *a lane call is an input into YURI; the only difference from a native turn is that the orchestrating lane supplies the input instead of the operator.*

The reframe (2026-06-05): it is **compatibility with external LLMs**, not offloading YURI's work onto something lesser. Hard-renamed from `offload` → `llm-compat`, no transitional alias.

**Codex (`gpt-5.5`)** is the conceptual 4th lane but a **separate platform** (`Scripts/codex-offload-runner.mjs`, via the Codex MCP), NOT yet routed through `llm-lane`/`lane-core-hooks`. Invoked as `ai codex` / `ai @codex`. Wiring it through the core seam is an open option (§11).

## 2. The non-negotiable laws (never break these)

1. **ADVISORY UNTIL VERIFIED.** Every lane output is `advisory_only`, `local_truth_claim=false`. It does not climb to "fact" until deterministic local evidence verifies it (yuri-origin pulse contract). The `coreOnResult` pulse records this verdict on every call. A lane that "said so" is a hypothesis.
2. **LOUD-FAIL, NEVER SILENT.** Exit codes are a contract (§8). A broken lane, missing key, bad endpoint, or empty output **must** surface as a non-zero exit + an `LLM_COMPAT_FAIL`/`LLM_COMPAT_WARN` marker on stderr. Silent degradation is worse than a crash.
3. **ENDPOINT ALLOWLIST (fail-closed).** Only `api.deepseek.com` and `integrate.api.nvidia.com` pass `assertSafeEndpoint`. Non-https, private/loopback/metadata hosts, or anything off the allowlist → `fail(3)`. This kills the SSRF/IPv6-metadata bypass class.
4. **TOOLS ARE SANDBOXED.** A lane's `bash`/`grep`/`fetch_url` runs via `execSync` and **bypasses the main session's PreToolUse hooks**, so the lane reuses YURI's audited `yuri-safety-core` gate directly: destructive ops (`rm -rf`, `dd`, `mkfs`, `git reset/clean`) blocked, protected surfaces denied, `fetch_url` private/loopback/metadata denied.
5. **ONE SOURCE OF TRUTH.** Lane roster + per-lane config live ONLY in `.claude/config/models.json → llm_compat_lanes`. Read by `llm-lane.mjs` (`MODELS.llm_compat_lanes`). The contract/routing axis (`llm-compat-contract.mjs`) is separate from dispatch. Never duplicate the lane table into an adapter.
6. **LOCKSTEP GRAMMAR.** The env wire + markers are a coordinated protocol (`LLM_COMPAT_*`). Producer and consumer rename together or the wire silently breaks. Zero `OFFLOAD_*` tokens remain (verified at rename).

## 3. Data contract (single source of truth)

`.claude/config/models.json → llm_compat_lanes` — per frontier lane: `{ model, provider, endpoint_env, endpoint_default, api_key_env, context_window, max_output{by-reasoning}, timeout_ms }`.

`.claude/config/models.json → local` — local SLM policy. As of 2026-06-07, every routed local role (`primary`, `utility`, `code`, `deep_reasoning`, `fallback`, `gemma`, `multimodal`) is pinned to `gemma4:12b-it-qat`. Older local blobs such as Needle, Qwen, or `gemma4:e2b` may remain installed, but they are not active policy fallbacks.

**Env wire grammar (`LLM_COMPAT_*`) — coordinated producer↔consumer:**

| Token | Role | Set by | Read by |
|---|---|---|---|
| `LLM_COMPAT_PROMPT_TEXT` | prompt transport | ai · llm-compat.sh · task-queue · worker-bridge · kagami-* · deepseek-handoff · **codex-offload-runner** | llm-lane.mjs · ollama-lane.mjs · codex-offload-runner.mjs |
| `LLM_COMPAT_TASK_ID` / `LLM_COMPAT_INTENT` | session/intent correlation | `.codex/adapters/yuri-offload-mcp.mjs` | llm-lane/queue/ollama/token-ledger/codex-runner |
| `LLM_COMPAT_QUEUE_WAIT_MS` / `_POLL_MS` / `_BYPASS` | concurrency lease tuning | llm-compat.sh | llm-compat-queue.mjs |
| `LLM_COMPAT_MAX_CONCURRENT_LANES` / `_HARD_MAX_*` / `_LEASE_DIR` / `_LEASE_TTL_MS` | queue caps | operator env | llm-compat-queue.mjs |
| `LLM_COMPAT_FAIL` / `LLM_COMPAT_WARN` | loud-fail markers | llm-lane.mjs · lane-core-hooks.mjs | (log/automation greppers) |
| `LLM_COMPAT_ASSESSMENT` | route-log marker | llm-compat.sh | yuri-repl ROUTE_LOG regex |
| `GLOBAL_LLM_COMPAT_DIRECTIVE` | session-boot protocol section | MUSUBI_PROTOCOL.md | musubi-protocol-ingest.js + validator |

## 4. Architecture / pipeline

```
ai llm <lane> "<prompt>" [flags]            (CLI surface; hard rename of `ai offload`, no alias)
  └─ ai (key hydration: keychain → env.sh → .zshrc)
       └─ llm-compat.sh  (optional: queue lease, --model/--swarm/--dry-run dispatch)  ──┐
       └─ node llm-lane.mjs <lane> "<prompt>"  (direct path; ai llm <lane> routes here) ─┤
                                                                                          ▼
   parseCli → dispatch(lane, prompt, opts)
     ├─ ALIAS[lane] → canonical key; cfg = LANES[key]            (fail 3 if unknown/missing)
     ├─ endpoint = env[cfg.endpoint_env] || cfg.endpoint_default ; assertSafeEndpoint (ALLOWLIST)
     ├─ coreOnDispatch({lane,prompt,runId})  ── lane-core-hooks ──┐  (error-isolated)
     │     · ENERGY  traceDispatchEvent → ΔU/energy landscape     │
     │     · MEMORY  recall() over cold store → recallBlock       │  one stable runId
     ├─ system = buildYuriLoadout()  (full YURI stack) + recallBlock   correlates all three
     ├─ postChat → fetch(${endpoint}/chat/completions)  (tool loop ≤ maxIters, convergence guards)
     │     · tools: read_file·grep·list_dir·search·xref_query·propagation_scan·fetch_url·bash (safety-gated)
     │       xref_query is not clipped by the wrapper; raise `top`/`scan` or set `all=true` for broad recall.
     ├─ coreOnResult({lane,output,exitCode,runId}) ─ lane-core-hooks ─┘
     │     · EVIDENCE → _SYSTEM/state/memory-ledger.jsonl
     │     · PULSE    → _SYSTEM/state/lane-pulse-trace.jsonl (advisory_only / verify|block)
     └─ stdout = model text ; exit 0
```

## 5. The lanes (roster — ground-truth from `llm_compat_lanes`, 2026-06-05)

| Lane (alias) | Model | Provider / endpoint | Context | Max output (xhigh) | Timeout | Status |
|---|---|---|---|---|---|---|
| `deepseek` / `ds` | `deepseek-v4-pro` | deepseek-direct · `api.deepseek.com` | 1,000,000 | 131,072 | 180s | ✅ |
| `nemotron` / `nvidia` | `nvidia/nemotron-3-super-120b-a12b` | nvidia-nim · `integrate.api.nvidia.com` | 1,000,000 | 32,768 | 30min* | ✅ |
| `kimi` | `moonshotai/kimi-k2.6` | nvidia-nim · `integrate.api.nvidia.com` | 1,000,000 | 32,768 | 240s | ✅ |
| `codex` (separate platform) | `gpt-5.5` | OpenAI Codex MCP · `codex-offload-runner.mjs` | — | — | up to 6h | ✅ **un-sandboxed (`danger-full-access`), guard-verified** · `--context` parity · spine via AGENTS.md · repo-wide. Not via the lane-core-hooks seam (open option). codex-spark stays read-only DRAFT; `--sandbox read-only` overrides any lane. |

Context window = INPUT cap (all 1M). Max output = a **separate** per-reasoning-depth knob (`off/low`:2048 · `medium`:4096 · `high`:16384 · `xhigh`: per table). DeepSeek counts reasoning tokens against it. Legacy remote/dead lanes (swarm/old-nvidia/etc.) are **hard-removed** — invoking one fails loud (exit 3).

### 5a. Local SLM lane (Ollama, 2026-06-07)

| Lane | Model | Runtime | Status |
|---|---|---|---|
| `gemma-local` / `gemma` / `ollama-local` / `triage-local` / `summarize-local` / `code-local` / `gpt-oss` | `gemma4:12b-it-qat` | Ollama via `ollama-lane.mjs` | 🔨 installed+routed local policy; viability benchmark pending |

This is a local SLM compatibility lane, not a replacement for the 3 frontier reasoning lanes. Its role is active background/private utility: triage, summarization, bounded code analysis, cross-reference extraction, and math-kernel signal preparation. It inherits the core seam (`coreOnDispatch`/`coreOnResult`) through `ollama-lane.mjs`, but it has no repo-read tools by default; main-session verification remains mandatory.

> **\*nemotron lane (renamed 2026-06-05):** the lane key is now `nemotron-3-super-120b-a12b` (was `nemotron-3-ultra-550b-a55b`; old id kept as a back-compat ALIAS). Reason: the 550b-ultra can't emit a first token within NVIDIA's free-endpoint **~40s no-output gateway wall** under load — proven by removing every client-side timeout (shell → AbortController → undici headers → socket) and still hitting it; the 120b-super fits. This lane uses the **`raw_https` streaming transport** (`config.raw_https=true` → `postChatHttps`, node:https SSE, no timeout) instead of the global fetch, since a slow reasoner's TTFB exceeds undici's ~5min headersTimeout. **Caveat:** the ~40s wall still caps prefill (~50KB), so dispatch this lane with **tool-read files, not big `--context` front-loads**. The duplicate lane tables (lane-kernel/llm-compat.sh/llm-compat-contract/kagami/shintai) still carry the old id — reconcile in the Wave-2 routing-fragmentation fix. kimi uses a sibling adapter (`parseKimiToolCalls`) for its native tool-call token format; nemotron's NIM tool format parses cleanly with no adapter.

## 6. Invocation reference

```
ai llm <deepseek|kimi|nemotron> "<prompt>" [flags]     # primary
ai deepseek|kimi|nemotron "<prompt>"   ·   @deepseek|@kimi "<prompt>"   # convenience aliases
ai llm capabilities | --list           # roster JSON
ai llm --model <lane>|--dry-run|--route-only ...        # full llm-compat.sh dispatcher (queue)
```

**Flags:** `--reasoning <low|medium|high|xhigh|max>` · `--system <str|@file>` · `--no-system` · `--light` (trim loadout) · `--no-tools` (bare prompt) · `--no-exec` (drop bash, keep read/fetch) · `--max-iters <n>` (default 24) · **`--context <f1,f2,..|@manifest>`** (front-load must-read files) · `--out <file>` · `--dry-run` · `--list`. Debug: `LLM_LANE_TRACE=<file>`.

**CONTEXT FRONT-LOAD (the dispatch-quality lever — §7a):** pass **`--context <files>`** to inject the exact must-read files INTO the dispatch, so the lane starts with guaranteed context from turn 1 instead of discovering it via tools (slower, not guaranteed). The *dispatcher* picks the files per task — proportional, not a repo dump. Budget-capped (`LLM_LANE_CONTEXT_BUDGET`, default 240k chars); protected surfaces refused. `--dry-run` reports `contextChars`.

**RELIABLE DISPATCH:** the lane self-limits via its own `AbortController` — **never wrap it in shell `timeout`** (§10.1). `--out <file>` is a clean sync way to capture output in automation.

## 7. The core-ingest seam (`lane-core-hooks.mjs`)

The single place to extend when wiring more of the core into lanes. Both hook points are **fully error-isolated** — a core hook NEVER breaks dispatch.

- `coreOnDispatch({lane,prompt,runId})` → fires at start: ENERGY (`traceDispatchEvent`) + MEMORY (`recall()` over the cold store, rendered into a `recallBlock` injected into the system prompt so the lane carries the same episodic memory a native turn gets). Returns `{recallBlock, runId}`.
- `coreOnResult({lane,prompt,output,exitCode,runId})` → fires on result: EVIDENCE (a `lane_output` record → `memory-ledger.jsonl`) + PULSE (the docked-LLM symbiotic pulse → `lane-pulse-trace.jsonl`, `advisory_only`, verdict `verify`|`block`).

One stable `runId` (`llm-lane-<lane>-<ts>`) correlates the energy trace, evidence record, and pulse for a dispatch.

## 7a. Dispatch quality: don't just say "equipped" — front-load the must-reads

The loadout (§4) gives a lane YURI's **identity + architecture** + the **tools** to self-gather. It does
NOT, by itself, guarantee the lane reads the *right task-specific files* — left alone it spends turns
discovering them via `search`/`read_file`, slower and not guaranteed. Telling a lane "you're fully
equipped" is necessary but not sufficient.

**The fix (owner directive 2026-06-05): the dispatcher front-loads the must-read files into the packet.**
Use `--context <files>` so the lane starts with the exact files it needs, in hand, from turn 1 — guaranteed
coverage, fewer wasted turns, more reliable output. The dispatcher's job is to *pick the must-reads per
task* (proportional — match the pack to the task's blast radius, never dump the repo; see
[[build-agent-context-loadout]]). For a security-substrate review: the guard files. For a memory review:
the memory organs. The lane still has tools for anything beyond the pack.

This is the single highest-leverage dispatch-quality lever: it converts "hope the lane finds the context"
into "the lane has the context." Every non-trivial fan-out dispatch should carry a `--context` pack.

## 8. Loud-fail exit contract + markers

| Exit | Meaning | Marker |
|---|---|---|
| `0` | ok (truncated-but-nonempty still 0) | `LLM_COMPAT_WARN code=0 ... reason=ok_truncated_<finish>` |
| `1` | empty output · transient transport · 5xx | `LLM_COMPAT_FAIL code=1 lane=<l> reason=<r>` |
| `2` | usage error (no lane arg) | usage to stderr |
| `3` | unknown lane · missing key · bad/non-allowlisted endpoint · 4xx | `LLM_COMPAT_FAIL code=3 ...` |

Recall unavailable (cold store down) → `LLM_COMPAT_WARN code=0 ... reason=recall_unavailable:*` (degrades visibly, dispatch continues). Spine incomplete (missing loadout file) → `LLM_COMPAT_WARN ... reason=spine_incomplete`.

## 9. Security contract (mandatory)

- **Endpoint:** ALLOWLIST `{api.deepseek.com, integrate.api.nvidia.com}`, https-only, fail-closed.
- **`fetch_url` tool:** DENY private/loopback/metadata + redirect:error.
- **`bash` tool:** `yuri-safety-core` gate — blocks `rm -rf`/`dd`/`mkfs`/`git reset|clean` + protected surfaces; the lane's tools bypass main-session PreToolUse hooks **by design**, so this in-process gate is the guard.
- **Protected paths:** `isProtectedPath` denies `.env`, `backend/data/`, `.claude/{history,state,file-history,worktrees,transcripts}`, secrets.
- **Keys:** never logged; hydrated by `ai` from keychain (`yuri-deepseek-api-key` / `yuri-nvidia-api-key`) → env.sh → .zshrc.

## 10. Known issues / gotchas (operational truth, 2026-06-05)

1. ✅ **RESOLVED — it was the shell `timeout` command, not the lane.** Wrapping a *live* lane call in shell `timeout` (`timeout 100 node llm-lane.mjs <lane> "..."` or `timeout … ai llm …`) truncates the in-flight request → **empty output + exit 0**, even though the call completes well under the limit. Bare invocation, `ai llm`, and `import dispatch()` all work. Root-caused by a clean A/B (timeout → EMPTY, no-timeout → PONG) plus the env-gated `LLM_LANE_TRACE`. **The lane self-limits via its own `AbortController` (`cfg.timeout_ms`, 180–240s) — a shell `timeout` is redundant AND harmful.** RULE: never wrap a lane dispatch in the shell `timeout` command; if you need an outer cap in automation, use the harness Bash-tool `timeout` PARAMETER instead. (Debug aid added: `LLM_LANE_TRACE=<file>` writes stage markers `MAIN_START..POST_POSTCHAT`.)
2. ✅ **kagami noise — gated (`29e5b16c`).** The kagami FACADE is OFF by design (`KAGAMI_FACADE_ENABLED=0`; auth scrapped; boot script `kagami-start.sh` MISSING), but `kagami-cli.mjs`'s `fail()` always appended `BOOT_HINT` (`boot: bash kagami-start.sh`) → `AggregateError/boot` noise that polluted captured stderr and masqueraded as a lane error (cost real debug time — see [[lane-timeout-ghost-lesson]]). Now the hint only prints when the facade is actually enabled. Facade subsystem = retirement candidate (disabled + unused); the 5 SCHEDULED kagami agents are live + kept.
3. **Direct lane needs the key in env.** `node llm-lane.mjs` reads `process.env[cfg.api_key_env]`; only the `ai` wrapper hydrates from keychain. For a direct call, export `DEEPSEEK_API_KEY` / `NVIDIA_API_KEY` first.
4. **Loop-prone models (kimi/NIM):** convergence guards (repeated-tool-batch detection + tool-turn nudge at 60% of maxIters + a forced final no-tools call) prevent empty exits from tool loops.

## 11. Extending: plug in a new frontier lane

1. Add the lane config to `models.json → llm_compat_lanes` (model, `endpoint_env`+`endpoint_default`, `api_key_env`, `context_window`, `max_output`, `timeout_ms`).
2. Add its host to `ALLOWED_HOSTS` in `llm-lane.mjs` (§ security law 3) — fail-closed by default.
3. Add aliases to `ALIAS`. The dispatch path, tools, core seam, and loud-fail contract are inherited for free — that is the whole point of the single code path.
4. If it is openai-compatible chat, nothing else changes. If not (e.g. Codex), it stays a separate platform until someone routes it through `coreOnDispatch`/`coreOnResult` (§1).
5. Propagate: update §5 here, the `routing_lanes` sector + a `LANE_*` node in `yuri-graph-state.json`, regenerate the circuitry viz, reindex (the change-propagation law).

## 12. Provenance + decision log

| Date | Decision / mechanism | Source |
|---|---|---|
| 2026-06-05 | Consolidate the tangled ~4040-line offload stack → single `llm-lane.mjs` + `lane-core-hooks.mjs` core-ingest seam | `dd10eb38`, `76d622de` |
| 2026-06-05 | Exactly 3 reasoning lanes; DeepSeek DIRECT; Kimi+Nemotron via NIM; legacy ~47 hard-removed; all 1M context; output cap a separate knob | owner, binding |
| 2026-06-05 | Rename `offload` → "LLM compatibility lane" (reframe: compatibility, not offloading); hard, no alias | `028e430f` |
| earlier | openai-compatible single-path dispatch; endpoint ALLOWLIST SSRF guard; tool sandbox via yuri-safety-core | red-team converged findings |
| 2026-06-07 | Add local SLM compatibility lane through Ollama; active local policy pinned to `gemma4:12b-it-qat`; Needle/Qwen/`gemma4:e2b` retired from routed local policy | owner, binding |

## Status / change log

- **2026-06-05 (later, same session) — lanes hardened + Codex fully equipped.** Timeout-ghost root-caused (shell `timeout` truncates live calls — §10.1, never the lane). `--context` front-load added to both `llm-lane.mjs` + `codex-offload-runner.mjs` (§7a). Codex un-sandboxed (`danger-full-access`, guard-VERIFIED — it attempted `rm -rf`, yuri-safety-core blocked it), repoRoot off-by-one fixed (guard + spine load from repo-root), spine via AGENTS.md. kagami boot-hint noise gated (§10.2). All merged to main (`d800012c`, `21ddcaca`, `29e5b16c`). **Lanes are fan-out-ready.**
- **2026-06-05 — manual created.** Captures the post-consolidation + post-rename reality + the day's operational findings (piped-stdout truncation, kagami noise, reliable `--out` capture). Lane core verified live (`PONG` via direct dispatch). Open defects: §10.1 (flush robustness), §10.2 (kagami noise). Codex-through-core-seam: open option (§11.4).
- **2026-06-07 — local SLM route re-added under llm-compat, Gemma-only.** `ollama-lane.mjs` owns local Ollama execution and fires `lane-core-hooks`; `.claude/config/models.json` local policy is pinned to `gemma4:12b-it-qat`; `llm-compat.sh`, `llm-compat-contract.mjs`, local policy tests, and capability manifest updated so old Needle/Qwen/`gemma4:e2b` choices are no longer selected.
