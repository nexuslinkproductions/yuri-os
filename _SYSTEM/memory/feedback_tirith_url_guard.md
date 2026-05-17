# Rule: Tirith URL Guard — Security Layer for URL-Touching Commands

**Set:** 2026-05-14
**Severity:** SECURITY POLICY — applies to every Bash command containing URLs

## The Layer

`~/.hermes/bin/tirith` (URL security analysis tool, already installed) now intercepts every Bash command that contains a URL. Pattern:

```
Bash command → bash-security-guard.js (hard blocks: .env, destructive, etc.)
            → tirith-url-guard.js     (URL risk score via tirith score)
            → Claude Code permission system
            → execute
```

## How It Works

`.claude/hooks/tirith-url-guard.js` runs on every PreToolUse:Bash event:

1. Skip non-Bash tools
2. Extract command string
3. Regex match all `http://` / `https://` URLs
4. For each URL: run `~/.hermes/bin/tirith score <url>` (5s timeout each)
5. If any URL scores MEDIUM/HIGH/CRITICAL risk → `permissionDecision: "ask"` with the explanation surfaced to the user
6. Safe URLs (LOW/SAFE/unknown) → silent pass
7. Tirith binary missing or any error → silent exit 0 (never break sessions)

## Bypass

Set `TIRITH_BYPASS=1` to skip the check entirely for one command. The hook logs to stderr when bypassed so it's not invisible.

```bash
TIRITH_BYPASS=1 bash _SYSTEM/Scripts/some-script-with-known-safe-url.sh
```

## What It Catches

Tirith detects:
- Phishing-shaped URLs (lookalike domains, IDN homograph)
- Server-side cloaking (different content for bots vs browsers)
- Known-malicious URL patterns
- Download-execute chains piped to shells (already caught by bash-security-guard.js, but tirith adds risk scoring)
- Pasted URLs from untrusted clipboard sources

## What It Doesn't Catch

- Custom internal hostnames (false negatives for fully internal URLs)
- IP-based URLs without DNS
- Encoded URLs (`%68%74%74%70...`) — base regex won't match

## MCP Server Side

`tirith mcp-server` is also registered in `claude_desktop_config.json`. Next session gets:
- `mcp__tirith__check` — check a command for URL security issues
- `mcp__tirith__score` — score a specific URL
- `mcp__tirith__scan` — scan files for hidden content / config poisoning
- `mcp__tirith__fetch` — check URL for server-side cloaking
- `mcp__tirith__explain` — show documentation for a detection rule

Use these tools proactively when:
- About to follow a link from an email / message / PDF
- Reviewing a PR that introduces external URLs
- Investigating a suspicious script

## Integration With Other Hooks

Order in PreToolUse:
1. `bash-security-guard.js` — hard blocks (`.env`, destructive commands, download-execute chains)
2. `claude-protocol-guard.js` — control-packet / route-plan advisories
3. **`tirith-url-guard.js`** — URL risk scoring (NEW)
4. `scout-inject.js` — context enrichment
5. `pre-tool-use.js` — general pre-tool logic
6. `aeonic-enforce.js` — aeonic protocol enforcement

Tirith fires LAST among the security/guard layer — bash-security-guard has already blocked hard violations; tirith adds risk-scoring nuance on top.

## Evidence

- `~/.hermes/bin/tirith` installed, commands include `score`, `check`, `scan`, `fetch`, `mcp-server`, `gateway`
- Plan Track 4 — Hermes/Tirith URL guard
- User instruction 2026-05-14: select security as one of 4 improvement directions
