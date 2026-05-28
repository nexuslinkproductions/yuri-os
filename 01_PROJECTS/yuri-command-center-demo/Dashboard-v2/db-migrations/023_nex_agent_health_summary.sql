-- 023_nex_agent_health_summary.sql
-- MOVE 4 Eve I — agent health rollup view.
--
-- Mirror of the migration applied via mcp__supabase__apply_migration
-- name 'nex_agent_health_summary'. Wraps public.agent_heartbeat with
-- a per-agent staleness classification so the /intel master pane
-- can show fresh/stale/dead at a glance.

create or replace view public.nex_agent_health_summary
with (security_invoker = true)
as
  with classified as (
    select
      agent_name,
      status as reported_status,
      last_action,
      last_action_at,
      heartbeat_at,
      coalesce(heartbeat_at, last_action_at) as last_seen,
      case agent_name
        when 'nex-daemon'         then 5
        when 'orchestrator'       then 15
        when 'cto'                then 1440
        when 'intel-analyst'      then 10080
        when 'night-digest'       then 1440
        when 'commitment-keeper'  then 60
        when 'ops-guardian'       then 1440
        when 'designer'           then 1440
        when 'sales-coach'        then 1440
        when 'self-healer'        then 1440
        else 1440
      end as expected_cadence_minutes,
      confidence
    from public.agent_heartbeat
  )
  select
    agent_name,
    reported_status,
    last_action,
    last_seen,
    expected_cadence_minutes,
    extract(epoch from (now() - last_seen)) / 60.0 as minutes_since_seen,
    case
      when last_seen is null then 'unknown'
      when extract(epoch from (now() - last_seen)) / 60.0 <= expected_cadence_minutes * 2 then 'fresh'
      when extract(epoch from (now() - last_seen)) / 60.0 <= expected_cadence_minutes * 24 then 'stale'
      else 'dead'
    end as health_status,
    confidence
  from classified
  order by
    case when last_seen is null then 1
         when extract(epoch from (now() - last_seen)) / 60.0 > expected_cadence_minutes * 24 then 0
         when extract(epoch from (now() - last_seen)) / 60.0 > expected_cadence_minutes * 2 then 2
         else 3
    end,
    last_seen desc nulls last;

comment on view public.nex_agent_health_summary is
  'MOVE 4 Eve I: agent_heartbeat with per-agent staleness classification (fresh / stale / dead / unknown). Dashboard /intel master pane reads this.';
