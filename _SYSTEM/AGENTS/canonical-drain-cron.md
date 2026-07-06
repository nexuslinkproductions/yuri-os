# Canonical-Drain — durable spec (P2 arming, 2026-06-14)

Keeps the canonical-truth store (`_SYSTEM/state/memory-canonical/`) fresh: fold each lane's shard into the
generation-rotated canonical log + materialized read-view, rotate/compact/unlink, and (slower beat) snapshot
off-disk. **Unlike [[dream-drain-cron]] — a heavy nightly *Claude synthesis* cron — this is PURE-NODE MECHANISM,
no model reasoning.** Its correct runtime is therefore an OS scheduler running a node process, NOT a session
prompt. Documented here so any session/owner can (re)arm it from one place.

## The fold command (the only thing that runs)
```bash
node _SYSTEM/Scripts/memory-canonical-store.mjs drain canonical-<runtime>
```
- Lease-protected (`DRAIN_LEASE_ID`), idempotent, dedup by sha256 content-hash. Safe to over-run: concurrent
  runs serialize on the nano-lease (the loser is a cheap no-op, never a double-count — proven by
  `mcs-fault-injection.test` A/B/G).
- Prints `{ ok, folded, skipped, shards, claims, rotated, compacted, unlinked }`.
- Uses the PRODUCTION dir + PRODUCTION nano-leases (no env override) — exactly the first-run smoke config.

Optional off-disk snapshot (run on a SLOWER beat — rotation keeps only the last 5, so frequent sweeps churn
out real history):
```bash
YURI_CANONICAL_BACKUP_ARM=1 node _SYSTEM/Scripts/mcs-persistence-sweep.mjs sweep
```

## Runtime options (owner choice — see AskUserQuestion 2026-06-14)

### A. launchd LaunchAgent — RECOMMENDED (persistent across restarts/logout; GOAL-matching)
Pure-node fold every 5 min, zero session/prompt cost, survives Claude exiting. Template
(`~/Library/LaunchAgents/com.yuri.canonical-drain.plist`; fill `<NODE>` = `which node`, `<REPO>` = repo root):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.yuri.canonical-drain</string>
  <key>ProgramArguments</key>
  <array><string><NODE></string><string><REPO>/_SYSTEM/Scripts/memory-canonical-store.mjs</string><string>drain</string><string>canonical-launchd</string></array>
  <key>WorkingDirectory</key><string><REPO></string>
  <key>StartInterval</key><integer>300</integer>
  <key>StandardErrorPath</key><string><REPO>/_SYSTEM/state/memory-canonical/.drain.err</string>
  <key>StandardOutPath</key><string><REPO>/_SYSTEM/state/memory-canonical/.drain.out</string>
  <key>ProcessType</key><string>Background</string>
</dict></plist>
```
- load: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.yuri.canonical-drain.plist`
- undo: `launchctl bootout gui/$(id -u)/com.yuri.canonical-drain` then `rm ~/Library/LaunchAgents/com.yuri.canonical-drain.plist`
- The `.drain.out/.err` logs live INSIDE the gitignored store dir, so they never enter git.

### B. Native session CronCreate (YURI-consistent, SESSION-BOUND)
Self-renewing like dream-drain (Step 0 re-creates before the 7-day expiry). **Limitation: session-bound** — if no
Claude session spans an expiry boundary the loop breaks; and it fires a (small) prompt each cycle for what is a
pure node command. Re-arm prompt: `*/5 * * * *`, recurring, durable, prompt = "Step 0 self-renew per
_SYSTEM/AGENTS/canonical-drain-cron.md; then run `node _SYSTEM/Scripts/memory-canonical-store.mjs drain
canonical-cron` and report the JSON counts."

### C. On-demand / hold
No scheduler. The store stays CORRECT (reads fold live across generations); it just isn't auto-fresh until a
drain runs. Pick a runtime later.

## Status
- 2026-06-14: store **ARMED live** — first on-disk run (4 genesis claims drained, `readView.claimCount=4`),
  persistence sweep armed (`snap-00001` verified). Full 40-test gate green. Drainer runtime = **PENDING OWNER CHOICE** (A/B/C above).
- Writer reality: only [[filing-canonical-bridge]] calls `appendClaim` (advisory, opt-in) — the armed pump has
  almost no real input yet. Wiring the first real canonical writer is the open next decision.

## SEE
- `_SYSTEM/Scripts/memory-canonical-store.mjs` (the store) · `mcs-persistence-sweep.mjs` (backup) ·
  `mcs-drain-daemon.mjs` (alt long-lived daemon, KeepAlive style) · [[dream-drain-cron]] (the synthesis-cron contrast)
