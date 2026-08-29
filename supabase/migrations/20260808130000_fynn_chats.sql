CREATE TABLE IF NOT EXISTS public.fynn_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS fynn_chats_id_user_id_idx
  ON public.fynn_chats (id, user_id);

CREATE INDEX IF NOT EXISTS fynn_chats_user_updated_idx
  ON public.fynn_chats (user_id, updated_at DESC);

CREATE OR REPLACE TRIGGER fynn_chats_updated_at
  BEFORE UPDATE ON public.fynn_chats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.fynn_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  proposal_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT fynn_messages_chat_user_fk
    FOREIGN KEY (chat_id, user_id)
    REFERENCES public.fynn_chats (id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS fynn_messages_chat_created_idx
  ON public.fynn_messages (chat_id, created_at ASC);

CREATE OR REPLACE FUNCTION public.touch_fynn_chat_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.fynn_chats
  SET updated_at = timezone('utc', now())
  WHERE id = NEW.chat_id AND user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER fynn_messages_touch_chat
  AFTER INSERT ON public.fynn_messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_fynn_chat_updated_at();

ALTER TABLE public.fynn_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fynn_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fynn chats"
  ON public.fynn_chats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fynn chats"
  ON public.fynn_chats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fynn chats"
  ON public.fynn_chats FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own fynn chats"
  ON public.fynn_chats FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own fynn messages"
  ON public.fynn_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fynn messages"
  ON public.fynn_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fynn messages"
  ON public.fynn_messages FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own fynn messages"
  ON public.fynn_messages FOR DELETE
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.fynn_chats, public.fynn_messages TO anon, authenticated, service_role;
