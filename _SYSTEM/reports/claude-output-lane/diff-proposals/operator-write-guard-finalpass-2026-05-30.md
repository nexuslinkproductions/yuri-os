# Codex Final-Pass Packet — Tool-Agnostic Operator Write/Edit Guard (hardening #2)

**Lane:** Claude/Opus 4.8 main · **Branch:** main · **Authority:** proposal_only (no commit performed)
**Resume context:** `SESSION_CLOSEOUT_2026-05-30_energy-user-data.md` RESUME POINT #1.
**Closes:** `energy-hardening-attack-2026-05-30.md` finding #2 (CRIT).

## Task summary
`bash-security-guard.js` only inspects `Bash`; Write/Edit/NotebookEdit bypass it. A `coworker`
could `Write '{}'` over `dev-credential.json` (chained with the now-closed #1 = one-write
self-escalation). New PreToolUse hook denies coworker mutation of the cred + guard trust
surface across every file-mutating tool. Defense-in-depth: #1 (`resolveRole` fail-closed)
already neutralizes the escalation; this stops the mutation from landing at all.

## Files changed
- **NEW** `.claude/hooks/operator-write-guard.js` — coworker-only deny on protected paths; reuses
  `yuri-operator.resolveRole()` verbatim with the same fail-closed fallback as the Bash guard.
- **NEW** `.claude/hooks/tests/operator-write-guard.test.js` — 23 checks (unit + parity + e2e + case-bypass).
- **EDIT** `.claude/settings.json` — registered the hook in the all-tools (`""`) PreToolUse matcher,
  immediately after `bash-security-guard.js` (synchronous/blocking, no `async`).

## Model decisions (for review)
- **coworker-only**: dev (owner passphrase) is never restricted — verified live (silent allow).
  Fail-closed: broken/tampered role system → coworker, never dev.
- **Protected set = parity + self**: mirrors `bash-security-guard.js` PROTECTED_ROLE_PATHS
  (yuri-operator.cjs, dev-credential.json, bash-security-guard.js, operator-guard/) **plus**
  the new guard itself (else a coworker edits the guard away). A drift test asserts parity.
- **Case-insensitive match**: found mid-build that `_SYSTEM/SELF/Dev-Credential.json` (same file
  on APFS) bypassed a case-sensitive `===`. Closed + regression-tested. Fail-closed direction.

## Tests / checks run (exact)
- `node .claude/hooks/tests/operator-write-guard.test.js` → `23 checks passed`
- `node .claude/hooks/tests/bash-security-guard.smoke.test.js` → `40 passed, 0 failed` (regression, untouched)
- `node .claude/hooks/tests/claude-protocol-guard.test.js` → `pass` (regression)
- `node -e JSON.parse(settings.json)` → valid JSON
- LIVE `dev` (this session) Write→cred → silent allow (exit 0, no output)
- LIVE forced `coworker` (wrong YURI_DEV_KEY) Write→cred → `permissionDecision:"deny"`

## Protected-path / secret-surface checks
- No secret read or written. `dev-credential.json` referenced by path only, never opened.
- No new role-resolution logic; `resolveRole()` reused unchanged (trust root intact).
- Guard self-protects (in its own protected list).

## GitNexus
- No existing symbol modified — new isolated hook file + JSON config insertion. Symbol-impact
  analysis N/A; `detect_changes` not run (no commit requested here).

## Residual risks (please arbitrate)
1. **Scope**: protects the canonical role/cred surface + self, NOT every other PreToolUse guard
   (claude-protocol-guard, agent-spawn-guard, pre-tool-gate, musubi-protocol-enforce, tirith-url).
   A coworker could still Edit a non-role guard to weaken non-credential enforcement. **Decision
   needed**: extend protected list to the full security-hook surface, or keep parity-minimal?
2. **Symlink TOCTOU**: a coworker-created intra-repo symlink to a protected file could be written
   through a non-protected lexical path (no realpath resolution — parity with the Bash guard).
   Bash `ln`/`mv`/`cp` onto protected paths already blocked for coworker; residual is low.
3. **Field coverage**: file_path (Write/Edit/MultiEdit) + notebook_path (NotebookEdit). A future
   mutating tool with a different path field would be missed.

## Commit
Not committed. Requesting verification + the scope decision in (1). Commit deferred to owner/Codex.

---

## v2 — OWNER DECISION RESOLVED (2026-05-30)
Owner chose **full security-hook surface** for residual risk #1. The protected list now covers,
in addition to the trust roots (yuri-operator.cjs, dev-credential.json) and self:
`bash-security-guard.js`, `claude-protocol-guard.{js,mjs}`, `agent-spawn-guard.js`,
`pre-tool-gate.js`, `musubi-protocol-enforce.js`, `tirith-url-guard.js`. All paths existence-verified.
Operational hooks (token-budget-check, yuri-risk-lite, pre-tool-use, energy-tick) intentionally
left coworker-editable. Mechanism unchanged — additive data + matching tests.

**Re-verification (exact):**
- `node --check` both files → OK
- `operator-write-guard.test.js` → `30 checks passed` (+7: each new guard denied for coworker;
  token-budget-check confirmed allowed; parity test still green)
- LIVE forced-coworker Edit→`agent-spawn-guard.js` → `permissionDecision:"deny"`
- LIVE dev Edit→`agent-spawn-guard.js` → silent allow (exit 0)

Residual #2 (symlink TOCTOU) and #3 (path-field coverage) unchanged. Diff scope still exactly
3 files (operator-write-guard.js, its test, settings.json +4); pre-existing `.codex/.../plugin-creator/*`
dirt is NOT part of this change — commit must be path-scoped.
