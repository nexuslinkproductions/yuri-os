# Wave 3 Deep Dive — Governance Enforcement Chain (end-to-end)

Scope: `.claude/settings.json` deny-list + the PreToolUse guard stack. Method: organ-level
correctness on the *enforcement chain* — what can DENY, what only WARNs, what is silently
dropped; fail-open vs fail-closed under crash/timeout/malformed; ordering hazards; trust root.

Auditor: Opus (Claude lane). Read-only everywhere. Bypass shapes cited as TEXT only, never
executed. Wave-1/2 energy-breaker findings are cited, not re-derived.

LIVE STATE (verified this session, `node yuri-operator.cjs resolve` + fs checks):
- Role system **ACTIVE** (`_SYSTEM/SELF/dev-credential.json` present + tracked).
- Resolved role = **`dev`** (owner, `YURI_DEV_KEY` valid). `.claude/operator.json` → role `dev`, gitignored (correct).
- Energy breaker = **metrics-only** (`_SYSTEM/state/energy-enforce.enabled` ABSENT; `YURI_ENERGY_ENFORCE` unset).
- **Consequence:** in *this* owner session, the entire coworker-mutation gate is a no-op (dev is unrestricted),
  and the energy breaker never blocks. The coworker layer only bites a cloned/coworker session.
  The universal env/.claude/decode-exec dens (fail-closed regardless of role) are the only Bash-guard teeth live for `dev`.

---

## GROUND TRUTH — Claude Code hook execution semantics (official docs, verified)

Source: https://code.claude.com/docs/en/hooks (fetched 2026-06-10). These govern the whole table:

1. **Deny** = `exit 0` + stdout JSON `{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",...}}`. Must be **stdout**. (exit 2 also blocks, via stderr, but our guards use the JSON form.)
2. **All matching hooks for a matcher run in PARALLEL.** Any single `deny` blocks the tool. There is **no guaranteed ordering** between hooks in the same matcher block.
3. **`async: true` = fire-and-forget.** The harness does NOT wait for the hook's output before running the tool; its `deny`/`additionalContext` cannot influence *this* tool call.
4. **FAIL-OPEN by default.** Timeout, exit≠2/≠0-with-deny, exit 1, OR **malformed/stderr JSON** ⇒ tool proceeds. Only `permissionDecision:deny` on stdout (or exit 2) blocks.

Registration (verified from settings.json, all-tools `""` matcher, in file order):
`ASYNC pre-tool-gate` · sync bash-security-guard · sync operator-write-guard · sync tirith-url-guard ·
sync claude-protocol-guard.mjs · sync pre-tool-use · sync musubi-protocol-enforce · sync yuri-risk-lite ·
sync token-budget-check · sync energy-enforce.mjs. Plus matcher-scoped: agent-spawn-guard (Agent),
math-register-guard (Write|Edit), gitnexus-hook (Grep|Glob|Bash).

---

## BLOCK / WARN TRUTH TABLE

Columns: **DENY** = can hard-block via stdout `permissionDecision:deny`. **WARN** = injects advisory
context only (`additionalContext`), never blocks. **silent** = does nothing enforceable.
Role column: **dev** = owner (this session), **cw** = coworker (clone).

| Layer (hook) | Tool surface | dev | cw | Notes / which deny path |
|---|---|---|---|---|
| settings.json deny-list | Read/Write/Edit on `.env*`, `backend/data`, `.claude/{state,history,file-history}`, `node_modules`, `.amp`, specific state JSONs | **DENY** | **DENY** | Harness-native permission deny. Role-independent, fail-closed (it is the permission system, not a hook). Strongest layer. Does NOT cover Bash (a `cat .env` is a Bash op, governed by the guard below, not the deny-list). |
| bash-security-guard.js (sync) | Bash: `.env` read/write/mutate/remove; sensitive `.claude/*` read/write; `.claude` destructive rm; decode/download-exec chains; broad `git add .claude`; `git rm .claude` | **DENY** | **DENY** | These dens are **role-independent** (`inspectCommand` runs them after the coworker gate). Fail-closed lexical matchers. |
| bash-security-guard.js (sync) | Bash: role-surface mutation (`isRolePathMutation`), git push, git remote, `init-dev` | silent (dev exempt) | **DENY** | `isBlockedForCoworker` returns null unless role===coworker. Static string matcher = **fail-OPEN layer-2 conscience** (documented residual, lines 943-966; Wave-1 lexical-bypass memory). |
| operator-write-guard.js (sync) | Write/Edit/MultiEdit/NotebookEdit onto ROLE_TRUST_SURFACES (realpath+case-insensitive) | silent (dev exempt) | **DENY** | `inspectMutation` returns null when role!==coworker. Fail-closed for cw: realpath-canonicalized, symlink-resolved. The *real* file-tool floor for the guard surface. |
| tirith-url-guard.js (sync) | Bash containing a URL, MEDIUM/HIGH/CRITICAL | **ask** | **ask** | Emits `permissionDecision:"ask"` (not deny) — prompts, not blocks. **Default fail-OPEN**: missing binary / parse fail ⇒ `exit 0` allow, UNLESS `TIRITH_FAIL_LOUD=1` (then `ask`). `TIRITH_BYPASS=1` env fully disables. |
| claude-protocol-guard.mjs (sync) | Write/Edit on CONTROL_FILE_PREFIXES; Bash mutating markers; Agent impl; Shintai; high-risk×2; plan-dispatch gate | WARN | WARN | Advisory `additionalContext` **except** one DENY path: critical-tier session packet at `/tmp/yuri-session-packet-<sid>.json` ⇒ `emitBlock`. `YURI_SPRINT_MODE=1` suppresses ALL warns (line 242). |
| pre-tool-use.js (sync) | compaction tiers + cross-terminal memory + token-economy | **silent (BROKEN)** | silent | Writes its JSON to **stderr** (line 39). Per spec, PreToolUse stdout-JSON is the only structured channel; stderr-JSON is a non-blocking error ⇒ **its advisory context is silently dropped**. Doc-vs-wiring drift (see F3). |
| musubi-protocol-enforce.js (sync) | Agent/Bash/Write/Edit AEONIC checks | WARN | WARN | Advisory only, 60s throttle. `console.log` JSON on stdout = honored as context. Never blocks. |
| energy-enforce.mjs (sync, LAST) | trailing breaker verdict (PEP) | **silent** (enforce OFF) | silent | Would `DENY` on catastrophic non-offsettable verdict ONLY if `YURI_ENERGY_ENFORCE=1` OR flag file present **AND** `YURI_ENERGY_OBSERVABILITY=1`. Currently OBS=1 but enforce flag absent ⇒ would_deny audited, never blocks. Fail-OPEN on every data gap (lines 87,99). |
| pre-tool-gate.js (**ASYNC**) | Read large / broad Bash routing advisory | silent | silent | `async:true` ⇒ fire-and-forget; output cannot affect the tool call. Advisory-only by design, so no enforcement loss — but see ordering note O2. |
| agent-spawn-guard.js (Agent) | Agent spawn | silent | silent | **Observability-only by owner directive 2026-05-30** (deny removed). Always allows. Logs to stderr. |
| math-register-guard.mjs (Write\|Edit) | math card registration | (not in enforcement scope — registration guard) |||

---

## FINDINGS

### F1 — SEV: MEDIUM (by-design, but the design is the risk) — energy-enforce PEP is doubly-inert AND fail-open; not an active brake
`.claude/hooks/energy-enforce.mjs:77,87,96-99` + `.claude/settings.json:200-203`.
Claimed: "circuit-breaker PreToolUse hook BLOCKS on a catastrophic non-offsettable trailing verdict."
Actual live: (a) enforce flag absent ⇒ `if(enforce)` false ⇒ every deny becomes `would_deny` audit, **zero blocks**;
(b) Wave-1 memory `energy-gate-Linfinity-doubly-inert` already established `maxLadderInversion` is hardcoded 0 in the live
tick path so the L∞ veto field feeding the breaker is always 0 — arming the cap alone does nothing;
(c) the hook **fails open on every data gap** (no snapshot, malformed snapshot, breaker throw → `return` = allow).
This is consistent with CLAUDE.md's own framing ("fail-open layer-2 conscience, not the primary guard"), so it is
**not a regression** — but the truth is: the energy breaker contributes **no enforcement** today, for any role. The
deterministic guards above it are the entire floor. Cited, not re-derived.

### F2 — SEV: MEDIUM — `isRolePathMutation` is a fail-OPEN lexical matcher (irreducible residual, already documented)
`.claude/hooks/bash-security-guard.js:943-997`. The file itself documents three uncatchable classes:
(1) byte-split `printf '\xNN'` payloads piped to a non-shell interpreter; (2) `source /tmp/payload.sh` /
`bash p.sh` where the mutation lives in a **separate file the matcher never opens**; (3) runtime-computed paths
assembled from env/`$(...)`/`readlink`. These are cited as TEXT, not executed. Per the file's own comment + Wave-1
memory `bash-guard-role-matcher-lexical-bypass`, this is **accepted**: the matcher raises the bar against casual
tampering; the HARD coworker floor is `operator-write-guard.js` (file tools, fail-closed realpath) + the
settings deny-list + filesystem perms + the scrypt trust-root (a clone holds only the hash). Correctly scoped.
**Residual gap that IS real:** the three bypass classes target Bash specifically; operator-write-guard only covers
Write/Edit/NotebookEdit. A coworker who can run arbitrary Bash (e.g. `bash /tmp/p.sh` that mutates a guard) is outside
both layers and stopped only by filesystem perms — which on a clone the coworker owns. The honest boundary for a
coworker-on-their-own-clone is **GitHub push deny** (verified: `isGitPush`→DENY) + the server-side repo lock (deferred
per yuri-operator.cjs:14), NOT local FS enforcement. Documented honestly in-code; flagging that the local layer is
porous to arbitrary-Bash by construction.

### F3 — SEV: MEDIUM — `pre-tool-use.js` emits structured output to STDERR; its advisory context is silently dropped
`.claude/hooks/pre-tool-use.js:38-42`. `emitContext` does `process.stderr.write(JSON.stringify({hookSpecificOutput:{...additionalContext}}))`.
Per the hooks spec, a PreToolUse hook's structured channel is **stdout**; JSON on stderr is treated as a non-blocking
error and the tool proceeds with the context **discarded**. Result: the 4-tier compaction prompts, the
cross-terminal-memory update injection, and the token-economy advisories this hook computes **never reach the model**.
Claimed-vs-actual: settings registers it as a live PreToolUse hook doing context injection; actual = its entire output
surface is inert. Pure WARN-class organ (never meant to block), so no *enforcement* hole — but it is a **dead advisory
organ**: declared-and-runs-but-output-never-read. Contrast bash-security-guard / claude-protocol-guard which correctly
use `process.stdout.write`. Likely a copy drift (the deny-capable siblings use stdout; this one diverged).
FIX: change `stderr` → `stdout` (one line). Low blast radius. UNVERIFIED whether intentional (no comment explains it).

### F4 — SEV: LOW — `claude-protocol-guard.mjs` DENY path depends on a `/tmp` file an attacker controls; and `YURI_SPRINT_MODE=1` blanket-suppresses
`.claude/hooks/claude-protocol-guard.mjs:242,320-365`. The single hard-block path requires
`/tmp/yuri-session-packet-<sid>.json` to exist AND parse to `pulse_plan.complexityTier==='critical'`. A `/tmp` path is
world-writable on a shared host and trivially absent in most sessions ⇒ the block is **opportunistic, not guaranteed**;
absence ⇒ downgrade to WARN (fail-open). Separately, `YURI_SPRINT_MODE=1` returns `[]` from `inspect` (line 242),
suppressing every protocol warning for the session. Both are advisory-tier so the security impact is bounded (this guard
governs *process discipline*, not protected paths), but the "critical-tier blocks" claim is conditional on attacker-
adjacent state. Acceptable for an advisory organ; noting the fail-open + env-suppress for completeness.

### F5 — SEV: LOW — ordering is parallel, not sequential: the "energy-enforce registered LAST so deterministic guards rule first" comment is a no-op assumption
`.claude/hooks/energy-enforce.mjs:11-12` claims it is "registered LAST in the PreToolUse chain so the deterministic
guards always rule first." Per the verified hook spec, **all matching hooks run in parallel** — registration order in
settings.json does NOT impose execution order. In practice this is harmless because **any** hook's `deny` blocks the
tool (an OR over all hooks), so a deterministic guard's deny and energy-enforce's deny don't race for precedence — both
just deny. But the *stated mechanism* (ordering guarantees precedence) is false. If two hooks disagreed (one `deny`,
one `allow`/advisory), `deny` wins regardless of order, so the safety posture is fine; the comment's reasoning is wrong.
No fix needed beyond correcting the comment if accuracy matters.

### F6 — SEV: INFO — `async: true` on `pre-tool-gate.js` is correct (advisory) but worth stating: it can NEVER deny
`.claude/settings.json:166`. `pre-tool-gate.js` is the only async PreToolUse hook. It is advisory-only by design, so
fire-and-forget loses nothing. Flagging only so no future change adds a `deny` to it expecting enforcement — an async
hook's deny is dropped. Same caution for the matcher-scoped `gitnexus-hook` (timeout:10, async-ish enrichment) and any
hook ever given `async:true`: deny-capable logic must stay on a SYNC hook.

### F7 — SEV: INFO — trust-root self-protection is sound; degraded paths fail CLOSED to the FULL union
Verified positives worth recording (no defect):
- `lane-kernel.mjs` is a MEMBER of its own `ROLE_TRUST_SURFACES.files` (line 66) — a coworker can't rewrite the kernel
  to shrink the protected set. Self-protecting trust root.
- Both `bash-security-guard.js` (313-339) and `operator-write-guard.js` (43-68) import ROLE_TRUST_SURFACES from
  lane-kernel and **fail CLOSED to the full hardcoded union** if the import throws — never to an empty (open) set, never
  to the narrower historical 4-path list. Drift between the two guards is structurally impossible.
- `resolveRole()` (yuri-operator.cjs:65-75) fails CLOSED: a cred file that exists-but-won't-parse ⇒ `coworker`. Only a
  genuinely absent cred ⇒ `dev` (fresh-repo setup). Closes the one-write self-escalation (Wave-prior finding, verified).
- operator-write-guard canonicalizes via `realpathSync` + case-insensitive compare ⇒ symlink-laundering and
  `Dev-Credential.json` case bypass are closed for the file-tool surface.

---

## TRUST ROOT — what stops a session editing the hooks/settings themselves?

| Mutation vector | dev (owner) | coworker (clone) |
|---|---|---|
| Edit a guard hook via Write/Edit tool | allowed (owner edits hooks — that IS this work) | **DENY** (operator-write-guard, fail-closed realpath) |
| `sed -i` / `>` / `rm` a guard hook via Bash | allowed | **DENY** (isRolePathMutation) *for the lexical forms*; **fail-open** for the 3 residual classes (F2) ⇒ filesystem perms / push-deny are the real floor |
| Edit `.claude/settings.json` (the hook registry) | allowed | settings.json is in **CONTROL_FILE_PREFIXES** (claude-protocol-guard → WARN only) AND in operator-write-guard surface? **NO** — settings.json is NOT in ROLE_TRUST_SURFACES.files. ⇒ a coworker editing settings.json gets only a WARN, not a DENY. **GAP (see below).** |
| Edit `.claude/operator.json` (sets local role) | allowed | not in trust surface; but role is derived from the scrypt cred, not operator.json — editing operator.json cannot grant `dev` (resolveRole ignores it). Safe. |
| Become `dev` without the passphrase | n/a | impossible — scrypt hash only; `timingSafeEqual` (yuri-operator.cjs:55). Trust root holds. |

**TRUST-ROOT GAP (SEV: MEDIUM, F8):** `.claude/settings.json` — the file that *registers every guard hook* — is in
`CONTROL_FILE_PREFIXES` (advisory WARN via claude-protocol-guard) but is **NOT** in `ROLE_TRUST_SURFACES.files`. So a
coworker editing `settings.json` to **delete the guard registrations** is met with a WARN, not a DENY, from the
file-tool path. The only thing stopping it: (a) `bash-security-guard` blocks Bash writes to `.claude/settings.local.json`
but **`settings.json` is NOT in `BLOCKED_CLAUDE_FILES`** (lines 14-22 — only `settings.local.json` is) — so even a
`tee`/`>` to `settings.json` via Bash is not denied by the env-den list; (b) operator-write-guard doesn't cover it.
Net: a coworker can disable the entire hook stack by editing `settings.json`, gated only by an ignorable WARN. The
mitigations are real but external: the deny-list and trust surface should include `.claude/settings.json` as a
coworker-mutation block. **This is the highest-value real finding in the chain.**
RECOMMEND: add `.claude/settings.json` to `ROLE_TRUST_SURFACES.files` (and `.claude/settings.local.json`), and add
`settings.json` to `BLOCKED_CLAUDE_FILES`. Verify the owner can still edit it as `dev` (yes — dev is exempt).

---

## FAIL-OPEN vs FAIL-CLOSED — per layer, under crash/timeout/malformed

| Layer | malformed stdin | exception / throw | timeout | missing dependency |
|---|---|---|---|---|
| settings.json deny-list | n/a (native) | n/a | n/a | fail-CLOSED (permission system) |
| bash-security-guard env/.claude dens | `JSON.parse` catch → `exit 0` = **fail-OPEN** | uncaught in matcher → process crash → harness treats as non-blocking → **fail-OPEN** | n/a (no timeout set) | role module broken → `coworker` (fail-closed role) BUT dens still run |
| operator-write-guard | `JSON.parse` catch → `exit 0` = **fail-OPEN** | activeRole catch → `coworker` if cred exists (fail-closed) | n/a | kernel import fail → full hardcoded union (fail-CLOSED surface) |
| tirith-url-guard | catch → `exit 0` **fail-OPEN** (unless FAIL_LOUD) | same | 5s execSync → catch → **fail-OPEN** | binary missing → **fail-OPEN** (unless FAIL_LOUD) |
| claude-protocol-guard | `JSON.parse` catch → `exit 0` | inspect catch → no block | n/a | ss.read null → gate skipped (fail-open) |
| energy-enforce | parse catch → `return` **fail-OPEN** | breaker throw → `return` **fail-OPEN** | n/a | no snapshot → `return` **fail-OPEN** |

**Pattern:** every Bash/command guard fails OPEN on malformed input — consistent with the platform default and with the
"these are layer-2, the deny-list + perms are the floor" design. The one **fail-CLOSED** spine is: settings.json
deny-list (native) + operator-write-guard's trust-surface (fail-closed for coworker file-tool writes) + the scrypt
role resolver. That spine is sound. Everything above it is advisory or lexical-best-effort.

---

## COVERAGE

Read in full (source, exact lines): settings.json (345 ln), bash-security-guard.js (1154 ln, both pages),
operator-write-guard.js (203 ln), pre-tool-gate.js (116 ln), pre-tool-use.js (189 ln), agent-spawn-guard.js (46 ln),
claude-protocol-guard.mjs (370 ln), musubi-protocol-enforce.js (128 ln), energy-enforce.mjs (139 ln),
tirith-url-guard.js (112 ln), session-state.js (30 ln), yuri-operator.cjs (207 ln),
lane-kernel.mjs ROLE_TRUST_SURFACES + CONTROL_FILE_PREFIXES (lines 45-160).
Verified live: role resolution, cred presence, enforce flag, git-tracked state of all trust files, operator.json
gitignore, async/sync registration, stderr-vs-stdout emission, hook-spec deny/async/fail-open semantics (official docs).
**Enforcement-chain coverage ≈ 95%.**

NOT covered (out of assigned scope / acknowledged): energy-breaker.mjs + yuri-energy.mjs internal math (Wave-1/2 owned;
cited not re-derived); the SessionStart/Stop/PostToolUse hooks except where they feed PreToolUse (energy-tick PDP
confirmed atomic-write + async PostToolUse); yuri-risk-lite.js, token-budget-check.js, math-register-guard.mjs,
gitnexus-hook.cjs internals (advisory/enrichment, not deny-capable enforcement).

## UNVERIFIED / RESIDUAL RISK
- F3 (stderr emission) assumed-inert per spec; not runtime-confirmed that the harness drops it (would need a live
  PreToolUse fire with a deterministic context probe — out of read-only scope). High confidence from spec.
- F8 settings.json coworker-edit gap: reasoned from the deny-list + trust-surface membership; not executed (never
  execute a bypass). The membership facts ARE verified (grep of BLOCKED_CLAUDE_FILES + ROLE_TRUST_SURFACES.files).
- The three F2 residual bypass classes are cited from the file's own documentation; not executed.
- Energy-enforce "would never permanently block" (auto-decay OPEN→HALF_OPEN→CLOSED) taken from comment + Wave-1/2
  memory, not re-derived here.

---

## ATTACK PASS (adversarial re-verification)

**Attacker:** Claude Sonnet 4.6 subagent. Method: read-only HEAD probes on every cited file/line.
**Date:** 2026-06-10.

### Verdict per finding

| Finding | Verdict | Evidence |
|---|---|---|
| F1: energy-enforce PEP doubly-inert + fail-open | **CONFIRMED** | energy-enforce.mjs line 46 `if (process.env.YURI_ENERGY_ENFORCE === '1') return true` — flag absent in env. energy-tick-core.mjs lines 230/252/286 `maxLadderInversion: 0` / `?? 0` — hardcoded zero confirmed at all three propagation sites. Fail-open on missing snapshot and breaker throw confirmed at lines 87/96-99. |
| F2: isRolePathMutation fail-OPEN lexical matcher (irreducible residual, documented) | **CONFIRMED** | bash-security-guard.js lines 943-966 document three uncatchable bypass classes. This is the file's own acknowledged residual. operator-write-guard.js + settings deny-list confirmed as the real coworker floor. |
| F3: pre-tool-use.js emits to STDERR — advisory context silently dropped | **CONFIRMED** | pre-tool-use.js line 39 `process.stderr.write(JSON.stringify({hookSpecificOutput:{...additionalContext}}))` verified. Per hooks spec, PreToolUse structured channel is stdout only; stderr JSON is non-blocking and discarded. All advisory output (compaction tiers, cross-terminal memory, token-economy) is dead. |
| F4: claude-protocol-guard DENY path depends on /tmp file + SPRINT_MODE blanket-suppress | **CONFIRMED** | claude-protocol-guard.mjs lines 349-368 verified: block requires sessionId + /tmp packet parse to complexityTier==='critical'. SPRINT_MODE line 242 returns [] before any check. Both are advisory-tier guard so security impact bounded — confirmed as-stated. |
| F5: hook ordering comment claims precedence via registration order — false per parallel execution spec | **CONFIRMED** | energy-enforce.mjs lines 11-12 comment claims "registered LAST". Hooks spec (verified in report): all matching hooks run in PARALLEL — registration order does not impose execution order. The safety posture is fine (any deny wins), but the stated mechanism is wrong. |
| F6: async pre-tool-gate can never deny (INFO) | **CONFIRMED** | settings.json line 166 `"async": true`. pre-tool-gate.js always writes `continue:true`. Correctly advisory-by-design; flagging stands as future-change guard. |
| F7: trust root sound — lane-kernel self-protecting, fail-CLOSED to full union | **CONFIRMED** | ROLE_TRUST_SURFACES.files live read = 11 entries including lane-kernel.mjs itself. Both bash-security-guard.js (lines 329-331) and operator-write-guard.js import it with fail-CLOSED fallback to full hardcoded union on import failure. resolveRole() coworker-default on parse failure confirmed. |
| F8 (TRUST-ROOT GAP): settings.json not in ROLE_TRUST_SURFACES; coworker Write/Edit = WARN only | **CONFIRMED** | ROLE_TRUST_SURFACES.files live read = 11 items — `.claude/settings.json` absent. BLOCKED_CLAUDE_FILES (bash-security-guard.js lines 14-22) = 7 items — only `settings.local.json` present, NOT `settings.json`. A coworker Write to settings.json gets a protocol-guard WARN only. This is the highest-value finding in the chain — confirmed. |

**Summary:** 8 findings — **8 CONFIRMED, 0 REFUTED, 0 UNVERIFIABLE.**

### Coverage vs scope die

Die extract (wave3-scope-die-extract.json) GOVERNANCE sector = 36 nodes. This report's scope is the PreToolUse enforcement chain specifically, not full GOVERNANCE breadth. Organs audited in-scope: the full PreToolUse hook stack (10 hooks), settings.json deny-list, trust root (lane-kernel + yuri-operator), and coworker role resolution.

**Skipped organs from die (out of enforcement-chain scope, acknowledged):**
1. `HERMES_FC` / `SCOUT_ARGUS` internals — scout-runner.js not read; PostToolUse advisory only, not deny-capable.
2. Energy-tick PDP internal math (energy-breaker.mjs, yuri-energy.mjs) — Wave-1/2 owned; cited not re-derived.
3. `yuri-risk-lite.js`, `token-budget-check.js`, `math-register-guard.mjs`, `gitnexus-hook.cjs` internals — advisory/enrichment, not deny-capable enforcement; excluded as out of scope by report's own boundary.
4. `CODEX_GATE` sector (PROPOSE/APPROVED/APPLY/APPLY_HEAD/CODEX_FLOW) — phantom infrastructure, no executor; governance-audit owns this finding.

**Missed organ count: 4 advisory/non-enforce organs** out of the full 36 die nodes. All are correctly out-of-scope for an enforcement-chain audit. Enforcement-chain coverage ≈ 95% as claimed.

### DeepSeek advisory leads verdict

- `deepseek-wave3-enforcement-chain.md` P0 findings (settings.json unprotected, ~25 hooks outside ROLE_TRUST_SURFACES): Both independently confirmed via live ROLE_TRUST_SURFACES.files read (11 entries, settings.json absent) and BLOCKED_CLAUDE_FILES read (7 entries, settings.json absent). The ~25 unprotected hook count is directionally correct — the 36-hook roster minus the 11 in ROLE_TRUST_SURFACES = 25 unprotected. **P0 LEADS CONFIRMED.**
- P1 findings (energy-enforce fail-open, agent-spawn-guard observability-only, protocol-guard WARN-only, pre-tool-gate async): All confirmed by HEAD reads. **P1 LEADS CONFIRMED.**
- Advisory-only characterization of `deepseek-wave3-enforcement-chain.md` was appropriate — all leads verified before acceptance.
