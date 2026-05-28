-- 007_nex_rag_foundation.sql
-- Workstream G1: pgvector extension + embeddings + retrieval log.
-- Foundation for the full RAG/learning layer (Workstream G).
--
-- This migration is INFRA only — it does not embed anything yet. The
-- backfill happens via Scripts/nex-embed-pipeline.js (G3) once the
-- Ollama LaunchAgent (G2) is up.
--
-- Apply with:  mcp__supabase__apply_migration  after CEO approval.
-- Reversible: drop table nex_embeddings, nex_retrieval_log, nex_embed_queue;
--             drop extension vector;  (skip the extension drop if other
--             tables come to depend on it — at the time of writing, none do).

-- ════════════════════════════════════════════════════════════════════
-- 1. Extension
-- ════════════════════════════════════════════════════════════════════

create extension if not exists vector;

-- ════════════════════════════════════════════════════════════════════
-- 2. nex_embeddings — the canonical store
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.nex_embeddings (
  id            bigserial primary key,
  source_type   text not null
                  check (source_type in (
                    'vault_note', 'decision', 'audit_event', 'meeting',
                    'plane_ticket', 'telegram_msg', 'client_email',
                    'commitment', 'fact'
                  )),
  source_ref    text not null,        -- vault file path | <table>:<uuid> | etc.
  chunk_idx     int  not null default 0,
  content_hash  text not null,        -- sha256(content) for dedup
  content       text not null,        -- the actual embedded chunk
  embedding     vector(768) not null, -- nomic-embed-text default; bump column to 1024 if we move to mxbai-embed-large
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  hit_count     int not null default 0,

  unique (source_type, source_ref, chunk_idx)
);

comment on table public.nex_embeddings is
  'Workstream G — semantic memory. Every chunk of vault/decisions/audit/etc. embedded once, retrieved on demand by mcp__nex-rag__search.';
comment on column public.nex_embeddings.source_ref is
  'Canonical pointer back to the original record. For vault_note: relative file path. For DB rows: <table_name>:<uuid>.';
comment on column public.nex_embeddings.content_hash is
  'sha256 of content; used to skip re-embedding when nothing actually changed.';
comment on column public.nex_embeddings.embedding is
  '768-dim vector from nomic-embed-text (Ollama default). If we move to mxbai-embed-large later, recreate this column as vector(1024) and re-embed.';

-- HNSW index for fast cosine similarity (writes are slower; reads are sub-50 ms).
create index if not exists nex_embeddings_hnsw_cosine_idx
  on public.nex_embeddings
  using hnsw (embedding vector_cosine_ops);

-- Filter helpers
create index if not exists nex_embeddings_source_type_idx
  on public.nex_embeddings (source_type);
create index if not exists nex_embeddings_client_code_idx
  on public.nex_embeddings ((metadata->>'client_code'))
  where metadata ? 'client_code';
create index if not exists nex_embeddings_recent_idx
  on public.nex_embeddings (created_at desc);

-- RLS: service_role only (matches 005_n1_rls_lockdown.sql pattern).
alter table public.nex_embeddings enable row level security;
drop policy if exists nex_embeddings_service_only on public.nex_embeddings;
create policy nex_embeddings_service_only
  on public.nex_embeddings
  as permissive
  for all
  to service_role
  using (true) with check (true);

-- ════════════════════════════════════════════════════════════════════
-- 3. nex_retrieval_log — every search query for quality analysis
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.nex_retrieval_log (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  query         text not null,
  filters       jsonb,
  top_k         int not null default 10,
  top_results   jsonb,             -- [{source_ref, score}] of returned set
  used_results  jsonb,             -- subset the caller marked helpful via mcp__nex-rag__feedback
  helpful       boolean,           -- aggregate flag: any used_results = true
  latency_ms    int,
  caller        text,              -- 'daemon' | 'cto' | 'sales-coach' | function name
  query_embedding vector(768)      -- store the query embedding for "find related queries" later
);

comment on table public.nex_retrieval_log is
  'Workstream G — every retrieval recorded. Trains the quality dashboard (G10) and outcome-weighted scoring (G7).';

create index if not exists nex_retrieval_log_occurred_at_idx
  on public.nex_retrieval_log (occurred_at desc);
create index if not exists nex_retrieval_log_caller_idx
  on public.nex_retrieval_log (caller, occurred_at desc);

alter table public.nex_retrieval_log enable row level security;
drop policy if exists nex_retrieval_log_service_only on public.nex_retrieval_log;
create policy nex_retrieval_log_service_only
  on public.nex_retrieval_log
  as permissive
  for all
  to service_role
  using (true) with check (true);

-- ════════════════════════════════════════════════════════════════════
-- 4. nex_embed_queue — backpressure buffer for high-volume sources
-- ════════════════════════════════════════════════════════════════════
-- event-dispatch.js writes a row here on every audit_log insert; the
-- nex-embed-pipeline drains it. Decouples webhook latency from embedding latency.

create table if not exists public.nex_embed_queue (
  id            bigserial primary key,
  enqueued_at   timestamptz not null default now(),
  source_type   text not null,
  source_ref    text not null,
  payload       jsonb,                       -- raw content to embed; pipeline does the chunking
  attempts      int not null default 0,
  last_error    text,
  picked_at     timestamptz,                 -- pipeline sets this when claimed; null = available
  done_at       timestamptz                  -- set on success; row pruned by retention job
);

create index if not exists nex_embed_queue_pending_idx
  on public.nex_embed_queue (enqueued_at)
  where done_at is null and picked_at is null;
create index if not exists nex_embed_queue_stuck_idx
  on public.nex_embed_queue (picked_at)
  where done_at is null and picked_at is not null;

alter table public.nex_embed_queue enable row level security;
drop policy if exists nex_embed_queue_service_only on public.nex_embed_queue;
create policy nex_embed_queue_service_only
  on public.nex_embed_queue
  as permissive
  for all
  to service_role
  using (true) with check (true);

-- ════════════════════════════════════════════════════════════════════
-- 5. Helper RPC: cosine search with outcome + recency weighting (G4 + G7 stub)
-- ════════════════════════════════════════════════════════════════════
-- Initial version: pure cosine + recency decay over 90 days. Outcome
-- weighting is a thin wrapper added in G7. nex-retrieve.js uses this RPC.

create or replace function public.nex_search(
  query_embedding vector(768),
  match_count int default 10,
  source_types text[] default null,
  client_code text default null,
  recency_half_life_days numeric default 90.0
)
returns table (
  id bigint,
  source_type text,
  source_ref text,
  chunk_idx int,
  content text,
  metadata jsonb,
  similarity float,
  combined_score float
)
language sql stable as $$
  select
    e.id,
    e.source_type,
    e.source_ref,
    e.chunk_idx,
    e.content,
    e.metadata,
    1 - (e.embedding <=> query_embedding)                             as similarity,
    -- combined: cosine similarity + recency decay (linear-ish, gentle)
    (1 - (e.embedding <=> query_embedding))
      + 0.05 * exp( - extract(epoch from (now() - e.created_at)) / (86400.0 * recency_half_life_days) )
                                                                       as combined_score
  from public.nex_embeddings e
  where (source_types is null or e.source_type = any(source_types))
    and (client_code  is null or e.metadata->>'client_code' = client_code)
  order by combined_score desc
  limit match_count;
$$;

comment on function public.nex_search is
  'Workstream G4 — cosine similarity over nex_embeddings with recency decay. Outcome weighting (G7) wraps this.';

-- ════════════════════════════════════════════════════════════════════
-- 6. Sanity check (no data, just structure)
-- ════════════════════════════════════════════════════════════════════
-- After applying:
--   select count(*) from public.nex_embeddings;          -- expect 0
--   select count(*) from public.nex_retrieval_log;       -- expect 0
--   select count(*) from public.nex_embed_queue;         -- expect 0
--   select extname from pg_extension where extname = 'vector';
--   \d public.nex_embeddings   -- should show hnsw index on embedding
