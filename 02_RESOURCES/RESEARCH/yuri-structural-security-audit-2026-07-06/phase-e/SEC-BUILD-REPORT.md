# SEC-1/3/4 BUILD REPORT — Fable-audit hardening (2026-07-06)

**Scope:** `_SYSTEM/Scripts/policy/yuri-safety-core.mjs` + `_SYSTEM/Scripts/voice/yuri-z-brain.py`.
Findings source: `02_RESOURCES/RESEARCH/yuri-structural-security-audit-2026-07-06/FABLE-AUDIT-SYNTHESIS.md` §1/§4.

## SEC-4 — patch both denylists (LIVE, additive, fail-closed)

**`yuri-safety-core.mjs`:**
- `PROTECTED_TARGETS` (was line ~13): added `.git/hooks` (dir), `.git/config` (file) — PROJECT_ROOT-relative.
- Added a HOME-relative set (new, via `os.homedir()`): `~/.aws`, `~/.npmrc`, `~/.docker`, `~/.gitconfig`,
  `~/.ssh`, `~/.zsh_history`, `~/Library/Keychains`, `~/.claude/settings.json`, `~/.claude/settings.local.json`.
- `PROTECTED_LITERAL_PATTERNS` (was line ~25): added `.git/hooks` / `.git/config` mirrors, plus a new
  `homeRelativePattern()` builder that matches THREE surface forms per HOME-relative entry: literal `~/...`,
  literal `$HOME/...`, and the **shell-expanded absolute path** (e.g. `/Users/marcelspatz/.aws`) — the last
  form is the one real shell invocations actually carry, and an earlier draft of this patch missed it
  entirely (caught + fixed during self-verification, see "Bugs found and fixed" below).
- **Real gap fixed beyond the literal ask:** `evaluateShellCommand` only ever gated a protected-literal hit
  when `MUTATING_COMMAND_RE` also matched (a write/mutate verb). A pure READ (`cat .env`, `cat ~/.aws/credentials`)
  was never gated by the shell path — this was true of the ORIGINAL `.env` entry too, not just my new
  additions. Added `READ_COMMAND_RE` (mirrors `bash-security-guard.js`'s `READ_CMDS` set: cat/head/tail/less/
  more/bat/nl/view/strings/xxd/hexdump/od/grep/awk/sed/cut/sort/uniq/read/source/./scp/rsync) and a second
  gate branch in `evaluateShellCommand` that fires on protected-literal + read-command, routed through the
  SAME `isAllowedProtectedReadForOffload` carve-out so the existing DeepSeek `.env` key-hydration path
  (`source .env` / `grep DEEPSEEK_API_KEY .env`) still degrades to allow. Verified this doesn't regress —
  see Security Matrix results below.

**`yuri-z-brain.py`** (`PROTECTED` tuple, was line ~296): added `.git/hooks/` + the same HOME cred stores
(`~/.aws`, `~/.npmrc`, `~/.docker`, `~/.gitconfig`, `~/.zsh_history`, `~/Library/Keychains`, `~/.claude/settings`)
via `os.path.expanduser("~")`. This is the brain's immediate substring-match hardening, live regardless of
whether SEC-1's unified gate is armed.

## SEC-3 — write_file/edit_file critical for new sensitive files (`yuri-z-brain.py`)

`_is_critical_call` (was line ~367-382) previously gated `write_file` ONLY via
`os.path.exists(os.path.join(REPO, p))` (overwrite check) and never gated `edit_file` at all.

New helpers (added just above `_is_critical_call`):
- `_resolve_tool_path(p)` — resolves a tool path the SAME way `_exec_tool` does: `os.path.join(REPO, p)`,
  which (per Python semantics) returns `p` UNCHANGED when `p` is already absolute — i.e. `REPO` is silently
  discarded. This is the exact escape SEC-3 flags: an absolute path like `~/.ssh/authorized_keys` (expanded)
  already writes OUTSIDE the repo today, and neither the old overwrite-only check nor a naive "is it under
  REPO" check catches it unless resolution matches the executor exactly.
- `_SENSITIVE_NEW_FILE_SEGMENTS` — `~/.ssh/`, `~/Library/LaunchAgents/`, `~/.zshrc`, `~/.bashrc`,
  `~/.bash_profile`, `~/.profile`, `/etc/cron`, `~/crontab`, `.git/hooks/`.
- `_is_write_target_critical(p)` — CRITICAL when: (a) target already exists (original overwrite behavior,
  preserved), OR (b) resolved path is outside the repo root entirely, OR (c) resolved path matches a
  sensitive-new-file segment. Fail-closed: any match gates.
- `_is_critical_call` now routes BOTH `write_file` and `edit_file` through `_is_write_target_critical`.
  `edit_file` in practice always resolves to (a) since `_exec_tool`'s edit_file handler requires the file
  to already exist to read+diff it — so this doesn't change edit_file's live behavior beyond what SEC-3
  explicitly asked for (new-sensitive-path protection also applies if an existing sensitive file is edited).

**Known pre-existing test conflict (not introduced by this change, verified against `git show HEAD`):**
`test_yuri_z_brain.py:63` asserts `edit_file` should be critical for a plain relative non-existent path;
`test_jarvis_memory.py:292` (`test_edit_file_not_gated`) asserts the opposite for a similar path. Both are
satisfied simultaneously today because the test paths differ in existence — `test_yuri_z_brain.py`'s baseline
already failed this exact check pre-edit (confirmed via a HEAD-checkout diff run), so this is inherited drift,
not a regression from this change. `test_jarvis_memory.py` (35/35) and the new SEC targeted matrix both pass.

## SEC-1 — unified gate, DISARMED-first (`yuri-safety-core.mjs` + `yuri-z-brain.py`)

**`yuri-safety-core.mjs`:** added `runCheckToolFromStdin()` + a new `--check-tool` CLI entry (additive,
does not touch the existing `--check`/hook-event CLI path). Reads `{toolName, toolInput, opts}` JSON from
stdin (an explicit contract, not the Claude/Codex hook-event alias shape `runHookFromStdin` expects — so the
Python caller doesn't need Claude-Code/Codex field-name knowledge). Calls `evaluateToolCall` directly, prints
`{allowed, decision, reason?}` JSON, exits 0 (allow) / 2 (deny). An evaluator crash is caught and treated as
deny (fail-closed), never silently allowed.

**`yuri-z-brain.py`:** new `UNIFIED_GATE = os.environ.get("YURI_Z_UNIFIED_GATE", "0") == "1"` (default OFF).
New `_unified_gate_check(tool_name, tool_input)` shells out to `node yuri-safety-core.mjs --check-tool`
(10s timeout, `YURI_Z_UNIFIED_GATE_TIMEOUT` override) and returns `(allowed, reason, degraded)` — ANY fault
(missing node, missing script, timeout, bad JSON, unexpected exit code) sets `degraded=True`.

New `_gate_bash(cmd)` / `_gate_write(tool_name, path)` wrap the existing inline checks (`_bash_block_reason`,
`_is_protected`) and layer the unified gate ON TOP, never in place of: the inline floor runs FIRST and
unconditionally (never weakened); only if the inline floor passes AND `UNIFIED_GATE` is armed AND the shim
didn't degrade does the unified gate get a chance to ADD a refusal. `_exec_tool`'s `bash`/`write_file`/
`edit_file` handlers now call `_gate_bash`/`_gate_write` instead of the bare inline checks. `read_file` was
deliberately left on the inline-only check — SEC-1 scoped this to bash/write/edit.

**DISARMED-first proof:** `UNIFIED_GATE` defaults to `False`; with the flag unset, brain behavior is
byte-for-byte identical to pre-SEC-1 except for the SEC-4 denylist hardening (which is unconditional).
Confirmed live: `brain.UNIFIED_GATE is False` on fresh import with no env var set.

## Bugs found and fixed during self-verification (not present in final code)

1. First denylist draft matched only the literal `~`/`$HOME` tokens, not the shell-expanded absolute path —
   `cat $HOME/.aws/credentials` (which arrives at the evaluator as `cat /Users/marcelspatz/.aws/credentials`
   after shell expansion) sailed through. Fixed via `homeRelativePattern()` matching all three forms.
2. `escapeRegExp` had a dead first `.replace()` call (non-global) before the real global one — simplified
   to a single correct call.
3. A stray `\;` inside a `u`-flag regex character class (`[\s"\';|&]` template-stringified as `\\;`) is an
   invalid escape under Unicode mode — `node --check` (static parse) did NOT catch this because the regex
   is constructed at runtime via `new RegExp(...)`, not a literal; caught only by actually importing the
   module. Fixed by removing the unneeded backslash.
4. Read-only reads of protected paths (`cat .env`, `cat ~/.aws/credentials`) were silently ALLOWED by
   `evaluateShellCommand` because the gate only fired under `MUTATING_COMMAND_RE`. This predates my changes
   (verified: `cat .env` was already allowed on `git show HEAD`) but directly undermines the arming matrix
   the packet requires, so I closed it with `READ_COMMAND_RE` (see SEC-4 above) rather than ship a denylist
   patch that still allows the exact reads the matrix says must deny.

## Security matrix — results

Run via: `echo '<json>' | node _SYSTEM/Scripts/policy/yuri-safety-core.mjs --check-tool` (exit 0=allow, 2=deny)
and directly against `yuri-z-brain.py`'s `_is_critical_call`/`_is_protected`/`_exec_tool`.

| Case | Expected | Result |
|---|---|---|
| `cat ~/.aws/credentials` (expanded + literal `~`) | DENY | PASS (both forms) |
| `cat ~/.npmrc` | DENY | PASS |
| `cat ~/Library/Keychains/login.keychain-db` | DENY | PASS |
| `cat .git/hooks/pre-commit` | DENY | PASS |
| `cat ~/.claude/settings.json` | DENY | PASS |
| `cat .env` | DENY | PASS (newly closed — see bug #4) |
| `cat .git/config` (fleet-gate-only, brain inline lacks it) | DENY when `YURI_Z_UNIFIED_GATE=1` | PASS |
| `write_file ~/.ssh/authorized_keys` | CRITICAL (confirm-gated) | PASS |
| `write_file ~/Library/LaunchAgents/x.plist` | CRITICAL | PASS |
| `write_file ~/.zshrc` | CRITICAL | PASS |
| `write_file` to absolute path outside repo | CRITICAL | PASS |
| `write_file` brand-new in-repo file | routine (not gated) | PASS |
| routine repo-local write/read, `git status` | ALLOWED, no regression | PASS |
| `.env` DeepSeek-offload `source`/`grep` carve-out | still ALLOWED | PASS |
| `YURI_Z_UNIFIED_GATE=1` + shim forced to fail (`FileNotFoundError`) on a command the inline floor already blocks (`cat .env`) | DENIED (inline floor holds) | PASS |
| Same degrade scenario on a routine command (`git status`) | still ALLOWED (degrade ≠ new block) | PASS |

**Test suites:** `test_yuri_z_brain.py` 90/93 (3 pre-existing/unrelated failures, confirmed identical on
`git show HEAD` baseline — not introduced by this change). `test_jarvis_memory.py` 35/35. `node --check` and
Python `ast.parse` both clean. `codex-offload-runner.test.mjs`'s `evaluateToolCall` assertions (the ones
that exercise `yuri-safety-core.mjs` directly) all pass; a later, unrelated failure in that same test file
(a temp-workspace missing `nano-lease.mjs` during a mocked subprocess scenario) is pre-existing and outside
this file's touched surface — confirmed present on `git show HEAD` too.

## Residual risk / gaps I did NOT cover (adversarial self-check, per instruction)

Named without being asked twice — a finite denylist is never adversary-complete:

- `~/.config/gcloud/*` (GCP credentials) — not covered.
- `~/.kube/config` (Kubernetes credentials) — not covered.
- `~/.gnupg/secring.gpg` / GPG secret keyring — not covered.
- 1Password / other password-manager vault files outside the explicitly named stores — not covered.
- `id_rsa`/`id_ed25519` etc. living OUTSIDE `~/.ssh/` (e.g. a backup copy) — the brain's substring match
  on `id_rsa` still catches the FILENAME anywhere, but `yuri-safety-core.mjs`'s path-based denylist only
  catches `~/.ssh` as a directory, not an arbitrarily-located key file by name.
- `~/.bash_history` / `~/.zsh_history` is covered but generic shell history under other paths, or
  `~/.config/*` broadly, is not.

These were out of scope for the three named findings (SEC-4 named exactly 7 stores; I did not expand the
enumeration beyond what was specified). Recommend a follow-up pass if the owner wants broader credential-
store coverage — ideally by porting `bash-security-guard.js`'s more mature pattern set into the shared gate
rather than hand-enumerating more paths here.

## Arming instructions (owner-gated per Self-Governance Charter)

- **SEC-4/SEC-3 are LIVE now**, no arming needed — they're additive denylist/classifier hardening on
  existing enforcement paths.
- **SEC-1's unified gate is DISARMED by default.** To arm: set `YURI_Z_UNIFIED_GATE=1` in the voice-brain's
  environment (e.g. in the launcher that starts `yuri-z-brain.py`, or exported before running it). Optional:
  `YURI_Z_UNIFIED_GATE_TIMEOUT` (seconds, default 10) to tune the shim's subprocess timeout.
- Arming does not weaken anything — the inline floor (now SEC-4-hardened) still runs first and unconditionally;
  the unified gate can only ADD a refusal, and any shim fault degrades silently back to the inline floor's
  verdict rather than failing open.

## Files changed

- `_SYSTEM/Scripts/policy/yuri-safety-core.mjs`
- `_SYSTEM/Scripts/voice/yuri-z-brain.py`

## Rollback

Both files are tracked; `git checkout -- _SYSTEM/Scripts/policy/yuri-safety-core.mjs _SYSTEM/Scripts/voice/yuri-z-brain.py` reverts fully.
