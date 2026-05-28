-- 016_nex_knowledge_gaps.sql
-- Phase 1.8 Loop B knowledge-gap detector.
--
-- Mirror of the migration applied via mcp__supabase__apply_migration name
-- 'nex_knowledge_gaps'. Tracks weak-evidence retrieval queries clustered
-- by query_hash; the cto-nightly handler surfaces the top-N to the CEO
-- with a Telegram question, resolutions feed back into bless_fact or
-- vault writes.

create table if not exists public.nex_knowledge_gaps (
  id              bigserial primary key,
  detected_at     timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  query           text   not null,
  query_hash      text   not null,
  occurrences     integer not null default 1,
  worst_top_score double precision,
  best_top_score  double precision,
  callers         text[] not null default '{}',
  status          text   not null default 'open'
                  check (status in ('open','resolved','dismissed','snoozed')),
  snoozed_until   timestamptz,
  resolved_at     timestamptz,
  resolution      text   check (resolution in
                                ('blessed_fact','wrote_vault_note','out_of_scope','manual_answer','duplicate')),
  resolution_ref  text,
  metadata        jsonb  default '{}'::jsonb
);

create unique index if not exists nex_knowledge_gaps_hash_open
  on public.nex_knowledge_gaps (query_hash) where (status = 'open');

create index if not exists nex_knowledge_gaps_status_idx
  on public.nex_knowledge_gaps (status, last_seen_at desc);

create index if not exists nex_knowledge_gaps_detected_idx
  on public.nex_knowledge_gaps (detected_at desc);

alter table public.nex_knowledge_gaps enable row level security;

drop policy if exists nex_knowledge_gaps_service_only on public.nex_knowledge_gaps;
create policy nex_knowledge_gaps_service_only
  on public.nex_knowledge_gaps
  for all
  to service_role
  using (true) with check (true);

comment on table public.nex_knowledge_gaps is
  'Phase 1.8 Loop B: tracked weak-retrieval queries clustered by hash. Resolved via bless_fact or vault note or marked out_of_scope.';
