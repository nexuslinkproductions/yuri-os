Now I have the complete evidence chain. Let me compile the final analysis.

---

## PreToolUse Hook Tax Analysis — 13 Hooks

### THE 3 REAL GATES (keep)

| # | Hook | Enforcement | Evidence |
|---|---|---|---|
| 2 | **bash-security-guard.js** | `permissionDecision: deny` on `.env` read/write, `.claude/` protected files, `curl\|bash`, decode-exec chains, role-gated mutations. **1181 lines of real logic.** This is the actual protected-path enforcement layer that backs up the 67-entry `settings.json` deny list. | MATCH file=.claude/hooks/bash-security-guard.js term=permissionDecision line=1156 excerpt="permissionDecision: 'deny'" |
| 8 | **energy-enforce.mjs** | `permissionDecision: deny` when breaker tripped. **Currently DISARMED** (`YURI_ENERGY_ENFORCE` unset, flag file absent → metrics-only burn-in). When armed, this is the trailing-veto PEP for the energy circuit breaker. Cheap real gate, currently zero-cost pass-through. | MATCH file=.claude/hooks/energy-enforce.mjs term=permissionDecision line=116 excerpt="permissionDecision: 'deny'" |
| 12 | **math-register-guard.mjs** | `permissionDecision: deny` on unregistered `_SYSTEM/Scripts/math/*.mjs` writes. Hard-fail-closed. **Matcher-gated to Write\|Edit only** — not on every call. | MATCH file=.claude/hooks/math-register-guard.mjs term=permissionDecision line=53 excerpt="permissionDecision: 'deny'" |

**Note on gate #2:** `settings.json` permissions.deny (67 entries) is enforced **natively by Claude Code** before hooks even fire. `bash-security-guard.js` is the backstop for Bash-path bypasses (heredocs, pipes, `tee`, `sed`, `-c` wrappers) that the native deny list can't pattern-match. Both are needed; neither is redundant.

---

### ADVISORY THEATER — Pure Tax, Zero Enforcement (merge/cut candidates)

| # | Hook | Lines | ms/call | Does | Enforcement | Verdict |
|---|---|---|---|---|---|---|
| 1 | **pre-tool-gate.js** | 115 | 70 | Regex-matches Bash/Read commands, injects "route to deepseek-flash" advisory text. | `continue: true` always. **Self-documents: "NEVER blocks"** | **CUT.** Advisory-only delegation nudges. The model ignores these. Zero deny capability. |
| 5 | **pre-tool-use.js** | 191 | 81 | Reads session-state + memory-bus on EVERY call. Tier-based compaction hints, cross-terminal memory check, token economy scoring. | `additionalContext` only. Never blocks. | **MERGE into a single advisory hook.** Does real work (compaction tiers) but it's context-injection, not enforcement. |
| 6 | **musubi-protocol-enforce.js** | 136 | 61 | "AEONIC_PROTOCOL" compliance — checks if too many direct writes without Agent dispatch, or Agent without skill loaded. Throttled to 60s. | "advisory only" — self-documented. Never blocks. | **CUT.** Nudge theater. Throttled so it rarely fires, but still spawns a 61ms Node process every call to check the throttle. |
| 9 | **directive-guard.mjs** | 287 | 74 | Reads + parses 4 YAML frontmatter directive `.md` files from `.claude/directives/` on EVERY call, matches action signatures, injects directive text as `additionalContext`. | **Self-documents: "NEVER blocks / denies. Fail-open on every code path."** Line 280: `// NEVER emit permissionDecision: deny` | **CUT.** Pure advisory. 287 lines to inject a text reminder that could be in CLAUDE.md. Pays filesystem I/O + YAML parse on every tool call. |
| 13 | **filing-gate.mjs** | 51 | 60 | Advisory on non-canonical file placement. | "NEVER blocks and NEVER force-allows" — self-documented. | **CUT.** Matcher-gated (Write\|Edit) so only 60ms on writes, but pure advisory. The periodic filing sweep already handles relocation. |

---

### MATCHER-GATED — Low Tax, Contextual Value (keep or trim)

| # | Hook | Matcher | ms/call (when matched) | Verdict |
|---|---|---|---|---|
| 3 | **tirith-url-guard.js** | `""` (all tools, but exits early unless `tool_name === 'Bash'` AND URLs present) | 67ms nominal, but `execSync` tirith binary call adds up to 5s timeout per URL | **KEEP but narrow matcher to `Bash`.** Real enforcement via `permissionDecision: ask`. Currently fires on every tool call but self-exits. Still pays 67ms for the exit. |
| 4 | **claude-protocol-guard.mjs** | `""` (all tools) | 79ms | **KEEP but narrow.** Has `permissionDecision: deny` capability (critical-tier routing gate, plan-review hard block) but degrades to WARN without `CLAUDE_SESSION_ID`. Complex state-dependent logic. Could be matcher-gated to `Bash\|Write\|Edit\|Agent` to skip on Read/Grep/Glob. |
| 7 | **yuri-risk-lite.js** | `""` (all tools, but exits early unless Bash) | 67ms | **KEEP but narrow matcher to `Bash`.** Has `permissionDecision: deny` on `mkfs`, raw disk write, `DROP DATABASE`. Real catastrophic-pattern gate. Currently pays 67ms on Read/Grep to exit immediately. |
| 10 | **gitnexus-hook.cjs** | `Grep\|Glob\|Bash` | 67ms (already matcher-gated) | **KEEP.** Graph enrichment, real value. Already optimally scoped. |
| 11 | **agent-spawn-guard.js** | `Agent` | 60ms (already matcher-gated) | **CUT.** Self-documented as "OBSERVABILITY-ONLY: logs every Agent spawn and always allows." Former deny removed per owner directive. 45 lines of `console.error` logging. Zero enforcement. |

---

### PER-CALL TAX SUMMARY

**Current cost:** Every tool call pays for **9 unconditional Node process spawns** (group 0):

```
pre-tool-gate.js          70ms  — advisory theater (CUT)
bash-security-guard.js    71ms  — REAL GATE (keep)
tirith-url-guard.js       67ms  — real ask-enforcement (narrow to Bash)
claude-protocol-guard.mjs 79ms  — real deny capability (narrow to mutating tools)
pre-tool-use.js           81ms  — advisory (merge)
musubi-protocol-enforce   61ms  — advisory theater (CUT)
yuri-risk-lite.js         67ms  — real deny on catastrophic (narrow to Bash)
energy-enforce.mjs        79ms  — REAL GATE, currently DISARMED (keep, cheap)
directive-guard.mjs       74ms  — advisory theater (CUT)
─────────────────────────────────
TOTAL                    649ms per tool call
```

TERM_COUNT term=PreToolUse count=13
FILE_COUNT file=.claude/settings.json count=13
MATCH file=.claude/hooks/pre-tool-gate.js term="NEVER blocks" line=8 excerpt="NEVER blocks — always continue:true. Advisory only"
MATCH file=.claude/hooks/musubi-protocol-enforce.js term="advisory only" line=6 excerpt="Never blocks tool execution — advisory only"
MATCH file=.claude/hooks/directive-guard.mjs term="NEVER blocks" line=4 excerpt="NEVER blocks / denies. Fail-open on every code path."
MATCH file=.claude/hooks/agent-spawn-guard.js term="OBSERVABILITY-ONLY" line=7 excerpt="This hook is now OBSERVABILITY-ONLY"
MATCH file=.claude/hooks/filing-gate.mjs term="NEVER blocks" line=4 excerpt="NEVER blocks and NEVER force-allows"

---

### MERGE/CUT RECOMMENDATIONS

**Cut 4 advisory-only hooks (saves ~275ms/call):**
- `pre-tool-gate.js` (70ms) — delegation nudges the model ignores
- `musubi-protocol-enforce.js` (61ms) — aeonic compliance theater, 60s-throttled
- `directive-guard.mjs` (74ms) — 4-file YAML parse per call for text injection; put directives in CLAUDE.md
- `agent-spawn-guard.js` (60ms on Agent only) — observability logging only

**Narrow 3 hooks to proper matchers (saves ~200ms on Read/Grep/Glob calls):**
- `tirith-url-guard.js` → matcher `"Bash"` (exits early on non-Bash now but still pays spawn tax)
- `yuri-risk-lite.js` → matcher `"Bash"` (same — catastrophic patterns are all Bash)
- `claude-protocol-guard.mjs` → matcher `"Bash|Write|Edit|Agent"` (routing/plan gate only matters on mutating tools)

**Merge `pre-tool-use.js` into `energy-enforce.mjs`** (or any surviving hook): compaction tiers + token economy is context-injection that could share a process with the energy PEP. Saves one spawn (81ms). Alternative: merge into `bash-security-guard.js` since that hook survives on every call anyway.

**Result after optimization:**
- Every-call hooks: **2** (`bash-security-guard` + `energy-enforce`) = ~150ms
- Bash-only: +3 (`tirith`, `yuri-risk-lite`, `gitnexus`) = +200ms
- Write/Edit-only: +2 (`math-register`, `filing-gate`) = +120ms
- **Read/Grep/Glob: ~150ms (down from 649ms — 77% reduction)**
- **Bash: ~350ms (down from ~716ms — 51% reduction)**

All 3 real gates preserved. Zero enforcement capability lost.

04KS_PRETOOLUSE_HOOK_TAX_ADVISORY_VS_ENFORCEMENT_X_PASS_COMMITTED