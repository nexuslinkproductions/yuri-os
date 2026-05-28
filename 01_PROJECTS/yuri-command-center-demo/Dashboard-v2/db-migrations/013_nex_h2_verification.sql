-- 013_nex_h2_verification.sql
-- Phase 1.2 / H2 verification middleware (Eve 1 — foundation).
--
-- Mirrors the migration applied via mcp__supabase__apply_migration name
-- 'nex_h2_verification_middleware'. Reuses the existing public.facts
-- table rather than creating a parallel canonical store:
--
--   nex_facts_canonical  — security-invoker view over facts where
--                          actor='CEO' or confidence ≥ 0.95
--                          (and not retracted, not superseded).
--   bless_fact()         — RPC: insert a confidence=1.0 fact and
--                          supersede any prior triple match.
--   nex_verify_claim()   — RPC: triple lookup used by lib/verify.js.
--
-- This is the durable foundation Phase 1.2 Eve 2 (kind-specific
-- verifiers) and Eve 3 (bless tool + cross-agent review) build on.

-- ── nex_facts_canonical view ──────────────────────────────────────────
create or replace view public.nex_facts_canonical
with (security_invoker = true)
as
  select
    id,
    subject_type,
    subject_id,
    predicate,
    value,
    source,
    source_ref,
    actor       as blessed_by,
    confidence,
    rationale,
    observed_at as blessed_at
  from public.facts
  where retracted is not true
    and superseded_by is null
    and (
      actor = 'CEO'
      or actor like 'CEO:%'
      or confidence >= 0.95
    );

comment on view public.nex_facts_canonical is
  'Phase 1.2 H2: CEO-blessed + high-confidence subset of public.facts. '
  'Read by mcp__nex-rag__verify. Updated via bless_fact() RPC.';

-- ── bless_fact RPC ────────────────────────────────────────────────────
create or replace function public.bless_fact(
  p_subject_type text,
  p_subject_id   text,
  p_predicate    text,
  p_value        jsonb,
  p_source_ref   text default null,
  p_actor        text default 'CEO',
  p_rationale    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_id uuid;
begin
  insert into public.facts
    (subject_type, subject_id, predicate, value, source, source_ref,
     actor, confidence, rationale, observed_at, recorded_at)
  values
    (p_subject_type, p_subject_id, p_predicate, p_value,
     'bless_fact_rpc', p_source_ref,
     p_actor, 1.0, p_rationale, now(), now())
  returning id into v_new_id;

  update public.facts
  set
    superseded_by = v_new_id,
    superseded_at = now()
  where subject_type = p_subject_type
    and subject_id   = p_subject_id
    and predicate    = p_predicate
    and id          != v_new_id
    and retracted   is not true
    and superseded_by is null;

  return v_new_id;
end;
$$;

revoke all on function public.bless_fact(text, text, text, jsonb, text, text, text) from public;
grant execute on function public.bless_fact(text, text, text, jsonb, text, text, text) to service_role;

comment on function public.bless_fact(text, text, text, jsonb, text, text, text) is
  'Phase 1.2 H2: CEO-blessed fact insertion. Inserts a confidence=1.0 row '
  'and supersedes any prior active fact for the same (subject_type, '
  'subject_id, predicate). Returns new fact id. Service-role only.';

-- ── nex_verify_claim helper RPC ───────────────────────────────────────
create or replace function public.nex_verify_claim(
  p_subject_type text,
  p_subject_id   text,
  p_predicate    text
)
returns table (
  id           uuid,
  value        jsonb,
  confidence   numeric,
  blessed_by   text,
  source_ref   text,
  blessed_at   timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, value, confidence, blessed_by, source_ref, blessed_at
  from public.nex_facts_canonical
  where subject_type = p_subject_type
    and subject_id   = p_subject_id
    and predicate    = p_predicate
  order by confidence desc, blessed_at desc
  limit 5;
$$;

revoke all on function public.nex_verify_claim(text, text, text) from public;
grant execute on function public.nex_verify_claim(text, text, text) to service_role;
