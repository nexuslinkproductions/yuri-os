-- 024_nex_canonical_freshness.sql
-- Phase B of the canonical transparency plan — freshness column +
-- views + suspect table + bump RPC + weekly health view.
--
-- Mirror of the two applied migrations:
--   nex_canonical_freshness (B1 + B2 + B3 core)
--   nex_weekly_freshness_for_review (B weekly rollup)

-- ── B1: last_verified_at on facts ─────────────────────────────────
alter table public.facts
  add column if not exists last_verified_at timestamptz;

update public.facts
   set last_verified_at = greatest(coalesce(observed_at, recorded_at), recorded_at)
 where last_verified_at is null
   and retracted is not true
   and superseded_by is null;

create index if not exists facts_last_verified_idx
  on public.facts (last_verified_at desc nulls last);

-- ── B2: per-fact freshness view ───────────────────────────────────
create or replace view public.nex_canonical_freshness
with (security_invoker = true)
as
  select
    id, subject_type, subject_id, predicate, value, actor, source_ref,
    last_verified_at, recorded_at, observed_at,
    case
      when last_verified_at is null then 'unknown'
      when last_verified_at >= now() - interval '30 days' then 'fresh'
      when last_verified_at >= now() - interval '90 days' then 'aging'
      else 'stale'
    end as freshness,
    extract(epoch from (now() - coalesce(last_verified_at, recorded_at))) / 86400.0 as age_days
  from public.facts
  where retracted is not true
    and superseded_by is null;

-- ── B2 rollup ─────────────────────────────────────────────────────
create or replace view public.nex_canonical_freshness_summary
with (security_invoker = true)
as
  select
    freshness,
    count(*) as cnt,
    round(avg(age_days)::numeric, 1) as avg_age_days,
    min(age_days) as min_age_days,
    max(age_days) as max_age_days
  from public.nex_canonical_freshness
  group by freshness
  order by case freshness
    when 'fresh'   then 1
    when 'aging'   then 2
    when 'stale'   then 3
    when 'unknown' then 4
  end;

-- ── B3: suspect table ─────────────────────────────────────────────
create table if not exists public.nex_canonical_suspect (
  id              bigserial primary key,
  detected_at     timestamptz not null default now(),
  fact_id         uuid references public.facts(id),
  subject_type    text,
  subject_id      text,
  predicate       text,
  canonical_value jsonb,
  vault_value     jsonb,
  source_ref      text,
  status          text not null default 'open'
                  check (status in ('open','resolved','dismissed')),
  resolved_at     timestamptz,
  resolved_by     text,
  resolution      text check (resolution in ('canonical_kept','vault_kept','value_changed','out_of_scope')),
  notes           text
);

create unique index if not exists nex_canonical_suspect_open_idx
  on public.nex_canonical_suspect (fact_id) where (status = 'open');

create index if not exists nex_canonical_suspect_detected_idx
  on public.nex_canonical_suspect (detected_at desc);

alter table public.nex_canonical_suspect enable row level security;

drop policy if exists nex_canonical_suspect_service_only on public.nex_canonical_suspect;
create policy nex_canonical_suspect_service_only
  on public.nex_canonical_suspect for all to service_role
  using (true) with check (true);

-- ── RPC: bump_last_verified ───────────────────────────────────────
create or replace function public.bump_last_verified(p_fact_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.facts set last_verified_at = now() where id = p_fact_id;
$$;

revoke all on function public.bump_last_verified(uuid) from public;
grant execute on function public.bump_last_verified(uuid) to service_role;

-- ── Weekly health one-row summary ─────────────────────────────────
create or replace view public.nex_weekly_canonical_health
with (security_invoker = true)
as
  select
    (select count(*) from public.facts
       where retracted is not true and superseded_by is null) as total_active,
    (select count(*) from public.nex_canonical_freshness where freshness = 'fresh') as fresh,
    (select count(*) from public.nex_canonical_freshness where freshness = 'aging') as aging,
    (select count(*) from public.nex_canonical_freshness where freshness = 'stale') as stale,
    (select count(*) from public.nex_canonical_freshness where freshness = 'unknown') as unknown,
    (select count(*) from public.nex_canonical_suspect where status = 'open') as suspects_open,
    (select count(*) from public.nex_canonical_suspect
       where status = 'open' and detected_at >= now() - interval '7 days') as suspects_new_this_week;
