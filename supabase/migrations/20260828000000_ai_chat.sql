-- AI chat: sessions, messages, and an audit trail for every write the AI performs on a user's behalf.

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS chat_sessions_user_updated_idx
  ON public.chat_sessions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content text NOT NULL DEFAULT '',
  -- Structured extras: chart specs, proposed-write cards, tool call/result payloads, etc.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
  ON public.chat_messages (session_id, created_at ASC);

-- Every insert/update/delete the AI actually executes gets logged here, regardless of outcome.
-- This is what powers "show me what the AI changed" and any future undo feature.
CREATE TABLE IF NOT EXISTS public.ai_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.chat_sessions(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  entity text NOT NULL CHECK (entity IN ('transaction', 'subscription', 'account', 'category')),
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS ai_action_log_user_created_idx
  ON public.ai_action_log (user_id, created_at DESC);

CREATE OR REPLACE TRIGGER chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;

-- The remote project may already contain these policies from an interrupted
-- deployment. PostgreSQL has no CREATE POLICY IF NOT EXISTS, so ignore only
-- the duplicate-policy condition and let every other migration error surface.
DO $$ BEGIN
  CREATE POLICY "Users can view own chat sessions" ON public.chat_sessions FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own chat sessions" ON public.chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update own chat sessions" ON public.chat_sessions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own chat sessions" ON public.chat_sessions FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own chat messages" ON public.chat_messages FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can create own chat messages" ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete own chat messages" ON public.chat_messages FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own ai action log" ON public.ai_action_log FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Inserts into ai_action_log are done by the edge function using the user's own JWT,
-- so this still needs a WITH CHECK, but no client-side UPDATE/DELETE policy is provided:
-- the audit log is append-only from the app's perspective.
DO $$ BEGIN
  CREATE POLICY "Users can insert own ai action log" ON public.ai_action_log FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT ALL ON TABLE public.chat_sessions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.chat_messages TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.ai_action_log TO anon, authenticated, service_role;
