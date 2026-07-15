DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'djay_voice_runtime') THEN
    CREATE ROLE djay_voice_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

CREATE TABLE tenancy.voice_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  deployment_key_hash bytea NOT NULL UNIQUE CHECK (octet_length(deployment_key_hash) = 32),
  key_prefix text NOT NULL CHECK (char_length(key_prefix) BETWEEN 6 AND 24),
  allowed_origins text[] NOT NULL CHECK (cardinality(allowed_origins) > 0),
  default_locale text NOT NULL DEFAULT 'th' CHECK (default_locale IN ('th', 'en')),
  greeting_th text NOT NULL CHECK (char_length(greeting_th) BETWEEN 1 AND 1000),
  greeting_en text NOT NULL CHECK (char_length(greeting_en) BETWEEN 1 AND 1000),
  automated_disclosure_th text NOT NULL CHECK (char_length(automated_disclosure_th) BETWEEN 8 AND 500),
  automated_disclosure_en text NOT NULL CHECK (char_length(automated_disclosure_en) BETWEEN 8 AND 500),
  max_call_seconds integer NOT NULL CHECK (max_call_seconds BETWEEN 30 AND 14400),
  reconnect_window_seconds integer NOT NULL CHECK (reconnect_window_seconds BETWEEN 0 AND 300),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'revoked')),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

CREATE TABLE tenancy.voice_sessions (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  deployment_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  entitlement_snapshot_id uuid NOT NULL,
  capability_profile text NOT NULL CHECK (capability_profile IN ('voice_gen1', 'voice_gen2')),
  public_label text NOT NULL CHECK (public_label IN ('First-Generation Voice Engine', 'Second-Generation Voice Engine')),
  locale text NOT NULL CHECK (locale IN ('th', 'en')),
  grant_hash bytea NOT NULL UNIQUE CHECK (octet_length(grant_hash) = 32),
  grant_expires_at timestamptz NOT NULL,
  max_call_seconds integer NOT NULL CHECK (max_call_seconds BETWEEN 30 AND 14400),
  reconnect_window_seconds integer NOT NULL CHECK (reconnect_window_seconds BETWEEN 0 AND 300),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'connected', 'reconnecting', 'ended', 'failed', 'expired')),
  usage_reservation_id uuid,
  reserved_minutes integer CHECK (reserved_minutes IS NULL OR reserved_minutes > 0),
  settled_minutes integer CHECK (settled_minutes IS NULL OR settled_minutes >= 0),
  connected_at timestamptz,
  disconnected_at timestamptz,
  reconnect_deadline timestamptz,
  ended_at timestamptz,
  terminal_reason text CHECK (terminal_reason IS NULL OR terminal_reason IN (
    'completed', 'customer_ended', 'time_limit', 'idle_timeout', 'transferred',
    'callback_requested', 'unavailable', 'grant_expired'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, conversation_id),
  FOREIGN KEY (tenant_id, deployment_id) REFERENCES tenancy.voice_deployments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, contact_id) REFERENCES tenancy.contacts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, entitlement_snapshot_id) REFERENCES tenancy.entitlement_snapshots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, usage_reservation_id) REFERENCES tenancy.usage_reservations(tenant_id, id) ON DELETE RESTRICT,
  CHECK (
    (capability_profile = 'voice_gen1' AND public_label = 'First-Generation Voice Engine')
    OR (capability_profile = 'voice_gen2' AND public_label = 'Second-Generation Voice Engine')
  ),
  CHECK (grant_expires_at > created_at),
  CHECK ((status IN ('ended', 'failed', 'expired')) = (ended_at IS NOT NULL)),
  CHECK ((usage_reservation_id IS NULL) = (reserved_minutes IS NULL))
);

CREATE TABLE tenancy.voice_session_connections (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  connected_at timestamptz NOT NULL,
  disconnected_at timestamptz,
  status text NOT NULL CHECK (status IN ('connected', 'disconnected', 'ended')),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, session_id, id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES tenancy.voice_sessions(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'connected') = (disconnected_at IS NULL))
);

CREATE UNIQUE INDEX tenancy_voice_one_connected_transport
  ON tenancy.voice_session_connections(tenant_id, session_id)
  WHERE status = 'connected';

CREATE TABLE tenancy.voice_concurrency_leases (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  acquired_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, session_id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES tenancy.voice_sessions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > acquired_at),
  CHECK (released_at IS NULL OR released_at >= acquired_at)
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'voice_deployments', 'voice_sessions', 'voice_session_connections', 'voice_concurrency_leases'
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

CREATE OR REPLACE FUNCTION tenancy.issue_voice_basic_grant(
  target_key_hash bytea,
  target_grant_hash bytea,
  request_origin text,
  target_session_id uuid,
  target_contact_id uuid,
  target_conversation_id uuid,
  target_expires_at timestamptz,
  target_locale text
)
RETURNS TABLE (
  session_id uuid, capability_profile text, public_label text, locale text,
  greeting text, automated_disclosure text, max_call_seconds integer,
  reconnect_window_seconds integer, expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
DECLARE resolved record; selected_greeting text; selected_disclosure text;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  IF octet_length(target_key_hash) <> 32 OR octet_length(target_grant_hash) <> 32
     OR target_locale NOT IN ('th', 'en') OR target_expires_at <= now()
     OR target_expires_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'invalid_voice_grant_request';
  END IF;

  SELECT deployment.*, snapshot.id AS snapshot_id, plan.plan_key
  INTO resolved
  FROM tenancy.voice_deployments deployment
  JOIN LATERAL (
    SELECT candidate.*
    FROM tenancy.entitlement_snapshots candidate
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = candidate.tenant_id AND subscription.id = candidate.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    WHERE candidate.tenant_id = deployment.tenant_id AND candidate.product_key = 'voice'
      AND candidate.access_mode = 'active'
      AND candidate.resolved_json->'entitlements'->>'voice.enabled' = 'true'
      AND candidate.resolved_json->'entitlements'->>'voice.capability_profile' = 'voice_gen1'
    ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
  ) snapshot ON true
  JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
  JOIN catalog.plans plan ON plan.id = version.plan_id
    AND plan.product_key = 'voice' AND plan.plan_key = 'voice_basic_gen1'
  WHERE deployment.deployment_key_hash = target_key_hash AND deployment.status = 'active'
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_deployment_not_available'; END IF;

  selected_greeting := CASE target_locale WHEN 'th' THEN resolved.greeting_th ELSE resolved.greeting_en END;
  selected_disclosure := CASE target_locale WHEN 'th' THEN resolved.automated_disclosure_th ELSE resolved.automated_disclosure_en END;
  INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale)
  VALUES (target_contact_id, resolved.tenant_id, 'Voice visitor', target_locale);
  INSERT INTO tenancy.conversations (
    id, tenant_id, contact_id, product_key, public_plan_key, entitlement_snapshot_id,
    channel_kind, automation_mode
  ) VALUES (
    target_conversation_id, resolved.tenant_id, target_contact_id, 'voice', resolved.plan_key,
    resolved.snapshot_id, 'voice', 'voice'
  );
  INSERT INTO tenancy.voice_sessions (
    id, tenant_id, deployment_id, contact_id, conversation_id, entitlement_snapshot_id,
    capability_profile, public_label, locale, grant_hash, grant_expires_at,
    max_call_seconds, reconnect_window_seconds
  ) VALUES (
    target_session_id, resolved.tenant_id, resolved.id, target_contact_id, target_conversation_id,
    resolved.snapshot_id, 'voice_gen1', 'First-Generation Voice Engine', target_locale,
    target_grant_hash, target_expires_at, resolved.max_call_seconds, resolved.reconnect_window_seconds
  );
  RETURN QUERY SELECT target_session_id, 'voice_gen1'::text, 'First-Generation Voice Engine'::text,
    target_locale, selected_greeting, selected_disclosure, resolved.max_call_seconds,
    resolved.reconnect_window_seconds, target_expires_at;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.authorize_voice_basic_session(
  target_grant_hash bytea,
  target_session_id uuid,
  request_origin text,
  target_protocol_version text,
  target_connection_id uuid,
  target_reservation_id uuid,
  target_lease_id uuid
)
RETURNS TABLE (
  session_id uuid, capability_profile text, locale text, max_call_seconds integer,
  reconnect_window_seconds integer, replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, catalog
AS $$
DECLARE runtime record; connection_record record; quota record; active_count integer; concurrency_limit integer; reserve_minutes integer;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  IF octet_length(target_grant_hash) <> 32 OR target_protocol_version <> 'djay.voice.v1' THEN
    RAISE EXCEPTION 'invalid_voice_authorization_request';
  END IF;

  SELECT session.*, deployment.allowed_origins, deployment.status AS deployment_status,
         snapshot.subscription_id, snapshot.access_mode, snapshot.resolved_json
  INTO runtime
  FROM tenancy.voice_sessions session
  JOIN tenancy.voice_deployments deployment
    ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = session.tenant_id AND snapshot.id = session.entitlement_snapshot_id
  JOIN tenancy.product_subscriptions subscription
    ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
    AND subscription.status IN ('active', 'trialing', 'scheduled_change')
  WHERE session.id = target_session_id AND session.grant_hash = target_grant_hash
    AND deployment.status = 'active' AND snapshot.access_mode = 'active'
    AND snapshot.resolved_json->'entitlements'->>'voice.enabled' = 'true'
    AND snapshot.resolved_json->'entitlements'->>'voice.capability_profile' = 'voice_gen1'
    AND session.capability_profile = 'voice_gen1'
    AND tenancy.ai_origin_allowed(deployment.allowed_origins, request_origin)
  LIMIT 1 FOR UPDATE OF session;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_session_not_available'; END IF;
  IF runtime.status IN ('ended', 'failed', 'expired') THEN RAISE EXCEPTION 'voice_session_not_connectable'; END IF;

  SELECT * INTO connection_record FROM tenancy.voice_session_connections connection
  WHERE connection.tenant_id = runtime.tenant_id AND connection.session_id = runtime.id
    AND connection.id = target_connection_id;
  IF FOUND THEN
    IF connection_record.status <> 'connected' OR runtime.status <> 'connected' THEN
      RAISE EXCEPTION 'voice_connection_not_connectable';
    END IF;
    RETURN QUERY SELECT runtime.id, runtime.capability_profile, runtime.locale,
      runtime.max_call_seconds, runtime.reconnect_window_seconds, true;
    RETURN;
  END IF;

  IF runtime.status = 'issued' AND runtime.grant_expires_at <= now() THEN RAISE EXCEPTION 'voice_grant_expired'; END IF;
  IF runtime.status = 'reconnecting' AND (runtime.reconnect_deadline IS NULL OR runtime.reconnect_deadline < now()) THEN
    RAISE EXCEPTION 'voice_reconnect_expired';
  END IF;
  IF runtime.status NOT IN ('issued', 'reconnecting') THEN RAISE EXCEPTION 'voice_session_not_connectable'; END IF;

  IF runtime.status = 'issued' THEN
    concurrency_limit := NULLIF(runtime.resolved_json->'limits'->>'concurrent_calls', '')::integer;
    IF concurrency_limit IS NULL OR concurrency_limit < 1 THEN RAISE EXCEPTION 'voice_concurrency_unconfigured'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(runtime.tenant_id::text || ':voice-concurrency', 0));
    SELECT count(*)::integer INTO active_count
    FROM tenancy.voice_concurrency_leases lease
    WHERE lease.tenant_id = runtime.tenant_id AND lease.released_at IS NULL AND lease.expires_at > now();
    IF active_count >= concurrency_limit THEN RAISE EXCEPTION 'voice_concurrency_exhausted'; END IF;

    reserve_minutes := ceil(runtime.max_call_seconds::numeric / 60)::integer;
    SELECT account.* INTO quota
    FROM tenancy.quota_accounts account
    WHERE account.tenant_id = runtime.tenant_id AND account.subscription_id = runtime.subscription_id
      AND account.product_key = 'voice' AND account.customer_unit = 'voice_minute'
      AND now() >= account.period_start AND now() < account.period_end
    ORDER BY account.period_start DESC LIMIT 1 FOR UPDATE;
    IF quota IS NULL THEN RAISE EXCEPTION 'voice_quota_unavailable'; END IF;
    IF quota.safety_cap_quantity IS NOT NULL
       AND quota.reserved_quantity + quota.settled_quantity + reserve_minutes > quota.safety_cap_quantity THEN
      RAISE EXCEPTION 'voice_safety_cap';
    END IF;
    UPDATE tenancy.quota_accounts SET reserved_quantity = reserved_quantity + reserve_minutes, updated_at = now()
    WHERE tenant_id = runtime.tenant_id AND id = quota.id;
    INSERT INTO tenancy.usage_reservations (
      id, tenant_id, quota_account_id, entitlement_snapshot_id, operation_id,
      idempotency_key, requested_quantity, reserved_quantity, status
    ) VALUES (
      target_reservation_id, runtime.tenant_id, quota.id, runtime.entitlement_snapshot_id,
      runtime.id::text, 'voice:session:' || runtime.id::text, reserve_minutes, reserve_minutes, 'reserved'
    );
    INSERT INTO tenancy.usage_events (
      tenant_id, subscription_id, entitlement_snapshot_id, reservation_id, product_key,
      operation_id, event_type, customer_unit, customer_quantity, idempotency_key, occurred_at
    ) VALUES (
      runtime.tenant_id, runtime.subscription_id, runtime.entitlement_snapshot_id,
      target_reservation_id, 'voice', runtime.id::text, 'reserved', 'voice_minute', reserve_minutes,
      'voice:session:' || runtime.id::text || ':reserved', now()
    );
    INSERT INTO tenancy.voice_concurrency_leases (id, tenant_id, session_id, acquired_at, expires_at)
    VALUES (target_lease_id, runtime.tenant_id, runtime.id, now(), now() + make_interval(secs => runtime.max_call_seconds + runtime.reconnect_window_seconds));
    UPDATE tenancy.voice_sessions SET usage_reservation_id = target_reservation_id,
      reserved_minutes = reserve_minutes, connected_at = now(), status = 'connected', updated_at = now()
    WHERE tenant_id = runtime.tenant_id AND id = runtime.id;
  ELSE
    UPDATE tenancy.voice_sessions SET status = 'connected', reconnect_deadline = NULL, updated_at = now()
    WHERE tenant_id = runtime.tenant_id AND id = runtime.id;
  END IF;

  INSERT INTO tenancy.voice_session_connections (id, tenant_id, session_id, connected_at, status)
  VALUES (target_connection_id, runtime.tenant_id, runtime.id, now(), 'connected');
  RETURN QUERY SELECT runtime.id, runtime.capability_profile, runtime.locale,
    runtime.max_call_seconds, runtime.reconnect_window_seconds, false;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.disconnect_voice_basic_session(
  target_session_id uuid,
  target_connection_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE runtime record;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  SELECT * INTO runtime FROM tenancy.voice_sessions session
  WHERE session.id = target_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM tenancy.voice_session_connections connection
    WHERE connection.tenant_id = runtime.tenant_id AND connection.session_id = runtime.id
      AND connection.id = target_connection_id AND connection.status = 'disconnected'
  ) THEN RETURN true; END IF;
  IF runtime.status <> 'connected' THEN RETURN false; END IF;
  UPDATE tenancy.voice_session_connections SET status = 'disconnected', disconnected_at = now()
  WHERE tenant_id = runtime.tenant_id AND session_id = runtime.id AND id = target_connection_id AND status = 'connected';
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE tenancy.voice_sessions SET status = 'reconnecting', disconnected_at = now(),
    reconnect_deadline = now() + make_interval(secs => reconnect_window_seconds), updated_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.id;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.finish_voice_basic_session(
  target_session_id uuid,
  target_connection_id uuid,
  elapsed_seconds integer,
  target_terminal_reason text
)
RETURNS TABLE (status text, customer_minutes integer, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE runtime record; reservation record; final_minutes integer; final_status text;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  IF elapsed_seconds < 0 OR target_terminal_reason NOT IN (
    'completed', 'customer_ended', 'time_limit', 'idle_timeout', 'transferred',
    'callback_requested', 'unavailable', 'grant_expired'
  ) THEN RAISE EXCEPTION 'invalid_voice_terminal_request'; END IF;
  SELECT session.*, snapshot.subscription_id INTO runtime
  FROM tenancy.voice_sessions session
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = session.tenant_id AND snapshot.id = session.entitlement_snapshot_id
  WHERE session.id = target_session_id FOR UPDATE OF session;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_session_not_available'; END IF;
  IF runtime.status IN ('ended', 'failed', 'expired') THEN
    RETURN QUERY SELECT runtime.status, COALESCE(runtime.settled_minutes, 0), true;
    RETURN;
  END IF;
  IF elapsed_seconds > runtime.max_call_seconds + runtime.reconnect_window_seconds THEN
    RAISE EXCEPTION 'voice_elapsed_invalid';
  END IF;
  IF target_connection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenancy.voice_session_connections connection
    WHERE connection.tenant_id = runtime.tenant_id AND connection.session_id = runtime.id
      AND connection.id = target_connection_id
  ) THEN RAISE EXCEPTION 'voice_connection_not_available'; END IF;

  final_status := CASE target_terminal_reason WHEN 'grant_expired' THEN 'expired' WHEN 'unavailable' THEN 'failed' ELSE 'ended' END;
  IF runtime.usage_reservation_id IS NULL THEN
    final_minutes := 0;
  ELSE
    final_minutes := LEAST(runtime.reserved_minutes, ceil(elapsed_seconds::numeric / 60)::integer);
    SELECT * INTO reservation FROM tenancy.usage_reservations usage
    WHERE usage.tenant_id = runtime.tenant_id AND usage.id = runtime.usage_reservation_id FOR UPDATE;
    IF reservation.status = 'reserved' THEN
      UPDATE tenancy.quota_accounts SET reserved_quantity = reserved_quantity - runtime.reserved_minutes,
        settled_quantity = settled_quantity + final_minutes, updated_at = now()
      WHERE tenant_id = runtime.tenant_id AND id = reservation.quota_account_id;
      UPDATE tenancy.usage_reservations SET status = CASE WHEN final_minutes > 0 THEN 'settled' ELSE 'released' END,
        settled_quantity = final_minutes, settled_at = now(), reason_code = target_terminal_reason
      WHERE tenant_id = runtime.tenant_id AND id = reservation.id;
      INSERT INTO tenancy.usage_events (
        tenant_id, subscription_id, entitlement_snapshot_id, reservation_id, product_key,
        operation_id, event_type, customer_unit, customer_quantity, idempotency_key, occurred_at
      ) VALUES (
        runtime.tenant_id, runtime.subscription_id, runtime.entitlement_snapshot_id,
        reservation.id, 'voice', runtime.id::text,
        CASE WHEN final_minutes > 0 THEN 'settled' ELSE 'released' END,
        'voice_minute', final_minutes, 'voice:session:' || runtime.id::text || ':terminal', now()
      );
    ELSE
      final_minutes := COALESCE(reservation.settled_quantity, 0)::integer;
    END IF;
  END IF;

  UPDATE tenancy.voice_session_connections connection
  SET status = 'ended', disconnected_at = COALESCE(connection.disconnected_at, now())
  WHERE connection.tenant_id = runtime.tenant_id AND connection.session_id = runtime.id
    AND connection.status IN ('connected', 'disconnected');
  UPDATE tenancy.voice_concurrency_leases SET released_at = COALESCE(released_at, now())
  WHERE tenant_id = runtime.tenant_id AND session_id = runtime.id;
  UPDATE tenancy.voice_sessions SET status = final_status, settled_minutes = final_minutes,
    ended_at = now(), terminal_reason = target_terminal_reason, reconnect_deadline = NULL, updated_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.id;
  UPDATE tenancy.conversations SET status = 'closed', automation_mode = 'closed', closed_at = now(), updated_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.conversation_id;
  RETURN QUERY SELECT final_status, final_minutes, false;
END
$$;

REVOKE ALL ON tenancy.voice_deployments, tenancy.voice_sessions,
  tenancy.voice_session_connections, tenancy.voice_concurrency_leases FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON tenancy.voice_deployments TO djay_runtime;
GRANT SELECT ON tenancy.voice_sessions, tenancy.voice_session_connections,
  tenancy.voice_concurrency_leases TO djay_runtime;

GRANT USAGE ON SCHEMA tenancy, catalog TO djay_voice_runtime;
REVOKE ALL ON FUNCTION tenancy.issue_voice_basic_grant(bytea, bytea, text, uuid, uuid, uuid, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.authorize_voice_basic_session(bytea, uuid, text, text, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.disconnect_voice_basic_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finish_voice_basic_session(uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.issue_voice_basic_grant(bytea, bytea, text, uuid, uuid, uuid, timestamptz, text) TO djay_voice_runtime;
GRANT EXECUTE ON FUNCTION tenancy.authorize_voice_basic_session(bytea, uuid, text, text, uuid, uuid, uuid) TO djay_voice_runtime;
GRANT EXECUTE ON FUNCTION tenancy.disconnect_voice_basic_session(uuid, uuid) TO djay_voice_runtime;
GRANT EXECUTE ON FUNCTION tenancy.finish_voice_basic_session(uuid, uuid, integer, text) TO djay_voice_runtime;
