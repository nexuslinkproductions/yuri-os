-- 006_nex_language_drift.sql
-- Audit table for NEX↔CEO language-drift incidents.
-- Populated fire-and-forget by Dashboard-v2/netlify/functions/shared-telegram.js
-- when a CEO-bound Telegram message contains German markers.
--
-- Read by: cto-nightly healthcheck, weekly intel-analyst review, ad-hoc CEO query.
--
-- Apply with: supabase db push --include 006_nex_language_drift.sql
-- (or via mcp__supabase__apply_migration after CEO approval)

create table if not exists public.nex_language_drift (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  chat_id       text        not null,
  original_text text        not null,
  source        text,
  caller_meta   text,
  resolved_at   timestamptz
);

create index if not exists nex_language_drift_occurred_at_idx
  on public.nex_language_drift (occurred_at desc);

create index if not exists nex_language_drift_unresolved_idx
  on public.nex_language_drift (occurred_at desc)
  where resolved_at is null;

-- RLS lockdown: only the service-role / dashboard can read/write.
-- (Pattern matches 005_n1_rls_lockdown.sql.)
alter table public.nex_language_drift enable row level security;

drop policy if exists nex_language_drift_service_only on public.nex_language_drift;
create policy nex_language_drift_service_only
  on public.nex_language_drift
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

comment on table  public.nex_language_drift is
  'NEX→CEO Telegram language-drift incidents. Detector lives in shared-telegram.js send().';
comment on column public.nex_language_drift.source is
  'Netlify function or daemon component that emitted the drifting message.';
comment on column public.nex_language_drift.caller_meta is
  'Optional caller-supplied breadcrumb passed via opts.__caller.';
