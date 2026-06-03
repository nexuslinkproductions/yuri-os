# YURI Guard-Surface Hardening — Bug-Bounty Corpus Cross-Reference (2026-06-03)

Method: 10 parallel read-only auditors, each cross-referencing the local disclosed bug-bounty corpus (`03_NEXUS-LINK/bug-bounty/corpus/bugbounty.db`, 9,487 HackerOne reports) against one YURI guard/hook file, then the findings adversarially triaged against the actual code + threat model. Findings are advisory until the owner verifies + fixes.

## Threat-model framing (why most raw findings were over-graded)
These hooks gate **Claude's own tool calls** and enforce the **two-role coworker restriction**. They are NOT an attacker-facing API. An adversary with local shell + write access to the repo / `~/.config` / `_SYSTEM/SELF` / `/tmp` has already bypassed every hook by definition (they can run the command directly). So findings premised on "attacker controls stdin / state.json / /tmp / env" are mostly moot. The genuinely useful signal is the narrow band: (a) a **prompt-injected or confused Claude** bypassing a defense-in-depth content block, and (b) cheap hygiene (file perms, log bounds).

## REFUTED (false positive / wrong threat model — NOT actioned)
- **bash-security-guard `activeRole()` "CRITICAL role bypass"** — fail-closed, misread direction. Creating `dev-credential.json` yields the *more*-restricted `coworker`; escalating to `dev` needs the scrypt-hashed passphrase. The operator-write-guard auditor independently certified this same pattern as correct. operator-write-guard also protects the cred file from coworker writes.
- **agent-spawn-guard stdin DoS / payload / caller-auth (4)** — the harness feeds the hook its own tool-call payload; not an attacker-controlled stdin endpoint.
- **yuri-operator `YURI_DEV_KEY` env "HIGH escalation"** — the env value is validated against the scrypt hash (`verifyDevKey`); setting it without the real passphrase fails.
- **musubi-protocol-enforce state-tampering** — requires local write to `session-state.json` = already won.

## VERIFIED — worth fixing
### FIXED (this session, in-repo)
- **energy-enforce.mjs audit log unbounded append** (MED, corpus #2 class — log-file DoS). Added a 50MB size guard before append (`AUDIT_MAX_BYTES`); stops contributing once the shared log is large. Broader log *rotation* remains a separate system concern.

### OWNER-TERMINAL (Edit-protected guards / trust root — fix in your shell)
- **bash-security-guard.js — incomplete pattern matching** (MED, defense-in-depth vs a prompt-injected Claude). Three real bypasses of existing blocks:
  - `isDownloadExecuteChain` only catches the pipe form: `curl x | bash` is blocked but `curl x; bash` / `curl x && bash` are not (regex keys on `|`). Fix: also match `;`, `&&`, `||`, `&` separators, or reject curl/wget + interpreter in the same command regardless of separator.
  - `isEnvTarget` matches only `.env` / `./.env`: `cat ./x/../.env` or `backend/../.env` bypass the read block. Fix: `path.resolve()`-normalize the arg before comparing.
  - `extractShellWrapper` regex misses `$'...'` and unquoted `-c` args. Fix: handle `$'...'`, or reject inline `sh -c` payloads outright.
  - Shared root cause: `toks()` is whitespace-only tokenization (no quoting/escaping). A shell-aware tokenizer would close several at once.
- **yuri-operator.cjs — credential hygiene** (LOW-MED). `chmodSync(CRED_FILE, 0o600)` after writing `dev-credential.json` (currently default perms). `--passphrase=<v>` flag leaks to `ps`/`/proc/PID/cmdline` — prefer interactive `promptHidden` only, or stdin. Minor: a possibly-unreachable Ctrl-C branch in `promptHidden` (`s===''` shadow).
- **claude-protocol-guard.mjs — `/tmp` session packet** (LOW; it gates Claude's workflow discipline, not a security boundary). Reads `/tmp/yuri-session-packet-*.json` with no UID check → another local user could forge gate state. Cheap fix: `if (fs.statSync(p).uid !== process.getuid()) return null;`.

### CLEAN (auditor-certified, evidence in code)
operator-write-guard.js (realpath canonicalization + dual lexical/symlink check + case-insensitive norm + fail-closed role), tirith-url-guard.js (http/https-only, shell-escaped, delegates to tirith binary), yuri-risk-lite.js (constant regexes, no exec/eval), token-budget-check.js (bounded I/O), energy-enforce.mjs (path-traversal-safe sessionId allowlist, fail-open, bounded snapshot arrays).

## Lower-priority robustness (not security)
- claude-protocol-guard warn_count / musubi-enforce throttle: read-modify-write races on session-state (last-write-wins; worst case = a skipped advisory). Optimistic-lock or accept.
- musubi-protocol-enforce: null-state defeats the 60s throttle (advisory spam, not security). Add a null guard.

SEE: [[bug-bounty-corpus-cross-ref-hardening]] · [[study-competition-for-code-excellence]] · `02_RESOURCES/RESEARCH/yuri-architecture-codex-2026-06-03.md`
