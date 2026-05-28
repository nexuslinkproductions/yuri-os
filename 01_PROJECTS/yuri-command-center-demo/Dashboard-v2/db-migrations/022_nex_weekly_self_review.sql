-- 022_nex_weekly_self_review.sql
-- MOVE 3 Eve F — four views consumed by intel-analyst (Sunday 19:00 CEST)
-- to compose the radical-honesty weekly self-review Telegram.
--
-- Mirror of the migration applied via mcp__supabase__apply_migration
-- name 'nex_weekly_self_review'.

-- ── nex_weekly_self_review_rollup ───────────────────────────────────
create or replace view public.nex_weekly_self_review_rollup
with (security_invoker = true)
as
  with by_agent as (
    select
      recommended_by,
      count(*) as total,
      count(*) filter (where outcome = 'won')        as won,
      count(*) filter (where outcome = 'actioned')   as actioned,
      count(*) filter (where outcome = 'no_action')  as no_action,
      count(*) filter (where outcome = 'missed')     as missed,
      count(*) filter (where outcome = 'cancelled')  as cancelled,
      count(*) filter (where outcome = 'progressed') as progressed,
      count(*) filter (where outcome = 'unknown')    as unknown
    from public.decisions
    where outcome is not null
      and outcome_observed_at >= (now() at time zone 'Europe/Zurich' - interval '7 days')
    group by recommended_by
  )
  select
    recommended_by,
    total,
    won, actioned, no_action, missed, cancelled, progressed, unknown,
    round((no_action + missed)::numeric / nullif(total, 0), 2) as noise_rate,
    round((won + actioned)::numeric    / nullif(total, 0), 2) as land_rate
  from by_agent
  order by total desc;

comment on view public.nex_weekly_self_review_rollup is
  'MOVE 3 Eve F: per-agent decision outcomes for the last 7 days with noise_rate (no_action+missed / total) and land_rate (won+actioned / total). Consumed by intel-analyst weekly.';

-- ── nex_weekly_self_review_examples ─────────────────────────────────
create or replace view public.nex_weekly_self_review_examples
with (security_invoker = true)
as
  with ranked as (
    select
      id, recommended_by, outcome, confidence_post,
      target_entity_id, client_code, recommendation,
      decided_at,
      row_number() over (partition by outcome order by confidence_post desc nulls last, decided_at desc) as rank_in_outcome
    from public.decisions
    where outcome is not null
      and outcome_observed_at >= (now() at time zone 'Europe/Zurich' - interval '7 days')
      and outcome in ('won', 'no_action', 'missed')
  )
  select * from ranked where rank_in_outcome <= 3
  order by
    case outcome when 'won' then 1 when 'missed' then 2 when 'no_action' then 3 else 4 end,
    rank_in_outcome;

comment on view public.nex_weekly_self_review_examples is
  'MOVE 3 Eve F: top 3 wins + top 3 misses (by confidence) from last 7 days. Consumed by intel-analyst to cite concrete examples.';

-- ── nex_weekly_gap_stats ────────────────────────────────────────────
create or replace view public.nex_weekly_gap_stats
with (security_invoker = true)
as
  select
    count(*) filter (where detected_at >= (now() at time zone 'Europe/Zurich' - interval '7 days'))   as detected_this_week,
    count(*) filter (where resolved_at >= (now() at time zone 'Europe/Zurich' - interval '7 days'))   as resolved_this_week,
    count(*) filter (where surfaced_at >= (now() at time zone 'Europe/Zurich' - interval '7 days'))   as surfaced_this_week,
    count(*) filter (where status = 'open')                                                            as still_open,
    count(*) filter (where status = 'snoozed')                                                         as snoozed,
    count(*) filter (where surfaced_at < (now() - interval '3 days') and status = 'open')             as stale_surfaced
  from public.nex_knowledge_gaps;

comment on view public.nex_weekly_gap_stats is
  'MOVE 3 Eve F: weekly Loop B stats (gaps detected / surfaced / resolved / still open / stale). Surfaces gaps that have been re-asked >3 days unresolved.';

-- ── nex_weekly_commitment_fidelity ──────────────────────────────────
create or replace view public.nex_weekly_commitment_fidelity
with (security_invoker = true)
as
  select
    count(*) filter (where due_at >= (now() at time zone 'Europe/Zurich' - interval '7 days') and due_at < (now() at time zone 'Europe/Zurich')) as due_this_week,
    count(*) filter (
      where due_at >= (now() at time zone 'Europe/Zurich' - interval '7 days')
        and due_at < (now() at time zone 'Europe/Zurich')
        and status in ('closed','kept','done')
        and (closed_at is null or closed_at <= due_at)
    ) as kept_on_time,
    count(*) filter (
      where due_at >= (now() at time zone 'Europe/Zurich' - interval '7 days')
        and due_at < (now() at time zone 'Europe/Zurich')
        and status in ('open','pending')
    ) as missed_or_open
  from public.commitments;

comment on view public.nex_weekly_commitment_fidelity is
  'MOVE 3 Eve F: commitment fidelity in the last 7 days. due_this_week / kept_on_time / missed_or_open.';
