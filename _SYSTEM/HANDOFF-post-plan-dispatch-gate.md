# HANDOFF — Post-Plan-Approval Dispatch Gate

**Created:** 2026-05-18  
**Status:** DESIGN SPEC — not implemented  
**Scope:** Enforce offload-contract routing priority after `ExitPlanMode` approval, before any direct mutation  

---

## Problem Statement

When Claude exits plan mode (`ExitPlanMode` → user approves), it transitions directly to executor mode and calls `Edit`/`Write`/`Bash` mutations without running `_SYSTEM/Scripts/ai route-plan`. This bypasses the offload contract's routing priority:

```
@gpt-5.5 → @gpt-5.4-mini → @amp → @nvidia → @codex-spark → ... → @claude (last resort)
```

The existing `claude-protocol-guard.js` PreToolUse gate doesn't catch this because:
- `needsDirectMutationWarning()` only fires on **protected paths** for `Edit`/`Write`
- `hasRoutePlanEvidence()` only checks the current tool's input text for protocol keywords
- Neither gate knows whether `ExitPlanMode` just fired

---

## Existing Hook Infrastructure (verified 2026-05-18)

| Hook | Event | Role |
|------|-------|------|
| `pre-tool-gate.js` | PreToolUse | Advisory for large reads / broad bash |
| `bash-security-guard.js` | PreToolUse | Hard blocks (secrets, rm -rf) |
| `claude-protocol-guard.js` | PreToolUse | Control packet / codex spec / route-plan evidence gate |
| `musubi-protocol-enforce.js` | PreToolUse | Offload-default advisory (>3 direct writes, 0 agent dispatches) |
| `post-tool-use.js` | PostToolUse | Tool tracking, design memory, cross-terminal memory bus |
| `session-checkpoint.js` | PostToolUse | Session state snapshots |
| `session-state.js` | shared module | Read/write `.claude/state/session-state.json` |

State persists within a session via `.claude/state/session-state.json` (read/written by `session-state.js`).

---

## Recommended Gate: Option A — State Machine via PostToolUse + PreToolUse

Minimal, fits the existing pattern, no new hook file required.

### Why not Option B (rule in yuri_operating_dna.md)?
Text rules rely on Claude following instructions at inference time — the exact failure mode being fixed. Advisory text has already been present in CLAUDE.md and the offload contract; it hasn't prevented the bypass.

### Why not Option C (extend musubi-protocol-enforce.js only)?
`musubi-protocol-enforce.js` uses a 60s throttle and fires on accumulated write count, not on the specific plan-approval event. It would miss the first few mutations and fire late or spuriously.

---

## Design: Plan-Dispatch Gate State Machine

### State shape (add to `session-state.json`)

```json
"plan_dispatch_gate": {
  "armed": false,
  "armed_at": null,
  "satisfied": false,
  "warn_count": 0
}
```

| Field | Meaning |
|-------|---------|
| `armed` | `true` after `ExitPlanMode` PostToolUse fires |
| `armed_at` | Unix ms timestamp of arming — used for TTL expiry |
| `satisfied` | `true` once route-plan evidence appears in any subsequent tool call |
| `warn_count` | How many times the gate has warned this session |

**TTL:** Gate auto-disarms if `Date.now() - armed_at > 30 * 60 * 1000` (30 min) or `warn_count >= 3`. Prevents stale state from a forgotten plan approval poisoning a later unrelated task.

---

## Change 1: `post-tool-use.js` — Arm the gate on `ExitPlanMode`

**Location:** `YURI-OS-MUSUBI/.claude/hooks/post-tool-use.js`  
**When:** PostToolUse event, `tool_name === 'ExitPlanMode'`

```js
// After existing tool-tracking logic:
if (event.tool_name === 'ExitPlanMode') {
  ss.update(state => {
    state.plan_dispatch_gate = {
      armed: true,
      armed_at: Date.now(),
      satisfied: false,
      warn_count: 0,
    };
  });
}
```

No output emitted — arm is silent.

---

## Change 2: `claude-protocol-guard.js` — Warn on first mutation without route-plan

**Location:** `YURI-OS-MUSUBI/.claude/hooks/claude-protocol-guard.js`  
**When:** PreToolUse, inside `inspect()`, after existing checks

```js
// --- Post-plan dispatch gate ---
const PLAN_GATE_TTL_MS = 30 * 60 * 1000;
const PLAN_GATE_MAX_WARNS = 3;
const fs = require('fs');
const ss = require('./session-state.js');

function checkPlanDispatchGate(input) {
  const toolName = input?.tool_name || '';
  // Only check on mutation tools or mutating bash
  const isMutation = MUTATION_TOOLS.has(toolName) ||
    (toolName === 'Bash' && includesAny(normalize(bashCommand(input)), MUTATING_COMMAND_MARKERS));
  if (!isMutation) return null;

  const state = ss.read();
  const gate = state?.plan_dispatch_gate;
  if (!gate || !gate.armed || gate.satisfied) return null;

  // TTL expiry
  if (gate.warn_count >= PLAN_GATE_MAX_WARNS ||
      Date.now() - gate.armed_at > PLAN_GATE_TTL_MS) {
    ss.update(s => { s.plan_dispatch_gate.satisfied = true; });
    return null;
  }

  // If current tool call already carries route-plan evidence, satisfy and pass
  const toolText = textOf(input?.tool_input);
  if (hasRoutePlanEvidence(toolText)) {
    ss.update(s => { s.plan_dispatch_gate.satisfied = true; });
    return null;
  }

  // Arm satisfied — fire warning
  ss.update(s => { s.plan_dispatch_gate.warn_count += 1; });
  return {
    code: 'post-plan-dispatch-required',
    message: [
      'ExitPlanMode approved but no route-plan dispatch — run:',
      '  _SYSTEM/Scripts/ai route-plan "<task summary>"',
      'and dispatch to the appropriate lane before direct mutation.',
      '(offload-contract priority: @gpt-5.5 → @codex-spark → ... → @claude last resort)',
    ].join(' '),
  };
}
```

Add `checkPlanDispatchGate(input)` to the `inspect()` function alongside existing checks. Use `emitWarnings()` (advisory only — never `emitBlock()`). Never blocks.

---

## Change 3: `claude-protocol-guard.js` — Satisfy gate when route-plan evidence appears

Inside the existing `hasRoutePlanEvidence()` check path — when it returns `true` during a *non-mutation* tool call (e.g., a Bash call to `ai route-plan`), also satisfy the gate:

```js
// At start of inspect(), before other checks:
const toolText = textOf(input?.tool_input);
if (hasRoutePlanEvidence(toolText)) {
  const state = ss.read();
  if (state?.plan_dispatch_gate?.armed && !state.plan_dispatch_gate.satisfied) {
    ss.update(s => { s.plan_dispatch_gate.satisfied = true; });
  }
}
```

This ensures the gate clears as soon as `_SYSTEM/Scripts/ai route-plan` (or any pulse-cortex route-plan artifact) appears in any tool call.

---

## Change 4: `yuri_operating_dna.md` — Document the protocol gate (belt-and-suspenders)

Add to `.claude/rules/yuri_operating_dna.md` under `## Local exception handling`:

```markdown
## Post-Plan-Approval Dispatch

After `ExitPlanMode` is approved, the `plan_dispatch_gate` in session-state.json is armed.
The first mutation (Edit/Write/Bash) before a `route-plan` call will trigger a
`post-plan-dispatch-required` advisory from `claude-protocol-guard.js`.

Correct response: run `_SYSTEM/Scripts/ai route-plan "<task>"` and dispatch to the
returned lane. Direct implementation by the main session is only permitted if
route-plan returns `@claude` as the lane recommendation.
```

---

## Gate Behavior Summary

| Scenario | Gate fires? | Side effect |
|----------|-------------|-------------|
| Plan approved → `ai route-plan` → Codex dispatch | No | Gate satisfied before any mutation |
| Plan approved → direct `Edit` (no route-plan) | WARN (advisory) | `warn_count++` |
| Plan approved → direct `Edit` with pulse-plan.json in tool text | No | Gate satisfied |
| YURI_SPRINT_MODE=1 | No | `inspect()` returns early (existing bypass) |
| 30 min elapsed since plan approval | No | Gate auto-expires |
| No plan approval this session | No | `armed = false`, gate dormant |

---

## Files to Touch (implementation)

| File | Change type | Risk |
|------|-------------|------|
| `.claude/hooks/post-tool-use.js` | Add `ExitPlanMode` arm block (~10 lines) | Low — additive |
| `.claude/hooks/claude-protocol-guard.js` | Add `checkPlanDispatchGate()` check + satisfy-on-evidence (~30 lines) | Low — advisory only, never blocks |
| `.claude/rules/yuri_operating_dna.md` | Documentation paragraph | None |

No new files. No new hook registrations in `settings.json`. No schema changes to `offload-contract.mjs`.

---

## Acceptance Criteria

- [ ] After `ExitPlanMode`, calling `Edit` on a non-protected file with no prior `route-plan` emits `post-plan-dispatch-required` advisory
- [ ] After `ExitPlanMode`, calling `_SYSTEM/Scripts/ai route-plan "..."` then `Edit` emits no advisory
- [ ] `YURI_SPRINT_MODE=1` suppresses the advisory (via existing early-return in `inspect()`)
- [ ] Gate does not fire when no plan approval has occurred in the session
- [ ] Gate expires after 30 min or 3 warnings without deadlocking the session

## Test Command

```bash
# Manual test — in a fresh session:
# 1. Enter and exit plan mode
# 2. Attempt: Edit .claude/state/test-gate.txt
# 3. Confirm advisory in hook output
# 4. Run: _SYSTEM/Scripts/ai route-plan "test"
# 5. Confirm advisory absent on next Edit
node .claude/hooks/claude-protocol-guard.js <<< '{"tool_name":"Edit","tool_input":{"file_path":"test.txt","old_string":"a","new_string":"b"}}'
# Expect: post-plan-dispatch-required warning (after arming state manually)
```

---

## Rollback Boundary

All changes are additive advisory code. Rollback: revert the three file edits. Gate state in `session-state.json` is ephemeral (session-scoped) and resets on next `SessionStart`.
