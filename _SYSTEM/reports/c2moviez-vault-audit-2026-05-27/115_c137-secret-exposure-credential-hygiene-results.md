# C-137 Secret Exposure And Credential Hygiene Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source and Git-history inspection. No target source files mutated. No credentials used, validated, or called. All observed secret values are redacted.

## Scope

This shard performs a targeted credential-hygiene pass:

```text
current tracked source / selected Git history / wrapper scripts / launchers / backup wrappers
  -> hardcoded API keys, bot tokens, PATs, signing secrets
  -> keychain/env fallback consistency
  -> runtime leakage surfaces
  -> repo-history persistence
```

The conclusion is urgent: the clone contains multiple tracked credential exposures in current `HEAD`, not just placeholders or local Keychain names. This directly contradicts the repo's "all secrets in Keychain, never hardcode API keys" claim. All exposed values must be treated as compromised and rotated.

## Findings

### R115-F01 - `Scripts/ai` Hardcodes Internal API And Telegram Bot Credentials

Severity: Critical credential exposure  
Status: `C137_VERIFIED_REDACTED`

Evidence:

- `Scripts/ai:30-31` comments that secrets are Keychain-sourced.
- `Scripts/ai:33` hardcodes an `INTERNAL_API_KEY` value. The value was observed but is intentionally not copied into this report.
- `Scripts/ai:34` hardcodes a `TELEGRAM_BOT_TOKEN` value. The value was observed but is intentionally not copied into this report.
- `Scripts/ai:36-40` continues into Claude/tmux launcher setup, making this a high-trust operator script rather than a dead sample file.

Impact:

This is a current-HEAD secret leak. Anyone with repository access can obtain an internal API key and Telegram bot token from tracked source. Because `Scripts/ai` is part of the Claude/tmux control path, the exposure also sits close to the most privileged automation surface in the repo.

Required remediation direction:

- Rotate the internal API key and Telegram bot token.
- Remove hardcoded exports and load only from Keychain or a server-side secret store.
- Add a pre-commit and CI secret scanner that blocks this exact pattern.

### R115-F02 - Supabase MCP Backup Wrapper Hardcodes An Access Token

Severity: Critical credential exposure  
Status: `C137_VERIFIED_REDACTED`

Evidence:

- `Scripts/mcp-wrappers-backup/supabase-mcp.sh:7-11` attempts to load a Supabase PAT or anon token from Keychain.
- `Scripts/mcp-wrappers-backup/supabase-mcp.sh:14-17` then invokes the Supabase MCP server with a hardcoded `--access-token` value instead of the `ACCESS_TOKEN` variable. The value was observed but is intentionally not copied into this report.
- Git-history grep showed this redacted token pattern recurring in historical commits for the same backup wrapper path.

Impact:

Even if this is a backup wrapper, it is tracked source and references Supabase admin tooling. A PAT or privileged access token in Git must be treated as compromised. If the token is still valid, it may allow Supabase project access through the MCP server. If it is expired, the pattern still proves the repo's credential hygiene controls failed.

Required remediation direction:

- Revoke/rotate the Supabase token.
- Remove the hardcoded argument and pass the already loaded `ACCESS_TOKEN` variable to the MCP server.
- Consider deleting backup wrappers that contain operationally obsolete secrets or moving them to a redacted template.

### R115-F03 - Soketi Signing Secret Is Hardcoded In Current Source And Persisted In History

Severity: Critical credential exposure  
Status: `C137_VERIFIED_REDACTED`

Evidence:

- `Scripts/soketi-bridge.js:35-40` hardcodes the Soketi host, app id, key, and signing secret. The secret value was observed but is intentionally not copied into this report.
- `Scripts/soketi-bridge.js:70-87` uses that secret to sign the Pusher-compatible HTTP API publish request.
- Git-history grep showed the same redacted `SOKETI_SECRET` assignment recurring across historical commits for `Scripts/soketi-bridge.js`.

Impact:

This confirms the realtime signing secret is not a one-off current-tree typo; it is present in history. Rotation must assume any clone, backup, or AI context packet with repo access could have captured it.

Required remediation direction:

- Rotate the Soketi secret and ensure old signatures are rejected.
- Move signing material to a server-only secret store.
- Rewrite or quarantine public/shared history only if Claudio's operational process requires it; rotation is the non-negotiable first step.

### R115-F04 - Claude OAT Handling Avoids Source Hardcoding But Creates Runtime Leakage Surfaces

Severity: High credential exposure-in-runtime risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/exeo-daemon-tmux.sh:100-110` documents that long-lived Claude OATs are exported through `CLAUDE_CODE_OAUTH_TOKEN`.
- `Scripts/exeo-daemon-tmux.sh:174` interpolates `CLAUDE_CODE_OAUTH_TOKEN` into a tmux command string before executing `claude --dangerously-skip-permissions`.
- `Scripts/nexogram-bridge.js:177` builds a command string containing `CLAUDE_CODE_OAUTH_TOKEN` when an OAT is available.
- `Scripts/daemon-stuck-watch.js:323-330` loads a Claude OAT from Keychain or environment and passes it into a restarted daemon process environment.

Impact:

This shard did not find a plaintext Claude OAT hardcoded in source, which is good. The runtime pattern is still risky: tokens can leak into process listings, tmux scrollback, debug logs, shell error messages, crash dumps, or operator screenshots when interpolated into command strings. The risk is amplified because the launched Claude session uses broad bypass permissions.

Required remediation direction:

- Pass OATs through a protected environment file or exec wrapper that avoids printing/interpolating the token into command text.
- Ensure logs and tmux panes never echo credential-bearing commands.
- Add a runtime redaction check for `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, and similar variables.

### R115-F05 - Team Bot Config Tracks Keychain Token Names And Stable Identity Mappings

Severity: Medium information-disclosure and targeting risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/team-bots/team-config.js:8-36` maps team members to Keychain token service names, Plane user ids, modules, and quiet-hour metadata.

Impact:

The Keychain service names are not secret values, but they make local credential discovery and social/ops targeting easier for anyone with machine access or repo access. This is acceptable only if the repo is tightly private and the threat model treats these as internal operational metadata.

Required remediation direction:

- Move token service names into a redacted team-bot config template or local-only config file.
- Keep public/tracked team config limited to non-sensitive role metadata and stable user ids only when necessary.

### R115-F06 - Credential Handling Is Inconsistent Across The Repo

Severity: High control-plane hygiene risk  
Status: `C137_VERIFIED`

Evidence:

- `CLAUDE.md:412` says secrets are in macOS Keychain and API keys should never be hardcoded.
- Current source contradicts that with hardcoded values in `Scripts/ai`, `Scripts/soketi-bridge.js`, and `Scripts/mcp-wrappers-backup/supabase-mcp.sh`.
- Many other scripts correctly load secrets from Keychain or environment, including `Scripts/run-nexogram-bridge.sh:10`, `Scripts/run-vault-file-sync.sh:10`, and multiple Supabase/Telegram wrappers.

Impact:

The system has the right secret-storage idea, but no enforcement. Some files use Keychain correctly, while high-trust launcher/bridge/backup files bypass it. That inconsistency is exactly how "one quick local fix" becomes a production credential leak.

Required remediation direction:

- Define one secret-access wrapper per runtime class.
- Block hardcoded credential assignments in source review.
- Add secret-scanner output to the audit log so future AI sessions cannot accidentally re-ingest raw secrets.

## History Notes

Selected redacted Git-history grep confirmed that the hardcoded Soketi secret and Supabase MCP access-token pattern appear in historical commits. The current HEAD also contains hardcoded `Scripts/ai` credentials. Because Git history can preserve removed secrets indefinitely, remediation must prioritize provider-side rotation over source cleanup alone.

## Positive Controls Observed

- Many scripts already use macOS Keychain lookups instead of plaintext values.
- No root `.env` file was present in the current clone inventory inspected during this pass.
- The audit reports generated here were secret-scanned after writing and did not contain raw secret values.

## Coverage Boundary

This pass used source and selected history inspection only. It did not validate whether any token is live, expired, scoped, revoked, or accepted by a provider. Validation would require using credentials or calling provider APIs, which is explicitly out of scope for this read-only audit.
