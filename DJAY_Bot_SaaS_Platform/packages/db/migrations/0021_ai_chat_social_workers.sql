CREATE TABLE tenancy.ai_social_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) = 32),
  external_subject_ciphertext text NOT NULL CHECK (char_length(external_subject_ciphertext) BETWEEN 32 AND 16384),
  contact_id uuid,
  conversation_id uuid,
  session_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'opted_out', 'blocked')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, connection_id, subject_hash),
  FOREIGN KEY (tenant_id, connection_id)
    REFERENCES tenancy.ai_social_connections(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, contact_id) REFERENCES tenancy.contacts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, session_id) REFERENCES tenancy.ai_sessions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (
    (contact_id IS NULL AND conversation_id IS NULL AND session_id IS NULL)
    OR (contact_id IS NOT NULL AND conversation_id IS NOT NULL AND session_id IS NOT NULL)
  )
);

ALTER TABLE tenancy.ai_social_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.ai_social_subjects FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.ai_social_subjects
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

CREATE OR REPLACE FUNCTION tenancy.claim_ai_social_inbound(
  claim_time timestamptz,
  stale_before timestamptz
)
RETURNS TABLE (
  outbox_id uuid,
  receipt_id uuid,
  tenant_id uuid,
  connection_id uuid,
  channel text,
  event_type text,
  external_message_id text,
  subject_hash bytea,
  occurred_at timestamptz,
  normalized_json jsonb,
  credential_ciphertext text,
  credential_key_version integer,
  attempt_count integer,
  processing_allowed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'ai_social_worker' THEN
    RAISE EXCEPTION 'AI social worker context required';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT candidate_outbox.id
    FROM tenancy.outbox candidate_outbox
    WHERE candidate_outbox.topic = 'ai_chat.social.inbound.received'
      AND candidate_outbox.available_at <= claim_time
      AND candidate_outbox.attempt_count < 10
      AND (
        candidate_outbox.status IN ('pending', 'failed')
        OR (candidate_outbox.status = 'processing' AND candidate_outbox.locked_at < stale_before)
      )
    ORDER BY candidate_outbox.available_at, candidate_outbox.created_at, candidate_outbox.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE tenancy.outbox claimed_outbox
    SET status = 'processing', locked_at = claim_time,
        attempt_count = claimed_outbox.attempt_count + 1,
        last_error_code = NULL
    FROM candidate
    WHERE claimed_outbox.id = candidate.id
    RETURNING claimed_outbox.*
  )
  SELECT claimed.id, receipt.id, claimed.tenant_id, connection.id, receipt.channel,
         receipt.event_type, receipt.external_message_id, receipt.subject_hash,
         receipt.occurred_at, receipt.normalized_json,
         CASE WHEN connection.status = 'active' THEN connection.credential_ciphertext ELSE NULL END,
         connection.credential_key_version, claimed.attempt_count,
         COALESCE(
           receipt.disposition = 'accepted'
           AND connection.status = 'active'
           AND deployment.status = 'active'
           AND agent.status = 'active'
           AND agent.current_published_playbook_version_id IS NOT NULL
           AND receipt.normalized_json->>'subjectCiphertext' IS NOT NULL
           AND EXISTS (
             SELECT 1
             FROM tenancy.entitlement_snapshots snapshot
             JOIN tenancy.product_subscriptions subscription
               ON subscription.tenant_id = snapshot.tenant_id
              AND subscription.id = snapshot.subscription_id
              AND subscription.status IN ('active', 'trialing', 'scheduled_change')
             JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
             JOIN catalog.plans plan ON plan.id = version.plan_id
              AND plan.product_key = 'ai_chat' AND plan.plan_key = 'ai_chat_premium'
             WHERE snapshot.tenant_id = claimed.tenant_id
               AND snapshot.product_key = 'ai_chat' AND snapshot.access_mode = 'active'
               AND snapshot.resolved_json->'entitlements'->>('channel.' || receipt.channel) = 'true'
               AND snapshot.resolved_json->'entitlements'->>'sales_core.enabled' = 'true'
           ), false
         )
  FROM claimed
  JOIN tenancy.ai_social_inbound_receipts receipt
    ON receipt.tenant_id = claimed.tenant_id
   AND receipt.id = NULLIF(claimed.payload->>'receiptId', '')::uuid
  JOIN tenancy.ai_social_connections connection
    ON connection.tenant_id = receipt.tenant_id AND connection.id = receipt.connection_id
  JOIN tenancy.ai_deployments deployment
    ON deployment.tenant_id = connection.tenant_id AND deployment.id = connection.deployment_id
  JOIN tenancy.ai_agents agent
    ON agent.tenant_id = connection.tenant_id AND agent.id = connection.agent_id;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.finish_ai_social_inbound(
  target_outbox_id uuid,
  processed boolean,
  safe_error_code text DEFAULT NULL,
  dead_letter boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE changed integer; target_tenant_id uuid; final_dead_letter boolean;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'ai_social_worker' THEN
    RAISE EXCEPTION 'AI social worker context required';
  END IF;
  SELECT target.attempt_count >= 10 OR dead_letter INTO final_dead_letter
  FROM tenancy.outbox target
  WHERE target.id = target_outbox_id
    AND target.topic = 'ai_chat.social.inbound.received'
    AND target.status = 'processing';
  UPDATE tenancy.outbox target
  SET status = CASE WHEN processed THEN 'sent'
                    WHEN final_dead_letter THEN 'dead_letter' ELSE 'failed' END,
      available_at = CASE WHEN processed OR final_dead_letter THEN target.available_at
                          ELSE now() + make_interval(secs => LEAST(3600, 30 * (2 ^ LEAST(target.attempt_count, 7)))) END,
      locked_at = NULL,
      processed_at = CASE WHEN processed OR final_dead_letter THEN now() ELSE NULL END,
      last_error_code = CASE WHEN processed THEN NULL
                             ELSE left(COALESCE(safe_error_code, 'social_processing_failed'), 100) END
  WHERE target.id = target_outbox_id
    AND target.topic = 'ai_chat.social.inbound.received'
    AND target.status = 'processing'
  RETURNING target.tenant_id INTO target_tenant_id;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 AND NOT processed THEN
    INSERT INTO tenancy.audit_logs (
      tenant_id, action, target_type, target_id, request_id, result, metadata
    ) VALUES (
      target_tenant_id, 'ai_chat.social_inbound_failed', 'tenant_outbox',
      target_outbox_id::text,
      COALESCE(current_setting('app.request_id', true), 'ai-social-worker'),
      'failed', jsonb_build_object(
        'errorCode', left(COALESCE(safe_error_code, 'social_processing_failed'), 100),
        'deadLetter', COALESCE(final_dead_letter, false)
      )
    );
  END IF;
  RETURN changed = 1;
END
$$;

REVOKE ALL ON tenancy.ai_social_subjects FROM PUBLIC;
GRANT SELECT ON tenancy.ai_social_subjects TO djay_runtime;
REVOKE ALL ON FUNCTION tenancy.claim_ai_social_inbound(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finish_ai_social_inbound(uuid, boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.claim_ai_social_inbound(timestamptz, timestamptz) TO djay_worker;
GRANT EXECUTE ON FUNCTION tenancy.finish_ai_social_inbound(uuid, boolean, text, boolean) TO djay_worker;
