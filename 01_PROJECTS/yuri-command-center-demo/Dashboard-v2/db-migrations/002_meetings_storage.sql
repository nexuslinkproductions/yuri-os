-- Run in Supabase SQL editor
-- Creates the meetings storage bucket for audio file backup

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meetings',
  'meetings',
  true,
  104857600, -- 100 MB per file
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: allow anon + authenticated to read/write
CREATE POLICY "meetings_bucket_anon_select"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'meetings');

CREATE POLICY "meetings_bucket_anon_insert"
  ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'meetings');

CREATE POLICY "meetings_bucket_auth_all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'meetings') WITH CHECK (bucket_id = 'meetings');
