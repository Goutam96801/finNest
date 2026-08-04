-- Switch Nest billing identifiers from Stripe to Razorpay
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS razorpay_customer_id text,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_razorpay_customer_id_uidx
  ON public.profiles (razorpay_customer_id)
  WHERE razorpay_customer_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.razorpay_customer_id IS 'Razorpay Customer id';
COMMENT ON COLUMN public.profiles.razorpay_subscription_id IS 'Active/latest Razorpay Subscription id';
COMMENT ON COLUMN public.profiles.nest_price_id IS 'Active Razorpay Plan id (monthly or yearly)';
COMMENT ON COLUMN public.profiles.nest_renews_at IS 'Current period end from Razorpay subscription';
COMMENT ON COLUMN public.profiles.nest_status IS 'Razorpay subscription status snapshot';
