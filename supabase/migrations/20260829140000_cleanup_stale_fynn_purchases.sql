-- Delete unpaid Fynn checkout rows that never completed (status = created)
-- after 30 minutes. Paid history is never touched.

CREATE INDEX IF NOT EXISTS fynn_purchases_stale_created_idx
  ON public.fynn_purchases (created_at)
  WHERE status = 'created';

CREATE OR REPLACE FUNCTION public.cleanup_stale_fynn_purchases()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.fynn_purchases
  WHERE status = 'created'
    AND created_at < timezone('utc', now()) - interval '30 minutes';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_fynn_purchases() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_fynn_purchases() TO postgres, service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'cleanup-stale-fynn-purchases';
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-stale-fynn-purchases',
  '*/5 * * * *',
  $$SELECT public.cleanup_stale_fynn_purchases()$$
);
