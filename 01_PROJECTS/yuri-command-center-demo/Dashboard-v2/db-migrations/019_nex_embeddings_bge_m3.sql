-- 019_nex_embeddings_bge_m3.sql
-- Phase 2.4 + 2.8 — wire BGE-m3 (1024-dim multilingual) into retrieval.
--
-- Mirror of three applied migrations:
--   nex_embeddings_bge_m3            (initial: column + HNSW + nex_search_v2)
--   nex_search_v2_fix_types          (numeric → double precision casts)
--   nex_bulk_set_embedding_v2        (batch update RPC for backfill speed)
--
-- Adds embedding_v2 vector(1024) alongside the existing
-- embedding vector(384). The backfill script populates it via the
-- local Python micro-service (BGE-m3 via sentence-transformers).
-- search picks the column by query-side dimension. Tonight: additive
-- only — old 384-dim path stays for compatibility (drift / coherence /
-- swarm baselines still consume it).

alter table public.nex_embeddings
  add column if not exists embedding_v2 vector(1024);

-- HNSW index on the new column (cosine ops, same as v1)
create index if not exists nex_embeddings_v2_hnsw_idx
  on public.nex_embeddings
  using hnsw (embedding_v2 vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- ── nex_search_v2 RPC ────────────────────────────────────────────
-- Cosine-search the 1024-dim column. Same outcome boost (γ3) + recency
-- boost shape. Casts to double precision so the function signature
-- matches PostgREST's strict result-type check.
create or replace function public.nex_search_v2(
  query_embedding vector(1024),
  match_count integer default 10,
  source_types text[] default null,
  client_code text default null
)
returns table (
  id              bigint,
  source_type     text,
  source_ref      text,
  chunk_idx       integer,
  content         text,
  metadata        jsonb,
  similarity      double precision,
  recency_boost   double precision,
  outcome_boost   double precision,
  combined_score  double precision
)
language plpgsql
security definer
set search_path = public
as $$
declare
  recency_window_days int := 90;
begin
  return query
  with hits as (
    select
      e.id, e.source_type, e.source_ref, e.chunk_idx, e.content, e.metadata,
      (1 - (e.embedding_v2 <=> query_embedding))::double precision as similarity,
      (case
        when e.created_at is null then 0
        when e.created_at > now() - (recency_window_days || ' days')::interval
          then 0.05 * (1 - extract(epoch from (now() - e.created_at)) / (recency_window_days * 86400))
        else 0
      end)::double precision as recency_boost
    from public.nex_embeddings e
    where e.embedding_v2 is not null
      and (source_types is null or e.source_type = any(source_types))
      and (client_code is null or (e.metadata->>'client_code') = client_code)
    order by e.embedding_v2 <=> query_embedding
    limit greatest(match_count * 3, 30)
  ),
  scored as (
    select
      h.*,
      coalesce((
        select (case d.outcome
                 when 'won' then 0.03
                 when 'reversed' then -0.06
                 else 0
               end)::double precision
        from public.decisions d
        where d.client_code = (h.metadata->>'client_code')
          and d.outcome is not null
        order by d.created_at desc
        limit 1
      ), 0::double precision) as outcome_boost
    from hits h
  )
  select
    s.id, s.source_type, s.source_ref, s.chunk_idx, s.content, s.metadata,
    s.similarity, s.recency_boost, s.outcome_boost,
    (s.similarity + s.recency_boost + s.outcome_boost)::double precision as combined_score
  from scored s
  order by combined_score desc
  limit match_count;
end;
$$;

revoke all on function public.nex_search_v2(vector, integer, text[], text) from public;
grant execute on function public.nex_search_v2(vector, integer, text[], text) to service_role;

comment on function public.nex_search_v2(vector, integer, text[], text) is
  'Phase 2.4 / 2.8: BGE-m3 (1024-dim multilingual) variant of nex_search. Searches embedding_v2 column.';

-- ── nex_bulk_set_embedding_v2 RPC ────────────────────────────────
-- Batch update helper for the BGE-m3 backfill. Accepts an array of
-- {id, vec} pairs and updates in one round-trip instead of N sequential
-- PATCHes (the original PATCH-per-row approach saturated at 0.3 rows/s
-- on Supabase REST — bulk RPC pushed steady-state to 1.7 rows/s).
create or replace function public.nex_bulk_set_embedding_v2(
  rows jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  affected int := 0;
begin
  with input as (
    select
      (r->>'id')::bigint   as id,
      (r->>'vec')::vector(1024) as vec
    from jsonb_array_elements(rows) r
  )
  update public.nex_embeddings e
     set embedding_v2 = i.vec
    from input i
   where e.id = i.id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.nex_bulk_set_embedding_v2(jsonb) from public;
grant execute on function public.nex_bulk_set_embedding_v2(jsonb) to service_role;
