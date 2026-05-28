-- 018_nex_local_inference_log.sql
-- Phase 2 Eve 1 local model inference telemetry.
--
-- Mirror of the migration applied via mcp__supabase__apply_migration name
-- 'nex_local_inference_log'. Logs every call to the Python micro-service
-- on 127.0.0.1:8765 (Qwen / DeepSeek / BGE-m3 via MLX) so we can trace
-- latency, token counts, and routing quality.

create table if not exists public.nex_local_inference_log (
  id              bigserial primary key,
  occurred_at     timestamptz not null default now(),
  endpoint        text not null check (endpoint in ('chat','reason','embed','health')),
  model           text,
  prompt_excerpt  text,
  prompt_hash     text,
  prompt_tokens   integer,
  completion_tokens integer,
  total_tokens    integer,
  latency_ms      integer,
  caller          text,
  client_code     text,
  status          text not null default 'ok'
                  check (status in ('ok','offline','model_not_loaded','timeout','error')),
  error_message   text,
  metadata        jsonb default '{}'::jsonb
);

create index if not exists nex_local_inference_log_occurred_idx
  on public.nex_local_inference_log (occurred_at desc);

create index if not exists nex_local_inference_log_endpoint_idx
  on public.nex_local_inference_log (endpoint, occurred_at desc);

create index if not exists nex_local_inference_log_status_idx
  on public.nex_local_inference_log (status, occurred_at desc) where (status <> 'ok');

alter table public.nex_local_inference_log enable row level security;

drop policy if exists nex_local_inference_log_service_only on public.nex_local_inference_log;
create policy nex_local_inference_log_service_only
  on public.nex_local_inference_log
  for all to service_role
  using (true) with check (true);
