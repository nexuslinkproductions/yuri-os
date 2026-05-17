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
