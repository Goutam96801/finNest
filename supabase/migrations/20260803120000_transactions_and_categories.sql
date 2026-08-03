-- Categories catalog + transactions schema
-- Aligns with existing enums: category_type, transaction_type, transaction_status

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  type public.category_type NOT NULL,
  icon text NOT NULL DEFAULT 'DotsThreeOutline',
  bg_color text NOT NULL DEFAULT '#525252',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT categories_slug_format CHECK (slug ~ '^[a-z0-9_]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS categories_system_slug_unique
  ON public.categories (slug)
  WHERE is_system = true;

CREATE UNIQUE INDEX IF NOT EXISTS categories_user_slug_unique
  ON public.categories (user_id, slug)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  type public.transaction_type NOT NULL,
  category text,
  amount numeric(14,2) NOT NULL,
  description text,
  status public.transaction_status NOT NULL DEFAULT 'completed',
  transaction_date timestamptz NOT NULL DEFAULT timezone('utc', now()),
  image_url text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT transactions_amount_positive CHECK (amount > 0),
  CONSTRAINT transactions_category_required CHECK (
    type = 'transfer' OR (category IS NOT NULL AND length(trim(category)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS transactions_user_id_idx ON public.transactions (user_id);
CREATE INDEX IF NOT EXISTS transactions_account_id_idx ON public.transactions (account_id);
CREATE INDEX IF NOT EXISTS transactions_user_date_idx ON public.transactions (user_id, transaction_date DESC);

CREATE OR REPLACE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Adjust account balance when transactions change
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
        delta := NEW.amount;
      ELSIF NEW.type = 'expense' THEN
        delta := -NEW.amount;
      END IF;

      IF delta <> 0 THEN
        UPDATE public.accounts
        SET balance = balance + delta
        WHERE id = NEW.account_id AND user_id = NEW.user_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'completed' THEN
      IF OLD.type = 'income' THEN
        delta := -OLD.amount;
      ELSIF OLD.type = 'expense' THEN
        delta := OLD.amount;
      END IF;

      IF delta <> 0 THEN
        UPDATE public.accounts
        SET balance = balance + delta
        WHERE id = OLD.account_id AND user_id = OLD.user_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: reverse old effect, apply new effect
  IF OLD.status = 'completed' THEN
    IF OLD.type = 'income' THEN
      delta := delta - OLD.amount;
    ELSIF OLD.type = 'expense' THEN
      delta := delta + OLD.amount;
    END IF;

    IF delta <> 0 THEN
      UPDATE public.accounts
      SET balance = balance + delta
      WHERE id = OLD.account_id AND user_id = OLD.user_id;
    END IF;
  END IF;

  delta := 0;

  IF NEW.status = 'completed' THEN
    IF NEW.type = 'income' THEN
      delta := NEW.amount;
    ELSIF NEW.type = 'expense' THEN
      delta := -NEW.amount;
    END IF;

    IF delta <> 0 THEN
      UPDATE public.accounts
      SET balance = balance + delta
      WHERE id = NEW.account_id AND user_id = NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_balance_aiud ON public.transactions;
CREATE TRIGGER transactions_balance_aiud
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.apply_transaction_balance_delta();

-- Recent transactions helper
CREATE OR REPLACE FUNCTION public.get_recent_transactions(p_limit integer DEFAULT 20)
RETURNS SETOF public.transactions
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public
AS $$
  SELECT *
  FROM public.transactions
  WHERE user_id = auth.uid()
  ORDER BY transaction_date DESC, created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
$$;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view system and own categories"
  ON public.categories FOR SELECT
  USING (is_system = true OR auth.uid() = user_id);

CREATE POLICY "Users can create own categories"
  ON public.categories FOR INSERT
  WITH CHECK (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can update own categories"
  ON public.categories FOR UPDATE
  USING (auth.uid() = user_id AND is_system = false)
  WITH CHECK (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can delete own categories"
  ON public.categories FOR DELETE
  USING (auth.uid() = user_id AND is_system = false);

CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON public.transactions FOR DELETE
  USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.categories TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.transactions TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.apply_transaction_balance_delta() TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.get_recent_transactions(integer) TO anon, authenticated, service_role;

-- Seed system categories (expense + income)
INSERT INTO public.categories (user_id, name, slug, type, icon, bg_color, is_system)
SELECT NULL, v.name, v.slug, v.type::public.category_type, v.icon, v.bg_color, true
FROM (
  VALUES
    ('Groceries', 'groceries', 'expense', 'ShoppingCart', '#4B5563'),
    ('Rent', 'rent', 'expense', 'House', '#075985'),
    ('Utilities', 'utilities', 'expense', 'Lightbulb', '#ca8a04'),
    ('Transportation', 'transportation', 'expense', 'Car', '#b45309'),
    ('Entertainment', 'entertainment', 'expense', 'FilmStrip', '#0f766e'),
    ('Dining', 'dining', 'expense', 'ForkKnife', '#be185d'),
    ('Health', 'health', 'expense', 'Heart', '#e11d48'),
    ('Insurance', 'insurance', 'expense', 'ShieldCheck', '#404040'),
    ('Savings', 'savings', 'expense', 'PiggyBank', '#065F46'),
    ('Clothing', 'clothing', 'expense', 'TShirt', '#7c3aed'),
    ('Personal', 'personal', 'expense', 'User', '#a21caf'),
    ('Others', 'others', 'expense', 'DotsThreeOutline', '#525252'),
    ('Income', 'income', 'income', 'CurrencyDollarSimple', '#16a34a')
) AS v(name, slug, type, icon, bg_color)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.is_system = true AND c.slug = v.slug
);
