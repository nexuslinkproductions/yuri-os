# Claude Run 032 Results - Nexogram Route Wiring

Date: 2026-05-27
Lane: `R032_NEXOGRAM_ROUTE_WIRING_OPUS / NEXOGRAM-ROUTE-WIRING-032`
Worker: persistent Claude/tmux lane, Opus
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Status: accepted with C-137 validation

## Clone Proof

```text
CLONE_PROOF commit=8103286e1abc63fa9490cb1375ecde4f340aa2bb status_count=0 tracked_files=1505
```

The worker completed inside the persistent Claude lane. C-137 validated the main repo evidence against the canonical clone before accepting durable findings.

Raw capture retained outside durable reports:

```text
/tmp/yuri-c2v-claude-run-032/pipe/r032-claude-capture-full.txt
```

## File Coverage

```text
FILE_COVERAGE path="Dashboard-v2/src/routes/nexogram/+page.svelte" method=full_read status=covered lines=4249 words=14511 notes="full route read; messaging, channels, file vault, realtime subscriptions, context panel, local drafts, lifecycle, template, and CSS covered"
BATCH_CLOSE lane=opus batch=R032 files_covered=1 findings=12 suppressions=4 deferred=3 invalidated=0
```

Supporting C-137 reads checked deployment and realtime wiring in:

```text
Dashboard-v2/server/Caddyfile.template
Dashboard-v2/server/index.js
Dashboard-v2/src/lib/pusher-realtime.ts
Dashboard-v2/functions/
```

These supporting reads validate findings but do not add new file-coverage credit in this result.

## Accepted Findings

### R032-F01 - Nexogram Calls Unmapped Or Missing Backend Functions

Severity: high
Class: wiring / availability

Evidence:

- `Dashboard-v2/src/routes/nexogram/+page.svelte:491`, `:519`, `:702`, `:754`, `:835`, `:897`, `:920`, `:933`, `:971`, `:989`, `:1012`, and `:1178` call `/api/functions/nexogram-*`, `/api/functions/nex-file-*`, and `/api/functions/nexita-context`.
- `Dashboard-v2/functions/` contains only `nex-rag-query.js` and `nexbox-fleet.js` among `nex*` function names; no `nexogram-send`, `nexogram-channels`, `nexogram-messages`, `nexogram-typing`, `nex-files-list`, `nex-file-ingest`, `nex-file-download`, or `nexita-context` handler is tracked.
- `Dashboard-v2/server/index.js:40-82` maps explicit `/.netlify/functions/*` routes and does not register those Nexogram handlers.
- `Dashboard-v2/server/Caddyfile.template:14-16` routes only `/.netlify/functions/*` to the API process; `/api/functions/*` falls through to the SvelteKit frontend at `:30-33`.
- `git ls-files Dashboard-v2/src/routes/api/**` returned no tracked SvelteKit API route handlers.

Impact:

The main chat/file/context product surface depends on backend endpoints that are not present in the tracked deployment evidence. Messaging, typing, file listing/upload/download, channel creation/opening, edit/delete/react, and NEX context retrieval can all appear wired in the UI while returning 404 or depending on out-of-repo code.

Recommendation:

Add tracked handlers and a tracked `/api/functions/*` proxy, or change callers to the deployed `/.netlify/functions/*` route shape. Add route-contract tests that enumerate every frontend `/api/functions/*` caller and require a matching handler or documented external dependency.

### R032-F02 - Channel Visibility And Membership Trust Is Deferred To Untracked RLS

Severity: high
Class: access control / privacy

Evidence:

- `nexogram/+page.svelte:504-508` selects all non-archived `nexogram_channels` with no membership or visibility filter.
- `nexogram/+page.svelte:530-535` reads `nexogram_messages` for whichever `channelId` is active.
- `nexogram/+page.svelte:559-563` upserts the current user into `nexogram_members` on channel selection.
- Repository searches found no tracked migration or policy definition for `nexogram_channels`, `nexogram_messages`, or `nexogram_members`.

C-137 correction:

This is not accepted as a proven live data leak because Supabase RLS may exist outside the tracked repository. It is accepted as a high-risk architecture gap: the frontend performs broad direct table reads/writes, and the tracked repo provides no policy evidence that those tables enforce membership.

Impact:

If deployed RLS is missing or permissive, any authenticated user could enumerate channels, self-enroll in channels, and read messages by channel ID.

Recommendation:

Bring the Nexogram table schema and RLS policies into tracked migrations. Require channel SELECT and message SELECT to be membership-scoped, and require membership UPSERT to be mediated by a server-side authorization path.

### R032-F03 - Realtime Nexogram Channels Are Public-Subscribe By Construction

Severity: high
Class: realtime access control

Evidence:

- `nexogram/+page.svelte:659-660` subscribes to every channel returned by `loadChannels()`.
- `nexogram/+page.svelte:580-657` binds message, typing, edit, delete, and reaction handlers for each channel.
- `Dashboard-v2/src/lib/pusher-realtime.ts:344-357` subscribes to `nex.nexogram.{channelId}` without a private/presence channel prefix or auth endpoint.
- `Dashboard-v2/src/lib/pusher-realtime.ts:375-395` binds ephemeral events on the same public channel name.
- `Dashboard-v2/src/lib/pusher-realtime.ts:112-124` configures Pusher/Soketi with host/key only; no channel authorization hook is visible in the client wrapper.

Impact:

Realtime message delivery appears gated by knowing a channel ID and being able to connect to Soketi, not by a per-channel auth handshake. Combined with broad channel enumeration or leaked channel IDs, this can expose messages and operational typing/edit/delete metadata.

Recommendation:

Move Nexogram realtime streams to private/presence channels with a server-side auth endpoint that checks channel membership. Do not subscribe to all returned channels until membership filtering is proven server-side.

### R032-F04 - Context Snapshot Exposes High-Sensitivity Operational Intelligence

Severity: medium
Class: authorization / data minimization

Evidence:

- `nexogram/+page.svelte:1178-1179` calls `/api/functions/nexita-context`.
- The `ContextSnapshot` type at `nexogram/+page.svelte:47-109` includes tickets, clients with `mrr`, meetings, recent decisions, tracker live state, commitments, and agent health.
- No tracked handler for `nexita-context` was found, so server-side role checks cannot be verified from GitHub-obtainable source.

Impact:

The route is designed to pull a full operational-intelligence bundle into the browser. If the missing handler returns this to all authenticated users, finance/client/meeting/agent state is overexposed.

Recommendation:

Implement and track a role-filtered context endpoint. Split the snapshot into least-privilege slices, and require explicit admin/owner checks for finance, client MRR, and agent-health internals.

### R032-F05 - File Upload Path Has Size And Memory Failure Modes

Severity: medium
Class: availability / file handling

Evidence:

- `nexogram/+page.svelte:825-828` allows files up to `8 MB`.
- `nexogram/+page.svelte:833-840` reads the whole file into memory, expands it into a spread array, base64-encodes it, and posts it as JSON to `/api/functions/nex-file-ingest`.
- `Dashboard-v2/server/index.js:14` sets Express JSON body limit to `10mb`.

Impact:

Base64 inflates an 8 MB file to roughly 10.7 MB before JSON overhead, which can exceed the tracked Express body limit if routed through this server. The `String.fromCharCode(...Uint8Array)` spread can also fail or freeze the browser for large inputs.

Recommendation:

Use multipart upload or presigned direct upload for Nexogram attachments. If inline upload remains, chunk the encoding and set the client limit below server overhead.

### R032-F06 - Message History Is Hard-Truncated To 80 Rows

Severity: medium
Class: data integrity / navigationability

Evidence:

- `nexogram/+page.svelte:530-535` loads messages in ascending order with `.limit(80)`.
- The route contains no cursor pagination or "load earlier messages" path in the assigned file.

Impact:

Users and LLM agents inspecting the UI can silently lose access to older channel history. This weakens auditability and can create false confidence that a channel has no prior context.

Recommendation:

Add cursor pagination, explicit history windows, and UI affordances for loading older messages.

### R032-F07 - Drafts Persist Indefinitely In Browser Local Storage

Severity: low
Class: privacy

Evidence:

- `nexogram/+page.svelte:297-312` stores drafts under `nexogram_draft_{channelId}` in `localStorage`.
- `nexogram/+page.svelte:1291-1292` persists any in-flight draft on route unmount.

Impact:

Sensitive client or finance drafts can persist indefinitely on a browser profile. Any future XSS or local profile access would expose unsent content.

Recommendation:

Add TTL cleanup, clear drafts on channel archive/leave, and avoid persisting high-sensitivity system/context drafts unless the user opts in.

### R032-F08 - Nexogram Route Is A 4249-Line Monolith

Severity: info
Class: navigationability / maintainability

Evidence:

- `Dashboard-v2/src/routes/nexogram/+page.svelte` is `4249` lines.
- Script ends at line `1294`; style spans `2263-4249`.
- The single route owns channel loading, membership writes, direct Supabase reads, realtime subscriptions, message sending, file vault, edit/delete/react, context snapshot, mobile drawers, slash commands, mentions, lifecycle timers, template, and CSS.

Impact:

The route is expensive for humans and LLMs to navigate. A narrow fix can easily miss hidden coupling hundreds of lines away, especially around table access, realtime subscriptions, local drafts, and context refresh.

Recommendation:

Extract `NexogramSidebar`, `NexogramThread`, `NexogramComposer`, `NexogramContextPanel`, `NexogramFilePicker`, and a data adapter module. Keep page-level state coordination small and explicit.

## Strengths And Suppressions

```text
SUPPRESSION path="nexogram/+page.svelte:459-468" hypothesis="markdown rendering is direct XSS" counterevidence="renderMarkdown escapes &, <, and > before applying markdown transforms; current order is safe, though fragile if link rendering is added later"
SUPPRESSION path="nexogram/+page.svelte:942-983" hypothesis="frontend allows editing/deleting other users' messages" counterevidence="beginEdit and deleteMessage both return when m.sender_id !== userId; backend enforcement still needs handler verification"
SUPPRESSION path="nexogram/+page.svelte:479-486" hypothesis="member directory read is necessarily a privacy leak" counterevidence="active user directory appears intentional for mentions/DMs; only email/display_name/role/code/color/is_active are selected"
SUPPRESSION path="nexogram/+page.svelte:895-902" hypothesis="window.open download URL is an open redirect in this file" counterevidence="download URL comes from the missing server endpoint; frontend uses noopener,noreferrer and user-initiated action; handler must still validate file authorization"
```

## Deferred Follow-Up

```text
DEFERRED path="Supabase live policies" reason="nexogram table RLS cannot be verified from tracked GitHub-obtainable source" next="owner-provided read-only Supabase policy export or tracked migration"
DEFERRED path="/api/functions/nexogram-* and /api/functions/nex-file-*" reason="no matching tracked handlers found" next="locate out-of-repo deployment source or add tracked handlers"
DEFERRED path="Soketi server authorization" reason="client wrapper uses public channel subscription, but server-side Soketi/app config is not in tracked source" next="read-only Soketi config export and private-channel auth route"
```

## Coverage Update

Before Run 032:

- accepted assigned target coverage: `340 / 1505`
- strict semantic coverage: `338 covered + 2 partial`

After Run 032:

- accepted assigned target coverage: `341 / 1505`
- strict semantic coverage: `339 covered + 2 partial`
