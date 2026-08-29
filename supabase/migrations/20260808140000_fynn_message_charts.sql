ALTER TABLE public.fynn_messages
  ADD COLUMN IF NOT EXISTS chart_metadata jsonb;
