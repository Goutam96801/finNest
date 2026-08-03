-- Seed test data for user bfea3e42-c634-41a4-992f-59bc96403d6d
-- Idempotent-ish: clears this user's transactional data first, then inserts fresh fixtures.

BEGIN;

DO $$
DECLARE
  v_uid uuid := 'bfea3e42-c634-41a4-992f-59bc96403d6d';
  v_hdfc uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
  v_cash uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
  v_wallet uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  v_axis uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
    RAISE EXCEPTION 'Profile % not found — sign up / create profile first', v_uid;
  END IF;

  -- Wipe existing test rows for this user (children first)
  DELETE FROM public.notifications WHERE user_id = v_uid;
  DELETE FROM public.subscriptions WHERE user_id = v_uid;
  DELETE FROM public.transactions WHERE user_id = v_uid;
  DELETE FROM public.accounts WHERE user_id = v_uid;

  UPDATE public.profiles
  SET
    full_name = COALESCE(NULLIF(full_name, ''), 'Test User'),
    currency = 'INR',
    timezone = 'Asia/Kolkata',
    updated_at = timezone('utc', now())
  WHERE id = v_uid;

  -- Accounts start at 0; balances come from completed transactions via trigger
  INSERT INTO public.accounts (
    id, user_id, name, type, balance, color, icon,
    account_number_last4, bank_name, credit_limit,
    is_primary, is_archived, display_order, notes
  ) VALUES
    (v_hdfc, v_uid, 'HDFC Salary', 'bank', 0, '#3B82F6', 'Bank', '4521', 'HDFC Bank', NULL, true, false, 0, 'Primary salary account'),
    (v_cash, v_uid, 'Cash', 'cash', 0, '#22C55E', 'Money', NULL, NULL, NULL, false, false, 1, 'Everyday cash'),
    (v_wallet, v_uid, 'PhonePe Wallet', 'wallet', 0, '#A855F7', 'Wallet', '8890', 'PhonePe', NULL, false, false, 2, 'UPI wallet'),
    (v_axis, v_uid, 'Axis Credit', 'credit_card', 0, '#F59E0B', 'CreditCard', '7788', 'Axis Bank', 150000, false, false, 3, 'Rewards card');

  -- Income
  INSERT INTO public.transactions (
    user_id, account_id, to_account_id, type, category, amount, description, status, transaction_date
  ) VALUES
    (v_uid, v_hdfc, NULL, 'income', 'income', 85000.00, 'July salary', 'completed', timezone('utc', now()) - interval '28 days'),
    (v_uid, v_hdfc, NULL, 'income', 'income', 85000.00, 'August salary', 'completed', timezone('utc', now()) - interval '2 days'),
    (v_uid, v_cash, NULL, 'income', 'income', 2500.00, 'Freelance tip', 'completed', timezone('utc', now()) - interval '12 days'),
    (v_uid, v_wallet, NULL, 'income', 'income', 1200.00, 'Cashback credit', 'completed', timezone('utc', now()) - interval '9 days');

  -- Expenses
  INSERT INTO public.transactions (
    user_id, account_id, to_account_id, type, category, amount, description, status, transaction_date
  ) VALUES
    (v_uid, v_hdfc, NULL, 'expense', 'rent', 22000.00, 'Apartment rent', 'completed', timezone('utc', now()) - interval '25 days'),
    (v_uid, v_hdfc, NULL, 'expense', 'utilities', 1850.00, 'Electricity + wifi', 'completed', timezone('utc', now()) - interval '20 days'),
    (v_uid, v_hdfc, NULL, 'expense', 'insurance', 3200.00, 'Health insurance premium', 'completed', timezone('utc', now()) - interval '18 days'),
    (v_uid, v_hdfc, NULL, 'expense', 'groceries', 4200.00, 'BigBasket monthly', 'completed', timezone('utc', now()) - interval '14 days'),
    (v_uid, v_cash, NULL, 'expense', 'dining', 680.00, 'Dinner with friends', 'completed', timezone('utc', now()) - interval '10 days'),
    (v_uid, v_wallet, NULL, 'expense', 'transportation', 450.00, 'Cab rides', 'completed', timezone('utc', now()) - interval '8 days'),
    (v_uid, v_wallet, NULL, 'expense', 'entertainment', 499.00, 'Movie tickets', 'completed', timezone('utc', now()) - interval '7 days'),
    (v_uid, v_hdfc, NULL, 'expense', 'health', 1500.00, 'Pharmacy + checkup', 'completed', timezone('utc', now()) - interval '6 days'),
    (v_uid, v_cash, NULL, 'expense', 'personal', 350.00, 'Haircut', 'completed', timezone('utc', now()) - interval '5 days'),
    (v_uid, v_axis, NULL, 'expense', 'clothing', 2899.00, 'Weekend shopping', 'completed', timezone('utc', now()) - interval '4 days'),
    (v_uid, v_hdfc, NULL, 'expense', 'dining', 1250.00, 'Team lunch', 'completed', timezone('utc', now()) - interval '3 days'),
    (v_uid, v_wallet, NULL, 'expense', 'groceries', 890.00, 'Quick kirana run', 'completed', timezone('utc', now()) - interval '1 day'),
    (v_uid, v_hdfc, NULL, 'expense', 'others', 199.00, 'App store purchase', 'completed', timezone('utc', now()) - interval '6 hours');

  -- Transfers
  INSERT INTO public.transactions (
    user_id, account_id, to_account_id, type, category, amount, description, status, transaction_date
  ) VALUES
    (v_uid, v_hdfc, v_cash, 'transfer', NULL, 5000.00, 'ATM cash withdrawal', 'completed', timezone('utc', now()) - interval '11 days'),
    (v_uid, v_hdfc, v_wallet, 'transfer', NULL, 3000.00, 'Top-up PhonePe', 'completed', timezone('utc', now()) - interval '9 days'),
    (v_uid, v_hdfc, v_axis, 'transfer', NULL, 2899.00, 'Pay Axis credit bill', 'completed', timezone('utc', now()) - interval '3 days');

  -- Subscriptions (upcoming + mix of frequencies)
  INSERT INTO public.subscriptions (
    user_id, account_id, name, amount, category, frequency, next_due_date, notes, is_active
  ) VALUES
    (v_uid, v_hdfc, 'Netflix', 649.00, 'entertainment', 'monthly', (CURRENT_DATE + 2), 'Premium plan', true),
    (v_uid, v_wallet, 'Spotify', 119.00, 'entertainment', 'monthly', (CURRENT_DATE + 5), 'Individual', true),
    (v_uid, v_hdfc, 'Cult.fit', 1499.00, 'health', 'monthly', (CURRENT_DATE + 8), 'Elite membership', true),
    (v_uid, v_hdfc, 'Amazon Prime', 1499.00, 'entertainment', 'yearly', (CURRENT_DATE + 40), 'Annual renewal', true),
    (v_uid, v_axis, 'Adobe CC', 4225.00, 'others', 'monthly', (CURRENT_DATE + 1), 'Photography plan', true),
    (v_uid, v_hdfc, 'iCloud+', 75.00, 'others', 'monthly', (CURRENT_DATE + 12), '50GB', true);

  -- Notifications (U&\20B9 = ₹ so Windows seed encoding cannot corrupt it)
  INSERT INTO public.notifications (user_id, type, title, body, data, is_read, created_at) VALUES
    (v_uid, 'subscription_due', 'Adobe CC due tomorrow', U&'\20B94,225 will be due soon', '{"name":"Adobe CC"}'::jsonb, false, timezone('utc', now()) - interval '2 hours'),
    (v_uid, 'subscription_due', 'Netflix due in 2 days', U&'\20B9649 scheduled on HDFC Salary', '{"name":"Netflix"}'::jsonb, false, timezone('utc', now()) - interval '1 day'),
    (v_uid, 'low_balance', 'Cash running low', U&'Cash balance is under \20B95,000 after recent spends', '{}'::jsonb, false, timezone('utc', now()) - interval '3 days'),
    (v_uid, 'subscription_paid', 'Spotify marked paid', 'Next due advanced by one month', '{"name":"Spotify"}'::jsonb, true, timezone('utc', now()) - interval '10 days'),
    (v_uid, 'system', 'Welcome to FinNest', 'Your accounts, transactions, and subscriptions are ready to explore.', '{}'::jsonb, true, timezone('utc', now()) - interval '30 days');
END $$;

COMMIT;

-- Summary
SELECT 'accounts' AS entity, count(*)::text AS count
FROM accounts WHERE user_id = 'bfea3e42-c634-41a4-992f-59bc96403d6d'
UNION ALL
SELECT 'transactions', count(*)::text
FROM transactions WHERE user_id = 'bfea3e42-c634-41a4-992f-59bc96403d6d'
UNION ALL
SELECT 'subscriptions', count(*)::text
FROM subscriptions WHERE user_id = 'bfea3e42-c634-41a4-992f-59bc96403d6d'
UNION ALL
SELECT 'notifications', count(*)::text
FROM notifications WHERE user_id = 'bfea3e42-c634-41a4-992f-59bc96403d6d';

SELECT name, type, balance, is_primary, bank_name, account_number_last4
FROM accounts
WHERE user_id = 'bfea3e42-c634-41a4-992f-59bc96403d6d'
ORDER BY display_order;
