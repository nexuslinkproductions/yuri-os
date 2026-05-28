-- 017_nex_tech_watch.sql
-- Phase 1.9 H4 tech-watch + auto-proposal.
--
-- Mirror of the migration applied via mcp__supabase__apply_migration name
-- 'nex_tech_watch'. Daily scanner walks 11 GitHub releases.atom feeds
-- (Anthropic SDK / MCP / Obsidian / Svelte / Supabase / pgvector /
-- Mistral / Plane), parses entries, scores by keyword relevance, dedupes
-- by guid. Weekly digest surfaces top-3 to the CEO morning brief.

create table if not exists public.nex_tech_watch_sources (
  id           bigserial primary key,
  name         text unique not null,
  url          text not null,
  source_type  text default 'atom' check (source_type in ('atom','rss','json')),
  enabled      boolean default true,
  last_fetched timestamptz,
  last_status  text,
  last_error   text,
  notes        text
);

create table if not exists public.nex_tech_watch_items (
  id              bigserial primary key,
  source_id       bigint references public.nex_tech_watch_sources(id) on delete set null,
  source_name     text,
  guid            text not null,
  title           text not null,
  url             text,
  published_at    timestamptz,
  fetched_at      timestamptz default now(),
  summary         text,
  raw             jsonb,
  matched_keywords text[] default '{}',
  relevance_score numeric default 0,
  ceo_action      text check (ceo_action in ('reviewed','integrate','skip','snooze')),
  surfaced_at     timestamptz
);

create unique index if not exists nex_tech_watch_items_guid_idx
  on public.nex_tech_watch_items (guid);

create index if not exists nex_tech_watch_items_relevance_idx
  on public.nex_tech_watch_items (relevance_score desc, published_at desc);

create index if not exists nex_tech_watch_items_pub_idx
  on public.nex_tech_watch_items (published_at desc);

alter table public.nex_tech_watch_sources enable row level security;
alter table public.nex_tech_watch_items   enable row level security;

drop policy if exists nex_tech_watch_sources_service_only on public.nex_tech_watch_sources;
create policy nex_tech_watch_sources_service_only
  on public.nex_tech_watch_sources for all to service_role using (true) with check (true);

drop policy if exists nex_tech_watch_items_service_only on public.nex_tech_watch_items;
create policy nex_tech_watch_items_service_only
  on public.nex_tech_watch_items for all to service_role using (true) with check (true);

-- Seed sources (idempotent)
insert into public.nex_tech_watch_sources (name, url, source_type, notes) values
  ('anthropic-sdk-ts',     'https://github.com/anthropics/anthropic-sdk-typescript/releases.atom', 'atom', 'Anthropic TypeScript SDK releases'),
  ('anthropic-sdk-py',     'https://github.com/anthropics/anthropic-sdk-python/releases.atom',     'atom', 'Anthropic Python SDK releases'),
  ('mcp-specification',    'https://github.com/modelcontextprotocol/specification/releases.atom',  'atom', 'MCP spec releases'),
  ('mcp-servers',          'https://github.com/modelcontextprotocol/servers/releases.atom',        'atom', 'Reference MCP server collection'),
  ('obsidian-releases',    'https://github.com/obsidianmd/obsidian-releases/releases.atom',        'atom', 'Obsidian app releases'),
  ('sveltekit',            'https://github.com/sveltejs/kit/releases.atom',                        'atom', 'SvelteKit releases'),
  ('svelte',               'https://github.com/sveltejs/svelte/releases.atom',                     'atom', 'Svelte core releases'),
  ('supabase',             'https://github.com/supabase/supabase/releases.atom',                   'atom', 'Supabase platform releases'),
  ('pgvector',             'https://github.com/pgvector/pgvector/releases.atom',                   'atom', 'pgvector releases'),
  ('mistral-client',       'https://github.com/mistralai/client-python/releases.atom',             'atom', 'Mistral Python client releases'),
  ('plane',                'https://github.com/makeplane/plane/releases.atom',                     'atom', 'Plane.so releases')
on conflict (name) do nothing;
