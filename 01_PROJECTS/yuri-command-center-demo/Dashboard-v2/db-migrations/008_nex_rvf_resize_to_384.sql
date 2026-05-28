-- 008_nex_rvf_resize_to_384.sql
-- Workstream G v2 β-phase: resize embedding columns to 384 dim.
--
-- Migration 007 set vector(768) for Ollama nomic-embed-text. The CEO
-- decision (2026-05-06) selected Agentic-Flow ONNX (MiniLM-L6-v2) as the
-- default embedder, which produces 384-dim vectors. Tables are empty
-- (rows: 0) so the resize is destructive of structure but lossless of data.
--
-- Apply with: mcp__supabase__apply_migration  after CEO approval.
-- Reversible: re-create columns as vector(768) if we ever switch embedder.

-- ════════════════════════════════════════════════════════════════════
-- 1. Drop the HNSW index (must be recreated after column change)
-- ════════════════════════════════════════════════════════════════════

drop index if exists public.nex_embeddings_hnsw_cosine_idx;

-- ════════════════════════════════════════════════════════════════════
-- 2. Truncate (defensive — should already be 0 rows) and resize
-- ════════════════════════════════════════════════════════════════════

truncate table public.nex_embeddings;
alter  table public.nex_embeddings drop column embedding;
alter  table public.nex_embeddings add  column embedding vector(384) not null;

truncate table public.nex_retrieval_log;
alter  table public.nex_retrieval_log drop column query_embedding;
alter  table public.nex_retrieval_log add  column query_embedding vector(384);

-- ════════════════════════════════════════════════════════════════════
-- 3. Recreate the HNSW index on the new column
-- ════════════════════════════════════════════════════════════════════

create index nex_embeddings_hnsw_cosine_idx
  on public.nex_embeddings
  using hnsw (embedding vector_cosine_ops);

-- ════════════════════════════════════════════════════════════════════
-- 4. Re-create the search RPC with vector(384) parameter
-- ════════════════════════════════════════════════════════════════════

drop function if exists public.nex_search(vector(768), int, text[], text, numeric);

create or replace function public.nex_search(
  query_embedding vector(384),
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
  'Workstream G v2 β — cosine search over nex_embeddings (384-dim) with recency decay. Outcome weighting (γ3) wraps this.';
