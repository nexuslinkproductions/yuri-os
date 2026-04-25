---
name: nudimmud-shell-service
description: Shell service architecture fix for Oracle terminal — launchd-managed process that handles spawn on behalf of pm2 backend
type: project
originSessionId: 23f8825d-699a-4d1b-9aae-f37facbbc89c
---
The Oracle terminal's shell execution (HTTP /api/terminal/run + WS /ws/shell) was broken due to macOS `posix_spawn` EBADF errors inside pm2-managed Node.js processes.

**Root cause:** pm2's fork mode sets up the backend process with Unix domain socket fds (0,1,2,3) and IPC pipes (5,6) that interfere with macOS `posix_spawn` in libuv (Node.js v25.9.0 / libuv 1.52.1). ALL spawn/spawnSync/execFile fail with EBADF consistently.

**Fix:** Standalone shell service at `/Users/marcelspatz/NUDIMMUD/backend/shellService.js` (port 3098) started by launchd, which has clean fds. The backend proxies terminal commands to it via HTTP.

**Architecture:**
- `shellService.js` → launchd plist `com.nudimmud.shellservice` → port 3098
- Backend `/api/terminal/run` → proxies to `http://127.0.0.1:3098/run`
- Backend `/ws/shell` → proxies to `http://127.0.0.1:3098/run`

**To restore after reboot:**
```bash
launchctl load ~/Library/LaunchAgents/com.nudimmud.shellservice.plist
```
(Or it auto-loads on login via KeepAlive + RunAtLoad in plist)

**Why:** Launchd starts processes with clean file descriptors; pm2 fork mode does not.

**Other fixes in same session:**
- `OracleTerminal.tsx`: WS URL changed from `window.location.host` to `WS_ORIGINS[0]` (fixes WS connecting to Vite port instead of backend)
- `notebookIngestService.ts`: Fixed pdf-parse `as any` cast (TS error crashing backend)
- `notebookVizService.ts`: Added `await` before `extractJson` calls (TS null assignability errors)
- `ecosystem.config.js`: Changed backend to `node dist/server.js` (compiled JS, not ts-node)
