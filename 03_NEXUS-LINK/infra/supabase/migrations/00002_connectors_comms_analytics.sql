-- Nexus Link — Wave 0 substrate: connectors vault + platform-separated comms + analytics.
-- Sibling to 00001_nexus_core_stub.sql (identity substrate). Matches its conventions:
--   - every business table: workspace_id UUID NOT NULL + RLS via app_current_workspace_id()
--   - service_role bypasses RLS; composite (workspace_id, ...) indexes
--   - UUID PKs via gen_random_uuid(); TIMESTAMPTZ DEFAULT now()
-- Aligns with UNIFIED-SCHEMA-DRAFT-2026-07-01.md slices 5 (comms), 10 (connectors), 12 (social_posts).
-- Apply: psql against the nexus-db container, OR via a Phase-0.1 migration runner (not yet wired).
-- Safe to re-run: every CREATE is IF NOT EXISTS, every POLICY is DO-block-guarded.

-- ---------------------------------------------------------------------------
-- 1. Connectors — per-tenant connected accounts + encrypted token vault
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.connector_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- "microsoft" | "google" | "meta" | "whatsapp" | "facebook" | "instagram"
  provider        TEXT NOT NULL,
  -- "connected" | "ready" | "review" | "error" | "revoked"
  status          TEXT NOT NULL DEFAULT 'ready',
  -- platform-native account id (e.g. Graph user OID, ad account id, WhatsApp phone-number-id)
  external_account_id TEXT,
  display_name    TEXT,
  -- OAuth scopes granted (determines read vs messaging-write capability)
  scopes          JSONB NOT NULL DEFAULT '[]',
  -- capability flags derived from scopes: which Nexus surfaces this account unlocks
  capabilities    JSONB NOT NULL DEFAULT '{"comms": false, "analytics_organic": false, "analytics_paid": false}',
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, external_account_id)
);

CREATE INDEX IF NOT EXISTS connector_accounts_workspace_idx
  ON public.connector_accounts (workspace_id, provider);

-- The token vault. Stores ONLY ciphertext — never plaintext. Encryption key
-- lives in the OS keyring (Rust `keyring` crate via the Tauri bridge), keyed
-- by `key_id`. This row never holds a secret an agent lane could exfiltrate.
CREATE TABLE IF NOT EXISTS public.connector_tokens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  connector_account_id UUID NOT NULL REFERENCES public.connector_accounts(id) ON DELETE CASCADE,
  -- AES-GCM ciphertext of the (access+refresh) token bundle. BYTEA, never TEXT.
  ciphertext          BYTEA NOT NULL,
  -- nonce/IV for the AEAD cipher
  ciphertext_nonce    BYTEA NOT NULL,
  -- which keyring entry decrypted it (rotation support)
  key_id              TEXT NOT NULL,
  -- token-class metadata (NOT the secret): when it expires, refresh strategy
  expires_at          TIMESTAMPTZ,
  refresh_strategy    TEXT NOT NULL DEFAULT 'oauth2_refresh',
  -- "active" | "rotating" | "expired" | "revoked"
  state               TEXT NOT NULL DEFAULT 'active',
  rotated_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connector_tokens_account_idx
  ON public.connector_tokens (connector_account_id);
CREATE INDEX IF NOT EXISTS connector_tokens_workspace_state_idx
  ON public.connector_tokens (workspace_id, state);

-- ---------------------------------------------------------------------------
-- 2. Communications — platform-separated inbox substrate
--    (owner directive: "don't mix and match, have it separated by platform")
--    `platform` is first-class; the inbox panel filters by it. No merged
--    heterogenous-thread union type — a reply routes back through the SAME
--    platform's connector.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- "whatsapp" | "facebook" | "instagram" | "gmail" | "outlook"
  platform          TEXT NOT NULL,
  -- platform-native thread id (DM thread id, email thread id, WhatsApp chat id)
  external_thread_id TEXT NOT NULL,
  -- nullable link to CRM contacts (slice 2); conversations can exist pre-contact
  contact_id        UUID,
  title             TEXT,
  -- unread count surfaced in the inbox lane badge
  unread_count      INT NOT NULL DEFAULT 0,
  -- "open" | "pending" | "closed"
  status            TEXT NOT NULL DEFAULT 'open',
  last_message_at   TIMESTAMPTZ,
  last_inbound_at   TIMESTAMPTZ,
  -- AI auto-reply policy for this thread (DeepSeek via /mcp): "off" | "suggest" | "auto"
  auto_reply_mode   TEXT NOT NULL DEFAULT 'suggest',
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform, external_thread_id)
);

CREATE INDEX IF NOT EXISTS conversations_workspace_platform_idx
  ON public.conversations (workspace_id, platform, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS conversations_workspace_unread_idx
  ON public.conversations (workspace_id, status, last_inbound_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  -- platform-native message id (idempotency on inbound fetch)
  external_id     TEXT NOT NULL,
  -- "inbound" | "outbound"
  direction       TEXT NOT NULL,
  sender_handle   TEXT,
  sender_name     TEXT,
  body_text       TEXT,
  -- attachments, media, platform-specific payload
  payload         JSONB NOT NULL DEFAULT '{}',
  -- was this composed/sent by the AI auto-reply lane?
  authored_by     TEXT NOT NULL DEFAULT 'human',
  sent_at         TIMESTAMPTZ,
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, conversation_id, external_id)
);

CREATE INDEX IF NOT EXISTS conversation_messages_conv_idx
  ON public.conversation_messages (conversation_id, sent_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS conversation_messages_workspace_captured_idx
  ON public.conversation_messages (workspace_id, captured_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Analytics — the canonical DataPoint time-series (mirrors the Rust model in
--    engine/crates/nexus-datapoint). One table for organic + paid. GA4-style:
--    typed value columns (not JSONB-per-row) so the hot aggregation paths
--    (counter SUM, currency SUM) stay indexable. Idempotent UPSERT key handles
--    the 72h paid-settling rewrite window without append-blind duplication.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.datapoints (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_id           TEXT NOT NULL,
  -- "post" | "profile" | "ad_account" | "campaign" | "ad_group" | "ad"
  entity_type         TEXT NOT NULL,
  -- "meta" | "google" | "microsoft"
  platform            TEXT NOT NULL,
  -- "organic" | "paid"
  channel_type        TEXT NOT NULL,
  metric_name         TEXT NOT NULL,
  -- "counter" | "ratio" | "duration" | "currency" | "unique_count"
  metric_kind         TEXT NOT NULL,
  -- "sum" | "recompute_from_num_denom" | "non_aggregatable"
  aggregation_rule    TEXT NOT NULL,
  -- "day" | "month" | "lifetime" | "event"
  period              TEXT NOT NULL DEFAULT 'day',
  -- typed scalar for counter/duration/ratio (the SUM path)
  value_num           DOUBLE PRECISION,
  -- currency: native cents + ISO-4217 + EUR-normalized cents (the GA4 dual-currency pattern)
  value_cents_native  BIGINT,
  value_currency      TEXT,
  value_cents_eur     BIGINT,
  -- first-class query axes: campaign_id, country, device, age, gender, ...
  dimensions          JSONB NOT NULL DEFAULT '{}',
  -- stable hash of dimensions so it can participate in a UNIQUE upsert key
  dimensions_hash     TEXT NOT NULL DEFAULT '',
  captured_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Idempotency: a re-fetch of the same (entity, metric, period, day, dimensions)
  -- UPSERTs (overwrites) instead of duplicating. Handles paid-spend settling.
  UNIQUE (workspace_id, entity_id, metric_name, period, captured_at, dimensions_hash)
);

-- Dashboard-hot query paths
CREATE INDEX IF NOT EXISTS datapoints_workspace_metric_time_idx
  ON public.datapoints (workspace_id, metric_name, captured_at DESC);
CREATE INDEX IF NOT EXISTS datapoints_workspace_entity_time_idx
  ON public.datapoints (workspace_id, entity_type, entity_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS datapoints_workspace_channel_time_idx
  ON public.datapoints (workspace_id, platform, channel_type, captured_at DESC);

-- dimensions_hash kept consistent by trigger (md5 of dimensions::text)
CREATE OR REPLACE FUNCTION public.datapoints_dimensions_hash()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.dimensions_hash = md5(COALESCE(NEW.dimensions::text, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS datapoints_dimensions_hash ON public.datapoints;
CREATE TRIGGER datapoints_dimensions_hash
  BEFORE INSERT OR UPDATE ON public.datapoints
  FOR EACH ROW EXECUTE FUNCTION public.datapoints_dimensions_hash();

-- ---------------------------------------------------------------------------
-- 4. social_posts — scheduled/cross-posted content (DEFERRED per read-first
--    reframe, but schema-ready so Wave 1+ connectors have a target). V1 uses
--    this only if/when publishing is re-enabled; not wired into the inbox.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.social_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  canonical_text  TEXT NOT NULL,
  media           JSONB NOT NULL DEFAULT '[]',
  -- per-platform overrides on top of the canonical post
  overrides       JSONB NOT NULL DEFAULT '{}',
  -- "draft" | "scheduled" | "sending" | "sent" | "failed"
  status          TEXT NOT NULL DEFAULT 'draft',
  scheduled_for   TIMESTAMPTZ,
  -- targets: which connector_accounts to publish to (deferred write path)
  targets         JSONB NOT NULL DEFAULT '[]',
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_posts_workspace_status_idx
  ON public.social_posts (workspace_id, status, scheduled_for NULLS LAST);

-- ---------------------------------------------------------------------------
-- RLS — same pattern as 00001. service_role bypasses; authenticated-tenant
-- policy uses app_current_workspace_id() (set per-request by API middleware).
-- ---------------------------------------------------------------------------

ALTER TABLE public.connector_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datapoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

-- service_role bypasses (same shape as 00001)
CREATE POLICY service_role_all_connector_accounts ON public.connector_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_connector_tokens ON public.connector_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_conversations ON public.conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_conversation_messages ON public.conversation_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_datapoints ON public.datapoints
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_social_posts ON public.social_posts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- authenticated tenant isolation (workspace_id must match the session setting)
DO $$
BEGIN
  EXECUTE $policy$
    CREATE POLICY connector_accounts_tenant ON public.connector_accounts
      FOR ALL TO authenticated
      USING (workspace_id = public.app_current_workspace_id())
      WITH CHECK (workspace_id = public.app_current_workspace_id())
  $policy$;
  EXECUTE $policy$
    CREATE POLICY connector_tokens_tenant ON public.connector_tokens
      FOR ALL TO authenticated
      USING (workspace_id = public.app_current_workspace_id())
      WITH CHECK (workspace_id = public.app_current_workspace_id())
  $policy$;
  EXECUTE $policy$
    CREATE POLICY conversations_tenant ON public.conversations
      FOR ALL TO authenticated
      USING (workspace_id = public.app_current_workspace_id())
      WITH CHECK (workspace_id = public.app_current_workspace_id())
  $policy$;
  EXECUTE $policy$
    CREATE POLICY conversation_messages_tenant ON public.conversation_messages
      FOR ALL TO authenticated
      USING (workspace_id = public.app_current_workspace_id())
      WITH CHECK (workspace_id = public.app_current_workspace_id())
  $policy$;
  EXECUTE $policy$
    CREATE POLICY datapoints_tenant ON public.datapoints
      FOR ALL TO authenticated
      USING (workspace_id = public.app_current_workspace_id())
      WITH CHECK (workspace_id = public.app_current_workspace_id())
  $policy$;
  EXECUTE $policy$
    CREATE POLICY social_posts_tenant ON public.social_posts
      FOR ALL TO authenticated
      USING (workspace_id = public.app_current_workspace_id())
      WITH CHECK (workspace_id = public.app_current_workspace_id())
  $policy$;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.connector_accounts IS 'Per-tenant connected accounts — Wave 0 connectors vault. See docs/NEXUS-LINK-SOCIAL-CONNECT-VISUAL-PLAN-2026-07-05.html §02';
COMMENT ON TABLE public.connector_tokens IS 'Encrypted token vault — ciphertext only, key in OS keyring. NEVER plaintext.';
COMMENT ON TABLE public.conversations IS 'Platform-separated inbox threads (owner directive: separated by platform, not merged). See plan §04';
COMMENT ON TABLE public.datapoints IS 'Canonical cross-channel metrics — mirrors engine/crates/nexus-datapoint Rust model. Silent-zero defense at the connector layer; aggregation_rule drives query-layer aggregation.';
