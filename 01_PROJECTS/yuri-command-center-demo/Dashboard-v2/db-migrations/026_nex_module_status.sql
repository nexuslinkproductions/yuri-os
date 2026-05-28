-- 026_nex_module_status.sql
-- Phase D — 12-module live transparency table.
-- Mirror of the migration applied via mcp__supabase__apply_migration
-- name 'nex_module_status'. Refreshed every 15 min by
-- Scripts/nex-rvf/refresh-module-status.js. Consumed by /intel/retrieval
-- top-of-page module strip.

create table if not exists public.nex_module_status (
  module_name        text primary key,
  display_name       text not null,
  category           text not null check (category in ('substrate','governance','curriculum','delegation','local','transparency','surface')),
  status             text not null default 'unknown'
                     check (status in ('active','degraded','silent','not_initialized','unknown')),
  last_signal_at     timestamptz,
  data_points        jsonb default '{}'::jsonb,
  notes              text,
  updated_at         timestamptz not null default now()
);

create index if not exists nex_module_status_category_idx
  on public.nex_module_status (category, status);

alter table public.nex_module_status enable row level security;

drop policy if exists nex_module_status_service_only on public.nex_module_status;
create policy nex_module_status_service_only
  on public.nex_module_status for all to service_role
  using (true) with check (true);

insert into public.nex_module_status (module_name, display_name, category, status, notes) values
  ('verification',      'H2 Verification',         'substrate',    'unknown', 'verify before stating'),
  ('drift',             'δ1 Drift detection',      'substrate',    'unknown', 'language register guardrail'),
  ('coherence',         'δ2 Coherence pre-send',   'substrate',    'unknown', 'output register guardrail'),
  ('memory',            'δ3 Memory physics',       'substrate',    'unknown', 'fact contradiction detection'),
  ('swarm',             'δ4 Swarm routing',        'delegation',   'unknown', 'semantic agent picker'),
  ('knowledge_gaps',    'Loop B Curriculum',       'curriculum',   'unknown', 'weak-retrieval surfacing'),
  ('tech_watch',        'H4 Tech-watch',           'curriculum',   'unknown', 'daily RSS scan, weekly digest'),
  ('local_cognition',   'Local models (MLX)',      'local',        'unknown', 'Qwen+DeepSeek+BGE-m3'),
  ('canonical_store',   'Canonical store',         'transparency', 'unknown', 'CEO-blessed facts'),
  ('outcome_reconciler','Outcome reconciler',      'governance',   'unknown', 'nightly decisions.outcome populator'),
  ('weekly_review',     'Weekly self-review',      'governance',   'unknown', 'intel-analyst Sunday'),
  ('morning_brief',     'Morning brief',           'surface',      'unknown', 'night-digest 06:45 CEST')
on conflict (module_name) do nothing;
