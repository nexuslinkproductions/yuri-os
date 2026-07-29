---
name: mcp-stdio-liveness-audit-macos
description: "Verify stdio MCP server liveness/attachment on macOS without inferring from age or fd state - five lsof/awk methodology traps, when fd-join is the wrong tool, the global-orphan host-recognition gap, the Codex MCP-duplication mechanism tiers, and the fd-not-idle / alive-not-legitimate / recommendation-not-authorization / absence-not-absence discipline"
---

# MCP stdio liveness audit (macOS)

Use when auditing whether stdio MCP server processes are live/attached vs orphaned/leaked - e.g. duplicate `npm exec` MCP servers under one Codex/OMP/Claude host.

## The five traps

### 1. lsof PIPE peer is in `$NF`, not `$9`
macOS `lsof` PIPE rows have a **blank NODE column**, so whitespace-collapse puts the peer pointer (`->0x...`) in the trailing NAME field, not column 9. Parsing `peer=$9` silently yields empty and every join returns 0.
```awk
local=$6; peer=$NF; sub(/^->/,"",peer)
```

### 2. Don't iterate `total[]` - seed the known leaf set
`for (p in total)` only visits PIDs that had at least 1 PIPE row at fd 0/1/2. A fully-detached leaf (stdio to /dev/null, no PIPE fds) **vanishes** instead of printing `0/N`, hiding orphans. Seed awk with the enumerated descendant list and iterate THAT:
```awk
BEGIN { n=split(leaves,a,","); for(i=1;i<=n;i++) known[a[i]]=1 }
$5=="PIPE" { pid=$2; fd=$4; local=$6; peer=$NF; sub(/^->/,"",peer);
  if (pid==ROOT) root[local]=1;
  if (fd=="0"||fd=="1"||fd=="2") { total[pid]++; if (peer in root) hit[pid]++; }
}
END { for (p in known) printf "%d %d/%d\n", p, hit[p]+0, total[p]+0 }   # 0/0 = no stdio PIPE at all
```

### 3. Classification: require `t==3 && h==3` for "fully attached"
Do NOT use `h==t` - it miscounts a leaf with only 1/1 or 2/2 matching PIPE fds as fully attached. "Fully attached" across stdin/stdout/stderr requires exactly 3 PIPE-type stdio fds AND all 3 peers in the root set. Report `t<3` and `t==0` as separate categories (a `t==0` leaf has stdio redirected to CHR/unix, not PIPE). NOTE: "fully fd-attached" establishes the pipe is open; it does NOT establish "idle" or "active" - protocol activity / which set is in use is a separate, fd-invisible question (see Discipline).

### 4. fd-join only works for DIRECT-stdio hosts - OMP transport is UNRESOLVED
The leaf-stdio-peer to root-pipe-node join proves attachment **only when the host itself holds stdio PIPEs**. True for **Codex** (`codex resume`). For **OMP** (`bun omp --auto-approve`), a root-only PIPE fd-join returns 0/N - **method-insufficient, NOT a detachment verdict**. OMP MCP transport is **UNRESOLVED**: a `bun __omp_worker_daemon_broker` child + unix sockets were observed, mcpvault stdio was confirmed to be a **unix socketpair** (not PIPE), but no leaf socket peer has been matched to a specific intermediary, and the broker holds ZERO pipe fds. Do **not** claim broker-mediation or any specific OMP mechanism as fact. Treat 0/N OMP result as "method-insufficient, topology unresolved," never "detached." To settle: trace socketpair inodes / KQUEUE peers, or read OMP internal state.

### 5. Global orphan scan: recognize ALL MCP-owning hosts, not just codex-resume/omp
A descendant-scoped audit (`getdesc <root>`) covers ONE tree; a launchd-reparented MCP process from a dead session is invisible. For a GLOBAL orphan verdict, enumerate ALL MCP-type procs system-wide and walk each one's ancestry. BUT the walk must recognize EVERY MCP-owning host pattern, not just `codex resume` and `bun omp`. Observed live: **ChatGPT.app runs its own MCP servers via `codex -c features.code_mode_host=true`** (a different codex invocation); Claude Code, IDE extensions, and Electron apps (Obsidian, ChatGPT.app) can also own MCP servers. A walkroot matching only codex-resume/omp will **MISLABEL** those as "orphan to launchd" when they are actually under a live (different) host. Distinguish: (a) **TRUE orphan** = chain reaches launchd with NO live app/host in the chain (dead session); (b) **live non-canonical host** = chain reaches launchd THROUGH a live app. Label the top ancestor explicitly; do not collapse both into "orphan." (Live finding: PID 1553 obsidian-mcp-tools scanned as orphan-to-launchd but was actually under ChatGPT.app/668 via codex code-mode-host 1301.)

## Codex MCP-duplication signature (mechanism tiers)
When N complete MCP sets appear as direct children of one `codex resume` session, all fd-ATTACHED (no orphans WITHIN the tree; protocol activity / which set is in active use UNKNOWN - fd-attachment does NOT establish idle or active):

- **CONFIRMED (observed):** the duplication is CORRELATED with subagent `thread_spawn` - one parent startup + one MCP set per spawned subagent thread (observed with named MURE role threads Lagrange/Volta/Sartre), each fork adding +6-7 MCP procs parented to the main codex ppid. The ps/lsof process-tree evidence shows the duplication tracks the forks.
- **NOT EVIDENCED (not "ruled out"):** MCP-layer reconnect/EOF. The inspected `connection_manager` logs show NO reconnect/EOF entries, so reconnect is NOT EVIDENCED by that surface - but absence in ONE logger is not absence of the thing. A reconnect on a different log surface or an unlogged retry remains POSSIBLE. Do not harden "no reconnect logged" into "reconnect ruled out."
- **PLAUSIBLE (inferred, not code-proven):** the internal mechanism "Codex rollouts do not share stdio handles across forks" - inferred from process-tree + lsof evidence, NOT from source. Keep it PLAUSIBLE until code inspection confirms.
- **Config:** has NO respawn/watch/restart/auto-reconnect directives - so the duplication is not config-driven from the inspected files.
- **OPEN (leak vs expected overhead):** are the spawned subagents STILL ACTIVE (per-subagent MCP sets in use = legitimate MURE fan-out overhead) or FINISHED-with-unreaped-MCPs (persistent ppid-codex sets = teardown leak)? The all-attached fd-join is consistent with EITHER (it cannot distinguish in-use from unreaped). Settle by querying codex `logs_*.sqlite` for per-thread `thread.status` transitions and mapping to wave ps-pids.
- **Wave-1 npm ENOENT asymmetry** (a server present in waves 2-N but absent in wave 1): PLAUSIBLE cause is npx `_npx` cache eviction, NOT verified; do not assume "config changed between launches" without a config-mtime or spawn-log check.

Cleanup: **restart the codex session** tears down all per-subagent MCP sets regardless of leak-vs-expected. Do NOT surgically kill old-wave leaves while the host holds their pipes (restart is a RECOMMENDED boundary, not authorization - read-only audits recommend; only the owner authorizes the mutation). Structural fix: HTTP-transport MCPs eliminate per-fork duplication at the source. Resident set grows over time (observed 23 to 33 leaves in ~50min) while staying all-attached; re-run the fd-join at cleanup time.

## Discipline (every audit)
- **fd-attachment is not active JSON-RPC use - and not "idle" either.** An open pipe proves the host still holds it; it proves NEITHER active use NOR idleness. Protocol activity / which set is in use is fd-invisible; label it UNKNOWN or NEEDS-VERIFICATION. Do not write "fd-attached-but-idle" - "idle" is the same unproven inference as "active," just inverted.
- **Alive + owned is NOT legitimate / intended / unsuperseded.** A live parent proves ownership and aliveness only; it does not prove the host is intended, active, or not a stale duplicate. For live-vs-superseded classification (often the audit's actual purpose), each host's session and activity must be independently checked. Do not call a host "legitimate" from aliveness alone.
- **Recommendation is NOT authorization.** A read-only audit task (constraint: "do not stop/edit/delete") produces a recommended remediation boundary (e.g. "restart session X"); peer agent acceptance does not authorize the mutation, and the read-only constraint binds until the OWNER separately grants it. Frame recommendations as "recommended boundary," never as authorized/in-progress/completed.
- **Absence-of-evidence is not evidence-of-absence.** "No X logged in the inspected surface" supports "X not evidenced," NOT "X ruled out." Hardening the former into the latter is a recurring overclaim failure mode.
- Each claim tier (CONFIRMED / PLAUSIBLE / NEEDS-VERIFICATION) needs its OWN evidence. Never promote inference from age, PPID, process count, or partial fd evidence to CONFIRMED.
- **Scope claims explicitly.** "Zero detached descendants in tree X" is descendant-scoped, NOT "zero orphaned MCP servers system-wide." A global orphan verdict requires a system-wide scan with full host taxonomy (trap 5), and even then is bounded by the regex of server types scanned - state the scanned-type boundary and defer unconditional completeness to an independent critic.
- State churns: rerun scans at report time. Observed 23 to 33 leaves under one codex session in ~50min while staying all-attached; processes die/respawn across the audit window.
- Secrets: config files (`~/.codex/config.toml`, `.mcp.json`) carry inline tokens. Grep TOML headers (`^\[mcp_servers\.`) for KEY names only; `jq -r '.mcpServers|keys[]'` for JSON keys; never cat/dump values.

## Scout delegation caution
A weak scout will misuse `read(bash://...)`, `write(/dev/stdin)`, and `hub(start)` as shell-execution paths and loop without yielding. If a scout stalls on tool errors, cancel and run the check inline. Liveness config-reads and fd-joins are small enough to own directly; reserve scouts for genuinely independent broad sweeps and adversarial cross-checks (e.g. a completeness critic that re-runs the global scan with an independent host taxonomy).
