-- 012_nex_drift_detection.sql
-- Workstream G v2 / Phase 1.3 δ1: semantic drift detection.
--
-- Replaces the regex-based German-marker check in shared-telegram.js with a
-- proper calibrated cosine-distance baseline. The CEO's English-register
-- chat is calibrated as a centroid; every NEX-bound or CEO-bound text is
-- evaluated for distance, velocity (Δ vs previous), and acceleration (Δ
-- velocity), then classified as stable | drifting | accelerating |
-- recovering.
--
-- Applied via mcp__supabase__apply_migration (name: nex_drift_detection,
-- version 20260510175541). This file mirrors that change for repo record.
--
-- Tables:
--   nex_drift_baseline  — centroid storage with version + active flag
--   nex_drift_log       — per-evaluation history
-- RPC:
--   nex_drift_active_baseline()  — efficient single-row active fetch
--
-- RLS: service-role only (same pattern as 005_n1_rls_lockdown.sql).

create extension if not exists vector;

-- ── nex_drift_baseline ────────────────────────────────────────────────
create table if not exists public.nex_drift_baseline (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  version       integer     not null,
  source_count  integer     not null,
  centroid      vector(384) not null,
  description   text,
  active        boolean     not null default false
);

create unique index if not exists nex_drift_baseline_one_active
  on public.nex_drift_baseline (active) where (active = true);

create index if not exists nex_drift_baseline_version_idx
  on public.nex_drift_baseline (version desc);

alter table public.nex_drift_baseline enable row level security;

drop policy if exists nex_drift_baseline_service_only on public.nex_drift_baseline;
create policy nex_drift_baseline_service_only
  on public.nex_drift_baseline
  for all
  to service_role
  using (true) with check (true);

-- ── nex_drift_log ─────────────────────────────────────────────────────
create table if not exists public.nex_drift_log (
  id                bigserial primary key,
  occurred_at       timestamptz not null default now(),
  baseline_version  integer,
  text_excerpt      text,
  text_hash         text,
  distance          double precision,
  velocity          double precision,
  acceleration      double precision,
  trend             text not null check (trend in ('stable','drifting','accelerating','recovering')),
  should_escalate   boolean not null default false,
  caller            text,
  client_code       text,
  meta              jsonb default '{}'::jsonb
);

create index if not exists nex_drift_log_occurred_idx
  on public.nex_drift_log (occurred_at desc);

create index if not exists nex_drift_log_trend_idx
  on public.nex_drift_log (trend, occurred_at desc) where (trend <> 'stable');

create index if not exists nex_drift_log_caller_idx
  on public.nex_drift_log (caller, occurred_at desc);

alter table public.nex_drift_log enable row level security;

drop policy if exists nex_drift_log_service_only on public.nex_drift_log;
create policy nex_drift_log_service_only
  on public.nex_drift_log
  for all
  to service_role
  using (true) with check (true);

-- ── nex_drift_active_baseline RPC ─────────────────────────────────────
-- Single-row active baseline fetch, used by the RVF service every 60 s
-- (cached in-process between calls).
create or replace function public.nex_drift_active_baseline()
returns table (
  id           bigint,
  version      integer,
  centroid     vector(384),
  source_count integer,
  description  text
)
language sql
security definer
set search_path = public
as $$
  select id, version, centroid, source_count, description
  from public.nex_drift_baseline
  where active = true
  limit 1;
$$;

revoke all on function public.nex_drift_active_baseline() from public;
grant execute on function public.nex_drift_active_baseline() to service_role;
