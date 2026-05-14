# Lane Health LaunchAgent

Run `Scripts/lane-health.sh` hourly with `launchd`.

## Install

```bash
cp _SYSTEM/launchd/com.nudimmud.lane-health.plist ~/Library/LaunchAgents/ && launchctl load -w ~/Library/LaunchAgents/com.nudimmud.lane-health.plist
```

## Unload

```bash
launchctl unload ~/Library/LaunchAgents/com.nudimmud.lane-health.plist
```

## Verify

```bash
launchctl list | grep nudimmud
```

## Output

Logs append to:

`/Users/marcelspatz/NUDIMMUD/.claude/state/lane-health.log`

Errors append to:

`/Users/marcelspatz/NUDIMMUD/.claude/state/lane-health.err`

## Token Digest

Run `Scripts/token-spend-report.mjs --daily-digest` daily at 09:00 with `launchd`.

Install:

```bash
cp _SYSTEM/launchd/com.nudimmud.token-digest.plist ~/Library/LaunchAgents/
```

Logs append to:

`/Users/marcelspatz/NUDIMMUD/.claude/state/token-digest.log`

Errors append to:

`/Users/marcelspatz/NUDIMMUD/.claude/state/token-digest.err`
