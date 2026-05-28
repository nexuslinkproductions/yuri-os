-- ══════════════════════════════════════════════════════════════════
-- 005_n1_rls_lockdown.sql                                Phase N1
--
-- Closes the anon-key data leak found by the 2026-04-28 audit.
--
-- Audit (curl ${SUPA_URL}/rest/v1/<x> with anon key):
--   200  facts                       table   ← LEAK
--   200  facts_current                view    ← LEAK (inherits from facts)
--   200  fact_contradictions_recent  view    ← LEAK (likely)
--   200  exeo_decisions              table   ← LEAK
--   200  exeo_decisions_rollup       view    ← LEAK
--   200  exeo_night_mode             table   ← LEAK
--   200  agent_cooldowns             table   ← LEAK
--   200  exeo_reasoning_graph_live   view    ← LEAK
--
-- Browser actually queries (verified via grep '\\.from(' in src/):
--   audit_log, entity_state, meetings, scheduled_blocks,
--   commitments, exeo_reasoning_edges, exeo_thoughts
--
-- Strategy:
--   • Tables    → ENABLE ROW LEVEL SECURITY + deny-all policy.
--   • Views     → cannot RLS directly (PG raises 42809). Instead
--                 REVOKE SELECT from anon/authenticated; views also
--                 inherit RLS from underlying tables, but that only
--                 helps if the view was created with security_invoker
--                 (migration 2026-04-24 took care of that). Belt +
--                 suspenders: revoke the GRANT.
--   • Browser-required tables → keep anon SELECT, deny anon write.
--
-- This migration is IDEMPOTENT — re-running is safe.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Service-key-only TABLES ────────────────────────────────────
do $$
declare
  t       text;
  rk      char;
begin
  foreach t in array array[
    'facts',
    'fact_contradictions_recent',
    'exeo_decisions',
    'exeo_night_mode',
    'agent_cooldowns'
  ] loop
    -- relkind: r = ordinary table, p = partitioned, f = foreign
    select c.relkind into rk
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = t;

    if rk is null then
      raise notice 'skip: % does not exist', t;
      continue;
    end if;

    if rk in ('r','p','f') then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop   policy if exists "deny_anon_%I" on public.%I', t, t);
      execute format(
        'create policy "deny_anon_%I" on public.%I for all to anon, authenticated using (false) with check (false)',
        t, t
      );
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('grant  all on public.%I to service_role', t);
      raise notice 'locked table: %', t;
    else
      raise notice 'skip non-table % (relkind=%)', t, rk;
    end if;
  end loop;
end $$;

-- ── 2. Service-key-only VIEWS / MATVIEWS ─────────────────────────
-- Views cannot have RLS enabled, but we revoke the GRANT so anon
-- can't SELECT from them at all. Underlying tables are already
-- locked above (or by migration 003).
do $$
declare
  v   text;
  rk  char;
begin
  foreach v in array array[
    'facts_current',
    'fact_contradictions_recent',  -- might be view OR table; we handle both
    'exeo_decisions_rollup',
    'exeo_reasoning_graph_live'
  ] loop
    select c.relkind into rk
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = v;

    if rk is null then
      raise notice 'skip: view % does not exist', v;
      continue;
    end if;

    if rk in ('v','m') then
      execute format('revoke all on public.%I from anon, authenticated', v);
      execute format('grant  all on public.%I to service_role', v);
      raise notice 'locked view: %', v;
    elsif rk in ('r','p','f') then
      -- Surprise — was a table. Apply RLS instead.
      execute format('alter table public.%I enable row level security', v);
      execute format('drop   policy if exists "deny_anon_%I" on public.%I', v, v);
      execute format(
        'create policy "deny_anon_%I" on public.%I for all to anon, authenticated using (false) with check (false)',
        v, v
      );
      execute format('revoke all on public.%I from anon, authenticated', v);
      execute format('grant  all on public.%I to service_role', v);
      raise notice 'locked table (was expected view): %', v;
    else
      raise notice 'skip unknown relkind for % (%)', v, rk;
    end if;
  end loop;
end $$;

-- ── 3. Read-only-for-anon on browser-required tables ─────────────
-- (Already RLS-enabled by migration 003 for some — adding per-op
-- policies that allow SELECT only. Inserts/updates/deletes go via
-- Netlify functions using the service key.)

-- 3a. commitments ─────────────────────────────────────────────────
alter table public.commitments enable row level security;

drop policy if exists "anon_select_commitments"        on public.commitments;
drop policy if exists "deny_anon_write_commitments"    on public.commitments;
drop policy if exists "deny_anon_update_commitments"   on public.commitments;
drop policy if exists "deny_anon_delete_commitments"   on public.commitments;

create policy "anon_select_commitments"      on public.commitments
  for select to anon, authenticated using (true);
create policy "deny_anon_write_commitments"  on public.commitments
  for insert to anon, authenticated with check (false);
create policy "deny_anon_update_commitments" on public.commitments
  for update to anon, authenticated using (false) with check (false);
create policy "deny_anon_delete_commitments" on public.commitments
  for delete to anon, authenticated using (false);

revoke insert, update, delete on public.commitments from anon, authenticated;
grant  select                  on public.commitments to anon, authenticated;
grant  all                     on public.commitments to service_role;

-- 3b. exeo_thoughts ───────────────────────────────────────────────
alter table public.exeo_thoughts enable row level security;

drop policy if exists "anon_select_exeo_thoughts"      on public.exeo_thoughts;
drop policy if exists "deny_anon_write_exeo_thoughts"  on public.exeo_thoughts;
drop policy if exists "deny_anon_update_exeo_thoughts" on public.exeo_thoughts;
drop policy if exists "deny_anon_delete_exeo_thoughts" on public.exeo_thoughts;

create policy "anon_select_exeo_thoughts"      on public.exeo_thoughts
  for select to anon, authenticated using (true);
create policy "deny_anon_write_exeo_thoughts"  on public.exeo_thoughts
  for insert to anon, authenticated with check (false);
create policy "deny_anon_update_exeo_thoughts" on public.exeo_thoughts
  for update to anon, authenticated using (false) with check (false);
create policy "deny_anon_delete_exeo_thoughts" on public.exeo_thoughts
  for delete to anon, authenticated using (false);

revoke insert, update, delete on public.exeo_thoughts from anon, authenticated;
grant  select                  on public.exeo_thoughts to anon, authenticated;
grant  all                     on public.exeo_thoughts to service_role;

-- 3c. exeo_reasoning_edges ────────────────────────────────────────
alter table public.exeo_reasoning_edges enable row level security;

drop policy if exists "anon_select_exeo_reasoning_edges"        on public.exeo_reasoning_edges;
drop policy if exists "deny_anon_write_exeo_reasoning_edges"    on public.exeo_reasoning_edges;
drop policy if exists "deny_anon_update_exeo_reasoning_edges"   on public.exeo_reasoning_edges;
drop policy if exists "deny_anon_delete_exeo_reasoning_edges"   on public.exeo_reasoning_edges;

create policy "anon_select_exeo_reasoning_edges"      on public.exeo_reasoning_edges
  for select to anon, authenticated using (true);
create policy "deny_anon_write_exeo_reasoning_edges"  on public.exeo_reasoning_edges
  for insert to anon, authenticated with check (false);
create policy "deny_anon_update_exeo_reasoning_edges" on public.exeo_reasoning_edges
  for update to anon, authenticated using (false) with check (false);
create policy "deny_anon_delete_exeo_reasoning_edges" on public.exeo_reasoning_edges
  for delete to anon, authenticated using (false);

revoke insert, update, delete on public.exeo_reasoning_edges from anon, authenticated;
grant  select                  on public.exeo_reasoning_edges to anon, authenticated;
grant  all                     on public.exeo_reasoning_edges to service_role;

-- ── Final state ───────────────────────────────────────────────────
-- Anon CAN read:  audit_log, entity_state, meetings, scheduled_blocks,
--                 commitments, exeo_thoughts, exeo_reasoning_edges
-- Anon CANNOT read: facts, facts_current, fact_contradictions_recent,
--                   exeo_decisions, exeo_decisions_rollup, exeo_night_mode,
--                   agent_cooldowns, exeo_reasoning_graph_live, auth_*
-- Anon CANNOT write: anything except audit_log INSERT (per migration 003)
--                    and scheduled_blocks UPDATE/DELETE (per migration 003).
