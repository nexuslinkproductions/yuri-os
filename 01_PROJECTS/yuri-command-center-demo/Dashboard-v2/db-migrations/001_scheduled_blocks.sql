-- Run once in Supabase SQL editor
-- Creates the scheduled_blocks table for the Weekly Focus scheduler

CREATE TABLE IF NOT EXISTS scheduled_blocks (
  id             UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      TEXT             NOT NULL,
  ticket_name    TEXT             NOT NULL DEFAULT '',
  client_code    TEXT             NOT NULL DEFAULT '',
  priority       TEXT             NOT NULL DEFAULT 'none',
  day            DATE             NOT NULL,
  start_hour     DOUBLE PRECISION NOT NULL,          -- 9.5 = 09:30
  duration_hours DOUBLE PRECISION NOT NULL DEFAULT 1,
  assignee_code  TEXT             NOT NULL DEFAULT 'CTI',
  m365_event_id  TEXT,
  color          TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

ALTER TABLE scheduled_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_scheduled_blocks"  ON scheduled_blocks FOR ALL TO anon        USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_scheduled_blocks"  ON scheduled_blocks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sb_day      ON scheduled_blocks(day);
CREATE INDEX IF NOT EXISTS idx_sb_ticket   ON scheduled_blocks(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sb_assignee ON scheduled_blocks(assignee_code);

-- Also create meetings table for Meeting Studio archive
CREATE TABLE IF NOT EXISTS meetings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL DEFAULT 'Meeting',
  started_at   TIMESTAMPTZ NOT NULL,
  ended_at     TIMESTAMPTZ,
  transcript   JSONB       NOT NULL DEFAULT '[]',
  summary      TEXT,
  action_items JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_meetings" ON meetings FOR ALL TO anon        USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_meetings" ON meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);
