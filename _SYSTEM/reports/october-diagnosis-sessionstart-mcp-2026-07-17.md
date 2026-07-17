# Diagnosis receipt — SessionStart loader:1572 + missing MCP tools (2026-07-17)

Lane: Claude Code (Fable 5), YURI-OS-MUSUBI main. Requested by Apollo via October bus
(temporary capacity assignment). Outbound `message_peer` unavailable in this session (see B-1),
so this file + the live terminal are the receipt. Read-only diagnosis; NO mutations performed,
NO sparse-checkout commands run (list/read-only inspection only), NO deletions.

## A. SessionStart failure `node:internal/modules/cjs/loader:1572` — ROOT CAUSE CONFIRMED

Causal chain, each link locally verified:

1. `core.sparseCheckout=true` with a 35-entry non-cone include list (`git sparse-checkout list`)
   covering protected paths + a few registries (`.amp`, `.claude/state`, `backend/data`,
   `node_modules`, `_SYSTEM/OS_KERNEL`, `skills/skill-index.json`, ...). The list reads like an
   automated "protect these paths" attempt with **inverted semantics** — sparse-checkout patterns
   INCLUDE, they don't exclude.
2. Partial application left **3,990 tracked files skip-worktree flagged (`S`) and absent from
   disk** (`git ls-files -v | grep -c '^S'`), silently — `git status` reports none of them.
   Top casualties by dir: `.claude/memory` (286), `02_RESOURCES/RESEARCH` (131), `.omp/agents`
   (127), `_SYSTEM/reports` (123), `.claude/commands` (90), `_SYSTEM/mure` (77),
   `.claude/hooks` (49 incl. `gitnexus/`).
3. `.claude/settings.json` (working tree) still wires 20 hook commands at
   `$CLAUDE_PROJECT_DIR/.claude/hooks/*` across SessionStart/SubagentStart/PostToolUse/Stop.
   The directory does not exist on disk.
4. Reproduction (exact): `node .claude/hooks/brain-inject.js` →
   `node:internal/modules/cjs/loader:1572 / throw err / Error: Cannot find module ...`
   (Node v26.4.0). Non-zero exit → Claude Code's "Failed with non-blocking status code".
   Every session start fires ~8 of these.

Consequences beyond the error message (safety-boundary honesty):
- ALL guard hooks are currently dead on this provider: `bash-security-guard`,
  `claude-protocol-guard`, `energy-enforce`, `soul-persona-inject` (subagent persona injection),
  `brain-inject`, sentinel start/stop, token accounting, EOT/dream/reflect closeout.
- Track-B memory (`.claude/memory`), slash commands (`.claude/commands`), and MURE agent cards
  (`.omp/agents`) are off disk → memory recall, opus-fleet/fleet-economy skill surfaces, and
  card-cast dispatch are degraded on every lane that reads them from disk.
- Working-tree `.claude/settings.json` also differs from HEAD by −94 lines: the
  UserPromptSubmit + PreToolUse guard blocks were stripped (uncommitted). Partial mitigation of
  the symptom that also disarms the guard layer's config, not just its files.

## B. Inactive/missing MCP tools per provider

- **B-1 Claude Code — CONFIRMED root cause.** `.claude/settings.local.json` enables
  `october-bus` (`enabledMcpjsonServers`) and allowlists `mcp__october-bus__*`, but NO server
  definition exists: `.mcp.json` defines only `voice` (both worktree and HEAD — it NEVER had an
  october-bus entry), and `~/.claude.json` has 0 october matches. Enabling an undefined server
  is a no-op → no `mcp__october-bus__*` tools in-session. NOT an env problem:
  `OCTOBER_BUS_PORT/CANVAS/NODE` are all set in this session. Verified live: this session's tool
  list has zero october tools while inbound bus messages still arrive (hook-relayed).
- **B-2 Codex — CONFIRMED gap.** No `[mcp_servers.october-bus]` in `.codex/config.toml` (repo)
  nor `~/.codex/config.toml`. Integration is hooks-only (`.codex/hooks.json` →
  `~/.october/bus-hook.mjs`): lifecycle events flow, but the model gets no october tools.
- **B-3 Pi — PLAUSIBLE, needs Pi-side verification.** Native extension
  `~/.pi/agent/extensions/october-bus.ts` exists (registers `message_peer` + task-board tools)
  but silently returns if `OCTOBER_BUS_PORT/CANVAS/NODE` are missing from Pi's process env
  (line ~6, no error logged). Settling check: inspect env of the running Pi process /
  October's Pi launch wrapper.
- Cross-reference: Cursor (`.cursor/mcp.json`), Gemini (`.gemini/settings.json`), Grok
  (`.grok/config.toml`), OpenCode (`opencode.json`) all define october-bus as HTTP MCP.
  OpenCode hard-codes port 60961 (mismatch risk vs env-based port elsewhere).

## Proposed fixes — ALL HELD for owner confirm (shared-state / arming blast)

- **F-A (fix A): targeted un-skip restore of the missing tracked files** WITHOUT any
  sparse-checkout subcommand: `git update-index --no-skip-worktree <paths>` + `git checkout -- <paths>`
  for `.claude/hooks` first (49 files, no local mods exist to lose), then staged batches for
  `.claude/memory`, `.claude/commands`, `.omp/agents`, `_SYSTEM/mure`, remainder. Owner-gated
  because it re-arms live guard hooks and changes behavior of ALL concurrent sessions mid-flight.
  `git sparse-checkout disable` would restore everything at once but is explicitly banned in the
  current directive and is the bigger hammer. NOTE for all lanes: a `sparse-checkout reapply`
  in the current state would dematerialize most of the repo — do not run it.
- **F-B1 (Claude Code): add the missing definition to `.mcp.json`** mirroring Cursor's shape
  (HTTP, `http://127.0.0.1:${OCTOBER_BUS_PORT}/mcp`, canvas/node headers). Takes effect only via
  restart + trust confirm — both owner-gated per directive.
- **F-B2 (Codex): register october-bus in `.codex/config.toml`**; verify installed codex
  version's remote/HTTP MCP support first (else a stdio bridge is needed).
- **F-B3 (Pi): ensure October's Pi launcher exports the three bus env vars**; add a logged
  warning to the extension's silent-return path.

Residual risk / falsifiers: if a SessionStart failure persists AFTER `.claude/hooks` is restored,
the loader:1572 attribution to missing files is incomplete (next suspect: a restored hook's own
`require()` of a skip-worktree'd lib, e.g. `_SYSTEM/Scripts/_lib` — currently in the include list,
so expected present). If october tools stay absent after F-B1 + restart + trust, check the bus
`/mcp` endpoint liveness on `$OCTOBER_BUS_PORT` next.
