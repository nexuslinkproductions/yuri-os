-- 021_nex_knowledge_gaps_surfaced_at.sql
-- MOVE 2 Eve E — track when a Loop B knowledge gap was surfaced
-- to the CEO in a morning brief, so:
--   (1) the daemon can correlate subsequent CEO messages to recently
--       surfaced questions (gap-answer detection),
--   (2) intel-analyst can identify gaps that get surfaced repeatedly
--       without resolution.
--
-- Mirror of the migration applied via mcp__supabase__apply_migration
-- name 'nex_knowledge_gaps_surfaced_at'.

alter table public.nex_knowledge_gaps
  add column if not exists surfaced_at timestamptz;

create index if not exists nex_knowledge_gaps_surfaced_idx
  on public.nex_knowledge_gaps (surfaced_at desc nulls last);
