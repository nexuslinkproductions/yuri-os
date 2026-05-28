-- 020_nex_decisions_yesterday_rollup.sql
-- MOVE 2 Eve D — morning-brief "Yesterday's NEX" feed.
--
-- Two views consumed by the night-digest agent (.claude/agents/night-digest.md)
-- to render the radical-honesty per-agent rollup section.
--
-- Mirror of the migration applied via mcp__supabase__apply_migration
-- name 'nex_decisions_yesterday_rollup'. Security-invoker so RLS still
-- guards the underlying decisions table.

create or replace view public.nex_decisions_yesterday_rollup
with (security_invoker = true)
as
  select
    recommended_by,
    outcome,
    count(*) as decision_count,
    round(avg(confidence_post)::numeric, 2) as avg_confidence
  from public.decisions
  where outcome is not null
    and outcome_observed_at >= (now() at time zone 'Europe/Zurich' - interval '24 hours')
  group by recommended_by, outcome
  order by recommended_by, outcome;

comment on view public.nex_decisions_yesterday_rollup is
  'MOVE 2 Eve D: per-agent / per-outcome rollup of reconciled decisions in the last 24h. Consumed by night-digest agent.';

create or replace view public.nex_decisions_yesterday_highlights
with (security_invoker = true)
as
  select
    id, recommended_by, outcome, confidence_post,
    target_entity_id, client_code, recommendation,
    decided_at, outcome_observed_at
  from public.decisions
  where outcome is not null
    and outcome_observed_at >= (now() at time zone 'Europe/Zurich' - interval '24 hours')
    and outcome in ('won', 'no_action', 'missed')
  order by
    case outcome
      when 'won' then 1
      when 'missed' then 2
      when 'no_action' then 3
      else 4
    end,
    confidence_post desc nulls last,
    decided_at desc
  limit 20;

comment on view public.nex_decisions_yesterday_highlights is
  'MOVE 2 Eve D: top 20 highlighted decisions (won / no_action / missed) reconciled in the last 24h. Used by night-digest to pick 1-2 concrete examples for the morning brief.';
