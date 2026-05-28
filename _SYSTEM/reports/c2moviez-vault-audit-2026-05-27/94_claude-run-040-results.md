# Claude Run 040 Results - Auth And Internal Access Baseline

Date: 2026-05-27
Lane: `R040_AUTH_INTERNAL_ACCESS_CLAUDE_OPUS`
Worker: persistent Claude/tmux lane, read-only target inspection
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted with C-137 validation

## Evidence Capture

Claude output was captured at:

```text
/tmp/yuri-c2v-claude-run-040/pipe/r040-claude-capture.txt
```

Accepted rows start at the final `CLONE_PROOF` block in the capture. Earlier pane scrollback is ignored.

## Accepted Findings

### R040-F01 - SSO Flow Does Not Mint The `exeo_token` Cookie It Depends On

Severity: critical
Class: auth integration / availability

Evidence:

- `Dashboard-v2/src/routes/auth/callback/+page.svelte:85-98` says it mints an `exeo_token` cookie by calling `/api/functions/auth` with `action: "verify"` and a GoTrue Bearer token.
- `Dashboard-v2/src/routes/+layout.svelte:93-103` repeats the same fire-and-forget verify call.
- `Dashboard-v2/functions/auth.js:264-272` handles `action === "verify"` by reading only the `exeo_token` cookie and never sets `Set-Cookie`.
- `Dashboard-v2/functions/auth.js:260-261` sets the cookie only on password login.

Impact:

SSO users can acquire a GoTrue session but never receive the custom cookie expected by many backend functions. This plausibly explains "logged out after about an hour" and protected endpoint failures for SSO users.

### R040-F02 - `auth-check.js` Treats GoTrue Bearer Tokens As Custom HMAC Tokens

Severity: high
Class: auth integration / false reject

Evidence:

- `Dashboard-v2/functions/auth-check.js:121-128` accepts either cookie token or Bearer token, then calls `verifyTokenStructure`.
- `auth-check.js:43-55` verifies tokens with an HMAC using `AUTH_SECRET`.
- `Dashboard-v2/src/lib/db.ts:721-738` and `:740-759` attach Supabase GoTrue `access_token` as Bearer.

Impact:

GoTrue JWTs are not signed with this custom `AUTH_SECRET`, so SSO Bearer requests are rejected by protected functions unless a custom `exeo_token` cookie exists.

### R040-F03 - Legacy Unsalted SHA256 Password Hash Fallback Remains Active

Severity: high
Class: password security / legacy compatibility

Evidence:

- `Dashboard-v2/functions/auth.js:141-147` accepts `AUTH_PASSWORD_HASH` by hashing the submitted password with unsalted SHA256.
- `auth.js:255-257` logs `sha256-legacy` when this path is used.

Impact:

If `AUTH_PASSWORD_HASH` remains configured, password security depends on an unsalted fast hash rather than the bcrypt path.

### R040-F04 - Deprecated Bare `X-Internal-Key` Still Bypasses HMAC Binding

Severity: medium
Class: internal auth / replay resistance

Evidence:

- `Dashboard-v2/functions/auth-check.js:75-88` implements timestamp/body-bound HMAC internal auth.
- `auth-check.js:113-118` still accepts raw `X-Internal-Key` equality as a deprecated fallback.

Impact:

A leaked internal key can authenticate requests without timestamp or body binding. This is especially risky while function routing remains split and `/.netlify/functions/*` is externally proxied.

### R040-F05 - Email-Domain Restriction Is Client-Side In Tracked Source

Severity: medium
Class: auth policy / server-side enforcement gap

Evidence:

- `Dashboard-v2/src/routes/auth/callback/+page.svelte:52-58` rejects non-`@c2moviez.com` emails client-side after GoTrue exchange.
- `Dashboard-v2/src/routes/+layout.svelte:59-64` repeats a client-side domain check.
- No tracked `hooks.server.ts` or GoTrue server-side auth hook configuration was found.

Impact:

Domain restriction cannot be proven server-side from GitHub-obtainable evidence. Severity depends on Supabase Auth/provider configuration and RLS.

### R040-F06 - Health Timestamp Hardcodes UTC+2

Severity: low
Class: observability

Evidence:

- `Dashboard-v2/functions/health.js:204-207` always adds two hours to UTC and emits `+02:00`.

Impact:

Health reports are one hour wrong during winter CET. This is low security impact but contributes to unreliable operations evidence.

## Suppressions

- `config-public.js:27-33`: exposing Supabase URL and anon key is not itself a secret leak; RLS determines safety.
- `+layout.svelte:91-92`: `exeo-authed` localStorage/sessionStorage is a UI hint, not a standalone auth bypass.
- `auth-check.js:123-128`: the Bearer path rejects GoTrue tokens; it is a false-reject problem, not a false-accept problem.

## Deferred

- Applied Supabase RLS policies.
- GoTrue provider/domain restrictions.
- Runtime `INTERNAL_SERVICE_KEY` strength and rotation.
- Per-function adoption of `auth-check.js` across the whole function tree.
- Live Caddy config versus tracked template.

## Coverage Update

No unique coverage increment is claimed. Run 040 is accepted as auth root-cause consolidation over files already covered or previously used as supporting evidence.
