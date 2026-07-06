# CONTROL PACKET — W4 observatory auth middleware (minimax-m3 lane)

GOAL: Build a small, standalone token-auth middleware module for the Observatory's node:http server so Mike can access it remotely without exposing the paper-trading dashboard to the open internet unauthenticated. Localhost stays open; non-localhost requires a bearer token. PURE module — does NOT modify the server (the main session wires it in).

GROUND FIRST (read these — do NOT guess signatures):
1. `_SYSTEM/Scripts/alpha-factor-library/observatory/observatory-server.mjs` — read the request handler shape: it's a raw node:http server, handlers receive `(req, res)`. Note the existing CORS allowlist (`ALLOWED_ORIGINS`) and `HOST='127.0.0.1'`. Your middleware must compose with this `(req,res)` style — a function the server can call at the top of its handler.
2. `00-MASTER-BRIEF.md` §4 constraints (paper-only, NO key reads, localhost-first).

TARGET FILE (new): `_SYSTEM/Scripts/alpha-factor-library/observatory/observatory-auth.mjs`

REQUIREMENTS:
- INV-2 NO key reads from disk. The shared secret comes from `process.env.OBSERVATORY_AUTH_TOKEN` ONLY. If that env var is UNSET → auth is DISABLED (open) and `checkAuth` returns `{ ok: true, mode: 'disabled' }` (DISARMED-by-default; do not break the existing localhost dev flow).
- `checkAuth(req, opts?) -> { ok, mode, reason? }` — pure decision function (no I/O beyond reading req headers + process.env):
  - If no token configured → `{ ok:true, mode:'disabled' }`.
  - If request remote address is loopback (127.0.0.1 / ::1) AND `opts.allowLoopback !== false` → `{ ok:true, mode:'loopback' }`.
  - Else require `Authorization: Bearer <token>` header matching the configured token via a CONSTANT-TIME comparison (use `node:crypto` `timingSafeEqual`, length-guarded so it never throws on length mismatch) → `{ ok:true, mode:'token' }` or `{ ok:false, reason:'unauthorized' }`.
- `applyAuth(req, res, opts?) -> boolean` — convenience: calls checkAuth; on fail writes `401` + `{error:'unauthorized'}` JSON and returns false; on pass returns true. (The server does `if (!applyAuth(req,res)) return;`.)
- Extract the client IP robustly (req.socket.remoteAddress; treat `::ffff:127.0.0.1` as loopback). Do NOT trust `X-Forwarded-For` for the loopback decision (spoofable) — document this.
- Pure ESM, node built-ins only (node:crypto), NO new dep.

ACCEPTANCE:
- `node --check` passes.
- `--test` exits 0 asserting: unset token → disabled/open; loopback → ok; non-loopback + no token header → 401; non-loopback + correct Bearer → ok; non-loopback + WRONG token → 401; timingSafeEqual length mismatch does NOT throw; `::ffff:127.0.0.1` treated as loopback.
- Self-test prints `N pass, 0 fail`.

TEST CMD: `node _SYSTEM/Scripts/alpha-factor-library/observatory/observatory-auth.mjs --test`
ROLLBACK: delete the new file.
AFTER WRITING: write the file, run node --check + --test yourself, report PASS/FAIL + exact counts + a ≤8-line summary + the exact `checkAuth`/`applyAuth` signatures so the main session can wire them. DO NOT git commit. Your final message IS the result.
