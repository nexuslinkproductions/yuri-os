# Fanout Run 002 Results

Date: 2026-05-27
Status: fanout proven, comprehensive audit still open

## Verdict

Marcel's objection was correct: `13_final-master-audit.md` was a strong solo C-137 security-frontier pass, not the requested comprehensive Rick fanout audit.

Run 002 corrected the routing failure by dispatching persistent Claude/tmux lanes to inspect the shared full clone directly:

- canonical clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`
- repo URL: `https://github.com/c2moviezfpv/c2moviez-vault`
- commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
- clean status: clean
- tracked files: `1505`

This run does not close the master audit. It establishes the fanout mechanism, collects the first repo-grounded lane findings, and exposes process gaps before expansion.

## Lane Acceptance

| Lane | Batch | Status | Coverage Counted |
| --- | --- | --- | --- |
| `QUANTUM_RICK_OPUS` | `ARCH-001` | accepted with capture caveat | 6 assigned target files |
| `PRIME_RICK_OPUS` | `CYBER-ARCH-001` | accepted | 5 assigned target files |
| `MAXIMUMS_RICKIMUS_OPUS` | `WIRING-001` | accepted | 6 assigned target files |
| `ZETA_ALPHA_RICK_OPUS` | `NAV-001` | accepted with recap-pollution caveat | 6 assigned target files |
| `RIQ_IV_OPUS` | `PROCESS-002` | accepted | 5 YURI process/report files |

Target-repo coverage in this run:

- lane-file inspections: `23`
- unique assigned target files: `21`
- total tracked repo files: `1505`
- conclusion: this is a first fanout micro-batch, not a deep line-by-line audit.

## Process Issues Observed

- The first attempted Claude launch used `--permission-mode bypassPermissions`; Claude stopped at a warning prompt and exited. Lanes were relaunched without bypass.
- Target clone `.claude` hook settings polluted lane output with nonblocking missing-module errors for `session-reflect.js`, `yuri-dream.js`, and `token-status.js`.
- Initial tmux windows were only `220x5`, collapsing Claude TUI output. Windows were resized to `220x60`.
- Recap prompts were sent too aggressively to some lanes, especially `zeta-nav`, causing repeated queued prompt text in the transcript.
- Future lanes should be launched cleanly with user-only settings and no target `.claude` hook ingestion, while still reading target files via `git -C`.

## C-137 Spot Checks

The following lane claims were spot-checked against the clone after fanout:

- `CLAUDE.md` references a repo-root `.mcp.json` at line 186, but `.mcp.json` is gitignored and absent from `HEAD`.
- `CLAUDE.md` references `~/.claude/plans/is-there-an-actual-noble-crystal.md` at lines 15 and 229, which is outside the clone and not portable.
- `Home.md` contains dead or stale wikilinks for ExeoFlow and SILASWIRTH at lines 112 and 115.
- `Scripts/ai` starts Claude with `--mcp-config`, `--permission-mode bypassPermissions`, and `--append-system-prompt` at lines 76-78.
- `Scripts/telegram-mcp/server.js` exposes `send_message`, `get_messages`, and `reply_message` tools around lines 128-216, including arbitrary `chat_id` parameters and destructive inbox clearing.
- `Scripts/exeo-daemon.js` reads `/tmp/telegram-inbox.jsonl`, injects Telegram messages into Claude, detects tool calls via text regex, waits for sentinels, and can force retry into the same tmux session.
- `Dashboard-v2/functions/event-dispatch.js` sends Telegram messages with `parse_mode: 'HTML'`, interpolates event data into HTML messages, uses in-memory burst dedup, and computes `notified` by re-running the rule.
- `Dashboard-v2/functions/auth-check.js` still allows the legacy bare `X-Internal-Key` path at lines 113-118.
- `Dashboard-v2/package.json` contains both stale Netlify adapter dependency and active Node adapter dependency.
- `Untitled.canvas` is tracked as `{}`, and loose `ALPEA-*.html` files exist directly under `02 - Clients/`.

## Accepted Lane Findings

### Architecture

- `ARCH001-1`: `CLAUDE.md` claims `.mcp.json` exists at repo root, but the file is not tracked. This can cause LLMs to navigate toward nonexistent local state.
- `ARCH001`: Dashboard runtime docs and package config are mixed: Node adapter is active, while a Netlify adapter dependency remains.
- `ARCH001`: `Dashboard-v2/src/routes/+layout.svelte` is a large monolithic layout surface, making architectural review and UI regression isolation harder.
- `ARCHNAV001-1`: `CLAUDE.md` is a strong LLM entrypoint because it states an authoritativeness rule and maps major repo surfaces.
- Deferred: `Dashboard-v2/netlify/functions/` has zero tracked files in the clone; function source appears to live elsewhere or be represented by `Dashboard-v2/functions/`.

### Cyber Control Plane

- `CYBERARCH001`: `Scripts/ai` uses Claude `bypassPermissions` in the actual control path. If untrusted Telegram text reaches this session, blast radius becomes very large.
- `CYBERARCH001`: Telegram user authorization is mostly anchored in environment-configured allowed users and bot token possession; no secondary operator authentication is evident in the audited path.
- `CYBERARCH001`: `/tmp/telegram-inbox.jsonl` is a local IPC trust boundary and may be writable/readable depending on runtime permissions.
- `CYBERARCH001`: MCP Telegram tools allow sending/replying to arbitrary `chat_id` values from the connected Claude/MCP client.
- `CYBERARCH001`: text-based detection of tool calls in `exeo-daemon.js` can create false positives, false negatives, and retry confusion.
- `CYBERWIRE001`: `get_messages` clears the inbox file while the daemon also tails it by offset, creating a possible dual-consumer loss mode.
- Deferred: guardrail modules, reasoning chain, group broadcaster, agent registry, runtime `.mcp.json`, and actual `/tmp` permissions need separate batches.

### Backend Wiring

- `WIRING001-3`: `event-dispatch.js` computes `notified` by calling `RULES[eventType]?.(data)` again, which may diverge from the actual async notification branch.
- `WIRING001-4`: `checkAuthSyncDeprecated` exists but is not exported; if revived, it skips revocation.
- `WIRING001-6`: `shared-config.js` logs missing `SITE_ID` at module load but does not throw, creating misleading severity.
- `WIRING001-10`: CORS origin defaults are duplicated in `shared.js` and `auth-check.js`.
- `WIRESEC001-1`: audit/RPC calls in `event-dispatch.js` use `SUPABASE_ANON_KEY`; RLS must be validated to ensure audit/state writes do not silently fail.
- `WIRESEC001-2`: Telegram HTML notification strings interpolate data fields directly.
- `WIRESEC001-3`: legacy bare `X-Internal-Key` bypass remains active.
- Strong wiring: Supabase service-key fallback naming in `shared-storage.js`, Plane team fallback cache in `shared-config.js`, and dashboard data dedup in `shared-data.js` are positive architecture points.

### Navigation And LLM Usability

- `NAVWIRE001-04`: loose `ALPEA-*.html` files sit at `02 - Clients/` root instead of the deeper client schema.
- `NAVWIRE001-05`: `Untitled.canvas` is a tracked empty canvas artifact at vault root.
- `NAVWIRE001-06`: `CLAUDE.md` points an LLM outside the repo into `~/.claude/plans/...`.
- `NAVWIRE001-07`: `Home.md` links to nonexistent `11 - ExeoFlow/ExeoFlow Overview`.
- `NAVWIRE001-08`: `Home.md` links to nonexistent `SILASWIRTHxc2moviez/SILASWIRTH Overview`.
- `NAVWIRE001-09`: `Dashboard-v2/src/lib/db.ts` has no hardcoded credentials and uses runtime env plus a stub client fallback.
- Deferred: `Scripts/`, most of `Dashboard-v2/`, `.claude/agents/`, and `02 - Clients/` require separate lane batches.

### Process QA

- `PROCESS002-01`: `13_final-master-audit.md` is now explicitly labeled V1 Security Frontier, not final.
- `PROCESS002-03`: Run 002 packet contract requires `REPO_PROOF`, `PATH_PROOF`, `READ_PROOF`, and `FILE_COVERAGE`.
- `PROCESS002-05`: Run 002 covers about 27 assigned files across process and target lanes while the repo has 1505 tracked paths; no burn-down queue exists yet.
- `PROCESS002-06`: V1 explanation sections still mix validated claims with hypotheses without per-claim lifecycle tags.
- `PROCESS002-11`: `00_master-plan.md` still describes broad shard lanes while Run 002 uses micro-batches; the plan needs synchronization.
- `PROCESS002-14`: YURI trial retrospective items have no owners, priorities, or deadlines yet.

## Required Next Correction

Before the next fanout, update the master plan to define a micro-batch burn-down ledger:

- one canonical clone;
- persistent Opus lanes only after Sonnet profile bootstrap;
- no target `.claude` hook ingestion;
- direct `git -C` reads only;
- `READ_PROOF` per assigned file;
- accepted, suppressed, deferred, or invalidated disposition per file;
- no final audit label until the ledger closes or explicitly lists every deferred surface.

Next target batches should prioritize:

- `Scripts/nex-guardrails/*`
- `Scripts/lib/*` used by `exeo-daemon.js`
- `Dashboard-v2/functions/shared-plane*.js`
- `Dashboard-v2/functions/auth.js`
- all public/external functions under `Dashboard-v2/functions/`
- `.claude/agents/*.md`
- `02 - Clients/` structure and generated-file routing
- full credential/password scan integrated with source-level review
