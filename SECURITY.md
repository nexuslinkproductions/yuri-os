# Security Policy

## Supported Versions

YURI is in active pre-release development. Security fixes are applied to the `main`
branch only. No separate LTS or versioned release branches exist yet. Once stable
releases are tagged, this table will be updated.

| Branch / Tag | Supported |
|---|---|
| `main` (latest) | Yes |
| Older commits | No — upgrade to `main` |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security bugs.** Public disclosure before a
fix is available harms every operator running YURI.

Report privately by emailing **contact@nexuslinkproductions.com** with the subject
`[YURI SECURITY] <brief description>`.

Include:
- A clear description of the vulnerability and the affected component
- Reproduction steps or a proof-of-concept (in a test environment only — never against systems you do not own)
- The potential impact in your assessment
- Your contact details for follow-up

### What to expect

| Stage | Timeline |
|---|---|
| Acknowledgment | Within 72 hours of receipt |
| Initial triage and severity assessment | Within 7 days |
| Fix or mitigation shipped | Depends on severity; critical issues targeted within 14 days |
| Public disclosure coordination | After the fix is available, coordinated with the reporter |

We follow responsible disclosure and will credit reporters in the changelog unless
anonymity is requested.

## Scope

**In scope:**

- The hook execution pipeline (`PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`),
  especially `bash-security-guard.js`, `operator-write-guard.js`, and protected-path enforcement
- The operator role / credential resolver (`coworker` vs `dev` elevation)
- Energy-gate and gate-bypass vectors
- Memory kernel and memory-bus trust boundaries
- `yuri-init` merge behavior (hook injection into a host `~/.claude` setup)
- `.env` / secret handling in any shipped script or template

**Out of scope:**

- Vulnerabilities in third-party dependencies not introduced or modified by YURI (report those upstream)
- Social engineering the operator
- Denial-of-service against a single local machine
- Anything under `_SYSTEM/archive/` or other non-shipped trees

## Hardening Notes for Operators

These apply when running YURI on a shared machine, in CI, or behind any network surface.

### 1. Review `.claude/settings.json` before trusting it on a shared machine

YURI's hooks intercept every tool call the AI makes — gating protected paths, shell
commands, mutations, and operator-write privileges. The allow/deny lists and trust
boundaries live in `.claude/settings.json`.

On a shared or multi-user machine, anyone who can write to the repository root can
modify `settings.json` and weaken those gates. Before deploying:

- Confirm the repo root is owned by, and writable only by, the intended operator account.
- Audit `.claude/settings.json` for unexpected `allow` entries that broaden shell or file access.
- Treat `.claude/hooks/` with the same file-permission discipline as any executable on your `PATH`.

The protected paths the guards enforce by default (from `_SYSTEM/yuri-origin.md`):

```
backend/data/        .claude/state/        .claude/history/
.claude/file-history/   .claude/projects/*/{history,state,file-history,worktrees,transcripts}/
.env                 node_modules/         secrets / API keys / credentials
```

YURI's own hooks never read or write these under normal operation. Any hook or agent
behavior reaching for them is a signal worth investigating.

### 2. Keep the operator dev key secret

YURI resolves a session **role**: `coworker` (restricted — the safe default) or `dev`
(full owner trust). Elevation to `dev` is gated by `YURI_DEV_KEY` and the credential
resolver. Treat that key like any other secret:

- Generate a strong, random `YURI_DEV_KEY`; never commit it (set it in `.env`, which is
  a protected path the hooks will not read).
- The `coworker` default exists so an untrusted or automated session cannot mutate the
  guard surface, role resolver, or credentials. Do not weaken that default to silence a prompt.
- The static command-string guards (`bash-security-guard`) are a fail-open layer-2
  conscience, not a sandbox. The hard boundary is the deterministic PreToolUse hooks plus
  the `settings.json` deny-list plus the owner-role trust root. Defense in depth, not a single wall.

### 3. The install merge touches your `~/.claude`

`yuri-init --apply` backs up and then additively merges YURI hooks into your
`~/.claude/settings.json`, and links skills/commands. Review the merged result, keep the
timestamped backup it writes, and detach cleanly with `yuri-init --remove`. Prefer the
plugin install path (`claude plugin add`) on shared machines — it is namespaced and does
not mutate your global settings.

### 4. Background daemons are opt-in and run as you

Any launchd/cron automation YURI can template runs as the user account that loads it,
inheriting that account's permissions and keychain access. They are **not** installed by
default. Only load automation you have inspected; verify each `ProgramArguments` path
resolves to the expected script. Audit with `launchctl list | grep yuri`; unload with
`launchctl bootout gui/$(id -u)/<label>`.

## Disclosure History

No public disclosures to date. This section will be updated as issues are resolved.
