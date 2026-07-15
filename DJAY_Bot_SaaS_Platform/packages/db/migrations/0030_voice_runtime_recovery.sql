CREATE TABLE platform.voice_runtime_controls (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  mode text NOT NULL CHECK (mode IN ('running', 'paused', 'emergency_stop')),
  reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 3 AND 200),
  changed_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  changed_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform.voice_runtime_controls (singleton, mode, reason_code)
VALUES (true, 'paused', 'activation_required');

ALTER TABLE tenancy.voice_sessions
  ADD COLUMN reported_elapsed_seconds integer CHECK (reported_elapsed_seconds IS NULL OR reported_elapsed_seconds >= 0),
  ADD COLUMN settled_elapsed_seconds integer CHECK (settled_elapsed_seconds IS NULL OR settled_elapsed_seconds >= 0);

ALTER TABLE tenancy.voice_session_connections
  ADD COLUMN heartbeat_at timestamptz;

UPDATE tenancy.voice_session_connections
SET heartbeat_at = COALESCE(disconnected_at, connected_at);

ALTER TABLE tenancy.voice_session_connections
  ALTER COLUMN heartbeat_at SET NOT NULL,
  ALTER COLUMN heartbeat_at SET DEFAULT now(),
  ADD CHECK (heartbeat_at >= connected_at),
  ADD CHECK (disconnected_at IS NULL OR heartbeat_at <= disconnected_at);

CREATE INDEX tenancy_voice_sessions_recovery
  ON tenancy.voice_sessions(status, grant_expires_at, reconnect_deadline, connected_at)
  WHERE status IN ('issued', 'connected', 'reconnecting');

CREATE INDEX tenancy_voice_connections_heartbeat
  ON tenancy.voice_session_connections(status, heartbeat_at)
  WHERE status = 'connected';

CREATE OR REPLACE FUNCTION tenancy.enforce_voice_runtime_accepting_new()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE runtime_mode text;
BEGIN
  SELECT control.mode INTO runtime_mode
  FROM platform.voice_runtime_controls control
  WHERE control.singleton = true;
  IF runtime_mode IS DISTINCT FROM 'running' THEN
    RAISE EXCEPTION 'voice_runtime_not_accepting_new_sessions';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_voice_session_runtime_control
BEFORE INSERT ON tenancy.voice_sessions
FOR EACH ROW EXECUTE FUNCTION tenancy.enforce_voice_runtime_accepting_new();

CREATE TRIGGER tenancy_voice_connection_runtime_control
BEFORE INSERT ON tenancy.voice_session_connections
FOR EACH ROW EXECUTE FUNCTION tenancy.enforce_voice_runtime_accepting_new();

CREATE OR REPLACE FUNCTION platform.get_voice_runtime_control()
RETURNS TABLE (
  mode text, reason_code text, version bigint, changed_at timestamptz,
  active_sessions integer, reconnecting_sessions integer, expired_grants integer,
  stale_connections integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, tenancy
AS $$
DECLARE actor_id uuid; actor_role text;
BEGIN
  IF session_user <> 'djay_platform' THEN RAISE EXCEPTION 'platform_role_required'; END IF;
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := NULLIF(current_setting('app.platform_role', true), '');
  IF actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM platform.role_assignments assignment
    WHERE assignment.platform_user_id = actor_id AND assignment.revoked_at IS NULL
      AND assignment.role = actor_role
      AND actor_role IN ('platform_owner', 'platform_ai_operations')
  ) THEN RAISE EXCEPTION 'platform_voice_operations_required'; END IF;

  RETURN QUERY
  SELECT control.mode, control.reason_code, control.version, control.changed_at,
    (SELECT count(*)::integer FROM tenancy.voice_sessions session WHERE session.status = 'connected'),
    (SELECT count(*)::integer FROM tenancy.voice_sessions session WHERE session.status = 'reconnecting'),
    (SELECT count(*)::integer FROM tenancy.voice_sessions session
      WHERE session.status = 'issued' AND session.grant_expires_at <= now()),
    (SELECT count(*)::integer FROM tenancy.voice_session_connections connection
      WHERE connection.status = 'connected' AND connection.heartbeat_at <= now() - interval '30 seconds')
  FROM platform.voice_runtime_controls control
  WHERE control.singleton = true;
END
$$;

CREATE OR REPLACE FUNCTION platform.set_voice_runtime_control(
  target_mode text,
  target_reason_code text
)
RETURNS TABLE (mode text, reason_code text, version bigint, changed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor_id uuid; actor_role text; request_value text; previous record;
BEGIN
  IF session_user <> 'djay_platform' THEN RAISE EXCEPTION 'platform_role_required'; END IF;
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := NULLIF(current_setting('app.platform_role', true), '');
  request_value := NULLIF(current_setting('app.request_id', true), '');
  IF actor_id IS NULL OR request_value IS NULL OR NOT EXISTS (
    SELECT 1 FROM platform.role_assignments assignment
    WHERE assignment.platform_user_id = actor_id AND assignment.revoked_at IS NULL
      AND assignment.role = actor_role
      AND actor_role IN ('platform_owner', 'platform_ai_operations')
  ) THEN RAISE EXCEPTION 'platform_voice_operations_required'; END IF;
  IF target_mode NOT IN ('running', 'paused', 'emergency_stop')
     OR char_length(btrim(target_reason_code)) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'invalid_voice_runtime_control';
  END IF;

  SELECT * INTO previous FROM platform.voice_runtime_controls control
  WHERE control.singleton = true FOR UPDATE;
  UPDATE platform.voice_runtime_controls control
  SET mode = target_mode, reason_code = btrim(target_reason_code),
      changed_by_platform_user_id = actor_id, version = control.version + 1,
      changed_at = now()
  WHERE control.singleton = true;

  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id,
    reason, result, metadata
  ) VALUES (
    actor_id, 'voice.runtime_control_changed', 'voice_runtime', 'voice_basic', request_value,
    btrim(target_reason_code), 'succeeded',
    jsonb_build_object('beforeMode', previous.mode, 'afterMode', target_mode,
      'beforeVersion', previous.version, 'afterVersion', previous.version + 1)
  );

  RETURN QUERY SELECT control.mode, control.reason_code, control.version, control.changed_at
  FROM platform.voice_runtime_controls control WHERE control.singleton = true;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.heartbeat_voice_basic_session(
  target_session_id uuid,
  target_connection_id uuid
)
RETURNS TABLE (alive boolean, runtime_mode text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, platform
AS $$
DECLARE current_mode text;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  SELECT control.mode INTO current_mode FROM platform.voice_runtime_controls control
  WHERE control.singleton = true;
  IF NOT EXISTS (
    SELECT 1 FROM tenancy.voice_sessions session
    JOIN tenancy.voice_session_connections connection
      ON connection.tenant_id = session.tenant_id AND connection.session_id = session.id
    WHERE session.id = target_session_id AND session.status = 'connected'
      AND connection.id = target_connection_id AND connection.status = 'connected'
  ) THEN
    RETURN QUERY SELECT false, current_mode;
    RETURN;
  END IF;
  UPDATE tenancy.voice_session_connections connection
  SET heartbeat_at = now()
  WHERE connection.session_id = target_session_id AND connection.id = target_connection_id
    AND connection.status = 'connected';
  RETURN QUERY SELECT current_mode <> 'emergency_stop', current_mode;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.finalize_voice_basic_session(
  target_session_id uuid,
  target_terminal_reason text,
  target_end_at timestamptz,
  target_reported_elapsed_seconds integer DEFAULT NULL
)
RETURNS TABLE (status text, customer_minutes integer, settled_seconds integer, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE runtime record; reservation record; final_minutes integer; final_seconds integer; final_status text;
BEGIN
  SELECT session.*, snapshot.subscription_id INTO runtime
  FROM tenancy.voice_sessions session
  JOIN tenancy.entitlement_snapshots snapshot
    ON snapshot.tenant_id = session.tenant_id AND snapshot.id = session.entitlement_snapshot_id
  WHERE session.id = target_session_id FOR UPDATE OF session;
  IF NOT FOUND THEN RAISE EXCEPTION 'voice_session_not_available'; END IF;
  IF runtime.status IN ('ended', 'failed', 'expired') THEN
    RETURN QUERY SELECT runtime.status, COALESCE(runtime.settled_minutes, 0),
      COALESCE(runtime.settled_elapsed_seconds, 0), true;
    RETURN;
  END IF;
  IF target_terminal_reason NOT IN (
    'completed', 'customer_ended', 'time_limit', 'idle_timeout', 'transferred',
    'callback_requested', 'unavailable', 'grant_expired'
  ) OR target_end_at > now() + interval '5 seconds'
     OR target_reported_elapsed_seconds IS NOT NULL AND target_reported_elapsed_seconds < 0 THEN
    RAISE EXCEPTION 'invalid_voice_terminal_request';
  END IF;

  SELECT LEAST(runtime.max_call_seconds, COALESCE(floor(sum(GREATEST(
    extract(epoch FROM (LEAST(COALESCE(connection.disconnected_at, target_end_at), target_end_at)
      - connection.connected_at)), 0
  ))), 0))::integer
  INTO final_seconds
  FROM tenancy.voice_session_connections connection
  WHERE connection.tenant_id = runtime.tenant_id AND connection.session_id = runtime.id;

  final_status := CASE target_terminal_reason
    WHEN 'grant_expired' THEN 'expired' WHEN 'unavailable' THEN 'failed' ELSE 'ended' END;
  IF runtime.usage_reservation_id IS NULL THEN
    final_minutes := 0;
  ELSE
    final_minutes := LEAST(runtime.reserved_minutes, ceil(final_seconds::numeric / 60)::integer);
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
        'voice_minute', final_minutes, 'voice:session:' || runtime.id::text || ':terminal', target_end_at
      );
    ELSE
      final_minutes := COALESCE(reservation.settled_quantity, 0)::integer;
    END IF;
  END IF;

  UPDATE tenancy.voice_session_connections connection
  SET status = 'ended', disconnected_at = COALESCE(connection.disconnected_at, target_end_at),
      heartbeat_at = LEAST(connection.heartbeat_at, COALESCE(connection.disconnected_at, target_end_at))
  WHERE connection.tenant_id = runtime.tenant_id AND connection.session_id = runtime.id
    AND connection.status IN ('connected', 'disconnected');
  UPDATE tenancy.voice_concurrency_leases SET released_at = COALESCE(released_at, target_end_at)
  WHERE tenant_id = runtime.tenant_id AND session_id = runtime.id;
  UPDATE tenancy.voice_sessions SET status = final_status, settled_minutes = final_minutes,
    settled_elapsed_seconds = final_seconds,
    reported_elapsed_seconds = COALESCE(target_reported_elapsed_seconds, reported_elapsed_seconds),
    ended_at = target_end_at, terminal_reason = target_terminal_reason,
    reconnect_deadline = NULL, updated_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.id;
  UPDATE tenancy.conversations SET status = 'closed', automation_mode = 'closed',
    closed_at = target_end_at, updated_at = now()
  WHERE tenant_id = runtime.tenant_id AND id = runtime.conversation_id;
  RETURN QUERY SELECT final_status, final_minutes, final_seconds, false;
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
DECLARE result record;
BEGIN
  IF session_user <> 'djay_voice_runtime' THEN RAISE EXCEPTION 'voice_runtime_role_required'; END IF;
  IF elapsed_seconds < 0 OR target_terminal_reason NOT IN (
    'completed', 'customer_ended', 'time_limit', 'idle_timeout', 'transferred',
    'callback_requested', 'unavailable', 'grant_expired'
  ) THEN RAISE EXCEPTION 'invalid_voice_terminal_request'; END IF;
  IF target_connection_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenancy.voice_session_connections connection
    WHERE connection.session_id = target_session_id AND connection.id = target_connection_id
  ) THEN RAISE EXCEPTION 'voice_connection_not_available'; END IF;
  SELECT * INTO result FROM tenancy.finalize_voice_basic_session(
    target_session_id, target_terminal_reason, now(), elapsed_seconds
  );
  RETURN QUERY SELECT result.status, result.customer_minutes, result.replayed;
END
$$;

CREATE OR REPLACE FUNCTION tenancy.reap_voice_basic_sessions(
  target_now timestamptz,
  stale_before timestamptz,
  target_limit integer
)
RETURNS TABLE (session_id uuid, terminal_reason text, customer_minutes integer, settled_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy, platform
AS $$
DECLARE current_mode text; candidate record; result record;
BEGIN
  IF session_user <> 'djay_worker'
     OR current_setting('app.service', true) IS DISTINCT FROM 'voice_reaper_worker' THEN
    RAISE EXCEPTION 'voice_reaper_worker_role_required';
  END IF;
  IF target_limit NOT BETWEEN 1 AND 500 OR stale_before > target_now
     OR target_now > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'invalid_voice_reaper_request';
  END IF;
  SELECT control.mode INTO current_mode FROM platform.voice_runtime_controls control
  WHERE control.singleton = true;

  FOR candidate IN
    SELECT session.id,
      CASE
        WHEN current_mode = 'emergency_stop' THEN 'unavailable'
        WHEN session.status = 'issued' THEN 'grant_expired'
        WHEN session.status = 'connected'
          AND session.connected_at + make_interval(secs => session.max_call_seconds) <= target_now
          THEN 'time_limit'
        ELSE 'unavailable'
      END AS reason,
      CASE
        WHEN current_mode = 'emergency_stop' THEN target_now
        WHEN session.status = 'connected' AND connection.heartbeat_at <= stale_before
          THEN connection.heartbeat_at
        ELSE target_now
      END AS end_at
    FROM tenancy.voice_sessions session
    LEFT JOIN LATERAL (
      SELECT active.heartbeat_at FROM tenancy.voice_session_connections active
      WHERE active.tenant_id = session.tenant_id AND active.session_id = session.id
        AND active.status = 'connected'
      ORDER BY active.connected_at DESC LIMIT 1
    ) connection ON true
    WHERE session.status IN ('issued', 'connected', 'reconnecting')
      AND (
        current_mode = 'emergency_stop'
        OR session.status = 'issued' AND session.grant_expires_at <= target_now
        OR session.status = 'reconnecting' AND session.reconnect_deadline <= target_now
        OR session.status = 'connected' AND (
          session.connected_at + make_interval(secs => session.max_call_seconds) <= target_now
          OR connection.heartbeat_at <= stale_before
        )
      )
    ORDER BY session.created_at, session.id
    LIMIT target_limit
    FOR UPDATE OF session SKIP LOCKED
  LOOP
    SELECT * INTO result FROM tenancy.finalize_voice_basic_session(
      candidate.id, candidate.reason, candidate.end_at, NULL
    );
    session_id := candidate.id;
    terminal_reason := candidate.reason;
    customer_minutes := result.customer_minutes;
    settled_seconds := result.settled_seconds;
    RETURN NEXT;
  END LOOP;
END
$$;

REVOKE ALL ON platform.voice_runtime_controls FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.enforce_voice_runtime_accepting_new() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.get_voice_runtime_control() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.set_voice_runtime_control(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.heartbeat_voice_basic_session(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.finalize_voice_basic_session(uuid, text, timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.reap_voice_basic_sessions(timestamptz, timestamptz, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION platform.get_voice_runtime_control() TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.set_voice_runtime_control(text, text) TO djay_platform;
GRANT EXECUTE ON FUNCTION tenancy.heartbeat_voice_basic_session(uuid, uuid) TO djay_voice_runtime;
GRANT EXECUTE ON FUNCTION tenancy.reap_voice_basic_sessions(timestamptz, timestamptz, integer) TO djay_worker;
