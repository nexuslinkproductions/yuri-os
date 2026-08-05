# E12 FRESHNESS WATCHER (design — per G2 loop-extension, owner-approved cadence)
Keeps the unified graph current between recon campaigns; catches drift without full re-walks.
- Cadence: every 6h (launchd interval) + on git HEAD change (post-checkout hook, non-blocking).
- Checks (all read-only, cheap):
  1. `git rev-parse HEAD` vs pinned graph HEAD → mismatch = stale, queue re-walk.
  2. `lsof -iTCP -sTCP:LISTEN` diff vs pinned port baseline → new/removed listener → update port nodes + alert on unexpected LAN bind (*).
  3. LAN probes 8471/8472/8777/11434 → disappearance = F-003 mitigation candidate (owner confirms); new 200 on unknown port = finding candidate.
  4. `secret-leak-scan.mjs` → regression gate (nonzero = alert).
  5. whatsapp-mcp proc count diff → drift note.
  6. `.agents/skills` projector --check → unmanaged-overwrite guard status (F-036 re-regression).
- Output: append-only /tmp/yuri-recon/watcher.log + node freshness updates; alerts to Orion for verdict.
- Stop policy: owner interrupt any time; auto-silence after 3 consecutive clean ticks until next HEAD change.
