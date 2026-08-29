-- Fynn Pro prepaid access (Razorpay Orders). Distinct from public.subscriptions (bills).

CREATE TABLE IF NOT EXISTS public.fynn_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('monthly', 'yearly')),
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  razorpay_order_id text NOT NULL UNIQUE,
  razorpay_payment_id text UNIQUE,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS fynn_purchases_user_status_end_idx
  ON public.fynn_purchases (user_id, status, period_end DESC);

CREATE TABLE IF NOT EXISTS public.fynn_usage_daily (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day date NOT NULL,
  message_count integer NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  PRIMARY KEY (user_id, day)
);

CREATE OR REPLACE TRIGGER fynn_purchases_updated_at
  BEFORE UPDATE ON public.fynn_purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.fynn_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fynn_usage_daily ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own fynn purchases"
    ON public.fynn_purchases FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can view own fynn usage"
    ON public.fynn_usage_daily FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT ON TABLE public.fynn_purchases TO authenticated;
GRANT SELECT ON TABLE public.fynn_usage_daily TO authenticated;
GRANT ALL ON TABLE public.fynn_purchases TO service_role;
GRANT ALL ON TABLE public.fynn_usage_daily TO service_role;

-- Webhook-only: mark an order paid and extend the entitlement window.
CREATE OR REPLACE FUNCTION public.activate_fynn_purchase(
  p_order_id text,
  p_payment_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.fynn_purchases%ROWTYPE;
  v_start timestamptz;
  v_max_end timestamptz;
  v_days integer;
BEGIN
  SELECT * INTO rec
  FROM public.fynn_purchases
  WHERE razorpay_order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND');
  END IF;

  IF rec.status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_PAID', 'period_end', rec.period_end);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fynn_purchases
    WHERE razorpay_payment_id = p_payment_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ALREADY_PAID');
  END IF;

  SELECT max(period_end) INTO v_max_end
  FROM public.fynn_purchases
  WHERE user_id = rec.user_id AND status = 'paid';

  v_start := GREATEST(timezone('utc', now()), COALESCE(v_max_end, timezone('utc', now())));
  v_days := CASE WHEN rec.plan = 'yearly' THEN 365 ELSE 30 END;

  UPDATE public.fynn_purchases
  SET
    status = 'paid',
    razorpay_payment_id = p_payment_id,
    period_start = v_start,
    period_end = v_start + make_interval(days => v_days),
    updated_at = timezone('utc', now())
  WHERE id = rec.id
  RETURNING * INTO rec;

  RETURN jsonb_build_object('ok', true, 'period_end', rec.period_end);
END;
$$;

REVOKE ALL ON FUNCTION public.activate_fynn_purchase(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_fynn_purchase(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_fynn_pro_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_end timestamptz;
  v_plan text;
  v_day date;
  v_count integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT period_end, plan INTO v_end, v_plan
  FROM public.fynn_purchases
  WHERE user_id = uid AND status = 'paid' AND period_end > timezone('utc', now())
  ORDER BY period_end DESC
  LIMIT 1;

  v_day := (timezone('Asia/Kolkata', now()))::date;

  SELECT message_count INTO v_count
  FROM public.fynn_usage_daily
  WHERE user_id = uid AND day = v_day;

  RETURN jsonb_build_object(
    'subscribed', v_end IS NOT NULL,
    'plan', v_plan,
    'period_end', v_end,
    'used', COALESCE(v_count, 0),
    'limit', 20,
    'resets_at', ((v_day + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_fynn_pro_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fynn_pro_status() TO authenticated;

-- Atomically increment today's IST usage if subscribed and under the cap.
CREATE OR REPLACE FUNCTION public.consume_fynn_message()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_end timestamptz;
  v_day date;
  v_count integer;
  v_limit integer := 20;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT max(period_end) INTO v_end
  FROM public.fynn_purchases
  WHERE user_id = uid AND status = 'paid';

  IF v_end IS NULL OR v_end <= timezone('utc', now()) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SUBSCRIPTION_REQUIRED');
  END IF;

  v_day := (timezone('Asia/Kolkata', now()))::date;

  INSERT INTO public.fynn_usage_daily (user_id, day, message_count)
  VALUES (uid, v_day, 1)
  ON CONFLICT (user_id, day)
  DO UPDATE SET message_count = public.fynn_usage_daily.message_count + 1
  WHERE public.fynn_usage_daily.message_count < v_limit
  RETURNING message_count INTO v_count;

  IF v_count IS NULL THEN
    SELECT message_count INTO v_count
    FROM public.fynn_usage_daily
    WHERE user_id = uid AND day = v_day;

    RETURN jsonb_build_object(
      'ok', false,
      'code', 'DAILY_LIMIT',
      'used', COALESCE(v_count, v_limit),
      'limit', v_limit,
      'resets_at', ((v_day + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'used', v_count, 'limit', v_limit, 'period_end', v_end);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_fynn_message() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_fynn_message() TO authenticated;
