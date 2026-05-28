-- 009_nex_search_outcome_boost.sql
-- Workstream G v2 γ3: outcome-weighted retrieval scoring.
--
-- Extends nex_search to look up the linked client_code's recent decisions:
--   • +0.03 if the client has any won outcome in last 90 days
--   • -0.06 if the client has any reversed outcome in last 90 days
--
-- Weights are deliberately weak (vs the cosine similarity which is 0–1)
-- so outcome only acts as a tiebreaker among semantically-close results,
-- not as a dominant force. We can re-tune after a week of usage if the
-- intel-analyst's nightly review shows the boost over- or under-fires.
--
-- Apply with: mcp__supabase__apply_migration  after CEO approval.
-- Reversible: re-apply 008 (which contains the un-boosted RPC).

drop function if exists public.nex_search(vector(384), int, text[], text, numeric);

create or replace function public.nex_search(
  query_embedding vector(384),
  match_count int default 10,
  source_types text[] default null,
  client_code text default null,
  recency_half_life_days numeric default 90.0
)
returns table (
  id              bigint,
  source_type     text,
  source_ref      text,
  chunk_idx       int,
  content         text,
  metadata        jsonb,
  similarity      float,
  recency_boost   float,
  outcome_boost   float,
  combined_score  float
)
language sql stable as $$
  with ranked as (
    select
      e.id,
      e.source_type,
      e.source_ref,
      e.chunk_idx,
      e.content,
      e.metadata,
      1 - (e.embedding <=> query_embedding)                          as similarity,
      0.05 * exp(
        - extract(epoch from (now() - e.created_at))
        / (86400.0 * recency_half_life_days)
      )                                                              as recency_boost,
      e.metadata->>'client_code' as cc
    from public.nex_embeddings e
    where (source_types is null or e.source_type = any(source_types))
      and (client_code  is null or e.metadata->>'client_code' = client_code)
  ),
  scored as (
    select
      r.*,
      coalesce(
        (select  0.03 from public.decisions d
           where d.client_code = r.cc
             and d.outcome = 'won'
             and d.decided_at > now() - interval '90 days'
           limit 1),
        0
      )
      +
      coalesce(
        (select -0.06 from public.decisions d
           where d.client_code = r.cc
             and d.outcome = 'reversed'
             and d.decided_at > now() - interval '90 days'
           limit 1),
        0
      ) as outcome_boost
    from ranked r
  )
  select
    s.id, s.source_type, s.source_ref, s.chunk_idx, s.content, s.metadata,
    s.similarity,
    s.recency_boost,
    s.outcome_boost,
    s.similarity + s.recency_boost + s.outcome_boost as combined_score
  from scored s
  order by combined_score desc
  limit match_count;
$$;

comment on function public.nex_search is
  'Workstream G v2 gamma-3 - cosine + recency + outcome-weighted retrieval over nex_embeddings (384-dim). Outcome boost: +0.03 won, -0.06 reversed (last 90d, by client_code).';
