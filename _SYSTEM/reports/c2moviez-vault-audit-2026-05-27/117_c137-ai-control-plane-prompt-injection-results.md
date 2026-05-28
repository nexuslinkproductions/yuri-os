# C-137 AI Control-Plane And Prompt-Injection Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection. No target source files mutated. No target scripts executed. No live Telegram, Supabase, NEXOGRAM, or Claude actions performed.

## Scope

This shard checks the highest-risk AI control-plane path:

```text
Telegram / NEXOGRAM / local queue input
  -> tmux-pasted privileged Claude session
  -> MCP tools / Telegram send tools / database and filesystem tools
  -> guardrails, recipient controls, queue integrity, and telemetry
```

The key conclusion is severe: Claudio's AI control plane has useful building blocks, but the primary runtime pattern treats external text as direct input to a privileged Claude operator. The repo shows allowlists and guardrails, yet those controls are placed around fallback or helper paths rather than the primary tool boundary. That makes the architecture prompt-injection-prone and hard for an LLM operator to navigate safely.

## Findings

### R117-F01 - Untrusted Telegram Text Is Pasted Directly Into A Privileged Claude Session

Severity: Critical prompt-injection and tool-authority risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/exeo-daemon.js:5-12` documents that `/tmp/telegram-inbox.jsonl` messages are injected into the persistent Claude tmux pane and that Claude calls `mcp__telegram__reply_message` directly.
- `Scripts/exeo-daemon.js:528-540` builds a metadata header, but it does not create a hard trusted/untrusted boundary around the user message.
- `Scripts/exeo-daemon.js:543-551` writes the full turn into `/tmp/nex-ai-msg.txt`, loads it into tmux, pastes it into the Claude pane, and submits it.
- `Scripts/exeo-daemon.js:633-645` constructs `fullMessage` as `header + userText`, meaning the raw Telegram text follows the control metadata in the same prompt channel.
- `Scripts/ai:72-79` launches Claude in a respawn loop with `--permission-mode bypassPermissions` and allowed tools including Telegram MCP tools, Plane, database/Supabase, Obsidian, `Read`, `Grep`, `Glob`, and `Bash`.

Attack path:

1. A Telegram message enters the local inbox.
2. The daemon labels metadata such as `role: ceo` or `role: external`.
3. The raw message text is pasted into the same interactive Claude session that owns powerful tools.
4. A malicious or accidental instruction inside the message can attempt to override the prior operating contract and cause unauthorized tool calls, data disclosure, bad writes, or false status claims.

Impact:

The same channel carries instructions, untrusted content, and privileged tool authority. This is the core failure mode for agentic prompt injection: a message is not data to be handled; it becomes an instruction to an operator with broad tools.

Required remediation direction:

- Treat Telegram and NEXOGRAM content as untrusted data, not as raw operator instructions.
- Wrap user text in explicit structured envelopes with non-overridable policy outside the model prompt path.
- Split sessions by authority: one low-privilege reader/classifier lane and one narrow executor lane.
- Remove `Bash`, broad DB/Supabase, and write-capable tools from the chat-facing session by default.

### R117-F02 - Telegram Poller Downloads And Processes Messages Before Sender Authorization

Severity: Critical ingress-control and resource-abuse risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/telegram-mcp/poller.js:436-440` long-polls all message and reaction updates.
- `Scripts/telegram-mcp/poller.js:454-474` downloads photos and writes them to `/tmp/telegram-photos`.
- `Scripts/telegram-mcp/poller.js:477-504` downloads documents and routes audio/video documents into meeting recording handling.
- `Scripts/telegram-mcp/poller.js:506-520` downloads audio messages into the meeting recorder path.
- `Scripts/telegram-mcp/poller.js:523-543` downloads and transcribes voice messages.
- `Scripts/telegram-mcp/poller.js:546-558` accepts meeting start/end commands.
- `Scripts/telegram-mcp/poller.js:560-574` appends every processed message to `/tmp/telegram-inbox.jsonl` and wakes EXEO.
- A direct allowlist check was not found in `poller.js`; searches for allowed-user variables in that file only surfaced message metadata and `allowed_updates`.

Attack path:

1. Any sender that can reach the bot sends a photo, document, audio file, voice note, or meeting command.
2. The poller downloads/transcribes/processes it before proving the sender is authorized.
3. The result is written to local files and/or injected into the EXEO inbox.

Impact:

This can burn CPU/RAM through media processing, fill `/tmp`, trigger Whisper/ffmpeg work, create meeting artifacts, and inject content into the AI control plane. It also matches the user's observed symptom class: high CPU and memory use can be caused by unauthenticated or too-early media processing, even without a successful Claude response.

Required remediation direction:

- Authorize sender and chat before any download, transcription, meeting command, queue append, or tmux wake.
- Reject unknown senders with a cheap text response or no response.
- Add size, MIME, duration, and rate limits before media fetch.
- Move heavy transcription into a bounded worker queue with per-sender quotas.

### R117-F03 - Guardrails Are Not On The Primary Outbound Tool Path

Severity: Critical broken-control risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/nex-guardrails/index.js:1-6` claims outbound messages are intercepted before Telegram, email, or NEXOGRAM.
- `Scripts/exeo-daemon.js:276-321` runs guardrails only inside `guardedTgSend`.
- `Scripts/exeo-daemon.js:324-352` uses that guarded path for fallback sends.
- The primary Claude path is documented at `Scripts/exeo-daemon.js:5-12`: Claude calls `mcp__telegram__reply_message` directly.
- `Scripts/telegram-mcp/server.js:128-157`, `193-215`, and `218-248` implement Telegram send/reply/buttons tools without invoking `runGuardrails`.
- `Scripts/nexogram-bridge.js:347-356` posts NEXOGRAM replies through `nexogram-send`.
- `Scripts/nexogram-bridge.js:412-416` applies only a narrow finance regex when `item.is_fanny` is true, then posts the reply. No `runGuardrails` call was found in `nexogram-bridge.js`.

Attack path:

1. Claude calls a Telegram MCP send/reply tool directly.
2. The message bypasses the `exeo-daemon.js` fallback wrapper.
3. Role-scope, language, output-sanitize, email hold, and retrieval-confidence rails are not guaranteed to execute.

Impact:

The repo contains guardrail logic, but the guardrail is not wired at the authoritative egress sink. This creates a false sense of safety: the safest-looking code path is not necessarily the path actually used by the privileged model.

Required remediation direction:

- Move guardrail enforcement into `Scripts/telegram-mcp/server.js` and the NEXOGRAM send function boundary.
- Make every outbound sink require a guardrail context and deny sends when the context is absent.
- Keep fallback wrappers as convenience helpers only, not as the security boundary.

### R117-F04 - Telegram MCP Tools Permit Explicit Arbitrary `chat_id` Targets

Severity: Critical exfiltration and misdelivery risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/telegram-mcp/server.js:128-156` defines `send_message`; when `chat_id` is provided, it sends to `[chat_id]` instead of the configured allowed users.
- `Scripts/telegram-mcp/server.js:193-215` defines `reply_message`; it sends to the provided `chat_id`.
- `Scripts/telegram-mcp/server.js:218-248` defines `send_buttons`; when `chat_id` is provided, it sends to `[chat_id]`.
- The checks that log CEO outbox entries only run when the target equals `CEO_CHAT_ID`; they are not authorization gates.

Attack path:

1. A prompt-injected model is instructed to call `mcp__telegram__send_message` or `mcp__telegram__reply_message` with an attacker-controlled `chat_id`.
2. The MCP server sends the text to that chat without proving the target is authorized for the content or role.

Impact:

This turns prompt injection into a plausible data-exfiltration or misdelivery path. Because Telegram chat IDs are accepted as tool parameters, recipient policy cannot rely on the model remembering the intended recipient.

Required remediation direction:

- Enforce recipient allowlists inside the MCP server, not in prompts.
- Reject explicit `chat_id` values unless they are known, role-classified, and allowed for the requested content class.
- Log and alert on denied target attempts.

### R117-F05 - `/tmp/telegram-inbox.jsonl` Is An Unauthenticated Local Command Bus

Severity: High local-injection and integrity risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/exeo-daemon.js:34-38` stores the inbox, state, log, and lock files under `/tmp`.
- `Scripts/exeo-daemon.js:911-934` reads new lines from `/tmp/telegram-inbox.jsonl`, parses JSON, accepts any `update_id` greater than `state.last_update_id`, and pushes the message into the processing queue.
- `Scripts/telegram-mcp/server.js:160-190` also reads the inbox file and clears it after reading.
- `Scripts/telegram-mcp/poller.js:572-574` appends inbox lines and wakes EXEO via tmux.

Attack path:

1. Any local process with write access to the shared file path appends a JSON object with a high `update_id`.
2. The daemon treats it as a real Telegram message and processes it.
3. The forged message reaches the privileged Claude session.

Impact:

The control plane trusts a world-known path as a queue. Even if Telegram sender checks are added later, a local process can bypass them unless the queue itself is authenticated and protected. The additional `get_messages` tool that clears the same file creates race and data-loss risk.

Required remediation direction:

- Move queues into a private runtime directory with restrictive permissions.
- Sign queue entries or write through a single local broker with ownership checks.
- Avoid multiple consumers clearing the same append-only file.
- Add monotonic per-source cursoring instead of global destructive reads.

### R117-F06 - Meeting Recorder And Media Processing Can Be Triggered Too Early

Severity: High availability and privacy risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/telegram-mcp/poller.js:337-421` writes uploaded meeting audio to `/tmp`, converts it with ffmpeg, transcribes with Whisper, saves MP3 copies, writes meeting notes under a local vault path, appends a synthetic inbox entry, and wakes EXEO.
- `Scripts/telegram-mcp/poller.js:477-520` routes audio/video documents and audio messages into that handler before any visible authorization gate.
- `Scripts/telegram-mcp/poller.js:523-543` transcribes voice messages inline.

Impact:

This is an availability risk and a privacy risk. Large or repeated files can trigger heavy local model and ffmpeg work. Meeting transcripts and audio copies can be created from untrusted senders if the bot receives their messages.

Required remediation direction:

- Gate meeting mode and media handling by authorized chat/user first.
- Require an explicit active meeting state owned by an authorized identity.
- Add bounded queue workers, max file size, max duration, MIME allowlists, and cleanup guarantees.

### R117-F07 - Claude Runs With Broad Permission Bypass In Chat-Facing Lanes

Severity: High blast-radius risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/ai:72-79` starts a persistent Claude session with `--permission-mode bypassPermissions` and broad allowed tools.
- `Scripts/exeo-daemon-tmux.sh:173-174` starts Claude with `--dangerously-skip-permissions`.
- `Scripts/nexogram-bridge.js:175-184` starts a NEXOGRAM Claude session with `--dangerously-skip-permissions`.
- `Scripts/exeo-daemon-tmux.sh:117-124` also uses a `claude --print` auth probe. This is a target-repo implementation choice, but it contradicts the persistent-session-only control-plane pattern YURI is trying to validate.

Impact:

Bypass permission mode can be practical for internal automation, but it is unsafe as the first-line interface for chat-originated text. Any injection, routing bug, stale prompt, or false recipient classification inherits a high blast radius.

Required remediation direction:

- Separate "chat intake" from "privileged executor."
- Run the intake lane with no write tools and no shell.
- Require structured, validated action proposals before invoking a privileged executor.
- Remove `--print` probes from durable control-plane paths if persistent-session behavior is a design requirement.

### R117-F08 - Telegram Reply Success Is Inferred From Text, Not Tool Events

Severity: Medium-high reliability and false-status risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/exeo-daemon.js:686-695` cannot see MCP `tool_use` events in the tmux flow, so it infers success from textual markers like `mcp__telegram__reply_message`, `reply_message`, `mcp__telegram__send_message`, or `send_message`.
- `Scripts/exeo-daemon.js:805-832` only falls back or retries when that textual inference says no reply was sent.

Attack path:

1. Claude writes text containing `reply_message` or `mcp__telegram__reply_message` without actually sending anything.
2. The daemon marks the reply as sent.
3. The user receives no message while monitoring says the operation succeeded.

Impact:

This explains a class of "Claude pretended it worked" failures. It is also dangerous for audit logs because the system records inferred tool calls rather than authoritative tool execution.

Required remediation direction:

- Emit structured tool-call events from the MCP server or a wrapper.
- Correlate each outbound Telegram message with Telegram API response IDs.
- Treat pane text as UI output only, not as proof of action.

### R117-F09 - Assistant-Emitted Machine Tags Can Create Commitments

Severity: Medium integrity risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/exeo-daemon.js:676-684` extracts `<COMMITMENT>{json}</COMMITMENT>` blocks from assistant text.
- `Scripts/exeo-daemon.js:835-847` registers each parsed commitment with actor `ceo`, source `telegram`, and the message id.

Impact:

Prompt injection can cause machine-readable tags to be emitted. Because those tags are parsed from assistant text, the system can create commitments that were never intentionally authorized by the CEO.

Required remediation direction:

- Treat machine tags as proposed actions, not final actions.
- Validate tags against the original sender, an explicit command grammar, and a user confirmation step.
- Store model-generated commitments as pending until confirmed.

### R117-F10 - Training/Outbox Logs Capture Chat Prompts And Replies Under `/tmp`

Severity: Medium privacy and data-retention risk  
Status: `C137_VERIFIED`

Evidence:

- `Scripts/exeo-daemon.js:766-771` appends Qwen fast-path prompt/response pairs to `/tmp/nex-outbox.jsonl`.
- `Scripts/exeo-daemon.js:786-795` appends CEO prompt and visible Claude response pairs to the same path for LoRA collection.

Impact:

CEO messages, operational content, and model replies can be retained in a shared temporary path without a tracked retention, redaction, or access policy. This can become a hidden source of sensitive data exposure.

Required remediation direction:

- Move training capture into a private, permissioned data store.
- Redact secrets, customer data, and finance details before persistence.
- Add retention windows and an explicit consent/disable switch.

## Positive Controls Observed

- `Scripts/exeo-daemon.js:717-719` avoids spawning Claude for non-CEO protocol messages in the NEX Brain group.
- `Scripts/exeo-daemon.js:733-752` only transcribes voice in the EXEO daemon when the sender is in `ALLOWED_USERS`; the earlier poller still processes voice too early, so this is only a partial control.
- The tmux buffer-paste pattern avoids shell quoting bugs for message content in the daemon path.
- The repo has a guardrail framework with language, role-scope, retrieval-confidence, output-sanitize, email, and infra rails.
- NEXOGRAM has a finance-redaction helper for Fanny, but it is regex-only and not a substitute for an egress guardrail.

## Coverage Boundary

This shard validates source-level wiring only. It does not prove what Telegram chats can actually reach the bot, what live Claude permissions are active, what live MCP config exists, or whether Claudio has local runtime ACLs around `/tmp` paths. The evidence is enough to say the tracked architecture is not safe as written: primary ingress, prompt, tool, queue, and egress controls are not aligned at the actual trust boundaries.
