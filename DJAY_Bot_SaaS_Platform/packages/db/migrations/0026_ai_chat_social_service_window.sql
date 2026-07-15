DROP FUNCTION tenancy.claim_ai_social_delivery(timestamptz, timestamptz);

CREATE FUNCTION tenancy.claim_ai_social_delivery(
  claim_time timestamptz,
  stale_before timestamptz
)
RETURNS TABLE (
  delivery_id uuid, tenant_id uuid, connection_id uuid, message_id uuid,
  channel text, recipient_ciphertext text, reply_token_ciphertext text,
  response_json jsonb, credential_ciphertext text, credential_key_version integer,
  attempt_count integer, service_window_open boolean, delivery_allowed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'ai_social_delivery_worker' THEN
    RAISE EXCEPTION 'AI social delivery worker context required';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT candidate_delivery.id
    FROM tenancy.ai_social_outbound_deliveries candidate_delivery
    WHERE candidate_delivery.available_at <= claim_time
      AND candidate_delivery.attempt_count < 10
      AND (
        candidate_delivery.status IN ('pending', 'failed')
        OR (candidate_delivery.status = 'processing' AND candidate_delivery.locked_at < stale_before)
      )
    ORDER BY candidate_delivery.available_at, candidate_delivery.created_at, candidate_delivery.id
    FOR UPDATE SKIP LOCKED LIMIT 1
  ), claimed AS (
    UPDATE tenancy.ai_social_outbound_deliveries target
    SET status = 'processing', locked_at = claim_time,
        attempt_count = target.attempt_count + 1, safe_error_code = NULL
    FROM candidate WHERE target.id = candidate.id
    RETURNING target.*
  )
  SELECT claimed.id, claimed.tenant_id, claimed.connection_id, claimed.message_id,
         claimed.channel, claimed.recipient_ciphertext, claimed.reply_token_ciphertext,
         claimed.response_json,
         CASE WHEN connection.status = 'active' THEN connection.credential_ciphertext ELSE NULL END,
         connection.credential_key_version, claimed.attempt_count,
         claimed.channel = 'line' OR claim_time <= receipt.occurred_at + interval '24 hours',
         COALESCE(
           connection.status = 'active' AND deployment.status = 'active'
           AND subject.status = 'active'
           AND (claimed.channel = 'line' OR claim_time <= receipt.occurred_at + interval '24 hours')
           AND EXISTS (
             SELECT 1 FROM tenancy.entitlement_snapshots snapshot
             JOIN tenancy.product_subscriptions subscription
               ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
              AND subscription.status IN ('active', 'trialing', 'scheduled_change')
             JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
             JOIN catalog.plans plan ON plan.id = version.plan_id
              AND plan.product_key = 'ai_chat' AND plan.plan_key = 'ai_chat_premium'
             WHERE snapshot.tenant_id = claimed.tenant_id
               AND snapshot.product_key = 'ai_chat' AND snapshot.access_mode = 'active'
               AND snapshot.resolved_json->'entitlements'->>('channel.' || claimed.channel) = 'true'
           ), false
         )
  FROM claimed
  JOIN tenancy.ai_social_connections connection
    ON connection.tenant_id = claimed.tenant_id AND connection.id = claimed.connection_id
  JOIN tenancy.ai_deployments deployment
    ON deployment.tenant_id = connection.tenant_id AND deployment.id = connection.deployment_id
  JOIN tenancy.ai_social_inbound_receipts receipt
    ON receipt.tenant_id = claimed.tenant_id AND receipt.id = claimed.receipt_id
  JOIN tenancy.ai_social_subjects subject
    ON subject.tenant_id = receipt.tenant_id AND subject.connection_id = receipt.connection_id
   AND subject.subject_hash = receipt.subject_hash;
END
$$;

REVOKE ALL ON FUNCTION tenancy.claim_ai_social_delivery(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_ai_social_delivery(timestamptz, timestamptz) TO djay_worker;
