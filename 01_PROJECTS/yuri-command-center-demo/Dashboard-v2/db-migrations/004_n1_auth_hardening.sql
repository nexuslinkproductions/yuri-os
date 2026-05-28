-- ══════════════════════════════════════════════════════════════════
-- 004_n1_auth_hardening.sql                              Phase N1
--
-- Locks down the production auth surface:
--   1. JWT revocation list   (jti → reject after logout / rotate)
--   2. Distributed rate limiting on /auth (replaces in-memory counter
--      that resets every cold start)
--   3. Auth audit trail      (login/verify/logout/rate_limited events)
--
-- Apply: Supabase dashboard → SQL editor → paste & run.
--
-- Apply-order safety: the auth.js function code degrades gracefully
-- when these tables don't exist yet (log + allow), so this migration
-- can land BEFORE or AFTER the function deploy without breaking auth.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. JWT revocation ─────────────────────────────────────────────
-- Every issued token now carries a random jti (UUID). Listing the jti
-- here causes checkAuth() to reject the token even though its HMAC
-- signature is still valid and its exp hasn't passed.
create table if not exists public.auth_revocations (
  jti          text primary key,
  revoked_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  reason       text,                   -- 'logout' | 'password_changed' | 'admin_revoke'
  user_label   text                    -- 'admin' / 'CTI' for the audit trail
);
create index if not exists auth_revocations_expires_idx
  on public.auth_revocations (expires_at);

comment on table public.auth_revocations
  is 'Revoked JWT jti list. Tokens whose jti appears here are rejected by checkAuth().';

-- ── 2. Distributed rate limiting ──────────────────────────────────
create table if not exists public.auth_attempts (
  ip           text not null,
  attempted_at timestamptz not null default now(),
  success      boolean not null,
  primary key (ip, attempted_at)
);
create index if not exists auth_attempts_ip_time_idx
  on public.auth_attempts (ip, attempted_at desc);

comment on table public.auth_attempts
  is 'Per-IP login attempts for distributed rate limiting (auth_rate_check RPC).';

-- ── 3. Auth audit trail ───────────────────────────────────────────
-- Mirrors what audit_log does for entity events but isolated so we
-- can grep for attack patterns without entity-noise.
create table if not exists public.auth_events (
  id           uuid primary key default gen_random_uuid(),
  occurred_at  timestamptz not null default now(),
  action       text not null,          -- login.success | login.failure | verify.success | verify.expired | logout | rate_limited | revoked
  ip           text,
  user_agent   text,
  user_label   text,
  jti          text,                   -- new token's jti on success, null otherwise
  detail       text                    -- short reason on failure
);
create index if not exists auth_events_time_idx
  on public.auth_events (occurred_at desc);
create index if not exists auth_events_action_idx
  on public.auth_events (action, occurred_at desc);

comment on table public.auth_events
  is 'Auth audit trail — login/verify/logout/rate_limited. Grep for attack patterns.';

-- ── 4. Rate-check RPC ─────────────────────────────────────────────
-- Returns true if request is allowed (≤ 5 attempts / 60s sliding
-- window per IP). Logs a 'rate_limited' event when exceeded.
create or replace function public.auth_rate_check(_ip text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count int;
begin
  -- Cheap GC on every call (small table, this stays fast).
  delete from auth_attempts where attempted_at < now() - interval '10 minutes';

  select count(*) into recent_count
    from auth_attempts
   where ip = _ip and attempted_at > now() - interval '60 seconds';

  if recent_count >= 5 then
    insert into auth_events (action, ip, detail)
      values ('rate_limited', _ip, format('count=%s', recent_count));
    return false;
  end if;
  return true;
end;
$$;

-- ── 5. Record-attempt RPC ─────────────────────────────────────────
create or replace function public.auth_record_attempt(_ip text, _success boolean)
returns void
language sql
security definer
set search_path = public
as $$
  insert into auth_attempts (ip, attempted_at, success) values (_ip, now(), _success);
$$;

-- ── 6. Revocation GC RPC ──────────────────────────────────────────
-- Drop revocation rows whose tokens are already past natural exp.
-- Called from a daily cron Netlify function (or the cto-nightly run).
create or replace function public.auth_revocations_gc()
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from auth_revocations
     where expires_at < now() - interval '1 day'
     returning 1
  )
  select count(*)::int from deleted;
$$;

-- ── 7. RLS — service-key only ─────────────────────────────────────
-- These tables MUST NOT be exposed to the anon key. They contain
-- attack-pattern data and live token state.
alter table public.auth_revocations enable row level security;
alter table public.auth_attempts    enable row level security;
alter table public.auth_events      enable row level security;

-- No policies = nothing readable/writable except via service-key.
-- (Service-key bypasses RLS by design.)

-- Explicit deny policies for clarity (anon/authenticated → block).
drop policy if exists "deny_anon_auth_revocations"  on public.auth_revocations;
drop policy if exists "deny_anon_auth_attempts"     on public.auth_attempts;
drop policy if exists "deny_anon_auth_events"       on public.auth_events;

create policy "deny_anon_auth_revocations" on public.auth_revocations
  for all to anon, authenticated using (false) with check (false);
create policy "deny_anon_auth_attempts" on public.auth_attempts
  for all to anon, authenticated using (false) with check (false);
create policy "deny_anon_auth_events" on public.auth_events
  for all to anon, authenticated using (false) with check (false);

-- ── 8. Grants — ONLY service_role ─────────────────────────────────
revoke all on public.auth_revocations from anon, authenticated;
revoke all on public.auth_attempts    from anon, authenticated;
revoke all on public.auth_events      from anon, authenticated;

grant all on public.auth_revocations to service_role;
grant all on public.auth_attempts    to service_role;
grant all on public.auth_events      to service_role;

grant execute on function public.auth_rate_check(text)         to service_role;
grant execute on function public.auth_record_attempt(text, boolean) to service_role;
grant execute on function public.auth_revocations_gc()         to service_role;
