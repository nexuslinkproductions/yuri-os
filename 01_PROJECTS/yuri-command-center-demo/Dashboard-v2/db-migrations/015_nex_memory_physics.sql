-- 015_nex_memory_physics.sql
-- Phase 1.5 / δ3 — memory physics.
--
-- Mirror of the migrations applied via mcp__supabase__apply_migration:
--   - 'nex_memory_physics' (initial)
--   - 'nex_memory_physics_fix_resolve' (RPC RETURNING bug fix)
--
-- Reuses the existing public.facts table and adds:
--   - nex_memory_open_conflicts VIEW: unresolved triple conflicts.
--   - mark_contradicts() RPC: link new fact to old one via contradicts col.
--   - resolve_conflict_supersede() RPC: CEO picks winner, others get
--     superseded_by = winner_id.

-- ── nex_memory_open_conflicts view ────────────────────────────────────
create or replace view public.nex_memory_open_conflicts
with (security_invoker = true)
as
  with triple_counts as (
    select subject_type, subject_id, predicate, count(*) as live_count
    from public.facts
    where retracted is not true
      and superseded_by is null
    group by 1, 2, 3
    having count(*) > 1
  )
  select
    f.id,
    f.subject_type,
    f.subject_id,
    f.predicate,
    f.value,
    f.actor,
    f.confidence,
    f.source,
    f.source_ref,
    f.recorded_at,
    f.observed_at,
    tc.live_count
  from public.facts f
  join triple_counts tc using (subject_type, subject_id, predicate)
  where f.retracted is not true
    and f.superseded_by is null
  order by f.subject_type, f.subject_id, f.predicate, f.confidence desc, f.observed_at desc;

comment on view public.nex_memory_open_conflicts is
  'Phase 1.5 δ3: triples in public.facts with ≥2 live (non-retracted, non-superseded) rows. CEO needs to bless one or retract others.';

-- ── mark_contradicts RPC ──────────────────────────────────────────────
create or replace function public.mark_contradicts(
  p_new_id uuid,
  p_old_id uuid,
  p_actor  text default 'system'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.facts
  set contradicts = p_old_id
  where id = p_new_id;
end;
$$;

revoke all on function public.mark_contradicts(uuid, uuid, text) from public;
grant execute on function public.mark_contradicts(uuid, uuid, text) to service_role;

-- ── resolve_conflict_supersede RPC ────────────────────────────────────
-- IMPORTANT: do NOT use `RETURNING ... INTO` here — it errors on
-- multi-row updates. Use `GET DIAGNOSTICS row_count` instead.
create or replace function public.resolve_conflict_supersede(
  p_winner_id uuid,
  p_resolved_by text default 'CEO'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subject_type text;
  v_subject_id   text;
  v_predicate    text;
  v_count        int;
begin
  select subject_type, subject_id, predicate
    into v_subject_type, v_subject_id, v_predicate
    from public.facts
   where id = p_winner_id;

  if v_subject_type is null then
    raise exception 'fact % not found', p_winner_id;
  end if;

  update public.facts
  set
    superseded_by = p_winner_id,
    superseded_at = now()
  where subject_type = v_subject_type
    and subject_id   = v_subject_id
    and predicate    = v_predicate
    and id          != p_winner_id
    and retracted   is not true
    and superseded_by is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.resolve_conflict_supersede(uuid, text) from public;
grant execute on function public.resolve_conflict_supersede(uuid, text) to service_role;
