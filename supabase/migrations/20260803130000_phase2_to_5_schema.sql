-- Phase 2: transfer support on transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS to_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_category_required;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_category_required CHECK (
    type = 'transfer'
    OR (category IS NOT NULL AND length(trim(category)) > 0)
  );

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_transfer_accounts_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_transfer_accounts_check CHECK (
    (type <> 'transfer' AND to_account_id IS NULL)
    OR (
      type = 'transfer'
      AND to_account_id IS NOT NULL
      AND to_account_id <> account_id
    )
  );

CREATE OR REPLACE FUNCTION public.apply_transaction_balance_delta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  delta numeric(14,2) := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' THEN
      IF NEW.type = 'income' THEN
        UPDATE public.accounts SET balance = balance + NEW.amount
        WHERE id = NEW.account_id AND user_id = NEW.user_id;
      ELSIF NEW.type = 'expense' THEN
        UPDATE public.accounts SET balance = balance - NEW.amount
        WHERE id = NEW.account_id AND user_id = NEW.user_id;
      ELSIF NEW.type = 'transfer' THEN
        UPDATE public.accounts SET balance = balance - NEW.amount
        WHERE id = NEW.account_id AND user_id = NEW.user_id;
        UPDATE public.accounts SET balance = balance + NEW.amount
        WHERE id = NEW.to_account_id AND user_id = NEW.user_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'completed' THEN
      IF OLD.type = 'income' THEN
        UPDATE public.accounts SET balance = balance - OLD.amount
        WHERE id = OLD.account_id AND user_id = OLD.user_id;
      ELSIF OLD.type = 'expense' THEN
        UPDATE public.accounts SET balance = balance + OLD.amount
        WHERE id = OLD.account_id AND user_id = OLD.user_id;
      ELSIF OLD.type = 'transfer' THEN
        UPDATE public.accounts SET balance = balance + OLD.amount
        WHERE id = OLD.account_id AND user_id = OLD.user_id;
        UPDATE public.accounts SET balance = balance - OLD.amount
        WHERE id = OLD.to_account_id AND user_id = OLD.user_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: reverse old, apply new
  IF OLD.status = 'completed' THEN
    IF OLD.type = 'income' THEN
      UPDATE public.accounts SET balance = balance - OLD.amount
      WHERE id = OLD.account_id AND user_id = OLD.user_id;
    ELSIF OLD.type = 'expense' THEN
      UPDATE public.accounts SET balance = balance + OLD.amount
      WHERE id = OLD.account_id AND user_id = OLD.user_id;
    ELSIF OLD.type = 'transfer' THEN
      UPDATE public.accounts SET balance = balance + OLD.amount
      WHERE id = OLD.account_id AND user_id = OLD.user_id;
      UPDATE public.accounts SET balance = balance - OLD.amount
      WHERE id = OLD.to_account_id AND user_id = OLD.user_id;
    END IF;
  END IF;

  IF NEW.status = 'completed' THEN
    IF NEW.type = 'income' THEN
      UPDATE public.accounts SET balance = balance + NEW.amount
      WHERE id = NEW.account_id AND user_id = NEW.user_id;
    ELSIF NEW.type = 'expense' THEN
      UPDATE public.accounts SET balance = balance - NEW.amount
      WHERE id = NEW.account_id AND user_id = NEW.user_id;
    ELSIF NEW.type = 'transfer' THEN
      UPDATE public.accounts SET balance = balance - NEW.amount
      WHERE id = NEW.account_id AND user_id = NEW.user_id;
      UPDATE public.accounts SET balance = balance + NEW.amount
      WHERE id = NEW.to_account_id AND user_id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Phase 3/4: notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL DEFAULT 'system',
  title text NOT NULL,
  body text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- inserts via service role / security definer helpers
CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

GRANT ALL ON TABLE public.notifications TO anon, authenticated, service_role;

-- Phase 4: subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  amount numeric(14,2) NOT NULL,
  category text NOT NULL DEFAULT 'others',
  frequency public.subscription_frequency NOT NULL DEFAULT 'monthly',
  next_due_date date NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT subscriptions_amount_positive CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS subscriptions_user_due_idx
  ON public.subscriptions (user_id, next_due_date ASC)
  WHERE is_active = true;

CREATE OR REPLACE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own subscriptions"
  ON public.subscriptions FOR DELETE
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.subscriptions TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.advance_subscription_due_date(
  p_date date,
  p_frequency public.subscription_frequency
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_frequency
    WHEN 'daily' THEN RETURN p_date + 1;
    WHEN 'weekly' THEN RETURN p_date + 7;
    WHEN 'monthly' THEN RETURN (p_date + interval '1 month')::date;
    WHEN 'quarterly' THEN RETURN (p_date + interval '3 months')::date;
    WHEN 'yearly' THEN RETURN (p_date + interval '1 year')::date;
    ELSE RETURN (p_date + interval '1 month')::date;
  END CASE;
END;
$$;

GRANT ALL ON FUNCTION public.advance_subscription_due_date(date, public.subscription_frequency) TO anon, authenticated, service_role;
