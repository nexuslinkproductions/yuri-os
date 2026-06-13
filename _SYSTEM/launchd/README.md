# Lane Health LaunchAgent

Run `_SYSTEM/Scripts/lane-health.sh` hourly with `launchd`.

## Install

```bash
cp _SYSTEM/launchd/com.yuri.lane-health.plist ~/Library/LaunchAgents/ && launchctl load -w ~/Library/LaunchAgents/com.yuri.lane-health.plist
```

## Unload

```bash
launchctl unload ~/Library/LaunchAgents/com.yuri.lane-health.plist
```

## Verify

```bash
launchctl list | grep yuri
```

## Output

Logs append to:

`/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/lane-health.log`

Errors append to:

`/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/lane-health.err`

## Filing Autonomy

Scheduled DETERMINISTIC filing sweep via `_SYSTEM/Scripts/filing-autonomy.mjs`. The plist
`com.yuri.filing-autonomy.plist` ships **DRY-RUN ONLY and DISABLED** — it can never move a file as written.

### Install (dry-run reporting only — safe)

```bash
cp _SYSTEM/launchd/com.yuri.filing-autonomy.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.yuri.filing-autonomy.plist   # writes the queued report + ledger each tick, moves NOTHING
```

Each tick writes:
- `_SYSTEM/reports/filing-autonomy-latest.md` — the queued-for-owner plan (what it WOULD move + everything held back).
- `_SYSTEM/state/filing-autonomy-ledger.jsonl` — append-only run-ledger (plan hash, tier counts, rollbackFrom).

### Arm autonomous execution of the safe LOW tier (ALL THREE required — any one missing ⇒ dry-run)

```bash
# 1. flag file (one half of the kill-switch)
touch _SYSTEM/state/filing-autonomy.enabled
# 2. env flag — edit the plist: uncomment the EnvironmentVariables dict (YURI_FILING_AUTONOMY=1)
# 3. add --execute to the plist ProgramArguments, then reload:
launchctl unload ~/Library/LaunchAgents/com.yuri.filing-autonomy.plist
cp _SYSTEM/launchd/com.yuri.filing-autonomy.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.yuri.filing-autonomy.plist
```

The runner additionally refuses to mutate unless the branch is `main`, executes only `risk==LOW AND refCount<=3
AND basenameOnlyCount==0 AND zero protected ref-hosts AND not pinned/protected AND target absent`, caps each run
at `--budget` moves (default 10), STAGES via `git mv` (never commits, never pushes), reindexes, then HARD-fails
if any stale reference remains.

### Disarm (kill-switch)

```bash
rm -f _SYSTEM/state/filing-autonomy.enabled            # removing EITHER half disarms instantly
launchctl unload ~/Library/LaunchAgents/com.yuri.filing-autonomy.plist
```

### Manual run

```bash
node _SYSTEM/Scripts/filing-autonomy.mjs                    # dry-run: report only
node _SYSTEM/Scripts/filing-autonomy.mjs --execute          # armed only; refused otherwise
node _SYSTEM/Scripts/filing-autonomy.mjs --execute --budget 3 --no-gitnexus
```

## Token Digest

Run `_SYSTEM/Scripts/token-spend-report.mjs --daily-digest` daily at 09:00 with `launchd`.

Install:

```bash
cp _SYSTEM/launchd/com.yuri.token-digest.plist ~/Library/LaunchAgents/
```

Logs append to:

`/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/token-digest.log`

Errors append to:

`/Users/marcelspatz/YURI-OS-MUSUBI/.claude/state/token-digest.err`
