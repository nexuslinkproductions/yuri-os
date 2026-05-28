# 121 - YURI Command-Center Adapter Plan

Date: 2026-05-28  
Owner lane: Codex/C-137 integration  
Source lanes: Quantum Rick proposal, Rick Prime pressure test  
Artifact status: first technical plan for the isolated YURI demo workspace

## Current State

Claudio's command-center frontend was moved, not copied, from the disposable clone into:

`01_PROJECTS/yuri-command-center-demo/Dashboard-v2`

The disposable source clone was `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo` at HEAD `8103286e1abc63fa9490cb1375ecde4f340aa2bb`. The clone root is now absent. The moved frontend contains 333 files, and the moved tree currently has 0 hits for protected/runtime paths such as `.env`, `node_modules`, `.amp`, protected `.claude/*` runtime folders, or `backend/data/`.

This plan does not mutate Claudio's real repo, does not mutate YURI core, does not call live services, does not use credentials, and does not deploy.

## Audit Truth Used

- `Dashboard-v2` is a SvelteKit command-center frontend.
- Prior audit counted 39 `+page.svelte` routes.
- The active shell renders Sidebar, MobileBottomNav, and CommandPalette.
- Known route/navigation drift: active nav lists `/finance` and `/crm`, but those routes are dead or absent.
- Navigation sources are not synchronized, and CommandPalette is stale.
- There is no route/module manifest.
- Deployment truth drift exists: `ops-dashboard`/port 3000 versus split `nex-api`/`nex-frontend` 3001/3002.
- Function truth drift exists: `Dashboard-v2/functions` versus `netlify/functions`.
- Frontend calls to `/api/functions/*` lack a coherent physical/deploy/auth route contract.
- `src/lib/db.ts` directly couples frontend code to Supabase public env and helper calls.

## Decision

The first adapter move should be demo/stub-first, not live-provider-first.

Quantum's initial plan correctly identified the major seams, but it over-weighted wrapping the live Supabase path. Prime's correction is accepted: the YURI demo must boot with empty credentials, no live provider calls, and fixture-backed data by default. Real Supabase, Pusher, auth, and deployment-shape decisions remain future work.

## Adapter Seams

| Seam | Problem | Demo adapter goal |
| --- | --- | --- |
| Data | `src/lib/db.ts` couples callers to Supabase/env | Add a data facade that returns typed fixtures in demo mode and lazy-loads real providers only outside demo mode |
| Environment | Startup may assume provider env exists | Add an env guard so empty `.env` does not crash demo boot |
| API | Raw `/api/functions/*` calls have no deploy/auth contract | Add typed API wrappers that return fixtures in demo mode and centralize future auth headers |
| Routes | Sidebar/MobileBottomNav/CommandPalette drift | Add one route manifest and consume it from nav surfaces |
| Realtime/SLA | Pusher/realtime paths may trigger external assumptions | Add no-op realtime stubs for demo mode |
| Deployment | Port/function split is unresolved | Defer; do not change `svelte.config.js`, `netlify.toml`, or deploy docs in the first adapter packet |

## Phase Order

### Phase 0 - No-Credential Demo Boot

Goal: make the moved frontend capable of loading in YURI demo mode without real Supabase, Pusher, credentials, or live network assumptions.

Candidate file scope, all under `01_PROJECTS/yuri-command-center-demo/Dashboard-v2/`:

- Add `src/lib/adapter/env.ts` for `VITE_DEMO_MODE` and external-call guards.
- Add `src/lib/adapter/demo-fixtures.ts` for typed fixture rows used by the dashboard.
- Add `src/lib/adapter/data.ts` as the data facade.
- Add `src/lib/adapter/realtime-stub.ts` as a no-op subscribe/publish surface.
- Modify `src/lib/db.ts` only after targeted reading, with a small demo branch and lazy real-provider initialization.

Phase 0 must not touch route pages, deploy config, YURI core, or Claudio's real repo.

### Phase 1 - Route Manifest

Goal: remove navigation drift without deleting features.

Candidate file scope:

- Add `src/lib/adapter/routes.ts`.
- Update Sidebar, MobileBottomNav, and CommandPalette to consume the manifest after targeted reads identify their exact paths.
- Mark `/finance` and `/crm` as `disabled` or `future`, not deleted.

### Phase 2 - API Wrapper Layer

Goal: centralize frontend calls that currently target `/api/functions/*`.

Candidate file scope:

- Add `src/lib/adapter/api.ts`.
- In demo mode, return fixture responses.
- Outside demo mode, centralize fetch paths and future auth header handling.

No auth provider decision is required for the demo artifact.

### Phase 3 - Realtime/SLA Isolation

Goal: ensure dashboard health/realtime UI can render without external Pusher/Supabase realtime calls.

Candidate file scope:

- Route demo-mode realtime imports through `src/lib/adapter/realtime-stub.ts`.
- Do not decide whether Pusher is legacy or live in this phase.

## Deferred

- Monolith versus split deploy shape.
- `netlify.toml`, `svelte.config.js`, production ports, and deploy docs.
- Real Supabase auth versus YURI identity proxy.
- Pusher disposition or removal.
- Route deletion or resurrection for `/finance` and `/crm`.
- Any mutation outside `01_PROJECTS/yuri-command-center-demo/Dashboard-v2/`.

## Risks

- Module-init provider imports can still crash the demo before `VITE_DEMO_MODE` is checked.
- A barrel export can leak server-only or provider-only code into client bundles.
- A comment such as `// @ts-server-only` is not a SvelteKit boundary; use real import boundaries and targeted build checks.
- Hidden `goto('/finance')` or `goto('/crm')` callers may exist outside nav components.
- Raw `fetch('/api/functions/...')` calls may be scattered across route pages and components.
- Demo fixtures can rot if they do not mirror the UI's expected shapes.
- Generated build output such as `.svelte-kit/`, `dist/`, and `node_modules/` must not enter the host repo index.

## Verification Gates

For each implementation phase:

- `git status --short` shows changes only inside `01_PROJECTS/yuri-command-center-demo/Dashboard-v2/` plus approved report artifacts.
- Protected/runtime scan returns 0 hits for `.env`, `node_modules`, `.amp`, protected `.claude/*` runtime paths, and `backend/data/`.
- Static search confirms demo mode does not execute Supabase/Pusher imports at module init.
- Static search confirms direct `/api/functions/*` fetches are routed through the adapter after Phase 2.
- Static search confirms Sidebar, MobileBottomNav, and CommandPalette consume one route manifest after Phase 1.
- Empty-env demo boot is tested before claiming Phase 0 complete.
- Browser/network verification shows 0 external Supabase/Pusher calls in demo mode before claiming the demo is runnable.

## Next Bounded Packet

`QTRK_ADAPTER_PHASE0_Q2`

Scope: Phase 0 only, inside `01_PROJECTS/yuri-command-center-demo/Dashboard-v2/`.

Allowed candidate changes:

- Add `src/lib/adapter/env.ts`.
- Add `src/lib/adapter/demo-fixtures.ts`.
- Add `src/lib/adapter/data.ts`.
- Add `src/lib/adapter/realtime-stub.ts`.
- Modify `src/lib/db.ts` only after targeted read, and only enough to support a demo-mode no-credential path.

Forbidden:

- No `+page.svelte` route edits.
- No Sidebar/MobileBottomNav/CommandPalette edits yet.
- No `pusher-realtime.ts` edits unless targeted Phase 0 boot proves it is required.
- No `netlify.toml` or `svelte.config.js` edits.
- No YURI core mutation.
- No Claudio real repo mutation.
- No live service calls, credentials, or deploys.

Expected output from a worker lane: unified diff proposal plus verification log only. Codex/C-137 performs final integration and verification.

