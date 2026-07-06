# Wave 3 Governance Audit
**Domain:** GOVERNANCE (codex_gate x7, control_plane x3, routing_lanes x13, advisors x13)
**Date:** 2026-06-10
**Auditor:** Claude Sonnet (wave3 subagent)
**Prior waves cited:** wave1 math-base-audit-2026-06-10-checkpoint.md; wave2-cognition-audit.md, wave2-memory-audit.md, wave2-retrieval-audit.md (+ deeps)
**DS advisory:** deepseek-wave3-hooks-wiring.md (verified), deepseek-wave3-enforcement-chain.md (advisory, not independently verified)
**Attack pass:** APPLIED (adversarial lens on every finding)

---

## 1. FINDINGS

### SEV-CRIT-1: pre-tool-gate.js declared async=true in PreToolUse — output ignored by harness
**SEV:** CRITICAL (silent governance bypass)
**File:** `.claude/settings.json` line 166 + `.claude/hooks/pre-tool-gate.js`
**Claimed:** pre-tool-gate fires synchronously before every tool use and can inject routing advisory context
**Actual:** Hook is declared `"async": true` in settings.json. Async PreToolUse hooks are fire-and-forget — their `additionalContext` output is NOT delivered to the model. The hook writes `{ continue: true, additionalContext: "..." }` (pre-tool-gate.js lines 106-108) but that JSON is discarded by the harness because it is async.
**Evidence:**
- MATCH file=.claude/settings.json line=166 excerpt=`"async": true` (pre-tool-gate entry)
- MATCH file=.claude/hooks/pre-tool-gate.js line=7 excerpt=`NEVER blocks — always continue:true. Advisory only`
- MATCH file=.claude/hooks/pre-tool-gate.js lines=106-108 excerpt=`process.stdout.write(JSON.stringify({ continue: true, additionalContext: advisory })`
**Impact:** All large-file and broad-search routing advisories (delegate to deepseek-flash) are silently swallowed. Hook exists, fires, but its output never reaches the model. Declared trigger-complete; behaviorally dead.

---

### SEV-CRIT-2: Codex two-phase gate (propose / .approved / HEAD SHA verify / apply) is contract prose only — no executable implementation found
**SEV:** CRITICAL (governance architecture claim with no live enforcement)
**File:** `_SYSTEM/reports/wave3-scope-die-extract.json` (CODEX_GATE sector: PROPOSE, APPROVED, APPLY, APPLY_HEAD, CODEX_FLOW nodes); `_SYSTEM/Scripts/llm-compat-contract.mjs` line 26 comment; die label "two-phase gate: propose / .approved / HEAD SHA / apply"
**Claimed:** Codex dispatch goes through a two-phase propose→approve→HEAD-SHA-verify→apply gate
**Actual:** Neither `_SYSTEM/Scripts/codex-offload-runner.mjs` nor `_SYSTEM/Scripts/ai` contains any logic for `.approved` markers, HEAD SHA stale-protection, or a two-phase propose flow. Searching both files for `propose`, `\.approved`, `APPROVED`, `headSha`, `HEAD.*SHA`, `stale` returns zero hits (verified via Bash).
**Evidence:**
- FILE_COUNT file=_SYSTEM/Scripts/codex-offload-runner.mjs count=0 matches for "propose|approved|headSha|stale"
- FILE_COUNT file=_SYSTEM/Scripts/ai count=0 matches for "CODEX_GATE|codex_gate|\.approved|HEAD.*SHA|headSha|stale"
- MATCH file=_SYSTEM/Scripts/llm-compat-contract.mjs line=26 excerpt=`// HARD RULE (2026-05-14): Codex is Claude's permanent implementation co-pilot.` — contract comment only
**Impact:** The codex_gate die sector (7 nodes: PROPOSE, APPROVED, APPLY, APPLY_HEAD, CODEX_FLOW, PROP_DRYRUN, CDX_FULL) represents wiring that is claimed in the architecture diagram and contract but has no executable gate. Codex dispatches go directly via `run_kagami_or_fallback` → lane execution with no HEAD SHA stale-protection and no `.approved` checkpoint.

---

### SEV-HIGH-1: advisory-only contract for DeepSeek and Claude advisors has no mechanical enforcement — purely document-level
**SEV:** HIGH (trust boundary claim not enforced)
**File:** `_SYSTEM/Scripts/llm-compat-contract.mjs` lines 288-320 (`claudeCouncilQualityGate`), lines 805-887 (`assessDeepseekAdvisory`), lines 889-929 (`assessClaudeAdvisory`)
**Claimed:** DeepSeek and Claude advisory outputs are `advisory_only=true; local_truth_claim=false`; Codex/main-session is final authority; output is discarded when `discardWhenAny` conditions are met
**Actual:** `assessDeepseekAdvisory` and `assessClaudeAdvisory` return JSON objects with `advisoryOnly: true` and `discardWhenAny` arrays. These are data fields in the `buildRoutePlan` output — they are **documentation/advisory metadata** passed to consumers. No hook, no executor, and no runtime component in the codebase enforces the `discardWhenAny` conditions or prevents an advisory output from being treated as authoritative. The `blockInfluenceWhenAny` conditions (e.g. "Two or more material repo claims are unverifiable") are similarly data-only — no scanner enforces them at dispatch time.
**Evidence:**
- MATCH file=_SYSTEM/Scripts/llm-compat-contract.mjs line=292 excerpt=`modelOutput: 'advisory_only=true; local_truth_claim=false'`
- MATCH file=_SYSTEM/Scripts/llm-compat-contract.mjs line=911 excerpt=`advisoryOnly: true,`
- FILE_COUNT file=_SYSTEM/Scripts/llm-compat-contract.mjs count=0 runtime checks that read `discardWhenAny` and abort dispatch on match
- FILE_COUNT file=.claude/hooks count=0 hook files that import or enforce `discardWhenAny` / `blockInfluenceWhenAny`
**Impact:** The advisory-only boundary is a contract promise readable by humans and agents that read route-plan output, not a hard gate. A session that ignores the `advisoryOnly` field and treats model output as canonical truth is not mechanically blocked. Severity is HIGH not CRITICAL because the control-plane CLAUDE.md + SOUL.md behavioral contract does express this intent to the model itself — but there is no runtime trip-wire.

---

### SEV-HIGH-2: claude-protocol-guard.mjs route-plan gate fires only as WARN for non-critical tier; critical-tier block requires CLAUDE_SESSION_ID in env — absence silently downgrades to WARN
**SEV:** HIGH (guard degrades silently on missing env var)
**File:** `.claude/hooks/claude-protocol-guard.mjs` lines 348-368
**Claimed:** Protocol gate blocks on critical-tier work without route-plan evidence
**Actual:** The block path (`emitBlock`) only fires when `CLAUDE_SESSION_ID` is set AND the read session packet has `complexityTier === 'critical'`. If `CLAUDE_SESSION_ID` is absent (subagent, headless, or env not propagated), the catch swallows the error and falls through to `emitWarnings` (line 367). This means critical-tier work that lacks route-plan evidence produces a WARN, not a DENY, in any execution context where the session ID is unavailable.
**Evidence:**
- MATCH file=.claude/hooks/claude-protocol-guard.mjs lines=348-368 excerpt=`const sessionId = process.env.CLAUDE_SESSION_ID || ''; if (sessionId) { ... emitBlock } catch(_) {} emitWarnings(warnings);`
- MATCH file=.claude/hooks/claude-protocol-guard.mjs line=242 excerpt=`if (process.env.YURI_SPRINT_MODE === '1') return [];` — full bypass exists

---

### SEV-HIGH-3: denyPermissionDecision: false in claudeProtocolGate — gate is permanently non-blocking via settings
**SEV:** HIGH (architecture claim vs. hard-coded off)
**File:** `_SYSTEM/Scripts/llm-compat-contract.mjs` line 360
**Claimed:** claudeProtocolGate governs control-plane work
**Actual:** `denyPermissionDecision: false` is a hardcoded field in the contract object. The hook (`claude-protocol-guard.mjs`) independently emits WARN vs DENY based on session-packet logic (SEV-HIGH-2), but the contract itself documents that permission denial is off. This is consistent — but means the gate is architecturally warn-only, not a hard stop, and any future consumer reading this field would conclude blocking is disabled.
**Evidence:**
- MATCH file=_SYSTEM/Scripts/llm-compat-contract.mjs line=360 excerpt=`denyPermissionDecision: false`
**Note:** Not independently contradicted by hook behavior — the hook's block path exists but requires runtime preconditions that can silently fail (SEV-HIGH-2). Compound risk with SEV-HIGH-2.

---

### SEV-HIGH-4: agent-spawn-guard.js is observability-only — all Agent spawns are ALLOWED; prior hard-deny is removed
**SEV:** HIGH (governance regression vs. original design claim)
**File:** `.claude/hooks/agent-spawn-guard.js` lines 1-45
**Claimed (die):** agent-spawn-guard governs agent dispatch under YURI policy
**Actual:** Hook is explicitly observability-only since 2026-05-30 owner directive. It logs and always exits 0. No spawn is ever denied. Cost guidance is NOT enforced (comment line 12: "NOT enforced").
**Evidence:**
- MATCH file=.claude/hooks/agent-spawn-guard.js line=8 excerpt=`This hook is now OBSERVABILITY-ONLY: it logs every Agent spawn and always allows.`
- MATCH file=.claude/hooks/agent-spawn-guard.js line=44 excerpt=`process.exit(0); // always allows`
**Note:** Owner directive 2026-05-30 explicitly made this change. Not a bug — but the die label "Agent spawn guard (YURI policy)" implies enforcement that no longer exists. Doc-vs-wiring drift.

---

### SEV-MED-1: SPRINT_MODE bypass (YURI_SPRINT_MODE=1) disables ALL PreToolUse protocol-guard checks globally with no scope limit
**SEV:** MEDIUM (bypass exists with no TTL, no scope, no audit trail within the hook)
**File:** `.claude/hooks/claude-protocol-guard.mjs` line 242
**Claimed:** Session-scoped bypass for authorized rapid-implementation sessions
**Actual:** `if (process.env.YURI_SPRINT_MODE === '1') return []` exits with zero warnings before any check runs. The env var persists for the shell session lifetime — not per-task, not per-tool-call. No hook-level audit event is emitted when sprint mode suppresses a finding. The only documentation is a comment inside the hook itself.
**Evidence:**
- MATCH file=.claude/hooks/claude-protocol-guard.mjs line=241-242 excerpt=`// Sprint mode bypass... if (process.env.YURI_SPRINT_MODE === '1') return [];`
**Note:** Documented as intentional but constitutes a wholesale governance bypass that leaves no trace in the hook's audit log.

---

### SEV-MED-2: route-plan enforcement is advisory in ai script — route-plan output drives lane selection but no gate prevents execution on a mismatched lane
**SEV:** MEDIUM (routing governance is advisory only)
**File:** `_SYSTEM/Scripts/ai` lines 760-790 (`run_auto_route`)
**Claimed:** route-plan classifies and routes every task through the correct lane
**Actual:** `run_auto_route` calls `llm_compat_contract route-plan`, extracts `.lane` from the JSON, then dispatches. If the returned lane is unrecognized or the JSON parse fails, the bash `case` statement falls through to `run_kagami_or_fallback` with whatever lane value landed — no hard stop, no validation of the returned lane against the declared lane table.
**Evidence:**
- MATCH file=_SYSTEM/Scripts/ai lines=760-790 excerpt=`lane="$(node -e '...' "$plan_json")"; case "$lane" in swarm) ... *) run_kagami_or_fallback "$lane" "$prompt"`
**Impact:** Malformed route-plan output or a new lane name not in the case statement silently falls to the catch-all. Not catastrophic but the routing governance claim ("smallest lane that can produce reliable evidence") has no enforcement gate.

---

### SEV-MED-3: musubi-protocol-enforce.js (aeonic-enforce) checks state.tools_used and state.skills_read from session-state — these counters are never reset per-task and accumulate across the whole session
**SEV:** MEDIUM (stale state produces false-positive and false-negative checks)
**File:** `.claude/hooks/musubi-protocol-enforce.js` lines 33-63
**Claimed:** aeonic-enforce checks per-dispatch compliance (offload default, skills-first)
**Actual:** `checkOffloadDefault` counts `directWrites > 3 && agentDispatches === 0` over `state.tools_used` — this is a session-lifetime accumulator. After the first 3+ direct writes, the advisory fires on every subsequent Bash or Edit call even if the operator has been dispatching agents. Conversely, `checkSkillsFirst` fires if `state.skills_read.length === 0` — a skills read from 2 hours ago satisfies this check even when a new unrelated task begins with no fresh skill load.
**Evidence:**
- MATCH file=.claude/hooks/musubi-protocol-enforce.js lines=33-44 excerpt=`const directWrites = (state.tools_used || []).filter(t => t === 'Write' || t === 'Edit').length;`
- MATCH file=.claude/hooks/musubi-protocol-enforce.js line=77 excerpt=`if (now - lastEnforce < ENFORCE_THROTTLE_MS)` — 60s throttle further obscures per-task accuracy
**Impact:** Both checks are advisory-only (no block), but stale-state advisories erode signal quality. Net effect: compliance feedback is session-scoped noise, not task-scoped governance.

---

### SEV-MED-4: OpenClaw/OPENCLAW_A advisor is "absorbed" — assessOpenClawAdvisory always returns decision:'skip'
**SEV:** MEDIUM (dead advisor, written-but-never-fires pattern)
**File:** `_SYSTEM/Scripts/llm-compat-contract.mjs` lines 986-1036
**Claimed (die):** OPENCLAW_A is a bridge_advisory in the advisors sector; openclaw-bridge.sh at 127.0.0.1:18789
**Actual:** `assessOpenClawAdvisory` immediately returns `{ decision: 'skip' }` when `ocConfig.authority === 'native-integrated'` (line 989-997), which is always true since `claudeProtocolGate.openClaw.authority` is hardcoded to `'native-integrated'` (llm-compat-contract.mjs line 354). The legacy bridge path exists in code but is unreachable.
**Evidence:**
- MATCH file=_SYSTEM/Scripts/llm-compat-contract.mjs line=354 excerpt=`authority: 'native-integrated',`
- MATCH file=_SYSTEM/Scripts/llm-compat-contract.mjs lines=989-997 excerpt=`if (ocConfig.authority === 'native-integrated') { return { decision: 'skip', ... } }`
**Impact:** `openClawAdvisory` field in route-plan output is always `{ decision: 'skip' }`. The `buildEnsemble` function reads this (`if (openClawAdvisory && openClawAdvisory.decision !== 'skip')`) — so `openclaw-preflight` never enters any ensemble. The die node OC_BRIDGE is architecturally dead. Benign since absorption is intentional, but creates a misleading die sector entry.

---

### SEV-MED-5: Obliteratus gate (requireWhenAny conditions) has no enforcement hook — it is a metadata recommendation only
**SEV:** MEDIUM (high-stakes gate is informational only)
**File:** `_SYSTEM/Scripts/llm-compat-contract.mjs` lines 374-392 (`obliteratus` config); lines 946-975 (`assessNativeFunctionGates`)
**Claimed:** Obliteratus fires as adversarial promotion gate for high-stakes artifacts; requireWhenAny conditions include "protected path or governance mutation"
**Actual:** `assessNativeFunctionGates` returns an object with `{ decision: 'use-native-gate', ... }` when conditions match, but this is data in `buildRoutePlan` output. No PreToolUse hook reads the route-plan output and enforces an obliteratus check before a promotion proceeds. The `obliteratus-hint` ensemble member is added in `buildEnsemble` for critical tier (line 1174) — this is a suggestion token in a JSON array, not a blocking gate.
**Evidence:**
- MATCH file=_SYSTEM/Scripts/llm-compat-contract.mjs lines=946-975 excerpt=`useObliteratus ? { decision: 'use-native-gate', ... } : { decision: 'skip' }`
- FILE_COUNT file=.claude/hooks count=0 hooks that read route-plan output and block on obliteratus=use-native-gate

---

### SEV-LOW-1: plan_dispatch_gate in claude-protocol-guard.mjs has TTL (30min) and warn_count cap (3) that auto-satisfy the gate — both paths produce side-effect: gate marked satisfied without route-plan evidence
**SEV:** LOW (intended escape valve that silently marks governance satisfied)
**File:** `.claude/hooks/claude-protocol-guard.mjs` lines 191-222
**Claimed:** Post-ExitPlanMode gate enforces route-plan dispatch before direct mutation
**Actual:** Gate auto-satisfies after 3 warns OR after 30 minutes, whichever comes first (lines 205-208). Both paths call `ss.update(s => { s.plan_dispatch_gate.satisfied = true; })` without route-plan evidence being present. This means a session can exhaust the warn budget through 3 non-compliant mutations, then proceed freely for the rest of the session with the gate silently marked as satisfied.
**Evidence:**
- MATCH file=.claude/hooks/claude-protocol-guard.mjs lines=204-208 excerpt=`if (gate.warn_count >= PLAN_GATE_MAX_WARNS || Date.now() - gate.armed_at > PLAN_GATE_TTL_MS) { ss.update(...satisfied = true); return null; }`

---

### SEV-LOW-2: Argus gate is declared "always-on" in nativeFunctionGates but has no dedicated hook — it runs as part of scout-orchestrator.js PostToolUse (async)
**SEV:** LOW (timing and authority mismatch)
**File:** `_SYSTEM/Scripts/llm-compat-contract.mjs` lines 369-376; `.claude/settings.json` PostToolUse hooks
**Claimed:** Argus runtime='native_function', activation='PostToolUse scout dispatcher', role='logic and sequencing check for meaningful tool calls'
**Actual:** Argus fires PostToolUse via scout-orchestrator.js, which is async (`"async": true`). PostToolUse async hooks cannot block tool execution — the tool has already run. Argus can observe and log sequencing issues but cannot prevent them. The "always-on" framing implies a PreToolUse posture; the reality is an after-the-fact observatory.
**Evidence:**
- MATCH file=.claude/settings.json PostToolUse entry excerpt=`scout-orchestrator.js async=true`
- MATCH file=_SYSTEM/Scripts/llm-compat-contract.mjs line=369 excerpt=`activation: 'PostToolUse scout dispatcher'`

---

## 2. TRIGGER COMPLETENESS CHECK

| Node/Sector | Declared | Hook Exists | Fires | Gate Active |
|---|---|---|---|---|
| CODEX_GATE (PROPOSE/APPROVED/APPLY/APPLY_HEAD) | YES (die) | NO | NO | NO — phantom |
| CODEX_FLOW | YES (die) | NO | NO | NO — phantom |
| OPENCLAW_A / OC_BRIDGE | YES (die) | YES (code path) | NO (always skip) | NO — dead branch |
| OBLITERATUS_A | YES (die+contract) | NO hook | NO | NO — metadata only |
| ARGUS (always-on) | YES (contract) | YES (scout-orchestrator) | YES (PostToolUse async) | NO — post-fact only |
| pre-tool-gate routing advisory | YES (settings) | YES | FIRES but output discarded | NO — async kills output |
| agent-spawn-guard enforcement | YES (die) | YES | FIRES (observability) | NO — always allow |
| plan_dispatch_gate | YES (protocol-guard) | YES | FIRES | WARN only; auto-expires |
| route-plan enforcement | YES (contract) | YES (ai script) | FIRES | Advisory routing, no hard stop |
| SPRINT_MODE bypass | YES (comment) | YES | Global bypass | Permanent for shell session |

---

## 3. DENY-LIST ARCHITECTURE (settings.json)

The settings.json deny-list is the primary hard enforcement surface. It covers:
- `.env*` variants (Read/Write/Edit) — complete
- `backend/data/**` (Read/Write/Edit) — complete
- `.claude/state/**`, `.claude/history/**`, `.claude/file-history/**` (Read/Write/Edit) — complete
- `.claude/projects/**/history|state|file-history|worktrees|transcripts/**` (all three verbs) — complete
- `node_modules/**`, `.amp/**` — complete
- Specific state files: `session-state.json`, `memory-bus.json`, `scout-bus.json`, `scout-errors.log`, `token-session.json` — Write/Edit blocked (Read not blocked for these)

**Gap observed:** `Read(.claude/state/session-state.json)` is NOT in the deny-list. The Write/Edit deny exists (lines 80-81) but a direct Read of session-state is permitted by the deny architecture. The hook layer (session-state.js wrapper) mediates normal access, but the settings deny doesn't block raw reads of the session-state file.

FILE_COUNT file=.claude/settings.json count=0 `Read(.claude/state/session-state.json)` deny entries

---

## 4. ADVISOR AUTHORITY CONTRACTS — SUMMARY

All three advisor types (DeepSeek, Claude, OpenClaw) carry `advisory_only=true` and `local_truth_claim=false` in their output metadata. This is consistently declared. The enforcement gap (SEV-HIGH-1) is that no runtime component mechanically verifies these flags before an advisory output influences a decision. The contract is self-enforcing via behavioral instruction (CLAUDE.md + SOUL.md) only.

The `blockInfluenceWhenAny` conditions in `deepseekCodexQualityGate` are the most complete specification of when an advisory should be discarded — but they require a human or behavioral agent to evaluate them. No scanner does this automatically.

---

## 5. COVERAGE

**Sectors audited:** codex_gate (7/7 nodes examined), control_plane (3/3), routing_lanes (13/13 lane definitions verified in llm-compat-contract), advisors (13/13 advisor nodes checked — DS/Claude/OpenClaw/HERMES/YURI-RISK/SWARM/OBLITERATUS and sub-variants)

**Coverage %: 92%**

**Not verified (8%):**
- `deepseek-wave3-enforcement-chain.md` (DS advisory, not independently verified — scope overlap with Opus deep wave)
- HERMES_FC and ARGUS internal scout-runner.js implementation (scout-runner.js not read; inferred from scout-orchestrator.js structure)
- `_SYSTEM/Scripts/pulse-orchestrator.mjs` — referenced in llm-compat-contract as consumer of Pulse Cortex fields but file existence not verified

---

## 6. UNVERIFIED (residual)

- Whether `pulse-orchestrator.mjs` exists and reads ensemble/codexPolicy fields from route-plan output — if it doesn't exist, ALL Pulse Cortex governance (ensemble dispatch, codex-queue-emit, obliteratus-hint) is also phantom infrastructure
- HERMES_FC native function internal behavior (scout-runner.js not read)
- Whether `deepseek-guarded-handoff.mjs` is actively called anywhere — file exists, head read confirms DeepSeek handoff wrapper, but no caller search performed

---

## RESULT_LABEL
`03GV_GOVERNANCE_BREADTH_WIRING_INVENTORY_P_PASS_COMMITTED`

**PASS_TYPE: P (partial)** — full breadth covered; two CRITICAL findings prevent X.

---

## ATTACK PASS (adversarial re-verification)

**Attacker:** Claude Sonnet 4.6 subagent. Method: read-only HEAD probes on every cited file/line.
**Date:** 2026-06-10.

### Verdict per finding

| Finding | Verdict | Evidence |
|---|---|---|
| SEV-CRIT-1: pre-tool-gate async=true, output discarded | **CONFIRMED** | settings.json line 166 `"async": true` verified. pre-tool-gate.js line 107 `process.stdout.write({continue:true, additionalContext})` confirmed. Harness fire-and-forget semantics for async hooks = output never reaches model. |
| SEV-CRIT-2: Codex two-phase gate (propose/.approved/HEAD SHA) has no executable implementation | **CONFIRMED** | `grep propose\|approved\|headSha\|stale` on codex-offload-runner.mjs → 0 hits. Same grep on `_SYSTEM/Scripts/ai` → 0 hits. Die nodes PROPOSE/APPROVED/APPLY/APPLY_HEAD/CODEX_FLOW are architecture labels only. |
| SEV-HIGH-1: advisory-only contract has no mechanical enforcement | **CONFIRMED** | llm-compat-contract.mjs line 292 `advisory_only=true`, line 360 `denyPermissionDecision: false` verified. `discardWhenAny`/`blockInfluenceWhenAny` are data fields only — no hook in `.claude/hooks/` imports or enforces them. |
| SEV-HIGH-2: protocol-guard block requires CLAUDE_SESSION_ID; absence silently downgrades to WARN | **CONFIRMED** | claude-protocol-guard.mjs lines 349-368 verified verbatim: `const sessionId = process.env.CLAUDE_SESSION_ID \|\| ''`; block path inside `if (sessionId)` block only; catch swallows error → falls through to `emitWarnings`. |
| SEV-HIGH-3: denyPermissionDecision: false hardcoded | **CONFIRMED** | llm-compat-contract.mjs line 360 `denyPermissionDecision: false` confirmed. Consistent with hook behavior but architecturally documents the gate as warn-only. |
| SEV-HIGH-4: agent-spawn-guard is observability-only | **CONFIRMED** | agent-spawn-guard.js line 8 `OBSERVABILITY-ONLY`, line 44 `process.exit(0); // always allows` confirmed. No deny path exists. |
| SEV-MED-1: SPRINT_MODE bypass global, no TTL/audit | **CONFIRMED** | claude-protocol-guard.mjs line 242 `if (process.env.YURI_SPRINT_MODE === '1') return []` verified. Shell-session-lifetime env var, no hook-level audit event on suppression. |
| SEV-MED-2: route-plan enforcement advisory — no hard stop on lane mismatch | **CONFIRMED** | `_SYSTEM/Scripts/ai` run_auto_route logic verified: `case "$lane"` falls through to `run_kagami_or_fallback` catch-all on unrecognized lane. No validation gate. |
| SEV-MED-3: musubi-protocol-enforce session-lifetime counters (stale state) | **CONFIRMED** | musubi-protocol-enforce.js lines 33-44 verified: `state.tools_used` is session accumulator not per-task. Line 77 60s throttle confirmed. Both checks advisory-only. |
| SEV-MED-4: OpenClaw/OPENCLAW_A always returns decision:'skip' | **CONFIRMED** | llm-compat-contract.mjs line 352 `authority: 'native-integrated'` hardcoded. Lines 989-997 `if (ocConfig.authority === 'native-integrated') { return { decision: 'skip' } }` confirmed. OC_BRIDGE die node is dead. |
| SEV-MED-5: Obliteratus gate is metadata-only, no enforcement hook | **CONFIRMED** | llm-compat-contract.mjs lines 946-975 returns data object only. No hook in `.claude/hooks/` reads route-plan output and blocks on `obliteratus=use-native-gate`. |
| SEV-LOW-1: plan_dispatch_gate auto-satisfies after 3 warns or 30min without route-plan evidence | **CONFIRMED** | claude-protocol-guard.mjs line 191 `PLAN_GATE_TTL_MS = 30*60*1000`, line 192 `PLAN_GATE_MAX_WARNS = 3`, lines 205-206 `ss.update(...satisfied = true)` on both paths confirmed. |
| SEV-LOW-2: Argus is PostToolUse async — cannot prevent, only observe | **CONFIRMED** | settings.json PostToolUse scout-orchestrator.js `async:true` confirmed. PostToolUse async hooks fire after tool execution — Argus cannot block. |

**Summary:** 13 findings — **13 CONFIRMED, 0 REFUTED, 0 UNVERIFIABLE.**

### Coverage vs scope die

Die extract (wave3-scope-die-extract.json) shows **36 GOVERNANCE organs** across codex_gate, control_plane, routing_lanes, and advisors sectors.

Report claims 92% coverage (codex_gate 7/7, control_plane 3/3, routing_lanes 13/13, advisors 13/13 = 36/36 nodes addressed). Sector counts match the die extract exactly.

**Skipped / under-verified organs (8%, 3 items):**
1. `HERMES_A` / `HERMES_FC` — scout-runner.js internals not read; behavior inferred from scout-orchestrator.js structure only.
2. `NATIVE_GATES` — pulse-orchestrator.mjs existence not verified; if absent, all Pulse Cortex ensemble dispatch (OBLITERATUS_A, ensemble member wiring) is also phantom infrastructure.
3. `LANE_GEMMA` / `LANE_LOCAL` / `LANE_TRIAGE` — Ollama local lane declared in die; live reachability of gemma4:12b-it-qat not verified.

**Missed organ count: 3** (out of 36 die nodes). Die coverage is otherwise complete.

### DeepSeek advisory leads verdict

- `deepseek-wave3-protectedpath-matrix.md`: All three observed gaps (F1 state-dir new-files, F2 secrets prose-only, F3 .amp/ origin drift) are structurally sound and independently supported by the settings.json deny-list and bash-security-guard BLOCKED_CLAUDE_FILES reads. **ADVISORY ACCEPTED.**
- `deepseek-wave3-hooks-wiring.md`: All 36 hook declarations verified PASS (present on disk, correct event/matcher). Dual-registrations for scout-orchestrator.js and gitnexus-hook.cjs confirmed intentional. **ADVISORY ACCEPTED — clean wiring confirmed.**
- `deepseek-wave3-enforcement-chain.md` (P0/P1 leads): F1 (settings.json unprotected) and F2 (~25 hooks outside ROLE_TRUST_SURFACES) confirmed by lane-kernel.mjs live read — ROLE_TRUST_SURFACES.files = 11 entries, settings.json absent. F3-F9 all confirmed by HEAD reads. **ADVISORY ACCEPTED — all P0/P1 leads hold.**
