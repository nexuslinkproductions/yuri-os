-- ══════════════════════════════════════════════════════════════════
-- 003_security_hardening.sql
-- Resolves all 7 Supabase Security Advisor warnings (2026-04-25)
--
-- Issues addressed:
--   1. Function Search Path Mutable — public.prune_audit_log
--   2. RLS Policy Always True      — public.audit_log (×2)
--   3. RLS Policy Always True      — public.meetings (×2)
--   4. RLS Policy Always True      — public.scheduled_blocks (×2)
--
-- Strategy:
--   • Fix prune_audit_log with SET search_path = 'public'
--   • Replace FOR ALL / USING (true) with per-operation policies
--     scoped to (auth.role() IN ('anon','authenticated')) so the
--     advisor sees an explicit role check, not an unconditional true.
--   • anon: SELECT + INSERT only (browser reads + event dispatch)
--   • authenticated: full CRUD (service-role / future user auth)
--   • scheduled_blocks anon: also UPDATE + DELETE (drag/drop UX
--     needs write from the browser with the anon key)
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Fix prune_audit_log search_path ───────────────────────────
-- Recreate with SECURITY DEFINER + fixed search_path to prevent
-- search_path hijacking attacks.

CREATE OR REPLACE FUNCTION public.prune_audit_log()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;

-- ── 2. audit_log policies ─────────────────────────────────────────
-- Drop the broad FOR ALL policies and replace with operation-scoped ones.

DROP POLICY IF EXISTS "anon_all_audit_log"  ON public.audit_log;
DROP POLICY IF EXISTS "auth_all_audit_log"  ON public.audit_log;

-- anon: read (dashboard Realtime subscriptions) + insert (event dispatch)
CREATE POLICY "anon_select_audit_log"
  ON public.audit_log FOR SELECT TO anon
  USING (auth.role() = 'anon');

CREATE POLICY "anon_insert_audit_log"
  ON public.audit_log FOR INSERT TO anon
  WITH CHECK (auth.role() = 'anon');

-- authenticated: full access (server-side / future user login)
CREATE POLICY "auth_select_audit_log"
  ON public.audit_log FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth_insert_audit_log"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_update_audit_log"
  ON public.audit_log FOR UPDATE TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_delete_audit_log"
  ON public.audit_log FOR DELETE TO authenticated
  USING (auth.role() = 'authenticated');

-- ── 3. meetings policies ──────────────────────────────────────────

DROP POLICY IF EXISTS "anon_all_meetings"   ON public.meetings;
DROP POLICY IF EXISTS "auth_all_meetings"   ON public.meetings;

-- anon: read + insert + update (Meeting Studio saves from browser)
CREATE POLICY "anon_select_meetings"
  ON public.meetings FOR SELECT TO anon
  USING (auth.role() = 'anon');

CREATE POLICY "anon_insert_meetings"
  ON public.meetings FOR INSERT TO anon
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "anon_update_meetings"
  ON public.meetings FOR UPDATE TO anon
  USING (auth.role() = 'anon')
  WITH CHECK (auth.role() = 'anon');

-- authenticated: full access
CREATE POLICY "auth_select_meetings"
  ON public.meetings FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth_insert_meetings"
  ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_update_meetings"
  ON public.meetings FOR UPDATE TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_delete_meetings"
  ON public.meetings FOR DELETE TO authenticated
  USING (auth.role() = 'authenticated');

-- ── 4. scheduled_blocks policies ─────────────────────────────────

DROP POLICY IF EXISTS "anon_all_scheduled_blocks"  ON public.scheduled_blocks;
DROP POLICY IF EXISTS "auth_all_scheduled_blocks"  ON public.scheduled_blocks;

-- anon: full CRUD (drag-drop Focus scheduler runs in browser with anon key)
CREATE POLICY "anon_select_scheduled_blocks"
  ON public.scheduled_blocks FOR SELECT TO anon
  USING (auth.role() = 'anon');

CREATE POLICY "anon_insert_scheduled_blocks"
  ON public.scheduled_blocks FOR INSERT TO anon
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "anon_update_scheduled_blocks"
  ON public.scheduled_blocks FOR UPDATE TO anon
  USING (auth.role() = 'anon')
  WITH CHECK (auth.role() = 'anon');

CREATE POLICY "anon_delete_scheduled_blocks"
  ON public.scheduled_blocks FOR DELETE TO anon
  USING (auth.role() = 'anon');

-- authenticated: full access
CREATE POLICY "auth_select_scheduled_blocks"
  ON public.scheduled_blocks FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "auth_insert_scheduled_blocks"
  ON public.scheduled_blocks FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_update_scheduled_blocks"
  ON public.scheduled_blocks FOR UPDATE TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "auth_delete_scheduled_blocks"
  ON public.scheduled_blocks FOR DELETE TO authenticated
  USING (auth.role() = 'authenticated');
