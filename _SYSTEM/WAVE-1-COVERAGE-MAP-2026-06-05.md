# WAVE 1 — Breadth-First Red-Team Coverage Map (2026-06-05)

> **Top-loaded** (current state first). The moat-capstone red-team: 4 equipped frontier lanes swept the full 127-node / 15-sector YURI architecture; my ≤3 agents scoped, synthesized, and truth-gated; nothing climbs to "real" without live-runtime evidence. Owner params (locked): breadth-first · local-corpus-first · both-lens weakness-weighted · lanes do coverage · ≤3 of my own agents.

`RESULT_LABEL: 08RT_WAVE1_BREADTH_REDTEAM_FANOUT_P_PASS` (P = partial: nemotron lane endpoint-limited; coverage + verification complete via the other 3 lanes.)

## 1. HEADLINE

137 raw lane findings → **101 deduped** → truth-gated to **9 VERIFIED real · 9 PARTIAL · 6 REFUTED**. The two loudest crits both **died on contact** with live evidence. Exactly **one** finding has genuinely attacker-reachable (non-operator) input. A reusable lane fix (kimi tool-call adapter) and a slow-reasoner transport (streaming node:https) were built + proven as a side-effect.

## 2. COVERAGE — all 127 nodes / 15 sectors / 7 slices

| Slice | Sectors | Nodes | Lane (final) | Raw findings |
|---|---|---|---|---|
| S1 boot/control | operator_io · control_plane · initialization | 14 | codex gpt-5.5 | 25 |
| S2 hooks/pulse | prompt_hooks · pulse_cortex | 19 | deepseek-v4-pro | 25 |
| S3 classify/advisors | classification · advisors | 20 | codex gpt-5.5 (nemotron failed→reassigned) | 20 |
| S4 lanes/codex-gate ★ | routing_lanes · codex_gate | 19 | deepseek-v4-pro (+ kimi ×2 corroboration) | 13 |
| S5 memory/services | memory · services | 22 | deepseek-v4-pro | 17 |
| S6 intel/improve | code_intelligence · self_improvement | 16 | codex gpt-5.5 | 14 |
| S7 registry/unassigned | command_registry · unassigned | 17 | codex gpt-5.5 (kimi failed→reassigned) | 23 |

★ S4 (crown jewel) reviewed **3× independently** (deepseek + kimi-adapter + kimi-fairtest) for cross-lane corroboration.

Severity of the 101 deduped: **7 crit · 33 high · 44 med · 17 low**.

## 3. VERIFIED REAL (survived adversarial truth-gate vs live runtime)

| # | Sev | File:line | Finding | Reachability |
|---|---|---|---|---|
| 1 | **high** | `_SYSTEM/OS_KERNEL/openclaw-bridge.sh:119-121` | Shell fields (`SUMMARY`/`task_id`/`channel`) interpolated raw into a `python3 -c` source string → field/code injection | **ATTACKER-REACHABLE** (OpenClaw agent output) — the only non-operator one |
| 2 | high | `_SYSTEM/Scripts/codex-offload-runner.mjs:28-35` | codex/full-tier = `danger-full-access` + `--full-auto`, **no propose/approve/apply gate on the live path** (the only gate impl is archive-only) | operator (dispatch the codex alias) |
| 3 | high | `codex-offload-runner.mjs:282` | `--cd`/`CODEX_TARGET_WORKTREE` → spawned `--cd` with no `isInsideRepo` clamp → un-sandboxed Codex in arbitrary dir | operator/caller |
| 4 | high | `_SYSTEM/Scripts/llm-lane.mjs:243` | `fetch_url` checks `isPrivateHost` on the literal hostname, never resolves DNS → public-name→private-IP (DNS rebind) SSRF | injected docked-model output |
| 5 | high | `llm-lane.mjs:153,159` | bash tool blocks `rm`/`git` verbs but allows arbitrary file write via `>`/`>>` redirection (no shell-syntax parse); protected regex omits `.claude/hooks` | injected tool call |
| 6 | med | `_SYSTEM/Scripts/gitnexus-mcp.mjs:19-23` | Missing local GitNexus silently runs `npx` fallback instead of fail-closed → supply-chain exec | binary absent |
| 7 | med | `_SYSTEM/Scripts/claude-memory-write.mjs:62-73` | `assertSafePath` lexical (`path.resolve`+`startsWith`), no `realpathSync` → symlink in `memory/` escapes root | needs prior write |
| 8 | low | `_SYSTEM/Scripts/codex-yuri.sh:9,14` | World-writable `/tmp` session packet, predictable `epoch+pid` name, read with no integrity check → local prompt injection | local race |
| 9 | med | `codex-offload-runner.mjs:211-214` | `--sandbox` override `Set.has()` with no `.trim()`/`.toLowerCase()` → `'read-only '` (trailing space) silently ignored, **falls through to the permissive default** (FAIL-OPEN). Found by kimi (the lane it fought to revive), gated by me. | operator typo |

## 4. REFUTED — the truth-gate thesis, proven (≈⅓ of confident crits were wrong)

- **`pulse-codex-runner.mjs:162` .approved TOCTOU (rank-3 crit, 3-lane "corroborated")** → **reachability-dead.** File is `_SYSTEM/archive/retired-pulse-cortex/` only, zero live refs. GitNexus index was *stale* and pointed at a non-existent path — the lanes trusted the index.
- **`bash-security-guard.js` lexical role-bypass (rank-15 high)** → **already FIXED.** Ran all 5 historical bypass forms (redirect-to-hook, cd-split rm, var-indirection, find -delete, git reset --hard) in true coworker role — every one **DENIES** now. (Updates the standing "CONFIRMED CRITICAL" memory → resolved.)
- **`codex-offload-runner` danger-full-access *default* (rank-1a crit)** → **false.** Runner default = `gpt-5.3-codex-spark` = read-only; danger-full-access only rides the explicit `codex` alias.
- **`--sandbox read-only` doesn't apply (kimi, crit)** → **false.** Dry-run shows `--sandbox read-only` reaches the spawned command; `parseArgs` completes before `buildCodexArgs`.
- **`pulse-classify-stdin` ignores stdin → downgrades to trivial** → **false.** Live caller passes argv; code matches; fallback tier is `standard`, not `trivial`.
- **`kimi F6` `../../.env` evades the protected-path regex** → **false.** Tested: `blocked=true` (the `/` before `.env` satisfies the boundary class).

Most "fail-open hook" crits (pre-tool-use.js:186, user-prompt-submit.js:343, the async first-gate) → **PARTIAL/WAI**: those are advisory/context hooks; the deny authority is the **synchronous** guards, proven to fire live.

## 5. WAVE-2 FIX QUEUE (the real work)

1. **`openclaw-bridge.sh`** field injection — the one attacker-reachable bug. `json.dumps`-quote every field, not just `CONTENT_JSON`. *(highest priority)*
2. **Codex gate** — add a propose/approve/apply gate (or content-hash-pinned `.approved`) + `isInsideRepo` clamp on `--cd`/`CODEX_TARGET_WORKTREE`. The "uncaged Codex" matches the owner 2026-06-05 directive, so this is a posture decision, not a silent bug — decide explicitly.
3. **`llm-lane.mjs:243`** fetch_url — resolve DNS and re-check the *IP* (close DNS rebind).
4. **`llm-lane.mjs:159`** bash tool — parse redirect targets in `laneCommandAllowed`; add `.claude/hooks` to the protected regex.
5. **`gitnexus-mcp.mjs:19`** — fail-closed on missing binary, no silent `npx`.
6. **`claude-memory-write.mjs:62`** — `realpathSync` before the root check.
7. **`codex-offload-runner.mjs:211`** — `.trim()` + **fail-closed** on an invalid `--sandbox` (don't default-permissive).

## 6. COVERAGE GAPS (Wave-2 read targets — not reviewed in Wave 1)

Apply-phase Codex gate · `policy/yuri-safety-core.mjs` (the `>` redirect bypass is inference until read) · `.claude/config/models.json` (SSRF endpoint resolution) · ENKI_*/ED_* orphan clusters (graph-live, no live consumer — merge/retire candidates) · WARM→COLD memory demotion wiring gap · protected runtime-bus files (partial by design). **Graph drift confirmed:** `LANE_NEMOTRON → nemotron-dispatch.mjs` is a phantom (all 3 S4 lanes verified MISSING); CODEX_GATE/PROPOSE/APPROVED/APPLY nodes point at docs, not the live runner.

## 7. LANE RELIABILITY REPORT (the meta-deliverable)

| Lane | Verdict | Detail |
|---|---|---|
| **deepseek-v4-pro** | ✅ workhorse | Direct API, fetch path. Flawless across S2/S4/S5. Strongest crown-jewel review. |
| **codex gpt-5.5** | ✅ reliable | Read-only DRAFT, reads files via its own tools. Carried S1/S6/S7/S3. |
| **kimi-k2.6** | ✅ **REVIVED this session** | Was emitting raw `<\|tool_call_begin\|>` tokens (NIM speaks Moonshot's format, llm-lane expected OpenAI `tool_calls`). Built a **translation adapter** (`parseKimiToolCalls`/`stripKimiToolTokens` + arg-key inference) → live-proven **14 findings, 40 tool execs, 0 leak**; **20/20 unit** (`/tmp/kimi-adapter.test.mjs`). Found 3 novel findings (F2 verified). |
| **nemotron** | ⚠ endpoint-limited | 550b can't prefill within NVIDIA's free-endpoint ~40s gateway wall → swapped to **120b-super** (owner-approved). Model works (3s PONG, clean tools, no leak). Free tier caps prefill ≈50KB and throttles after a burst → big reviews need tiling or a paid endpoint. Architecture correct; endpoint is the limit. Dropped from this wave. |

**Transport work shipped (stays):** streaming `node:https` for slow reasoning lanes (`raw_https` flag, zero timeout, its own connection — deepseek/kimi untouched, regression PONG passes). Every client-side timeout removed (shell → AbortController → undici headers → socket); the only wall left is NVIDIA's gateway.

## 8. CAPSTONE RESULT

4 frontier lanes covered a surface my agents alone wouldn't sweep as broadly — **and the truth-gate earned its keep**, refuting a third of the confident crits including the 2 loudest. Net: 9 verified-real defects, 1 attacker-reachable, a clean 7-item Wave-2 fix queue, and a revived lane. The moat thesis holds: breadth from the lanes, **truth from local verification** — never from "the model said so."

SEE: `/tmp/wave1-synthesis.md` (101 deduped) · `/tmp/wave1-verified.md` (verdicts) · `_SYSTEM/LANE-MANUAL.md` · the kimi adapter in `_SYSTEM/Scripts/llm-lane.mjs`.
