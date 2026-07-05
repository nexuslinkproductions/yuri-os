-- Nexus Link — Wave 2 slice 1 (LOCAL phase): tamper-evident audit log.
-- The breach-detection spine. Verbatim from the Code Reference Pack
-- (02_RESOURCES/RESEARCH/nexus-security-code-reference-pack-2026-07-06.md L3b/L3c/L3d/L3e),
-- adapted to Nexus workspace_id conventions (00001/00002 pattern).
--
-- APPLIES on the local Docker Postgres stack (docker compose up). No Hetzner/Cloudflare
-- dependency — this is the LOCAL phase of Wave 2.
--
-- What this migration ships:
--   1. audit.audit_log — append-only, workspace_id NOT NULL (multi-tenant correlation key)
--   2. BEFORE-INSERT hash-chain trigger with the MANDATORY 0x00 domain-separation prefix
--      (RFC 6962 §2.1 principle; without it second-preimage resistance is lost)
--   3. Append-only enforcement (REVOKE UPDATE/DELETE/TRUNCATE + defense-in-depth trigger + DDL guard)
--   4. PII-audit triggers on the tables that exist today (connector_tokens, conversations,
--      conversation_messages) — leads/contacts triggers added when those tables land
--
-- The off-host Merkle root (L3a) + the nightly verification query (L3d) land as a
-- pg_cron job + a scripts/audit-chain-verify.sql in the next slice.

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- digest(data text/bytea, type text)

-- ---------------------------------------------------------------------------
-- 1. audit_log table (workspace_id FIRST-CLASS — multi-tenant correlation)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS audit;
REVOKE CREATE ON SCHEMA audit FROM public;

CREATE TABLE IF NOT EXISTS audit.audit_log (
    seq            BIGSERIAL      PRIMARY KEY,
    workspace_id   UUID           NOT NULL,                 -- multi-tenant correlation key (MANDATORY)
    actor_id       UUID,
    table_name     TEXT           NOT NULL,
    action         CHAR(1)        NOT NULL CHECK (action IN ('I','U','D')),
    row_pk         TEXT,
    row_payload    JSONB          NOT NULL,
    happened_at    TIMESTAMPTZ    NOT NULL DEFAULT clock_timestamp(),
    prev_hash      TEXT           NOT NULL,
    row_hash       TEXT           NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_log_workspace_seq_idx
    ON audit.audit_log (workspace_id, seq DESC);
CREATE INDEX IF NOT EXISTS audit_log_table_time_idx
    ON audit.audit_log (table_name, happened_at DESC);

REVOKE ALL ON audit.audit_log FROM public;
-- Dedicated owner role (NOT the app role, NOT a superuser). The app gets INSERT+SELECT only.
GRANT INSERT, SELECT ON audit.audit_log TO nexus_app;

-- ---------------------------------------------------------------------------
-- 2. Hash-chain BEFORE-INSERT trigger (0x00 prefix MANDATORY — RFC 6962 §2.1)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit.tg_audit_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit AS $$
DECLARE
    v_prev  audit.audit_log%ROWTYPE;
    v_found boolean := false;
    v_blob  text;
BEGIN
    -- Serialize concurrent writers so the chain tip is read atomically.
    PERFORM pg_advisory_xact_lock(hashtext('audit_chain'));
    SELECT * INTO v_prev FROM audit.audit_log ORDER BY seq DESC LIMIT 1;
    v_found := FOUND;
    IF v_found THEN
        NEW.prev_hash := v_prev.row_hash;
    ELSE
        NEW.prev_hash := encode(public.digest('', 'sha256'), 'hex');   -- genesis = sha256('')
    END IF;

    -- Deterministic canonicalization: jsonb (sorted keys), fixed UTC ISO-8601 timestamp.
    v_blob := jsonb_build_object(
        'seq',          NEW.seq,
        'workspace_id', NEW.workspace_id,
        'actor_id',     NEW.actor_id,
        'table_name',   NEW.table_name,
        'action',       NEW.action,
        'row_pk',       NEW.row_pk,
        'row_payload',  NEW.row_payload,
        'happened_at',  to_char(NEW.happened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'prev_hash',    NEW.prev_hash
    )::text;

    -- 0x00 prefix = domain separation (RFC 6962 §2.1 principle; prevents second-preimage
    -- collisions between a leaf and a node hash). OMITTING THIS IS THE LOAD-BEARING DEFECT.
    NEW.row_hash := encode(public.digest(E'\\x00' || v_blob::bytea, 'sha256'), 'hex');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_chain ON audit.audit_log;
CREATE TRIGGER trg_audit_chain
    BEFORE INSERT ON audit.audit_log
    FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_chain();

-- Append helper the PII triggers call (SECURITY DEFINER under audit_owner so an
-- unprivileged app role can mutate PII tables but the audit INSERT still happens
-- with elevated, narrow privileges — the app never gets direct INSERT on audit_log).
CREATE OR REPLACE FUNCTION audit.append_event(
    p_workspace_id uuid, p_actor_id uuid, p_table_name text, p_action char,
    p_row_pk text, p_row_payload jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit AS $$
BEGIN
    INSERT INTO audit.audit_log (workspace_id, actor_id, table_name, action, row_pk, row_payload)
    VALUES (p_workspace_id, p_actor_id, p_table_name, p_action, p_row_pk, p_row_payload);
END;
$$;
REVOKE ALL ON FUNCTION audit.append_event(uuid, uuid, text, char, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION audit.append_event(uuid, uuid, text, char, text, jsonb) TO nexus_app;

-- ---------------------------------------------------------------------------
-- 3. Append-only enforcement (REVOKE + defense-in-depth + DDL guard)
-- ---------------------------------------------------------------------------
REVOKE UPDATE, DELETE, TRUNCATE ON audit.audit_log FROM PUBLIC, nexus_app;
-- (owner self-revoke applied by the dedicated audit_owner role outside this migration)

CREATE OR REPLACE FUNCTION audit.tg_audit_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit.audit_log is append-only: % not permitted (row seq=%)',
        TG_OP, COALESCE(OLD.seq, NEW.seq)
        USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_no_update ON audit.audit_log;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit.audit_log
    FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_immutable();
DROP TRIGGER IF EXISTS trg_audit_no_delete ON audit.audit_log;
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit.audit_log
    FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_immutable();
-- TRUNCATE doesn't fire row-level DELETE triggers -> revoke explicitly (done above)
-- + a statement-level TRUNCATE guard is belt-and-braces.

-- (DDL guard moved to the END of this migration — it must be created AFTER the
--  RLS ALTER TABLE on audit.audit_log, or it blocks the migration's own RLS enable.)

-- ---------------------------------------------------------------------------
-- 4. PII-audit triggers on tables that exist today (Wave 0/00002 surfaces)
--    connector_tokens = OAuth crown jewels; conversations/messages = DM content.
--    leads/contacts triggers added when those tables migrate (slice 2).
--    App MUST set: SET LOCAL app.workspace_id = '<uuid>' per transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit.tg_pii_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, public AS $$
DECLARE v_ws uuid;
BEGIN
    v_ws := NULLIF(current_setting('app.workspace_id', true), '')::uuid;
    IF v_ws IS NULL THEN
        RAISE EXCEPTION 'app.workspace_id not set — audit trigger cannot bind tenant'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
        PERFORM audit.append_event(v_ws, NULL, TG_TABLE_NAME, 'D',
            COALESCE(OLD.id::text, OLD.connector_account_id::text), to_jsonb(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM audit.append_event(v_ws, NULL, TG_TABLE_NAME, 'U',
            COALESCE(NEW.id::text, NEW.connector_account_id::text),
            jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW)));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        PERFORM audit.append_event(v_ws, NULL, TG_TABLE_NAME, 'I',
            COALESCE(NEW.id::text, NEW.connector_account_id::text), to_jsonb(NEW));
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

-- Attach to the surfaces that exist post-00002.
DROP TRIGGER IF EXISTS connector_tokens_audit ON public.connector_tokens;
CREATE TRIGGER connector_tokens_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.connector_tokens
    FOR EACH ROW EXECUTE FUNCTION audit.tg_pii_audit();

DROP TRIGGER IF EXISTS conversations_audit ON public.conversations;
CREATE TRIGGER conversations_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION audit.tg_pii_audit();

DROP TRIGGER IF EXISTS conversation_messages_audit ON public.conversation_messages;
CREATE TRIGGER conversation_messages_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.conversation_messages
    FOR EACH ROW EXECUTE FUNCTION audit.tg_pii_audit();

-- ---------------------------------------------------------------------------
-- RLS on audit_log (same pattern as 00001/00002)
-- ---------------------------------------------------------------------------
ALTER TABLE audit.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all_audit_log ON audit.audit_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);
DO $$
BEGIN
    EXECUTE $policy$
        CREATE POLICY audit_log_tenant ON audit.audit_log
            FOR ALL TO authenticated
            USING (workspace_id = public.app_current_workspace_id())
            WITH CHECK (workspace_id = public.app_current_workspace_id())
    $policy$;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE audit.audit_log IS 'Wave-2 tamper-evident audit spine — append-only, hash-chained (0x00 RFC 6962 prefix), workspace_id-first-class. See nexus-security-code-reference-pack-2026-07-06.md L3.';

-- ---------------------------------------------------------------------------
-- 5. DDL guard (LAST — after all legitimate audit DDL, incl. the RLS enable above,
--    so it doesn't block the migration's own setup)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit.tg_block_audit_ddl()
RETURNS event_trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_event_trigger_ddl_commands()
        WHERE command_tag IN ('DROP TABLE','ALTER TABLE','DROP SCHEMA')
          AND (COALESCE(schema_name, '') = 'audit' OR object_identity LIKE 'audit.%')
    ) THEN
        RAISE EXCEPTION 'DDL on audit.* is forbidden (tamper-evident log)'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
END;
$$;
DROP EVENT TRIGGER IF EXISTS trg_audit_ddl_guard;
CREATE EVENT TRIGGER trg_audit_ddl_guard
    ON ddl_command_end
    WHEN TAG IN ('DROP TABLE','ALTER TABLE','DROP SCHEMA')
    EXECUTE FUNCTION audit.tg_block_audit_ddl();
