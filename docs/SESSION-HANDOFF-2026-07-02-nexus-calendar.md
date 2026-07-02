# SESSION HANDOFF — Nexus Link Calendar Phase 0

**Date:** 2026-07-02  
**Operators:** Marcel, Mike (architecture), YURI lanes (Claude/Cursor, MURE native + GLM)  
**Continue here:** [`NEXUS-LINK-CALENDAR-INDEX.md`](./NEXUS-LINK-CALENDAR-INDEX.md)

---

## 1. What this session delivered

### Product (Phase 0 calendar)

End-to-end **canonical-first calendar** for the Nexus Link local demo:

- **Backend:** JSON store (`calendar_store.py`), service layer with inline propagation (`calendar_service.py`), eight REST routes on `server.py`
- **Microsoft:** Graph read/write (`fetch_calendar`, create/update/delete) with `Calendars.ReadWrite`; PKCE OAuth persisted in Keychain
- **UI:** Interactive calendar module wired to REST — day/work week/week/month, modals, source toggles, booking types panel, one-time import, propagation toasts
- **Validation:** UI + server reject `end` before `start`; default end = start + 1h on create
- **Docs:** Architecture (Mike model), UI spec, wiring playbook, gap audit, three verification reports

### Infrastructure (parallel track)

- `03_NEXUS-LINK/infra/` — Docker Compose Supabase stack, migrations README, setup guide (tracked in git)
- `_SYSTEM/Scripts/mure-poll-run.mjs` — progress polling for MURE swarm runs

### Not delivered (explicitly Phase 1+)

Postgres tables, background worker, public booking endpoint, no-show automation, availability engine, Apple/Google connectors, round-robin assignee engine on create, inbound webhook sync.

---

## 2. Architecture decisions (locked)

From `nexus-app/docs/CALENDAR-ARCHITECTURE.md` §9:

| # | Decision |
|---|----------|
| 1 | Inbound provider edits → **(c) auto-update Nexus** (worker not built yet) |
| 2 | Apple → **CalDAV server-side** |
| 3 | Historical import → **one-time ingest**, `source=imported` |
| 4 | Round-robin booking → **Mike product call TBD** (types stored; engine stub) |

**Mike invariant (verified):** Write Nexus → outbox → propagate. UI never merges live provider feeds.

---

## 3. Verification evidence

### Disconnected smoke — PASS 7/7

`tasks/calendar-smoke-report.md` — py_compile, create propagation gate, validation errors, import dedup, soft delete, GET bundle.

### Architect gap audit — PASS

`tasks/calendar-arch-report.md` — `02AR_CALENDAR_ARCH_GAP_AUDIT_PASS`. Canonical-first core aligns; gaps documented in wiring § Gap audit.

### Live Microsoft CRUD — PASS 13/13

`tasks/calendar-live-test-report.md` — `LIVE_CALENDAR_MS_X_PASS_COMMITTED` against connected `contact@nexuslinkproductions.com`.

### UI manual test

- **Failed once:** end 11:00 before start 12:00 → Graph `At least one property failed validation`
- **Fixed:** `calValidateRange`, `calDefaultEndFromStart`, server `_validate_range` → re-sync succeeded

### MURE GLM swarm — aborted

- Run: `swarm-mr2rf0lu-ec9447` (manifest `.claude/jobs/swarm-mr2rf0lu-ec9447/manifest.json`)
- 4/6 leaves PASS; `cal-arch-map` + `cal-adjudicate-smoke` glm-max stuck ~35min on full-repo grep
- **Recovery:** native re-dispatch — architect + adjudicator both PASS

---

## 4. Errors encountered and fixes

| Error | Fix |
|-------|-----|
| MURE work done inline instead of `company.mjs` dispatch | Owner corrected; armed company run, then aborted + native agents |
| glm-max grep crawl on 39GB tree | Abort; native re-dispatch |
| `/api/calendar/*` → 404 | Stale `server.py` without routes — restart `:8787` |
| Duplicate servers `:8787` + `:8788` | Kill duplicate before next session |
| UI sync failed toast | End-before-start validation (UI + server) |
| `docs/CALENDAR-WIRING.md` name collision | Renamed MURE doc → `docs/MURE-DASHBOARD-WIRING.md` |
| `CALENDAR-ARCHITECTURE.md` §5.2 stale | Updated to Phase 0 live status |

---

## 5. Runtime state at closeout

| Item | Value |
|------|-------|
| Server | `http://127.0.0.1:8787` |
| Boot | `cd 03_NEXUS-LINK/nexus-app/service && python3 server.py --no-browser` |
| MS account | Connected (Keychain tokens survive restart) |
| Data | `service/data/calendar.json` (local, gitignored) |
| Config | `service/config.json` (local, gitignored — never commit) |

---

## 6. File inventory (implementation — gitignored)

```
03_NEXUS-LINK/nexus-app/
├── service/
│   ├── calendar_store.py      # JSON store + outbox
│   ├── calendar_service.py    # CRUD + propagation + import
│   ├── server.py              # REST routes
│   ├── connectors/microsoft.py
│   └── data/calendar.json     # runtime data
├── ui/app.js                  # calUI module
├── ui/i18n/{en,de}.json
├── docs/CALENDAR-*.md
└── tasks/calendar-*.{md,mure.json}
```

**Tracked in YURI repo this session:**

```
docs/NEXUS-LINK-CALENDAR-INDEX.md
docs/SESSION-HANDOFF-2026-07-02-nexus-calendar.md
docs/MURE-DASHBOARD-WIRING.md          # renamed from CALENDAR-WIRING.md
03_NEXUS-LINK/infra/                   # Docker + Supabase stack
_SYSTEM/Scripts/mure-poll-run.mjs
README.md                              # index links updated
```

---

## 7. Gap audit summary (for Phase 1 planning)

High priority from architect + wiring docs:

1. **Booking types dead data** — stored but not resolved on `create_event`; `round_robin_cursor` never advanced  
2. **No overlap / availability check** — double-booking possible  
3. **Synchronous propagation** — Graph latency blocks HTTP request  
4. **No inbound delta** — Outlook edits after import won't reflect until manual re-import  
5. **Graph mapping lossy** — attendees, tags, busy/showAs not pushed outbound  
6. **No public booking route** — Buchungslink is toast-only in UI  

Full table: `nexus-app/docs/CALENDAR-WIRING.md` § Gap audit.

---

## 8. Recommended next session

1. **Confirm tracking policy** — un-ignore `nexus-app` selectively or maintain docs-only mirror in `docs/`  
2. **Phase 1a:** background propagation worker + retry for `sync: failed`  
3. **Phase 1b:** `POST /api/public/book/:slug` stub + booking_type resolution  
4. **Mike call:** round-robin day-one vs post-MVP (Q4)  
5. **UI:** retry sync button for failed events  
6. **Postgres:** calendar slice in `infra/supabase/migrations/` per migrations README §6  

---

## 9. MURE task packets (re-runnable)

```bash
# DISARMED by default — owner arms YURI_MURE_ARMED or touch _SYSTEM/state/mure.enabled
node _SYSTEM/mure/company.mjs --task-file 03_NEXUS-LINK/nexus-app/tasks/calendar-native-redispatch.mure.json
node _SYSTEM/Scripts/mure-poll-run.mjs --run-id <swarm-id> --poll-ms 60000
```

---

## 10. Residual risk

- **Stale server process** — calendar 404 while connectors work; always restart from current tree  
- **Gitignore** — calendar code not in remote unless policy changes; handoff docs are the tracked source  
- **Inline propagation** — production needs worker before multi-user load  
- **Import dedup edge cases** — architect flagged possible miss paths  
- **Secrets** — `config.json`, Keychain tokens, MS Graph IDs in test reports stay local  

---

**Session closeout:** documentation propagated, architecture §5.2 synced, index + handoff committed to `docs/`.  
**RESULT_LABEL:** `SESSION_CLOSEOUT_NEXUS_CALENDAR_PHASE0_2026-07-02`
