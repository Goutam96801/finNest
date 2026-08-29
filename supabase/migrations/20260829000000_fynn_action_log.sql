-- Audit trail for every write the AI actually executes on a user's behalf
-- (after they've confirmed a fynn_proposals row). Append-only from the app's
-- perspective — this is what would power a future "show me what Fynn changed"
-- or undo feature.

CREATE TABLE IF NOT EXISTS public.ai_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposal_id uuid REFERENCES public.fynn_proposals(id) ON DELETE SET NULL,
  chat_id uuid REFERENCES public.fynn_chats(id) ON DELETE SET NULL,
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

ALTER TABLE public.ai_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai action log"
  ON public.ai_action_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ai action log"
  ON public.ai_action_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE public.ai_action_log TO anon, authenticated, service_role;
