-- Nexus Link core stub migration (Phase 0)
-- Aligns with UNIFIED-SCHEMA-DRAFT-2026-07-01.md (identity + AI ledger stubs)
-- Runs on first Postgres init via docker-entrypoint-initdb.d symlink mount.

-- Extensions used across Nexus schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Tenant root
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan_tier TEXT NOT NULL DEFAULT 'trial',
  locale TEXT NOT NULL DEFAULT 'de',
  branding JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspaces_slug_idx ON public.workspaces (slug);

-- ---------------------------------------------------------------------------
-- User profiles (links Supabase auth.users; Better Auth compatible shape)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK to auth.users when Supabase Auth schema exists (GoTrue migrates on startup).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.profiles
      DROP CONSTRAINT IF EXISTS profiles_id_fkey;
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'profiles auth.users FK deferred — run after GoTrue first boot if needed';
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Workspace membership
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS workspace_members_workspace_idx
  ON public.workspace_members (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_idx
  ON public.workspace_members (user_id);

-- ---------------------------------------------------------------------------
-- AI harness stubs (Phase 0 — schema only, no inference)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_workspace_config (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key_mode TEXT NOT NULL DEFAULT 'platform' CHECK (key_mode IN ('platform', 'byok', 'hybrid')),
  monthly_credit_usd NUMERIC(12, 2) NOT NULL DEFAULT 0,
  soft_cap_usd NUMERIC(12, 2),
  hard_cap_usd NUMERIC(12, 2),
  retention_days INT NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_workspace_created_idx
  ON public.ai_usage_events (workspace_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_events_request_id_idx
  ON public.ai_usage_events (workspace_id, request_id);

-- ---------------------------------------------------------------------------
-- RLS helpers (tenant isolation pattern from schema draft)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_current_workspace_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.workspace_id', true), '')::uuid;
$$;

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_workspace_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; anon/authenticated policies added in Phase 0.1 API middleware.
CREATE POLICY service_role_all_workspaces ON public.workspaces
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_profiles ON public.profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_workspace_members ON public.workspace_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_ai_workspace_config ON public.ai_workspace_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_ai_usage_events ON public.ai_usage_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users read/update own profile (requires auth.uid from Supabase image)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY profiles_select_own ON public.profiles
        FOR SELECT TO authenticated
        USING (id = auth.uid())
    $policy$;
    EXECUTE $policy$
      CREATE POLICY profiles_update_own ON public.profiles
        FOR UPDATE TO authenticated
        USING (id = auth.uid())
        WITH CHECK (id = auth.uid())
    $policy$;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Seed dev workspace (local only)
INSERT INTO public.workspaces (id, name, slug, plan_tier, locale)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Nexus Link Dev',
  'nexus-dev',
  'trial',
  'de'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.ai_workspace_config (workspace_id, monthly_credit_usd, retention_days)
VALUES ('00000000-0000-4000-8000-000000000001', 15.00, 30)
ON CONFLICT (workspace_id) DO NOTHING;

COMMENT ON TABLE public.workspaces IS 'Tenant root — see UNIFIED-SCHEMA-DRAFT §3.1';
COMMENT ON TABLE public.profiles IS 'User identity — links auth.users / Better Auth';
COMMENT ON TABLE public.ai_usage_events IS 'Immutable token ledger — YURI-CLOUD-HARNESS §7';
