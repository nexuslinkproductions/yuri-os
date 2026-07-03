# Nexus Link — Phase 1 build handoff (for Cursor)

**Date:** 2026-07-03
**Audience:** Cursor (or any coding agent) executing the Phase 1 build.
**Companion visual plan:** [`NEXUS-LINK-PHASE1-VISUAL-PLAN-2026-07-02.html`](./NEXUS-LINK-PHASE1-VISUAL-PLAN-2026-07-02.html)
**Phase 0 record:** [`SESSION-HANDOFF-2026-07-02-nexus-calendar.md`](./SESSION-HANDOFF-2026-07-02-nexus-calendar.md) · [`NEXUS-LINK-CALENDAR-INDEX.md`](./NEXUS-LINK-CALENDAR-INDEX.md)

This document is self-contained. Read it top to bottom, then execute the workstreams in order. Each task names exact files and an acceptance gate. Three detailed design dossiers (produced by a design pass, cited below) are the **spec-of-record** for the hard parts — read the referenced dossier before implementing that workstream.

---

## 0. What Nexus Link is (context)

Nexus Link is a self-hosted, bilingual (DE/EN), GDPR, all-in-one business platform for the DACH market — CRM + funnels + automation + messaging (WhatsApp/IG/FB) + email + calendar + files + team. It is being turned from a demo UI into a functional product **module by module**. Phase 0 shipped a live, canonical-first **calendar** module. Phase 1 (this handoff) makes three things operational: **(A)** Microsoft sync robustness, **(B)** a live availability engine, **(C)** a platform-wide account-connection layer.

### Runtime & layout

- **App root:** `03_NEXUS-LINK/nexus-app/`
- **Backend:** Python stdlib HTTP server. Boot: `cd 03_NEXUS-LINK/nexus-app/service && python3 server.py --no-browser` → `http://127.0.0.1:8787`
- **Store:** JSON canonical store — `service/calendar_store.py` → `service/data/calendar.json` (+ an outbox job queue in the same file)
- **Service layer:** `service/calendar_service.py` (CRUD + propagation)
- **REST:** `service/server.py` — `/api/calendar/*`, `/api/connect/*`, `/api/connectors`
- **Connectors:** `service/connectors/` — `base.py` (Connector protocol + registry), `microsoft.py` (live, Graph + PKCE OAuth), `stubs.py` (unwired providers), `__init__.py` (bootstrap)
- **UI:** `ui/app.js` — single-file view shell; `V.<view>()` render functions, `calUI` state object, `calApi/calRefresh/calRerender` for the calendar module. i18n in `ui/i18n/{en,de}.json`.
- **Docs (local, gitignored):** `docs/CALENDAR-ARCHITECTURE.md`, `CALENDAR-WIRING.md`, `CALENDAR-UI-SPEC.md`, `CONNECTORS.md`, `ENTRA-SETUP.md`, `MICROSOFT-CONNECT-RUNBOOK.md`

### Boundaries — read before you touch anything

1. **`03_NEXUS-LINK/nexus-app/` is gitignored** in this repo (export policy). You edit the local files; the tracked `docs/` tree is the planning source of truth. Do **not** try to `git add` nexus-app files — that's intentional.
2. **Do NOT touch YURI-OS infrastructure.** Anything under `_SYSTEM/`, `.claude/`, the fleet scripts (`glm-fleet.mjs`, `ollama-fleet.mjs`, `lane-dispatch.mjs`, `contract-conformance.mjs`), MURE, etc. is **out of scope** for this build. The "cosmetic exit-1" fleet fix mentioned in the visual plan is **already done** and is not part of Nexus Link — leave it alone.
3. **Secrets stay local and unread.** `service/config.json` (client ids, tenant), macOS Keychain tokens, and any Graph ids in test reports are local-only. Never commit them, never print full token/id values (redact to first 6–8 chars in any report).
4. **`service/data/calendar.json` is live runtime data** — the owner's real calendar events + provider ids. Do not delete or rewrite it wholesale. Migrations must be additive and backward-compatible (the store already uses `setdefault` for new keys).

---

## 1. Workstream A — Microsoft sync robustness

**Spec-of-record:** `03_NEXUS-LINK/nexus-app/tasks/ms-sync-robustness-glm.md` (read it — it has code-level fix designs).

### The bug (verified against the live outbox)

The UI shows `Saved in Nexus · sync to Microsoft failed: The specified object was not found in the store` — Graph `ErrorItemNotFound`. Verified root cause: **a delete was replayed on an already-deleted Graph event**. Two delete jobs fired ~4s apart for the same event (`ev_964b855c…`); the first succeeded on Graph, the replay hit 404, and the code treats a 404 on delete as a hard failure. Two structural enablers:

- `service/connectors/microsoft.py` `_graph_mutate` (~line 371) **strips the HTTP status code**, returning only the Graph error message → the caller cannot distinguish 404 from 400, so self-heal is impossible.
- `service/calendar_service.py` delete path (`_run_propagation`, ~line 110-117) **raises on any error** with no idempotency guard.
- Propagation is **synchronous** — Graph latency blocks the HTTP request.

Note: also reconcile the ~4 stuck `pending` jobs already in `service/data/calendar.json` outbox (a create+delete pair for an event that never reached Graph; a duplicate pending delete for `ev_964b855c…`).

### Tasks (in order)

- **A1 — Preserve HTTP status.** In `microsoft.py` `_graph_mutate`, return `{"error": <msg>, "status": <http_code>}` instead of dropping the code. *(1-line-ish change; unblocks everything below.)*
  **Gate:** a forced 404 returns a dict carrying `status: 404`.
- **A2 — Idempotent delete + 404 self-heal.** In `calendar_service.py` propagation: `delete` + 404 → treat as success (desired state already reached, mark `synced`). `update` + 404 → re-create the event and re-attach the new Graph id via the existing `_attach_provider_id`.
  **Gate:** replaying a delete on a missing Graph event marks the job `done`, not `failed`. Updating an event whose Graph id is gone re-creates it and stores the new id.
- **A3 — Outbox dedupe.** Don't enqueue a `delete` job when the event is already `status:cancelled` with a delete pending. Reconcile the existing stuck jobs.
  **Gate:** deleting an already-cancelled event does not create a second delete job.
- **A4 — Retry + dead-letter (P1).** Exponential backoff (10s → ~13min), dead-letter after 5 attempts. Add a per-job `attempts`/`next_attempt_at` field to outbox jobs.
  **Gate:** a transient failure retries with backoff; a persistent one dead-letters after 5 and surfaces to the UI.
- **A5 — Background propagation worker (P1).** Drain the outbox on a daemon thread so saving an event doesn't block on Graph latency. Keep the synchronous path available for tests.
  **Gate:** POST `/api/calendar/events` returns before Graph is contacted; the event syncs shortly after.
- **A6 — UI retry button (P1).** In `ui/app.js`, add a "retry sync" affordance on events whose `sync == "failed"`, calling `POST /api/calendar/propagate` (or a targeted retry route).
  **Gate:** a failed event shows a retry control; clicking it re-runs propagation for that event.
- **A7 — Inbound delta sync (P2).** `GET /me/calendarView/delta` polling with a persisted `deltaLink` (no public webhook URL needed). Fulfils the locked "auto-update Nexus" decision — edits made in Outlook flow back in. *(Design in the dossier; can defer to Wave 3.)*

### Verification (Workstream A)

Run the Phase-0 baselines and confirm no regression, then the new negative tests:
```bash
cd 03_NEXUS-LINK/nexus-app/service && python3 -m py_compile *.py connectors/*.py
# live (owner MS account connected):
curl -s http://127.0.0.1:8787/api/health
curl -s http://127.0.0.1:8787/api/connect/microsoft/status
curl -s http://127.0.0.1:8787/api/calendar/outbox   # confirm stuck jobs reconciled
```
New negative tests to add: double-delete replay → second is a no-op; update-with-missing-id → re-create; 404-on-delete → job `done`.

---

## 2. Workstream B — availability engine (make the panel live)

**Spec-of-record:** `03_NEXUS-LINK/nexus-app/tasks/availability-engine-design-glm.md` (full data model + algorithm + REST + edge cases). Prior-art model: Cal.com (schedule + slot rules + busy subtraction).

### Current state (verified)

The Availability panel in `ui/app.js` (~line 1289) renders a **hardcoded array** `const slots=[6,4,5,3,7,2,0]` mapped to MO–SU — pure demo. Everything needed to make it real already exists server-side and is **unused**:

- `service/calendar_store.py` `DEFAULT_SETTINGS` — `work_start` (`"08:00"`), `work_end` (`"18:00"`), `timezone` (`"Europe/Vienna"` today; owner is in **Zurich** — see decision D-TZ below). No consumer reads `work_start/work_end` for slot math.
- `DEFAULT_BOOKING_TYPES` — `{id, name, duration, rule (round_robin|fixed|load), pool[]|assignee, buffer}`. Stored, never resolved on create.
- `round_robin_cursor` — seeded to 0, never read.
- The canonical event store is the busy-time source (Phase 0 already imports/propagates Microsoft events into it, so "busy" already includes the connected calendar).

### Tasks (in order)

- **B1 — Slot engine.** New `service/availability.py`: resolve a booking type → build working intervals per assignee from schedule + date overrides (localize via `zoneinfo`) → subtract busy events from the canonical store (respect `status != cancelled`, `busy`, `allDay`) → expand buffers → interval subtraction → generate candidate slots by granularity, filtered by minimum-notice. Per-day free counts for summary; per-slot list for detail. **Stdlib only, no new deps. No server-side cache (recompute per request — Cal.com ships the same way; <50ms).**
  **Gate:** given known events + working hours, returns correct per-day counts; a fully-booked day returns 0; a day outside the work schedule returns 0.
- **B2 — REST.** `GET /api/calendar/availability?start=&end=&booking_type=&detail=` — summary mode = per-day free counts; detail mode = per-slot with assignee. Add booking-type CRUD (`GET/POST/PUT/DELETE /api/calendar/booking-types`) and, if adopting per-assignee schedules (D-AVAIL below), schedule CRUD routes.
  **Gate:** the endpoint returns counts matching B1 for the current week; booking types are editable via API.
- **B3 — UI panel.** In `ui/app.js`: replace the hardcoded array with `calUI.availability` fetched in `calRefresh()` (alongside `GET /api/calendar/events`). Add a booking-type selector; make day pills expandable to show slot times + available assignee. Degrade gracefully if the availability call fails (show a muted state, not a crash). Add i18n keys to `ui/i18n/{en,de}.json`.
  **Gate:** the panel shows server-computed counts that change when you add/remove a calendar event; expanding a day lists real slots; the caption ("live from the connected calendars") is now true.
- **B4 — Booking-type resolution on create.** Resolve the assignee when an event is created from a booking type. **Default: fixed-assignee.** Round-robin/load engine (advancing `round_robin_cursor`) lands after the Mike product call (D-RR below) — wire it behind the rule field so it's a config flip, not a rebuild.
  **Gate:** creating a booking of a fixed type assigns the right person; round-robin is stubbed but structured.

### Known HIGH-risk edge (from the dossier)

**Assignee-name normalization.** Booking-type pools use `"Mike R."`, `"Atilla K."`; events may carry `who: "Mike"`. A silent mismatch makes the slot engine subtract the wrong person's busy time. Normalize names to a canonical form (map `"Mike"` → `"Mike R."`) in one place and use it everywhere. Treat this as a correctness bug, not a nicety.

Other edges to handle: DST (compute in the schedule TZ via `zoneinfo`, no special-casing), all-day events block the day, no-show events free the slot, multi-assignee = **union** for Phase 1 (all booking types are single-assignee; intersection/group scheduling is deferred).

---

## 3. Workstream C — the platform connection layer (NOT just calendar)

**Spec-of-record:** `03_NEXUS-LINK/nexus-app/tasks/provider-connectors-design-glm.md` (full connector abstraction, Google connector, honest Meta assessment, per-provider owner checklists).

### Framing (important — this is a platform capability)

Connecting Microsoft, Google and Meta is a **platform-wide account-connection layer**, not a calendar feature. One connected account unlocks many modules. Build a shared **identity + OAuth + token rail** (the "Connections" subsystem — already live for Microsoft), and let each module plug a **capability adapter** onto the same connected account:

| Provider | Unlocks | Scopes / surface | State |
|---|---|---|---|
| **Microsoft 365** | Calendar · Email · Contacts/CRM · Files | `Calendars.ReadWrite` · `Mail.ReadWrite` · `Contacts.ReadWrite` · `Files.ReadWrite.All` (Graph) | **connected** |
| **Google** | Calendar · Email (Gmail) · Contacts · Drive | `calendar.events` (+ Gmail/People/Drive later); Desktop OAuth + PKCE + loopback | **this wave** |
| **Meta** | Communication inbox · Social (**NOT calendar**) | WhatsApp Cloud API · Instagram Graph · FB Pages | verify track |
| **Apple** | Calendar · Contacts (later) | server-side CalDAV (locked) | parked |

This wave builds the auth core + the **calendar capability adapter** for Google, and refactors the working Microsoft connector into the same shape. Mail/Contacts/Files/messaging adapters are **registered stubs** the later modules fill — build the rail once, here.

### Tasks (in order)

- **C1 — Auth core.** Extract shared OAuth infra from `microsoft.py` into `service/connectors/_oauth.py`: PKCE S256, loopback HTTPServer catcher factory, daemon-thread code awaiter, provider-parameterized HTML page, and Keychain helpers (`com.nexuslink.app.{provider}`). No behavior change to Microsoft.
  **Gate:** Microsoft connect flow still works end-to-end after extraction.
- **C2 — `ProviderConnector` ABC.** Expand `service/connectors/base.py` to the full lifecycle: `authorize`, `status`, `connect_state`, `_valid_token`, `fetch_range`, `create`, `update`, `delete`, `delta`. All methods return dicts (never raise across the provider boundary; `{"error": ...}` on failure). Add `AuthResult` dataclass.
  **Gate:** the ABC is defined; the registry iterates connectors uniformly.
- **C3 — Refactor Microsoft onto the ABC.** `MicrosoftConnector(ProviderConnector)` using `_oauth.py`. **Freeze behavior with tests FIRST** (capture current MS connect + CRUD behavior), then refactor — this is the highest-regression-risk task, do not break working sync.
  **Gate:** MS behavior identical before/after (same tests pass). Live MS CRUD still works.
- **C4 — Generalize propagation fan-out.** `calendar_service.py:_run_propagation()` iterates all **connected** connectors instead of hardcoding Microsoft. Outbox job `targets` expands from `["microsoft"]` to the connected provider list.
  **Gate:** a Nexus event propagates to every connected provider; with only MS connected, behavior is unchanged.
- **C5 — Google connector.** `service/connectors/google.py` → `GoogleConnector(ProviderConnector)` off `_oauth.py`. Calendar scope `calendar.events`; Keychain `com.nexuslink.app.google`; endpoints `https://www.googleapis.com/calendar/v3/calendars/primary/events` (+ `freeBusy`, `syncToken`). **#1 gotcha: Google all-day events are exclusive-end** — a 1-day all-day event on July 2 is `start.date=2026-07-02`, `end.date=2026-07-03`. Handle in the event-body mapper. **#2: refresh token** only returns on first consent — send `access_type=offline` + `prompt=consent`.
  **Gate:** unit-mapped canonical↔Google event round-trips correctly, incl. all-day.
- **C6 — Google config + routes + UI.** Add `google_client_id` to `service/config.json` + a Settings UI field (parallel to the Microsoft one). Generalize `/api/connect/microsoft/*` → `/api/connect/{provider}/*` in `server.py`. Add a Google tile to the Connections panel.
  **Gate:** `/api/connect/google/start` returns an auth URL; the Connections panel shows a Google tile.
- **C7 — Capability-adapter stubs.** Register mail/contacts/files/messaging capability slots (empty adapters) so later modules discover them on the already-connected account. Keep them honestly `state="review"`/"coming", not fake-live.
  **Gate:** the registry lists the future capabilities without pretending they work.
- **C8 — Owner console setup (Google).** The owner (or a supervised Comet/computer-use browser session) performs the 5-step Google Cloud Console setup — see the dossier §4.2: create project → OAuth consent screen **External + Testing** (owner as test user, no verification) → enable Calendar API → **Desktop** OAuth client id → paste into Nexus. Then live-connect.
  **Gate:** Google shows connected; Keychain has `com.nexuslink.app.google` tokens.
- **C9 — Meta (deferred, zero calendar code).** Meta has **no calendar API** — it is a messaging/social connector for the Communication/Inbox module. Start the Meta **Business App + Business Verification** track (2–10 days verify, App Review 2–6 weeks) so the Inbox module isn't blocked. Keep the `stubs.py` Meta entry as `state="review"`; do **not** wire it into calendar propagation.

### Verification (Workstream C)

```bash
cd 03_NEXUS-LINK/nexus-app/service && python3 -m py_compile connectors/*.py
curl -s http://127.0.0.1:8787/api/connectors                 # registry lists MS(connected) + Google + stubs
curl -s http://127.0.0.1:8787/api/connect/google/start       # returns an auth URL once client_id set
# after C8: create an event in Nexus → verify it lands in BOTH Microsoft and Google calendars
```

---

## 4. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D-CANONICAL | Nexus owns calendar truth; write Nexus → outbox → propagate. UI reads only Nexus REST, never merges live provider feeds. | Mike model (Phase 0, verified). |
| D-INBOUND | Inbound provider edits → auto-update Nexus (delta poll, A7). | Locked §9(c). |
| D-APPLE | Apple = server-side CalDAV, on the same `ProviderConnector` rail. | Owner decision. Deferred. |
| D-META | Meta = messaging/social connector (WhatsApp/IG/FB), **not** calendar. | No Meta calendar API exists (two independent research lanes). |
| D-RAIL | Connections is a platform subsystem (auth core + per-capability adapters), consumed by all modules, not calendar-scoped. | Owner correction 2026-07-03. |

## 5. Open decisions (owner to confirm — recommended defaults in bold)

- **D-AVAIL — availability scope for Wave 1:** one business schedule **(recommended)** vs per-assignee schedules. Per-assignee is richer (the dossier designed it) but needs teammates' calendars connected — none are yet. The schema leaves room to upgrade. Start with one schedule using the existing `work_start/work_end`.
- **D-RR — round-robin on create:** build the resolution engine now with **fixed-assignee default (recommended)**; activate the round-robin/load rule after the Mike product call (config flip, not rebuild).
- **D-TZ — timezone:** `DEFAULT_SETTINGS.timezone` is `"Europe/Vienna"`; the owner operates in **Zurich**. Both are UTC+1/CET so slot math is identical, but **set it to `Europe/Zurich`** for correctness/clarity unless the owner says otherwise.
- **D-GOOGLE-SETUP — console session:** do the Google Cloud Console setup during Wave 2 with the owner present (Comet/computer-use or manual). It creates an OAuth app in the owner's Google account — owner-present is the right posture. ~10 min.

---

## 6. Build order & gates (summary)

1. **Wave 1** — Workstream A P0/P1 (sync you can trust) + Workstream B (availability you can see). Gate: Phase-0 baselines green (disconnected smoke, live MS CRUD 13/13) + new negative tests + owner clicks through the UI.
2. **Wave 2** — Workstream C auth core + `ProviderConnector` + MS refactor (behavior-frozen) + Google connector live (owner console session) + capability-adapter stubs + Meta verification kickoff. Gate: Google CRUD live + availability includes Google busy + MS unchanged.
3. **Wave 3** — Inbound delta sync (A7) both providers + `POST /api/public/book/:slug` (Buchungslink goes real) + round-robin engine (post-Mike). Gate: edit in Outlook/Google → shows in Nexus → availability count changes.

## 7. Footguns

- **Stale server** — if `/api/calendar/*` 404s but `/api/connect/microsoft/status` works, an old `server.py` process is running without the new routes. Kill it and reboot from the current tree. Add a health/route check to every gate.
- **Duplicate servers** — Phase 0 saw `:8787` + `:8788` at once. Ensure only one is running.
- **Refactor regression** — C3 (MS onto the ABC) is the highest risk; freeze behavior with tests before refactoring.
- **Google docs URL rot** — the dossier flagged 2 dead Google doc links; re-verify API details against live docs before implementing C5, don't trust from memory.
- **Don't leak secrets** — redact client ids / tenant / Graph ids / tokens in any report; never commit `config.json` or Keychain contents.

---

**Everything the fleet already produced is on disk for you:** the three `tasks/*-glm.md` dossiers (spec-of-record for A/B/C), plus the Phase-0 handoff + calendar index in `docs/`. Start with Wave 1, Workstream A.
