# Nexus Link — Calendar documentation index

**Last updated:** 2026-07-02 (session closeout)  
**Phase:** 0 — canonical-first JSON store + Microsoft Graph propagation + UI wired  
**Runtime:** `http://127.0.0.1:8787` · `03_NEXUS-LINK/nexus-app/service/server.py`

---

## Quick status

| Area | Status |
|------|--------|
| Mike canonical-first write path | ✅ PASS |
| UI → REST → JSON store → outbox → Graph | ✅ Live |
| Microsoft OAuth (`contact@nexuslinkproductions.com`) | ✅ Connected |
| API CRUD + propagation (curl) | ✅ `LIVE_CALENDAR_MS_X_PASS_COMMITTED` |
| UI create/edit/delete | ✅ Fixed end-before-start validation |
| Disconnected smoke (no MS) | ✅ 7/7 PASS |
| Architect gap audit | ✅ `02AR_CALENDAR_ARCH_GAP_AUDIT_PASS` |
| Postgres / worker / public booking | ⏳ Phase 1+ |

**Git note:** `03_NEXUS-LINK/nexus-app/` is **gitignored** in YURI-OS-MUSUBI (export policy). Implementation lives locally; this `docs/` tree is the **tracked** planning + handoff surface.

---

## Document map

### Tracked (this repo — commit these)

| Document | Purpose |
|----------|---------|
| [`SESSION-HANDOFF-2026-07-02-nexus-calendar.md`](./SESSION-HANDOFF-2026-07-02-nexus-calendar.md) | Full session closeout — what shipped, verification, risks, next steps |
| [`NEXUS-LINK-CALENDAR-INDEX.md`](./NEXUS-LINK-CALENDAR-INDEX.md) | This index |
| [`MURE-DASHBOARD-WIRING.md`](./MURE-DASHBOARD-WIRING.md) | MURE work-dashboard API (separate from Nexus calendar) |
| [`../03_NEXUS-LINK/infra/README-SETUP.md`](../03_NEXUS-LINK/infra/README-SETUP.md) | Docker + Supabase local dev stack |
| [`../03_NEXUS-LINK/infra/migrations/README.md`](../03_NEXUS-LINK/infra/migrations/README.md) | Postgres migration order (calendar = slice 6) |

### Local only (`03_NEXUS-LINK/nexus-app/` — gitignored)

| Document | Purpose |
|----------|---------|
| `docs/CALENDAR-ARCHITECTURE.md` | Mike model — flowcharts, agent matrix, locked decisions §9 |
| `docs/CALENDAR-UI-SPEC.md` | Apple/Outlook UI interaction parity |
| `docs/CALENDAR-WIRING.md` | REST routes, UI functions, live test playbook, gap audit |
| `docs/MICROSOFT-CONNECT-RUNBOOK.md` | OAuth troubleshooting (owner lab verified) |
| `docs/ENTRA-SETUP.md` | Entra app registration |
| `docs/CONNECTORS.md` | Connector scopes and onboarding |
| `docs/RUN.md` | Boot and dev commands |
| `service/CALENDAR_VERIFICATION.md` | Implementation verification checklist |
| `MICROSOFT_CALENDAR_WIRING_COMPLETE.md` | Graph write ops wiring report |
| `tasks/calendar-arch-report.md` | Architect gap audit report |
| `tasks/calendar-smoke-report.md` | Adjudicator smoke 7/7 |
| `tasks/calendar-live-test-report.md` | Live MS CRUD 13/13 |
| `tasks/calendar-live-wiring.mure.json` | MURE task packet (live wiring) |
| `tasks/calendar-native-redispatch.mure.json` | MURE re-dispatch after glm-max abort |

### YURI ops

| Artifact | Purpose |
|----------|---------|
| `_SYSTEM/Scripts/mure-poll-run.mjs` | 60s progress poll for swarm/company runs |
| `.claude/jobs/swarm-mr2rf0lu-ec9447/` | Aborted GLM calendar swarm (`finalizeOk: false`) |

---

## Architecture (one paragraph)

Nexus owns calendar truth in a canonical store. All UI and API writes hit Nexus first, enqueue an outbox job, then propagate to Microsoft Graph. The UI reads **only** Nexus REST — source toggles filter `event.source`, not live provider overlays. One-time import pulls Outlook history with `source=imported` and dedup by `provider_ids.microsoft`. See `nexus-app/docs/CALENDAR-ARCHITECTURE.md` §2 for sequence diagrams.

---

## Implementation map

| Layer | Path |
|-------|------|
| Store | `service/calendar_store.py` → `service/data/calendar.json` |
| Service | `service/calendar_service.py` |
| HTTP | `service/server.py` — `/api/calendar/*` |
| Connector | `service/connectors/microsoft.py` |
| UI | `ui/app.js` — `calApi`, `calRefresh`, `calValidateRange` |
| i18n | `ui/i18n/en.json`, `de.json` — `cal.endBeforeStart` |

---

## REST surface (Phase 0)

| Method | Path |
|--------|------|
| GET | `/api/calendar/events?start=&end=` |
| POST | `/api/calendar/events` |
| PUT | `/api/calendar/events` (id in body) |
| DELETE | `/api/calendar/events?id=` |
| PUT | `/api/calendar/settings` |
| POST | `/api/calendar/import/microsoft` |
| POST | `/api/calendar/propagate` |
| GET | `/api/calendar/outbox` |

---

## Verification ledger

| Run | Verdict | Label |
|-----|---------|-------|
| Disconnected adjudicator smoke | 7/7 PASS | native re-dispatch |
| Architect gap audit | PASS | `02AR_CALENDAR_ARCH_GAP_AUDIT_PASS` |
| Live MS API CRUD | 13/13 PASS | `LIVE_CALENDAR_MS_X_PASS_COMMITTED` |
| GLM MURE swarm | 4/6 then aborted | `swarm-mr2rf0lu-ec9447` — glm-max stuck on full-repo grep |

---

## Phase 1 backlog (not in Phase 0)

1. Background propagation worker + outbox retry / dead-letter  
2. Postgres migration (`booking_types`, `bookings`, `calendar_sync_state`)  
3. `POST /api/public/book/:slug` + funnel integration  
4. Domain events (`booking.created`, `booking.no_show`, …)  
5. Inbound delta sync (Graph webhook / poll) per §9 decision (c) auto-update  
6. Booking-type resolution on create (round-robin — **Mike Q4 TBD**)  
7. Availability engine + `availability-scan` agent  
8. Apple CalDAV server-side · Google Calendar connector  
9. UI retry for `sync: failed` events  

Full gap list: `nexus-app/docs/CALENDAR-WIRING.md` § Gap audit.

---

## Boot (continue next session)

```bash
cd 03_NEXUS-LINK/nexus-app/service
python3 server.py --no-browser   # → http://127.0.0.1:8787
curl -s http://127.0.0.1:8787/api/health
curl -s http://127.0.0.1:8787/api/connect/microsoft/status
```

**Stale-server footgun:** If calendar routes 404 but MS status works, restart from current `server.py` (old process may lack calendar routes).

---

*Propagate changes: any endpoint or Mike-model decision → update `CALENDAR-ARCHITECTURE.md`, `CALENDAR-WIRING.md`, this index, and the session handoff if scope changes.*
