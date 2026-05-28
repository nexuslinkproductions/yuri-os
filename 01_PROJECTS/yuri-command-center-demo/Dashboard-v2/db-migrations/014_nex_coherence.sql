-- 014_nex_coherence.sql
-- Phase 1.4 / δ2 — coherence pre-send hold.
--
-- Mirror of the migration applied via mcp__supabase__apply_migration name
-- 'nex_coherence_holds' (version 20260510...). Same pattern as the drift
-- detection foundation (012) but for the OUTPUT register: every NEX-bound
-- message is scored against ~50 known-good outputs. Anomalous messages
-- are HELD in nex_coherence_holds and the daemon Telegrams the CEO with
-- inline buttons [ship / edit / kill].
--
-- Adaptive threshold: each baseline row stores corpus stats (mean,
-- stddev). Threshold = mean + 2σ on calibration so ~95% of in-distribution
-- outputs pass cleanly. Stored alongside the centroid so a corpus swap
-- re-derives.

create extension if not exists vector;

-- ── nex_coherence_baseline ────────────────────────────────────────────
create table if not exists public.nex_coherence_baseline (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),
  version         integer     not null,
  source_count    integer     not null,
  centroid        vector(384) not null,
  mean_distance   double precision not null,
  stddev_distance double precision not null,
  threshold       double precision not null,
  description     text,
  active          boolean     not null default false
);

create unique index if not exists nex_coherence_baseline_one_active
  on public.nex_coherence_baseline (active) where (active = true);

create index if not exists nex_coherence_baseline_version_idx
  on public.nex_coherence_baseline (version desc);

alter table public.nex_coherence_baseline enable row level security;

drop policy if exists nex_coherence_baseline_service_only on public.nex_coherence_baseline;
create policy nex_coherence_baseline_service_only
  on public.nex_coherence_baseline
  for all
  to service_role
  using (true) with check (true);

-- ── nex_coherence_holds ───────────────────────────────────────────────
create table if not exists public.nex_coherence_holds (
  id                bigserial primary key,
  occurred_at       timestamptz not null default now(),
  baseline_version  integer,
  text              text not null,
  text_hash         text,
  distance          double precision,
  anomaly_score     double precision,
  stability_score   double precision,
  threshold         double precision,
  warnings          jsonb default '[]'::jsonb,
  decision          text not null default 'pending'
                    check (decision in ('pending','shipped','edited','killed','expired')),
  decision_at       timestamptz,
  decision_by       text,
  decision_text     text,
  caller            text,
  client_code       text,
  metadata          jsonb default '{}'::jsonb
);

create index if not exists nex_coherence_holds_occurred_idx
  on public.nex_coherence_holds (occurred_at desc);

create index if not exists nex_coherence_holds_pending_idx
  on public.nex_coherence_holds (occurred_at desc) where (decision = 'pending');

create index if not exists nex_coherence_holds_caller_idx
  on public.nex_coherence_holds (caller, occurred_at desc);

alter table public.nex_coherence_holds enable row level security;

drop policy if exists nex_coherence_holds_service_only on public.nex_coherence_holds;
create policy nex_coherence_holds_service_only
  on public.nex_coherence_holds
  for all
  to service_role
  using (true) with check (true);

-- ── nex_coherence_active_baseline RPC ─────────────────────────────────
create or replace function public.nex_coherence_active_baseline()
returns table (
  id              bigint,
  version         integer,
  centroid        vector(384),
  source_count    integer,
  mean_distance   double precision,
  stddev_distance double precision,
  threshold       double precision,
  description     text
)
language sql
security definer
set search_path = public
as $$
  select id, version, centroid, source_count, mean_distance, stddev_distance, threshold, description
  from public.nex_coherence_baseline
  where active = true
  limit 1;
$$;

revoke all on function public.nex_coherence_active_baseline() from public;
grant execute on function public.nex_coherence_active_baseline() to service_role;
