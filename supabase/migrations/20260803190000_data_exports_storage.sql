-- Data exports metadata + storage bucket

CREATE TABLE IF NOT EXISTS public.data_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('csv', 'pdf')),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS data_exports_user_created_idx
  ON public.data_exports (user_id, created_at DESC);

ALTER TABLE public.data_exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exports"
  ON public.data_exports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own exports"
  ON public.data_exports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own exports"
  ON public.data_exports FOR DELETE
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.data_exports TO anon, authenticated, service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exports',
  'exports',
  false,
  52428800,
  ARRAY['text/csv', 'application/pdf', 'text/plain']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "Users can read own export files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own export files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own export files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own export files" ON storage.objects;
DROP POLICY IF EXISTS "Service role manages export files" ON storage.objects;

CREATE POLICY "Users can read own export files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can upload own export files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update own export files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own export files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'exports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Service role manages export files"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'exports')
  WITH CHECK (bucket_id = 'exports');
