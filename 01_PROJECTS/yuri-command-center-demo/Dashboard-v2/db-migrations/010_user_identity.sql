-- Migration 010: user_identity + RBAC
-- Roles: ceo | cto | marketing_manager | operator
-- Covers: ops.c2moviez.com, marketing-studio, team-bots, future NEXBOX

-- ── user_profiles ────────────────────────────────────────────────────
-- Extends auth.users with role + Telegram link.
-- NOTE: insert rows AFTER the Supabase Auth user is created via the dashboard.
create table if not exists user_profiles (
  id               uuid primary key,  -- matches auth.users.id
  email            text unique not null,
  display_name     text not null,
  role             text not null check (role in ('ceo', 'cto', 'marketing_manager', 'operator')),
  telegram_chat_id bigint unique,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── role_permissions ─────────────────────────────────────────────────
create table if not exists role_permissions (
  role                  text primary key,
  can_view_financials   boolean not null default false,
  can_view_clients      boolean not null default true,
  can_view_team         boolean not null default false,
  can_create_tickets    boolean not null default false,
  can_send_telegram     boolean not null default false,
  allowed_routes        text[]  not null default '{}',
  allowed_tools         text[]  not null default '{}'
);

-- Seed default roles
insert into role_permissions
  (role, can_view_financials, can_view_clients, can_view_team,
   can_create_tickets, can_send_telegram, allowed_routes, allowed_tools)
values
  ('ceo',
   true, true, true, true, true,
   '{/,/clients,/revenue,/team,/marketing-studio,/settings}',
   '{all}'),
  ('cto',
   true, true, true, true, false,
   '{/,/clients,/team,/settings}',
   '{system,infra}'),
  ('marketing_manager',
   false, true, false, true, false,
   '{/,/clients,/marketing-studio}',
   '{marketing,docs}'),
  ('operator',
   false, true, false, false, false,
   '{/,/clients}',
   '{readonly}')
on conflict (role) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────
alter table user_profiles    enable row level security;
alter table role_permissions enable row level security;

-- Each user sees only their own profile; service role sees all
create policy "own_profile_select" on user_profiles
  for select using (auth.uid() = id);

create policy "service_role_all" on user_profiles
  for all using (auth.role() = 'service_role');

-- Role permissions are public-readable (needed by edge functions)
create policy "role_perms_public_read" on role_permissions
  for select using (true);

-- ── auto update_at ───────────────────────────────────────────────────
create or replace function _set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists user_profiles_updated_at on user_profiles;
create trigger user_profiles_updated_at
  before update on user_profiles
  for each row execute function _set_updated_at();

-- ── helper: resolve role for a telegram_chat_id ──────────────────────
-- Used by team-bots and edge functions to gate access without a full JWT.
create or replace function get_role_for_telegram(chat_id bigint)
returns text language sql security definer as $$
  select role from user_profiles
  where telegram_chat_id = chat_id and is_active = true
  limit 1;
$$;

-- ── CEO seed row ─────────────────────────────────────────────────────
-- Run after creating the Supabase Auth user for info@c2moviez.com.
-- Replace '<auth-uuid>' with the UUID from auth.users.
-- insert into user_profiles (id, email, display_name, role, telegram_chat_id)
-- values ('<auth-uuid>', 'info@c2moviez.com', 'Claudio Tinner', 'ceo', 8265895585)
-- on conflict (email) do nothing;
