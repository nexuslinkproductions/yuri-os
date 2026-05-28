-- 025_nex_canonical_store_summary.sql
-- Phase C — single-row KPI summary + top predicates + cold facts views
-- consumed by /intel/retrieval master pane.
--
-- Mirror of the migration applied via mcp__supabase__apply_migration
-- name 'nex_canonical_store_summary'.

create or replace view public.nex_canonical_store_summary
with (security_invoker = true)
as
  with base as (
    select id, subject_type, subject_id, predicate, actor, last_verified_at
    from public.facts
    where retracted is not true and superseded_by is null
  ),
  freshness as (
    select count(*) filter (where last_verified_at >= now() - interval '30 days') as fresh,
           count(*) filter (where last_verified_at <  now() - interval '30 days'
                              and last_verified_at >= now() - interval '90 days') as aging,
           count(*) filter (where last_verified_at <  now() - interval '90 days') as stale,
           count(*) filter (where last_verified_at is null) as unknown
    from base
  ),
  by_source as (
    select count(*) filter (where actor = 'CEO:vault-frontmatter') as from_vault,
           count(*) filter (where actor = 'CEO')                   as from_chat,
           count(*) filter (where actor not in ('CEO', 'CEO:vault-frontmatter')
                              and actor not like 'CEO:%')          as from_other
    from base
  ),
  suspects as (
    select count(*) filter (where status = 'open') as open,
           count(*) filter (where status = 'open'
                              and detected_at >= now() - interval '7 days') as new_this_week
    from public.nex_canonical_suspect
  )
  select
    (select count(*) from base)                          as total_active,
    (select count(distinct subject_id) from base)         as distinct_subjects,
    (select count(distinct predicate) from base)          as distinct_predicates,
    f.fresh, f.aging, f.stale, f.unknown,
    s.from_vault, s.from_chat, s.from_other,
    sus.open as suspects_open, sus.new_this_week as suspects_new
  from freshness f, by_source s, suspects sus;

create or replace view public.nex_canonical_top_predicates
with (security_invoker = true)
as
  select predicate, count(*) as cnt
  from public.facts
  where retracted is not true and superseded_by is null
  group by predicate
  order by count(*) desc, predicate
  limit 12;

create or replace view public.nex_canonical_cold_facts
with (security_invoker = true)
as
  select
    f.id, f.subject_type, f.subject_id, f.predicate, f.value, f.actor,
    f.last_verified_at, f.recorded_at,
    extract(epoch from (now() - f.last_verified_at)) / 86400.0 as age_days
  from public.facts f
  where f.retracted is not true
    and f.superseded_by is null
    and (
      f.last_verified_at is null
      or f.last_verified_at <= f.recorded_at + interval '5 minutes'
    )
  order by f.recorded_at asc
  limit 15;
