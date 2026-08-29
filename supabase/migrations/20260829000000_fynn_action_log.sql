-- ai_action_log (and its RLS policies) was created in 20260828000000_ai_chat.sql
-- with a session_id pointing at chat_sessions. Fynn confirm writes against
-- fynn_proposals / fynn_chats, so add those columns without recreating the table.

ALTER TABLE public.ai_action_log
  ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.fynn_proposals(id) ON DELETE SET NULL;

ALTER TABLE public.ai_action_log
  ADD COLUMN IF NOT EXISTS chat_id uuid REFERENCES public.fynn_chats(id) ON DELETE SET NULL;
