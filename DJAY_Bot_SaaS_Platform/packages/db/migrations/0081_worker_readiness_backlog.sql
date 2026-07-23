-- Phase 12 / G6d: worker readiness may observe Stripe webhook backlog without claiming jobs.

CREATE OR REPLACE FUNCTION billing.webhook_backlog_stats(
  stale_after interval DEFAULT interval '5 minutes'
)
RETURNS TABLE (
  received_count integer,
  processing_stale_count integer,
  failed_recent_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, billing
AS $$
BEGIN
  IF session_user <> 'djay_worker' THEN
    RAISE EXCEPTION 'billing_webhook_backlog_worker_required';
  END IF;
  RETURN QUERY
  SELECT
    (SELECT count(*)::int FROM billing.webhook_events
      WHERE provider_key = 'stripe' AND status = 'received') AS received_count,
    (SELECT count(*)::int FROM billing.webhook_events
      WHERE provider_key = 'stripe' AND status = 'processing'
        AND received_at < now() - stale_after) AS processing_stale_count,
    (SELECT count(*)::int FROM billing.webhook_events
      WHERE provider_key = 'stripe' AND status = 'failed'
        AND received_at > now() - interval '1 hour') AS failed_recent_count;
END
$$;

REVOKE ALL ON FUNCTION billing.webhook_backlog_stats(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.webhook_backlog_stats(interval) TO djay_worker;
