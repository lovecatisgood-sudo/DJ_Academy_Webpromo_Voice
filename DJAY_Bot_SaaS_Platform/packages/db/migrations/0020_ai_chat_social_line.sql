CREATE TABLE tenancy.ai_social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  deployment_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('line', 'whatsapp', 'messenger')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  external_account_ref text NOT NULL CHECK (char_length(external_account_ref) BETWEEN 3 AND 200),
  credential_ciphertext text NOT NULL CHECK (char_length(credential_ciphertext) BETWEEN 32 AND 16384),
  credential_key_version integer NOT NULL DEFAULT 1 CHECK (credential_key_version > 0),
  webhook_key_hash bytea NOT NULL UNIQUE CHECK (octet_length(webhook_key_hash) = 32),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reauthorization_required', 'revoked')),
  health_status text NOT NULL DEFAULT 'unchecked' CHECK (health_status IN ('unchecked', 'healthy', 'degraded', 'failed')),
  safe_error_code text,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_health_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, id, channel),
  UNIQUE (tenant_id, channel, external_account_ref),
  FOREIGN KEY (tenant_id, agent_id) REFERENCES tenancy.ai_agents(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, deployment_id, agent_id)
    REFERENCES tenancy.ai_deployments(tenant_id, id, agent_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'revoked' AND revoked_at IS NOT NULL) OR (status <> 'revoked' AND revoked_at IS NULL))
);

CREATE TABLE tenancy.ai_social_subject_offsets (
  tenant_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) = 32),
  last_accepted_occurred_at timestamptz,
  last_accepted_external_event_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, connection_id, subject_hash),
  FOREIGN KEY (tenant_id, connection_id)
    REFERENCES tenancy.ai_social_connections(tenant_id, id) ON DELETE RESTRICT,
  CHECK (last_accepted_external_event_id IS NULL OR char_length(last_accepted_external_event_id) BETWEEN 1 AND 500)
);

CREATE TABLE tenancy.ai_social_inbound_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('line', 'whatsapp', 'messenger')),
  external_event_id text NOT NULL CHECK (char_length(external_event_id) BETWEEN 1 AND 500),
  external_message_id text CHECK (external_message_id IS NULL OR char_length(external_message_id) BETWEEN 1 AND 500),
  subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) = 32),
  event_type text NOT NULL CHECK (event_type IN ('inbound.message', 'delivery.status', 'subject.opt_out')),
  occurred_at timestamptz NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('accepted', 'out_of_order')),
  normalized_json jsonb NOT NULL CHECK (octet_length(normalized_json::text) <= 65536),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, connection_id, external_event_id),
  FOREIGN KEY (tenant_id, connection_id, channel)
    REFERENCES tenancy.ai_social_connections(tenant_id, id, channel) ON DELETE RESTRICT
);

CREATE INDEX tenancy_ai_social_receipts_recent
  ON tenancy.ai_social_inbound_receipts(tenant_id, connection_id, received_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ai_social_connections', 'ai_social_subject_offsets', 'ai_social_inbound_receipts'
  ] LOOP
    EXECUTE format('ALTER TABLE tenancy.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE tenancy.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenancy.%I USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id())',
      table_name
    );
  END LOOP;
END
$$;

CREATE TRIGGER tenancy_ai_social_receipt_immutable
  BEFORE UPDATE OR DELETE ON tenancy.ai_social_inbound_receipts
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_ai_immutable_change();

CREATE OR REPLACE FUNCTION tenancy.ai_social_runtime_connection(
  target_webhook_key_hash bytea,
  target_channel text
)
RETURNS TABLE (
  connection_id uuid,
  tenant_id uuid,
  channel text,
  credential_ciphertext text,
  credential_key_version integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
  SELECT connection.id, connection.tenant_id, connection.channel,
         connection.credential_ciphertext, connection.credential_key_version
  FROM tenancy.ai_social_connections connection
  JOIN tenancy.ai_deployments deployment
    ON deployment.tenant_id = connection.tenant_id AND deployment.id = connection.deployment_id
  JOIN tenancy.ai_agents agent
    ON agent.tenant_id = connection.tenant_id AND agent.id = connection.agent_id
  JOIN LATERAL (
    SELECT snapshot.id
    FROM tenancy.entitlement_snapshots snapshot
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
    JOIN catalog.plans plan ON plan.id = version.plan_id
      AND plan.product_key = 'ai_chat' AND plan.plan_key = 'ai_chat_premium'
    WHERE snapshot.tenant_id = connection.tenant_id
      AND snapshot.product_key = 'ai_chat' AND snapshot.access_mode = 'active'
      AND snapshot.resolved_json->'entitlements'->>('channel.' || target_channel) = 'true'
    ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1
  ) authority ON true
  WHERE octet_length(target_webhook_key_hash) = 32
    AND target_channel IN ('line', 'whatsapp', 'messenger')
    AND connection.webhook_key_hash = target_webhook_key_hash
    AND connection.channel = target_channel
    AND connection.status = 'active'
    AND deployment.channel = target_channel AND deployment.status = 'active'
    AND agent.status = 'active' AND agent.current_published_playbook_version_id IS NOT NULL
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION tenancy.receive_ai_social_event(
  target_webhook_key_hash bytea,
  target_channel text,
  target_receipt_id uuid,
  target_external_event_id text,
  target_external_message_id text,
  target_subject_hash bytea,
  target_event_type text,
  target_occurred_at timestamptz,
  target_normalized_json jsonb
)
RETURNS TABLE (receipt_id uuid, disposition text, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
DECLARE
  resolved record;
  existing record;
  offset_row record;
  selected_disposition text;
BEGIN
  IF octet_length(target_webhook_key_hash) <> 32
     OR octet_length(target_subject_hash) <> 32
     OR target_channel NOT IN ('line', 'whatsapp', 'messenger')
     OR target_event_type NOT IN ('inbound.message', 'delivery.status', 'subject.opt_out')
     OR char_length(target_external_event_id) NOT BETWEEN 1 AND 500
     OR (target_external_message_id IS NOT NULL AND char_length(target_external_message_id) NOT BETWEEN 1 AND 500)
     OR target_occurred_at > now() + interval '5 minutes'
     OR octet_length(target_normalized_json::text) > 65536 THEN
    RAISE EXCEPTION 'invalid_social_event';
  END IF;

  SELECT * INTO resolved
  FROM tenancy.ai_social_runtime_connection(target_webhook_key_hash, target_channel);
  IF resolved IS NULL THEN RAISE EXCEPTION 'social_connection_not_available'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    resolved.connection_id::text || ':' || target_external_event_id, 0
  ));
  SELECT receipt.id, receipt.disposition INTO existing
  FROM tenancy.ai_social_inbound_receipts receipt
  WHERE receipt.tenant_id = resolved.tenant_id
    AND receipt.connection_id = resolved.connection_id
    AND receipt.external_event_id = target_external_event_id;
  IF existing IS NOT NULL THEN
    RETURN QUERY SELECT existing.id, existing.disposition, true;
    RETURN;
  END IF;

  INSERT INTO tenancy.ai_social_subject_offsets (tenant_id, connection_id, subject_hash)
  VALUES (resolved.tenant_id, resolved.connection_id, target_subject_hash)
  ON CONFLICT DO NOTHING;
  SELECT subject.last_accepted_occurred_at, subject.last_accepted_external_event_id INTO offset_row
  FROM tenancy.ai_social_subject_offsets subject
  WHERE subject.tenant_id = resolved.tenant_id
    AND subject.connection_id = resolved.connection_id
    AND subject.subject_hash = target_subject_hash
  FOR UPDATE;

  selected_disposition := CASE
    WHEN offset_row.last_accepted_occurred_at IS NULL
      OR target_occurred_at >= offset_row.last_accepted_occurred_at THEN 'accepted'
    ELSE 'out_of_order'
  END;

  INSERT INTO tenancy.ai_social_inbound_receipts (
    id, tenant_id, connection_id, channel, external_event_id, external_message_id,
    subject_hash, event_type, occurred_at, disposition, normalized_json
  ) VALUES (
    target_receipt_id, resolved.tenant_id, resolved.connection_id, target_channel,
    target_external_event_id, target_external_message_id, target_subject_hash,
    target_event_type, target_occurred_at, selected_disposition, target_normalized_json
  );

  IF selected_disposition = 'accepted' THEN
    UPDATE tenancy.ai_social_subject_offsets
    SET last_accepted_occurred_at = target_occurred_at,
        last_accepted_external_event_id = target_external_event_id,
        updated_at = now()
    WHERE tenant_id = resolved.tenant_id AND connection_id = resolved.connection_id
      AND subject_hash = target_subject_hash;
    INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
    VALUES (
      resolved.tenant_id, 'ai_chat.social.inbound.received',
      jsonb_build_object('connectionId', resolved.connection_id, 'receiptId', target_receipt_id, 'channel', target_channel),
      'social:inbound:' || resolved.connection_id::text || ':' || target_external_event_id
    );
  END IF;

  RETURN QUERY SELECT target_receipt_id, selected_disposition, false;
END
$$;

REVOKE ALL ON tenancy.ai_social_connections, tenancy.ai_social_subject_offsets,
  tenancy.ai_social_inbound_receipts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON tenancy.ai_social_connections TO djay_runtime;
GRANT SELECT ON tenancy.ai_social_subject_offsets, tenancy.ai_social_inbound_receipts TO djay_runtime;

REVOKE ALL ON FUNCTION tenancy.ai_social_runtime_connection(bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.receive_ai_social_event(
  bytea, text, uuid, text, text, bytea, text, timestamptz, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.ai_social_runtime_connection(bytea, text) TO djay_ai_runtime;
GRANT EXECUTE ON FUNCTION tenancy.receive_ai_social_event(
  bytea, text, uuid, text, text, bytea, text, timestamptz, jsonb
) TO djay_ai_runtime;
