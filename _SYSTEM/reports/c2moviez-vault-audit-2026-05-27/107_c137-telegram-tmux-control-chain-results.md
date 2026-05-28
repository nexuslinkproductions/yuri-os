# C-137 Telegram, Tmux, And Claude Control-Chain Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target scripts executed. No installs. No live Telegram, Claude, Supabase, Plane, or Obsidian calls.

## Scope

This shard inspects the communication/control path that explains Claudio's broken Telegram-to-Claude system and the higher cyber risk created by treating chat input as an operations bus.

Grounded control-flow map:

```text
Telegram getUpdates
  -> Scripts/telegram-mcp/poller.js
  -> /tmp/telegram-inbox.jsonl
  -> Scripts/exeo-daemon.js
  -> tmux target exeo:ai
  -> Scripts/ai
  -> Claude interactive session with Telegram, Plane, Supabase, Obsidian, Read/Grep/Glob/Bash tools
```

This is a privileged operational command path, not a normal chatbot.

## Findings

### R107-F01 - Telegram Ingress Writes All Messages Into The AI Control Bus Before A Sender Allowlist Gate

Severity: Critical if the Telegram bot is reachable by untrusted senders; High otherwise  
Status: `C137_VERIFIED`, `DEPLOYMENT_DEPENDENT`

Evidence:

- `Scripts/telegram-mcp/poller.js:433-440` long-polls Telegram updates.
- `Scripts/telegram-mcp/poller.js:560-574` appends each parsed message into `/tmp/telegram-inbox.jsonl` and wakes EXEO via tmux.
- No sender allowlist check is visible before the inbox append in that poller block.
- `Scripts/exeo-daemon.js:713-723` processes every ingested message and writes a receive audit row.
- `Scripts/exeo-daemon.js:725-730` uses `ALLOWED_USERS` only to decide whether to broadcast significant CEO intent.
- `Scripts/exeo-daemon.js:755-777` uses `ALLOWED_USERS` only for the CEO fast path.
- `Scripts/exeo-daemon.js:778-783` sends the message to the persistent AI pane regardless of whether the sender is CEO.
- `Scripts/exeo-daemon.js:403-481` builds a system prompt for non-CEO contacts too, while still listing Plane, Telegram, Supabase, and Obsidian MCP servers at `Scripts/exeo-daemon.js:470-471`.

Impact:

If the live bot can receive messages from anyone outside Claudio's trusted set, untrusted Telegram input can reach a Claude session that has operational tools. The prompt labels the sender as an external contact, but that is not an authorization boundary. The safe pattern would be deny-by-default before the inbox write or before `runAI`, with a separate low-authority flow for external contacts.

Required remediation direction:

- Add a hard allowlist check in `poller.js` before any file write, file download, meeting command, or tmux wake.
- Add a second allowlist/role gate in `exeo-daemon.js` before `runAI`.
- Route unknown senders to a minimal responder without Plane, Supabase, Obsidian, Bash, or broad Telegram tools.
- Log denied sender ids without exposing message contents broadly.

### R107-F02 - The Claude Pane Runs With Broad Tooling And Bypassed Permission Prompts

Severity: Critical as a blast-radius multiplier  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/ai:72-80` launches an interactive Claude loop with `--permission-mode bypassPermissions`.
- `Scripts/ai:74-79` grants Telegram, Plane, database/Supabase, Obsidian, `Read`, `Grep`, `Glob`, and `Bash` tools.
- `Scripts/exeo-daemon.js:503-520` creates or reuses the `exeo:ai` tmux window and pipes the pane output to `/tmp/nex-ai-session.log`.
- `Scripts/exeo-daemon.js:543-550` injects a full user turn into that pane by loading a tmux buffer and pressing Enter.
- The legacy tmux script also used skip-permission mode at `Scripts/exeo-daemon-tmux.sh:173-174`.

Impact:

This design intentionally favors autonomy. That means every ingress weakness into the AI pane inherits the authority of a local operator session: local filesystem read, shell commands, vault tools, operational service tools, and Telegram sends. For a trusted CEO-only private assistant this may be acceptable with strict gates. For a bot that can process external messages, it is too much authority.

Required remediation direction:

- Split the AI lane into at least two tool profiles: CEO-admin and external-low-trust.
- Remove `Bash` from the default Telegram response lane unless the turn is locally approved.
- Keep write-capable MCP tools out of unauthenticated or externally-originated turns.
- Make `permission-mode bypassPermissions` a documented high-risk operating mode with explicit preflight checks.

### R107-F03 - Telegram MCP Sends Bypass The Repo's Outbound Guardrail Wrapper

Severity: High  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/exeo-daemon.js:276-322` implements `guardedTgSend()` around the raw Telegram send primitive.
- That wrapper is used for fallback-style sends, not for MCP tool sends emitted by Claude.
- `Scripts/telegram-mcp/server.js:128-157` implements `send_message` and sends caller-provided HTML text to either a supplied chat id or all allowed users.
- `Scripts/telegram-mcp/server.js:193-215` implements `reply_message` and sends caller-provided HTML text to a supplied chat id.
- `Scripts/telegram-mcp/server.js:218-248` implements inline button sends.
- None of those MCP tool handlers call the `nex-guardrails` wrapper before sending.

Impact:

The prompt tells Claude that every turn must end with a Telegram MCP send. But the actual MCP send path is not the guarded send path. This creates a false safety story: guardrails exist in the repo, but the main Claude-to-Telegram path can bypass them. Sensitive or malformed output can leave the system without the intended block/hold/flag decision.

Required remediation direction:

- Move guardrail enforcement into the Telegram MCP server itself.
- Require every `send_message`, `reply_message`, and `send_buttons` handler to pass through one shared outbound policy.
- Add a per-tool audit record with sender role, chat id, guardrail decision, and message hash.
- Deny arbitrary `chat_id` for non-admin sessions.

### R107-F04 - `/tmp/telegram-inbox.jsonl` Is An Unsigned Local Command And Prompt Bus

Severity: High  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/exeo-daemon.js:911-934` watches `/tmp/telegram-inbox.jsonl`, parses any JSON line with a new `update_id`, and queues it for processing.
- `Scripts/telegram-mcp/poller.js:560-574` writes Telegram-originated entries into the same file.
- `Scripts/telegram-mcp/poller.js:235-249` writes `SYSTEM` meeting-analysis entries into the same file.
- `Scripts/telegram-mcp/poller.js:398-412` writes more `SYSTEM` meeting entries into the same file.
- `Scripts/meeting-analyzer.js:65-79` appends `SYSTEM` entries into the same inbox.
- `Scripts/meeting-analyzer.js:99-115` instructs EXEO to read/write meeting notes, render HTML, and send Telegram.
- `Scripts/cto-nightly-trigger.js:40-62` appends a high-authority CTO task into the same inbox.

Impact:

The file is both an inbox and a command queue. Any local process that can write to that path can create messages that look like Telegram or `SYSTEM` work. This may be acceptable on a single-user Mac only if every writer is fully trusted and protected. It is not a strong security boundary.

Required remediation direction:

- Use a private directory with restrictive permissions rather than a world-familiar `/tmp` path.
- Add an HMAC or signed envelope for each local command entry.
- Separate Telegram user messages from internal scheduled commands.
- Add a schema with allowed producers and allowed actions per producer.

### R107-F05 - Meeting Recorder Side Effects Run Before Sender Authorization

Severity: High availability and integrity risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/telegram-mcp/poller.js:477-490` downloads uploaded document/audio files and routes audio to the meeting recorder.
- `Scripts/telegram-mcp/poller.js:507-515` does the same for Telegram audio messages.
- `Scripts/telegram-mcp/poller.js:523-538` downloads and transcribes voice messages.
- `Scripts/telegram-mcp/poller.js:546-557` accepts text meeting commands such as starting and ending meetings.
- `Scripts/telegram-mcp/poller.js:230-249` writes meeting notes and injects a `SYSTEM` analysis request into the inbox.
- `Scripts/telegram-mcp/poller.js:260-279` runs local ffmpeg and Whisper transcription with up to 60-second command timeouts for voice.
- `Scripts/telegram-mcp/poller.js:395-414` writes a meeting note and wakes EXEO after audio transcription.

Impact:

Even before the message reaches Claude, the poller can do local file writes, downloads, audio conversion, transcription, and `SYSTEM` prompt injection. This is a plausible contributor to CPU/RAM spikes and a direct abuse path if the bot receives untrusted media.

Required remediation direction:

- Apply sender allowlist before media download or meeting command parsing.
- Add media size, duration, MIME, and sender quotas before downloading files.
- Keep meeting analysis injection behind a signed internal producer gate.
- Push long audio work into a queue with concurrency and memory limits.

### R107-F06 - Long-Poll Startup Explicitly Clears Telegram Webhooks, Creating A Receiver-Mode Conflict

Severity: High stability risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/telegram-mcp/poller.js:424-426` calls `deleteWebhook` before starting the long-poll loop.
- The tracked repo also contains serverless Telegram webhook handlers inspected in shard `105`, including `Dashboard-v2/functions/telegram.js` and `Dashboard-v2/functions/telegram-team.js`.
- `Scripts/telegram-mcp/poller.js:433-440` then owns `getUpdates`.

Impact:

Telegram bots cannot reliably use webhook delivery and `getUpdates` ownership at the same time. Starting the poller can disable the webhook path. If Claudio expected Telegram commands to flow through a deployed function while a local poller also starts, messages can vanish from the expected path or bypass the intended handler logic.

Required remediation direction:

- Pick exactly one receiver mode per bot: webhook or long-poll.
- Encode receiver ownership in docs, LaunchAgents, and health checks.
- Alert loudly when a poller deletes a webhook.
- Do not run local long-poll for a bot that production webhooks are expected to own.

### R107-F07 - Repo Contains Retired Or Side Paths That Still Use Non-Persistent Claude Calls

Severity: Medium-High stability and cost risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/exeo-daemon-tmux.sh:117-129` uses a `claude --print` auth probe.
- `Scripts/exeo-live.sh:250-257` calls `claude -p` with stream-json output and bypassed permissions.
- `Scripts/daemon-stuck-watch.js:294-330` runs a 15-minute canary using `claude --print` independently of the persistent tmux pane.
- The newer `Scripts/ai:72-83` persistent loop is better aligned with the desired architecture, but the old paths remain tracked.

Impact:

The repo contains both the desired persistent lane and older one-shot paid prompt paths. This is a navigationability and cost-control problem: an operator or LLM can easily choose the wrong script and reintroduce session burn, auth drift, or inconsistent model/tool state.

Required remediation direction:

- Mark retired scripts as retired in filename and documentation, or remove them from active navigation.
- Replace one-shot canary behavior with a health query against the persistent pane when possible.
- Keep one canonical launcher and one canonical health check.

### R107-F08 - LaunchAgent Documentation Claims A Live Communication Stack That GitHub Does Not Reconstruct

Severity: High navigationability/stability risk  
Status: `C137_VERIFIED`, `BLOCKED_LOCAL_STATE`

Evidence:

- `CLAUDE.md:287-303` claims active LaunchAgents include `telegram-poller`, `exeo-daemon`, and `exeo-wake`.
- The tracked `Scripts/launchagents-staged/` inventory contains 20 plist files plus the installer script.
- The tracked staged LaunchAgent list does not include a `telegram-poller` plist, an `exeo-daemon` plist, or an `exeo-wake` plist.

Impact:

The communication system cannot be reconstructed from the GitHub clone alone. This directly explains why an LLM could hallucinate that the Telegram/Claude backend is alive: docs claim the agents exist, but tracked launchd material does not prove how they are installed or supervised.

Required remediation direction:

- Add the canonical LaunchAgent plists or remove claims that they are source-controlled.
- Add a generated runtime inventory export, separate from secrets and local state, that proves which plist owns which process.
- Make the command center show source-tracked, installed, loaded, and healthy as separate states.

### R107-F09 - Wake And Legacy Tmux Targets Are Not Always Pane-Specific

Severity: Medium reliability risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/telegram-mcp/poller.js:22-28` wakes `tmux` target `exeo` rather than the more specific `exeo:ai`.
- The newer daemon uses `TMUX_TARGET = "exeo:ai"` at `Scripts/exeo-daemon.js:490`.
- The legacy script pastes into `$SESSION` at `Scripts/exeo-daemon-tmux.sh:605-611`, while other parts refer to session/window behavior.

Impact:

This is less severe than the authorization findings, but it affects reliability. If tmux target resolution lands on the wrong pane/window, a wake message or prompt injection can go into a shell instead of the AI pane. That can produce silent failures or stray commands in the wrong interactive context.

Required remediation direction:

- Always target a precise pane id captured at launcher startup.
- Store and verify the pane id before every injection.
- Refuse to paste if the pane title/process is not the expected Claude process.

### R107-F10 - Telegram MCP `get_messages` Can Race With The Daemon's Inbox Reader

Severity: Medium reliability risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/telegram-mcp/server.js:160-181` reads `/tmp/telegram-inbox.jsonl` and clears the whole file after reading.
- `Scripts/exeo-daemon.js:911-934` treats the same file as a cursor-based append-only input stream.
- `Scripts/focus-orchestrator.js:284-301` also reads the shared inbox rather than owning Telegram polling.

Impact:

The persistent daemon model expects append-only cursor semantics. The MCP `get_messages` tool expects consume-and-clear semantics. If both patterns are active, messages can be lost or read by the wrong consumer.

Required remediation direction:

- Remove or retire `get_messages` from the MCP tool surface if the daemon owns the inbox.
- Move to an explicit queue database or per-consumer offset files.
- Document exactly one owner for each queue.

## Positive Controls

- The newer path in `Scripts/exeo-daemon.js` uses a persistent tmux session instead of spawning a fresh Claude process per message.
- `Scripts/exeo-daemon.js:543-550` uses tmux buffers for injection, which avoids fragile shell quoting of long user text.
- `Scripts/exeo-daemon.js:377-400` does suppress non-CEO group protocol messages from spawning Claude.
- `Scripts/exeo-daemon.js:805-832` retries CEO messages that fail to call a Telegram tool, which addresses the "Claude did work but never replied" failure class.
- `Scripts/nex-guardrails/index.js` exists as a policy layer; the issue is that the main MCP send path does not enforce it.

## Coverage Notes

Inspected directly:

```text
Scripts/telegram-mcp/poller.js
Scripts/telegram-mcp/server.js
Scripts/exeo-daemon.js
Scripts/ai
Scripts/exeo-daemon-tmux.sh
Scripts/exeo-live.sh
Scripts/daemon-stuck-watch.js
Scripts/meeting-analyzer.js
Scripts/cto-nightly-trigger.js
Scripts/focus-orchestrator.js
Scripts/nex-guardrails/index.js
Scripts/nex-guardrails/rails/*.js
CLAUDE.md
Scripts/launchagents-staged/*
```

Not inspected because it is outside GitHub clone scope:

```text
live Telegram bot receiver mode
live webhook state
local tmux panes
installed LaunchAgents
runtime process tree
Keychain values
Claude account/session state
```
