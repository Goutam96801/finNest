-- Nest billing columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nest_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS nest_price_id text,
  ADD COLUMN IF NOT EXISTS nest_renews_at timestamptz,
  ADD COLUMN IF NOT EXISTS nest_status text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_uidx
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.nest_active IS 'True when Nest subscription is active or trialing';
COMMENT ON COLUMN public.profiles.stripe_customer_id IS 'Stripe Customer id for Checkout/Portal';
COMMENT ON COLUMN public.profiles.nest_price_id IS 'Active Stripe Price id (monthly or yearly)';
COMMENT ON COLUMN public.profiles.nest_renews_at IS 'Current period end from Stripe';
COMMENT ON COLUMN public.profiles.nest_status IS 'Stripe subscription status snapshot';
