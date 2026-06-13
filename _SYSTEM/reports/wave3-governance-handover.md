# YURI Wave-3 Governance Domain — Handover Instruction for Opus 4.8

> **Operator note (Marcel):** paste this file's path into the Opus session as the task packet root. Resolve owner decisions D-G1 through D-G4 (§6) before or at session start; D-G1 (trust-root hardening) is the highest-value call and is blocking for WP-G.1 direction. Status: **PACKAGES READY — Codex addendum blocked until Jun 11 credits reset; re-dispatch `/tmp/wave3-codex-spec.md` (copy saved at `_SYSTEM/reports/wave3-codex-spec-saved.md`) after reset.**

---

## 0 · Mission

You are fixing the YURI governance domain so that the enforcement chain does what it claims: hard blocks are actually hard, advisory outputs are mechanically labelled advisory, and the trust root cannot be silently bypassed. A completed multi-layer audit (attack-confirmed 13/13 findings in the breadth audit, 8/8 in the enforcement-chain deep dive) found: **the settings.json deny-list is the only genuine hard floor; everything above it is advisory or lexical-best-effort, and several gates claim to block when they only warn or are fire-and-forget.**

Non-negotiable framing: governance is the enforcement floor for everything else. A gate that claims to block but only warns creates false confidence across the entire system. Fix the trust-root gap and the dead advisory organs first; the advisory-labelling cleanup last.

**Completeness contract:** every attack-confirmed finding in the audit ledger appears exactly once below as a workpackage or an explicit PARKED entry. If you find one missing, flag it in your session report.

**Document map:**
- `_SYSTEM/reports/wave3-governance-audit.md` — primary breadth audit (13 findings). Read ATTACK PASS section for each finding's confirmed verdict.
- `_SYSTEM/reports/wave3-enforcement-chain-deep.md` — deep-dive (8 findings, F1-F8). Attack-confirmed 8/8.
- `_SYSTEM/lane-output/deepseek-wave3-enforcement-chain.md` — DS advisory (P0/P1 leads confirmed). [DS-verified]
- `_SYSTEM/lane-output/deepseek-wave3-protectedpath-matrix.md` — DS advisory (3 gaps, all confirmed). [DS-verified]
- `_SYSTEM/lane-output/deepseek-wave3-hooks-wiring.md` — DS advisory (36/36 wiring CLEAN). [DS-verified]
- This file — the work program. The only execution order that is authoritative.

---

## 1 · Context loadout (read in this order, then start)

1. `CLAUDE.md` (repo root — loads persona + origin automatically)
2. `_SYSTEM/reports/wave3-governance-audit.md` — read FINDINGS + ATTACK PASS fully
3. `_SYSTEM/reports/wave3-enforcement-chain-deep.md` — read FINDINGS + ATTACK PASS fully
4. This file, fully
5. Per phase: the target files listed in that phase's workpackages — read each fully before editing it

Run `node _SYSTEM/Scripts/xref-query.mjs "governance enforcement hook settings trust-root"` once at session start.

---

## 2 · Hard rules (violations void the work)

- **No commit, no push.** Marcel holds commit authority.
- **Protected paths untouchable**: `backend/data/`, `.claude/state/`, `.claude/history/`, `.env`, `node_modules/`, `.amp/`.
- **No dependency installs. No destructive commands. Never `claude -p`/`--print`/SDK.**
- **Scope discipline:** edit ONLY files named in the workpackage you are executing. If a fix seems to require touching an unlisted file, stop, document why in your report, and flag it.
- **Evidence discipline:** every fix ends with its acceptance command run and the output captured. "Looks right" without command output is not done.
- **Owner-decision boxes** (marked `🔶 OWNER` below): do NOT pick silently. Implement the recommended default ONLY if Marcel pre-approved it in the packet; otherwise implement nothing for that item and list it in your session report.
- **Trust surface edits** (WP-G.1): `ROLE_TRUST_SURFACES.files` in `lane-kernel.mjs` is self-protecting — dev can edit it, coworker cannot. Verify your edit does not accidentally narrow the set.
- **Hook edits:** whenever editing a hook, verify you are editing the file that `settings.json` actually registers (canonical path). Do not create a duplicate.

---

## 3 · Working agreement

- **One phase per work block.** Finish a phase — all fixes + all acceptance runs — before opening the next.
- **Per fix:** read current code at the cited anchor → confirm the audit's "current behavior" still matches HEAD (if it doesn't, STOP, note the drift, move on) → apply the change → run the acceptance command → capture output.
- **DS advisory lead verdicts already applied:** `deepseek-wave3-enforcement-chain.md` P0/P1 leads, `deepseek-wave3-protectedpath-matrix.md` F1-F3, and `deepseek-wave3-hooks-wiring.md` CLEAN verdict are all CONFIRMED by the attack pass. Accept them; do not re-derive.
- **End of session report:** changed files (complete list), every command run with pass/fail, owner-decision items left open, anything you stopped on.

---

## 4 · Fix phases

### Phase 0 — Baseline freeze
```bash
# Record before touching anything
node _SYSTEM/Scripts/lane-kernel.mjs 2>/dev/null | head -5 || cat _SYSTEM/Scripts/lane-kernel.mjs | grep -c "ROLE_TRUST_SURFACES"
grep -c "permissionDecision" .claude/hooks/bash-security-guard.js
grep -c "permissionDecision" .claude/hooks/operator-write-guard.js
node -e "const {createRequire}=require('module'); const r=createRequire(__filename); try{const k=r('./.claude/hooks/lane-kernel.mjs'); console.log('import ok')}catch(e){console.log('esm, use --input-type=module')}" 2>/dev/null || echo "ESM module, verified via source read"
```
Any unexpected failure before you start → stop, report, wait.

---

### Phase 1 — Trust-root gap: settings.json coworker-edit hardening (highest-value finding in the chain)

**WP-G.1** [CRITICAL → HIGH by role scope] [CONFIRMED: governance-audit F8, deep-dive F8] 🔶 D-G1 `.claude/settings.json` not in `ROLE_TRUST_SURFACES` — coworker Write/Edit = advisory WARN only

- **Files:** `.claude/hooks/lane-kernel.mjs` (ROLE_TRUST_SURFACES.files array), `.claude/hooks/bash-security-guard.js` (BLOCKED_CLAUDE_FILES array, lines 14-22), `_SYSTEM/Scripts/llm-compat-contract.mjs` (CONTROL_FILE_PREFIXES — documentation update only)
- **Evidence:** [deep-dive F8, CONFIRMED]. ROLE_TRUST_SURFACES.files = 11 entries; `.claude/settings.json` absent. BLOCKED_CLAUDE_FILES = 7 entries; only `settings.local.json` present, NOT `settings.json`. A coworker editing `settings.json` to delete guard registrations is met with only a claude-protocol-guard WARN, not a DENY from operator-write-guard.
- **Three branches (owner resolves via D-G1):**
  - **Option A (recommended — deny-rule addition):** Add `.claude/settings.json` (and `.claude/settings.local.json`) to `ROLE_TRUST_SURFACES.files` in `lane-kernel.mjs`. Also add `settings.json` to `BLOCKED_CLAUDE_FILES` in `bash-security-guard.js`. This makes coworker Write/Edit to settings.json a hard DENY from operator-write-guard (file-tool surface, fail-closed realpath) and a hard DENY from bash-security-guard on Bash writes. Dev (owner) is exempt from operator-write-guard (guard returns null for dev). Blast radius: trivially low — adds two array entries.
  - **Option B (hook self-protection):** Inside `claude-protocol-guard.mjs`, upgrade the settings.json mutation path from `additionalContext` WARN to `permissionDecision: 'deny'` when role===coworker. Requires importing the role resolver into the protocol guard. More complex than Option A; adds role logic to a hook that currently does not check role.
  - **Option C (accept-with-monitoring):** Leave the gap; add a `console.error` audit log line in `operator-write-guard.js` when settings.json is accessed by coworker. Documents the risk, does not close it. Acceptable only if Marcel determines coworker threat model does not include settings.json mutation.
- **Acceptance (Option A):** `node -e "const k = require('./.claude/hooks/lane-kernel.mjs')" 2>&1 | head` or source-read: `grep 'settings.json' .claude/hooks/lane-kernel.mjs` returns the new entry. `grep 'settings.json' .claude/hooks/bash-security-guard.js` returns entry in BLOCKED_CLAUDE_FILES. Verify dev session can still edit settings.json (operator-write-guard returns null for dev role — no change).
- **Regression:** verify that adding settings.json to ROLE_TRUST_SURFACES does NOT prevent the owner (dev role) from editing hooks via Write/Edit tool. operator-write-guard.js line 89: `if (activeRole !== 'coworker') return null` — dev is exempt. Safe.
- **Codex addendum:** `_SYSTEM/reports/wave3-codex-spec-saved.md` → fold in governance second-opinion after Jun 11 credit reset.

---

### Phase 2 — Dead advisory organ cleanup: pre-tool-use.js stderr fix

**WP-G.2** [MEDIUM] [CONFIRMED: deep-dive F3] `pre-tool-use.js` emits structured advisory output to STDERR — silently dropped by harness

- **Files:** `.claude/hooks/pre-tool-use.js:38-42` (`emitContext` function)
- **Evidence:** [deep-dive F3, CONFIRMED]. `process.stderr.write(JSON.stringify({hookSpecificOutput:{...additionalContext}}))`. PreToolUse structured channel is stdout only; stderr JSON is non-blocking and discarded. All compaction tiers, cross-terminal-memory update injection, and token-economy advisories compute correctly but never reach the model.
- **Direction:** Change `process.stderr.write` → `process.stdout.write` in `emitContext`. One line. Verify the JSON shape remains `{ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "..." } }` (matches how bash-security-guard and claude-protocol-guard emit advisory context).
- **Acceptance:** `grep "process.stdout.write\|process.stderr.write" .claude/hooks/pre-tool-use.js` — confirm only stdout references for the `hookSpecificOutput` path. `grep -c "stderr" .claude/hooks/pre-tool-use.js` should be 0 for the JSON output path (error logging to stderr is fine; advisory output must be stdout).
- **Regression:** the hook is advisory-only (never meant to block); changing to stdout adds advisory reach, never blocks. No regression risk on the enforcement surface.

---

### Phase 3 — Protocol-guard CLAUDE_SESSION_ID silent downgrade: documentation + comment fix

**WP-G.3** [HIGH] [CONFIRMED: governance-audit SEV-HIGH-2] Protocol-guard block requires `CLAUDE_SESSION_ID` in env; absence silently downgrades critical-tier block to WARN

- **Files:** `.claude/hooks/claude-protocol-guard.mjs:348-368`
- **Evidence:** [governance-audit SEV-HIGH-2, CONFIRMED]. Block path inside `if (sessionId)` block only; catch swallows error → falls through to `emitWarnings`. YURI_SPRINT_MODE=1 blanket-suppresses before any check.
- **Direction:** This is a documentation + comment hardening, NOT a behavior change (changing the block condition to fire without a session ID would require architectural decisions about what `complexityTier` means in headless contexts). Fix: (1) Add a `process.stderr.write` warning comment when `sessionId === ''` and the gate would-have-blocked: `[protocol-guard] WARN: CLAUDE_SESSION_ID absent — critical-tier block downgraded to WARN`. This makes the degradation visible in logs. (2) Add a comment above the `if (sessionId)` block: `// NOTE: block path requires CLAUDE_SESSION_ID — absent in subagent/headless contexts → falls to WARN`. (3) Correct the block-registration order comment in `energy-enforce.mjs:11-12` that incorrectly claims registration order imposes execution order (all hooks run in PARALLEL per harness spec).
- **Acceptance:** `grep "CLAUDE_SESSION_ID absent" .claude/hooks/claude-protocol-guard.mjs` returns the warning. `grep "PARALLEL" .claude/hooks/energy-enforce.mjs` returns the corrected comment.
- **Regression:** advisory only; no behavior change. Zero regression risk.

---

### Phase 4 — Musubi-protocol-enforce stale state: advisory accuracy improvement

**WP-G.4** [MEDIUM] [CONFIRMED: governance-audit SEV-MED-3] `musubi-protocol-enforce.js` uses session-lifetime accumulators — stale state produces false-positive/false-negative checks

- **Files:** `.claude/hooks/musubi-protocol-enforce.js:33-63`
- **Evidence:** [governance-audit SEV-MED-3, CONFIRMED]. `state.tools_used` is a session accumulator. After 3+ direct writes, `checkOffloadDefault` fires advisory on every subsequent call even if agents are dispatching. `checkSkillsFirst` is satisfied by a skills_read from hours ago. Both checks are advisory-only (no block), but erode signal quality.
- **Direction:** Add a `task_id`-based reset mechanism. Options: (a) Read `state.last_task_reset_at` timestamp; if the last reset is >5 minutes ago and `state.tools_used.length` has not changed, clear the per-task counters (heuristic task boundary). (b) Simpler: add a `MAX_DIRECT_WRITE_LOOKBACK = 20` constant; slice `state.tools_used` to the last 20 entries before counting `directWrites`. This limits the false-positive window to recent history without requiring a task boundary signal. Option B is recommended (lower risk, no new state writes).
- **Acceptance:** `grep "MAX_DIRECT_WRITE_LOOKBACK\|slice(-" .claude/hooks/musubi-protocol-enforce.js` returns the guard. The advisory will no longer fire on Edit calls made 3+ hours ago in the same session.
- **Regression:** advisories only (no block). Slicing reduces false positives; cannot increase false negatives from current state (stale state = already false-negative).

---

### Phase 5 — Ghost die cleanup: plan_dispatch_gate auto-expire documentation; dead/misleading die entry comments

**WP-G.5** [LOW] [CONFIRMED: governance-audit SEV-LOW-1] `plan_dispatch_gate` auto-satisfies after 3 warns or 30min without route-plan evidence

- **Files:** `.claude/hooks/claude-protocol-guard.mjs:191-222`
- **Evidence:** [governance-audit SEV-LOW-1, CONFIRMED]. Both TTL (30min) and warn-count (3) paths call `ss.update(s => { s.plan_dispatch_gate.satisfied = true })` without route-plan evidence present.
- **Direction:** This is an honest behavior that should be documented, not a silent bug to hide. Add a comment block at lines 204-208: `// AUTO-EXPIRE: gate self-satisfies after PLAN_GATE_MAX_WARNS (3) warns OR PLAN_GATE_TTL_MS (30min) — by design. // This is an escape valve to prevent infinite blocking in interactive sessions. // Consequence: a session can exhaust the warn budget then proceed freely — accept this as advisory-tier behavior.` Separately, add a `process.stderr.write` log line at the satisfaction point: `[plan-dispatch-gate] EXPIRED: gate auto-satisfied via ${reason} — session may proceed without route-plan.`
- **Acceptance:** `grep "AUTO-EXPIRE\|EXPIRED.*gate" .claude/hooks/claude-protocol-guard.mjs` returns both the comment and the log line.
- **Regression:** no behavior change; documentation only + stderr audit log.

**WP-G.6** [LOW] [CONFIRMED: governance-audit SEV-LOW-2] Argus framing correction — "always-on" implies pre-fact; reality is PostToolUse async (cannot prevent, only observe)

- **Files:** `_SYSTEM/Scripts/llm-compat-contract.mjs` (Argus activation field comment), `.claude/hooks/scout-orchestrator.js` (header comment if present)
- **Evidence:** [governance-audit SEV-LOW-2, CONFIRMED]. Argus fires PostToolUse async — cannot block tool execution. "Always-on" framing implies PreToolUse posture.
- **Direction:** Update `llm-compat-contract.mjs` Argus activation comment from `'PostToolUse scout dispatcher'` to `'PostToolUse scout dispatcher (async — observes only; cannot prevent tool execution)'`. Add a matching comment to `scout-orchestrator.js` header if one exists. No behavior change.
- **Acceptance:** `grep -n "PostToolUse.*async.*observes\|cannot prevent" _SYSTEM/Scripts/llm-compat-contract.mjs` returns the updated comment.
- **Regression:** documentation only. Zero.

**WP-G.7** [MEDIUM] [CONFIRMED: governance-audit SEV-MED-4] OpenClaw OPENCLAW_A die node is dead — OC_BRIDGE always returns `decision:'skip'`; prune the die entry

- **Files:** `_SYSTEM/reports/wave3-scope-die-extract.json` (if Marcel approves die pruning), OR `_SYSTEM/Scripts/llm-compat-contract.mjs:354,989-997` (add explicit dead-branch comment)
- **Evidence:** [governance-audit SEV-MED-4, CONFIRMED]. `authority: 'native-integrated'` hardcoded → `assessOpenClawAdvisory` immediately returns `{decision:'skip'}` → `openclaw-preflight` never enters any ensemble. OC_BRIDGE die node is architecturally dead.
- **Direction (two options — Marcel resolves):** (a) Add a comment at `llm-compat-contract.mjs:354`: `// DEAD BRANCH: authority='native-integrated' causes assessOpenClawAdvisory to always return {decision:'skip'}. OC_BRIDGE die node is a ghost — OpenClaw is absorbed into native function routing.` (b) Also prune the OPENCLAW_A and OC_BRIDGE nodes from `wave3-scope-die-extract.json` in a housekeeping pass. Recommended: do (a) now; (b) during the next die housekeeping pass.
- **Acceptance:** `grep "DEAD BRANCH.*native-integrated\|OC_BRIDGE.*ghost" _SYSTEM/Scripts/llm-compat-contract.mjs` returns the comment.
- **Regression:** documentation only. Zero.

---

### Phase 6 — Phantom codex_gate sector: owner decision on build vs delete

**WP-G.8** [CRITICAL] [CONFIRMED: governance-audit SEV-CRIT-2] 🔶 D-G2 Codex two-phase gate (PROPOSE/APPROVED/APPLY/APPLY_HEAD/CODEX_FLOW) has no executable implementation — 7 phantom die nodes

- **Files:** `_SYSTEM/Scripts/codex-offload-runner.mjs`, `_SYSTEM/Scripts/ai`, `_SYSTEM/reports/wave3-scope-die-extract.json`, `_SYSTEM/Scripts/llm-compat-contract.mjs:26`
- **Evidence:** [governance-audit SEV-CRIT-2, CONFIRMED]. Zero hits for `propose`, `approved`, `headSha`, `stale` in either codex-offload-runner.mjs or `_SYSTEM/Scripts/ai`. The die sector (7 nodes: PROPOSE, APPROVED, APPLY, APPLY_HEAD, CODEX_FLOW, PROP_DRYRUN, CDX_FULL) represents architecture labels only.
- **Two branches (owner resolves via D-G2):**
  - **Option A (build the two-phase gate):** In `codex-offload-runner.mjs`, implement: (1) propose phase — write a `.codex-propose/<task-id>.json` with the task spec + HEAD SHA snapshot; (2) approved check — require presence of `.codex-propose/<task-id>.approved` marker before executing; (3) apply phase — after Codex output arrives, re-verify HEAD SHA matches snapshot before applying; emit DENY if HEAD advanced (stale protection). This is a P2 build task that makes the advertised gate real. Estimated: ~100 lines. Acceptance: `grep "propose\|approved\|headSha" _SYSTEM/Scripts/codex-offload-runner.mjs` returns the new implementation; a test dispatch produces a `.codex-propose/*.json` file.
  - **Option B (delete the 7 die nodes):** Remove PROPOSE, APPROVED, APPLY, APPLY_HEAD, CODEX_FLOW, PROP_DRYRUN, CDX_FULL from `wave3-scope-die-extract.json`. Add a comment to `llm-compat-contract.mjs:26`: `// CODEX_GATE sector pruned 2026-06-10 — the two-phase propose/approve/apply gate was architecture-only; no implementation exists. Codex dispatches go directly via run_kagami_or_fallback.` This is honest and removes misleading die nodes. Lower cost, kills the feature claim.
- **Acceptance (B):** `grep "PROPOSE\|APPROVED\|APPLY_HEAD\|CODEX_FLOW\|PROP_DRYRUN\|CDX_FULL" _SYSTEM/reports/wave3-scope-die-extract.json | wc -l` returns 0. `grep "CODEX_GATE.*pruned" _SYSTEM/Scripts/llm-compat-contract.mjs` returns the comment.
- **Regression note:** Codex dispatches already bypass the gate (it does not exist). Either option leaves dispatch behavior unchanged.

---

### Phase 7 — Advisory-only boundary: mechanical labelling audit

**WP-G.9** [HIGH] [CONFIRMED: governance-audit SEV-HIGH-1] Advisory-only contract for DeepSeek/Claude advisors has no mechanical enforcement — `discardWhenAny` and `blockInfluenceWhenAny` are data-only

- **Files:** `_SYSTEM/Scripts/llm-compat-contract.mjs:288-320, 805-887, 889-929`
- **Evidence:** [governance-audit SEV-HIGH-1, CONFIRMED]. `advisoryOnly: true` and `discardWhenAny` arrays are data fields in `buildRoutePlan` output — no hook, no executor enforces them at dispatch time.
- **Direction:** This is a governance posture decision. Short of building a runtime scanner (which would be a P2 build task), the highest-value fix is documentation + a runtime assertion helper. (1) Add a JSDoc block above `buildRoutePlan`: `/** @governance: advisory boundary is SELF-ENFORCING via behavioral contract (CLAUDE.md + SOUL.md). discardWhenAny and blockInfluenceWhenAny conditions are model-readable data fields; no hook mechanically enforces them. Runtime enforcement would require a route-plan consumer scanner — see PARKED-G.A. */` (2) Add a `validateAdvisoryBoundary(routePlan)` helper function that reads `discardWhenAny` and logs a stderr warning when any condition matches. Export it so callers can invoke it. This is not a blocking gate — it is a logging helper that makes the discard conditions observable. (3) Update `denyPermissionDecision: false` in llm-compat-contract.mjs:360 to add a comment: `// ARCHITECTURAL: gate is warn-only by design; blockInfluenceWhenAny is a behavioral contract condition, not a runtime DENY.`
- **Acceptance:** `grep "advisory boundary.*SELF-ENFORCING\|validateAdvisoryBoundary" _SYSTEM/Scripts/llm-compat-contract.mjs` returns both the doc comment and the helper export.
- **Regression:** no enforcement change. Helper is additive.

---

### Phase 8 — Route-plan lane validation: add lane-table guard

**WP-G.10** [MEDIUM] [CONFIRMED: governance-audit SEV-MED-2] `run_auto_route` in `ai` script falls through to catch-all on unrecognized lane name

- **Files:** `_SYSTEM/Scripts/ai:760-790` (`run_auto_route` function)
- **Evidence:** [governance-audit SEV-MED-2, CONFIRMED]. `case "$lane"` falls through to `run_kagami_or_fallback` catch-all on unrecognized lane. No validation of returned lane against declared lane table.
- **Direction:** Add a validation block after lane extraction: define a `VALID_LANES` list (claude, deepseek-flash, deepseek-pro, codex, swarm, gemma, local, kimi, nemotron, triage, gpt-oss). If `$lane` is not in the list, log a stderr warning: `[auto-route] unrecognized lane '${lane}' from route-plan — falling through to kagami. Check llm-compat-contract lane table.` Then proceed to the existing fallback (do NOT hard-fail — this must remain fail-open to avoid blocking all work on a future lane name). This makes the catch-all visible without making routing fragile.
- **Acceptance:** `grep "VALID_LANES\|unrecognized lane" _SYSTEM/Scripts/ai` returns the validation block and warning.
- **Regression:** advisory warning added; routing behavior unchanged (catch-all still fires).

---

### Phase 9 — SPRINT_MODE bypass audit trail

**WP-G.11** [MEDIUM] [CONFIRMED: governance-audit SEV-MED-1] `YURI_SPRINT_MODE=1` global bypass has no hook-level audit event on suppression

- **Files:** `.claude/hooks/claude-protocol-guard.mjs:241-242`
- **Evidence:** [governance-audit SEV-MED-1, CONFIRMED]. `if (process.env.YURI_SPRINT_MODE === '1') return []` exits before any check. Shell-session-lifetime env var. No audit event emitted when sprint mode suppresses a finding.
- **Direction:** Before the `return []`, emit a single stderr line: `[protocol-guard] SPRINT_MODE=1 active — all protocol checks suppressed this call`. This adds a trace without adding cost. Do NOT change the suppression behavior itself (sprint mode is an intentional authorized bypass).
- **Acceptance:** `grep "SPRINT_MODE.*suppressed\|sprint.*protocol.*suppressed" .claude/hooks/claude-protocol-guard.mjs` returns the audit line.
- **Regression:** sprint mode still suppresses all checks. One stderr line added per suppressed call.

---

## 5 · PARKED entries

| ID | Finding | Reason parked |
|---|---|---|
| PARKED-G.A | Advisory-boundary runtime scanner (governance-audit SEV-HIGH-1 extension) | Building a scanner that reads route-plan JSON and enforces `discardWhenAny` / `blockInfluenceWhenAny` conditions mechanically is a P2 build task requiring a new hook or executor. The advisory is self-enforcing via CLAUDE.md behavioral contract; WP-G.9 adds a logging helper as a first step. Full scanner deferred until the governance build sprint. |
| PARKED-G.B | HERMES_FC / SCOUT_HERMES ghost die (hidden-meta audit, governance cross-reference) | Not found in scout-orchestrator.js, not in any agent definition. No retirement breadcrumb. Parked as a phantom die node — either build it (add to scout-orchestrator spawn list + create agents/hermes-fc.md) or prune from the die in the next housekeeping pass. No active guard is missing; ARGUS + YURI-RISK are the live scouts. |
| PARKED-G.C | LANE_GEMMA / LANE_LOCAL / LANE_TRIAGE — Ollama local lane live reachability | Declared in die; `gemma4:12b-it-qat` reachability not verified (attack pass §3 item 3). Deferred to a local-lane health check pass — requires Ollama running locally, which is out of read-only audit scope. |
| PARKED-G.D | HERMES_A / HERMES_FC scout-runner.js internals | scout-runner.js internals not read in either audit (advisory/enrichment, not deny-capable enforcement). Deferred to a targeted scout-runner audit if HERMES_FC is ever built. |
| PARKED-G.E | Obliteratus gate runtime enforcement (governance-audit SEV-MED-5) | `assessNativeFunctionGates` returns data objects only; no hook reads route-plan output and blocks on `obliteratus=use-native-gate`. Building a true Obliteratus enforcement hook is a P2 governance build task. The `obliteratus-hint` ensemble suggestion is the current posture. Deferred. |
| PARKED-G.F | `Read(.claude/state/session-state.json)` not in deny-list | Write/Edit deny exists; raw Read is permitted by the deny architecture. The hook layer (session-state.js wrapper) mediates normal access. Adding a Read deny would break session-state consumers. Deferred as low-impact (Read is not a mutation vector). |
| PARKED-G.G | DS advisory: `deepseek-wave3-protectedpath-matrix.md` F1 (state-dir new-files), F2 (secrets prose-only), F3 (.amp/ origin drift) | All three structural observations are confirmed by settings.json deny-list reads. F1 and F2 are accepted as design constraints (prose behavioral contract for secrets; state dir deny covers existing files). F3 (.amp/ origin) is a legacy entry. No active threat vector; deferred to config housekeeping. [DS-verified] |

---

## 6 · Owner decisions

| ID | Decision | Recommendation | Tradeoffs | Phase gated |
|---|---|---|---|---|
| **D-G1** | Trust-root hardening for settings.json coworker mutation: deny-rule addition (Option A) vs hook self-protection (Option B) vs accept-with-monitoring (Option C) | **Option A** — add settings.json to ROLE_TRUST_SURFACES.files and BLOCKED_CLAUDE_FILES. Lowest blast radius (~2 array entries), closes the highest-value finding in the chain. Dev (owner) is unaffected (operator-write-guard exempts dev role). | Option A: minimal change, closes the gap immediately. Option B: adds role logic to protocol-guard (more complex, more hooks in play). Option C: leaves the gap open, documented risk — acceptable only if the coworker threat model is explicitly out of scope. | Phase 1 (blocking WP-G.1) |
| **D-G2** | Phantom codex_gate sector: build the two-phase propose/approved/HEAD-SHA/apply gate (Option A) vs delete the 7 die nodes (Option B) | **Option B** (delete) unless Marcel has active plans to formalize Codex dispatch governance. The two-phase gate is valuable architecture but takes ~100 lines to implement correctly. Building it before the rest of the governance domain is cleaned up adds complexity without a live enforcer. Delete the die nodes, add the honest comment, revisit in a governance build sprint. | Option A: real gate, advertised behavior matches implementation, ~100 lines of new code with a new propose/approve flow. Option B: honest, immediate, zero new code. | Phase 6 (blocking WP-G.8) |
| **D-G3** | `denyPermissionDecision: false` in llm-compat-contract — keep warn-only posture vs arm to deny for critical-tier sessions | **Keep warn-only** (current posture). The settings.json deny-list + operator-write-guard are the hard floor; claude-protocol-guard is a behavioral advisory layer. Arming it to deny would require reliable CLAUDE_SESSION_ID propagation to all contexts (currently fails silently for subagents — SEV-HIGH-2). Fix the session-ID propagation first if deny posture is desired. | Warn-only: consistent with current design; advisory governance. Deny-armed: requires CLAUDE_SESSION_ID fix first; may block legitimate subagent work if propagation is incomplete. | Phase 3 (WP-G.3 documents the downgrade) |
| **D-G4** | Auto-compact mechanism: the compact-at-60% rule is prose-only (no hook reads live context%); build a real PostToolUse context probe vs drop the rule | **Deferred to Tokens domain** (WP-T.3 covers this same finding with full context). Resolve there. Governance domain: acknowledge the prose-only posture in WP-G.3's comment update. | Cross-domain finding; resolution belongs in the Tokens handover. | Resolved via Tokens domain WP-T.3 |

---

## 7 · Coverage gaps — follow-up AUDIT workpackages

**WP-G.AUDIT-1** — HERMES_A / HERMES_FC scout-runner.js internals: scout-runner.js was not read in either audit. The HERMES_FC die entry is a ghost (not spawned), but the `evaluateArgus` function in scout-runner.js was confirmed via structure inference only. A targeted read of scout-runner.js would confirm: (a) whether any HERMES logic is stubbed there; (b) whether ARGUS internal implementation matches the "logic and sequencing check" claim in llm-compat-contract.

**WP-G.AUDIT-2** — `pulse-orchestrator.mjs` existence and Pulse Cortex consumer verification: the governance audit notes that if `pulse-orchestrator.mjs` does not exist, ALL Pulse Cortex governance (ensemble dispatch, codex-queue-emit, obliteratus-hint) is also phantom infrastructure. Verify: `ls _SYSTEM/Scripts/pulse-orchestrator.mjs` and read the head if it exists. This determines whether WP-G.8's Option A (build codex gate) should also include a pulse-orchestrator consumer.

**WP-G.AUDIT-3** — `deepseek-guarded-handoff.mjs` active caller search: file exists, head read confirms DeepSeek handoff wrapper, but no caller search was performed in the audit. Run: `grep -rn "deepseek-guarded-handoff" _SYSTEM/Scripts/ .claude/hooks/ _SYSTEM/Scripts/ai` to determine if it is a dead utility or an active wrapper.

---

## 8 · Final acceptance gate

Ordered; each step gates the next; failure halts and the session report quotes the exact failing line.

1. **Baseline stable:** `grep -c "ROLE_TRUST_SURFACES" .claude/hooks/lane-kernel.mjs` matches pre-fix count (before WP-G.1 changes the array).
2. **Trust-root gap closed (Option A):** `grep 'settings\.json' .claude/hooks/lane-kernel.mjs` returns entry; `grep 'settings\.json' .claude/hooks/bash-security-guard.js | grep BLOCKED` returns entry.
3. **pre-tool-use.js advisory output fixed:** `grep "process.stderr.write" .claude/hooks/pre-tool-use.js | grep hookSpecificOutput | wc -l` returns 0.
4. **Protocol-guard CLAUDE_SESSION_ID degradation documented:** `grep "CLAUDE_SESSION_ID absent" .claude/hooks/claude-protocol-guard.mjs` returns warning line.
5. **musubi stale-state lookback added:** `grep "MAX_DIRECT_WRITE_LOOKBACK\|slice(-" .claude/hooks/musubi-protocol-enforce.js` returns the guard.
6. **Sprint-mode audit trail:** `grep "SPRINT_MODE.*suppressed" .claude/hooks/claude-protocol-guard.mjs` returns the log line.
7. **Advisory boundary documented:** `grep "validateAdvisoryBoundary\|advisory boundary.*SELF-ENFORCING" _SYSTEM/Scripts/llm-compat-contract.mjs` returns both.
8. **Route-plan lane validation:** `grep "VALID_LANES\|unrecognized lane" _SYSTEM/Scripts/ai` returns the validation block.
9. **Owner decisions D-G2 and D-G3 recorded:** session report confirms Marcel's choice on codex_gate (build vs delete) and deny posture.

Wave is DONE when all 9 are green AND §5's completeness contract holds. Write the wave report as `wave3-governance-fix-wave-report-<date>.md` next to this file.
