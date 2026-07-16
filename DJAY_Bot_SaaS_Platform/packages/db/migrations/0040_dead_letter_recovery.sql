CREATE TABLE platform.dead_letter_replay_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_kind text NOT NULL CHECK (queue_kind IN ('system_email', 'flowbot_email', 'ai_chat_email')),
  item_id uuid NOT NULL,
  expected_attempt_count integer NOT NULL CHECK (expected_attempt_count >= 0),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 12 AND 500),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'applied', 'rejected', 'invalidated')),
  requested_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  reviewed_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  applied_at timestamptz,
  CHECK (reviewed_by_platform_user_id IS NULL
    OR reviewed_by_platform_user_id <> requested_by_platform_user_id)
);

CREATE UNIQUE INDEX platform_one_open_dead_letter_replay
  ON platform.dead_letter_replay_requests(queue_kind, item_id)
  WHERE status = 'requested';

CREATE INDEX platform_dead_letter_replay_recent
  ON platform.dead_letter_replay_requests(requested_at DESC, id DESC);

CREATE OR REPLACE FUNCTION platform.assert_dead_letter_recovery_context(operation text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform
AS $$
DECLARE actor_id uuid; actor_role text;
BEGIN
  IF session_user <> 'djay_platform' THEN
    RAISE EXCEPTION 'platform recovery context required';
  END IF;
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  actor_role := current_setting('app.platform_role', true);
  IF actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM platform.users app_user
    JOIN platform.role_assignments assignment
      ON assignment.platform_user_id = app_user.id
     AND assignment.role = actor_role AND assignment.revoked_at IS NULL
    WHERE app_user.id = actor_id AND app_user.status = 'active'
  ) THEN
    RAISE EXCEPTION 'active platform authority required';
  END IF;
  IF operation IN ('list', 'request')
     AND actor_role NOT IN ('platform_owner', 'platform_ai_operations', 'platform_support') THEN
    RAISE EXCEPTION 'platform recovery authority required';
  END IF;
  IF operation IN ('approve', 'reject') AND actor_role <> 'platform_owner' THEN
    RAISE EXCEPTION 'platform owner recovery authority required';
  END IF;
  RETURN actor_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.dead_letter_recovery_overview()
RETURNS TABLE (
  record_kind text, record_id uuid, queue_kind text, item_id uuid,
  attempt_count integer, safe_error_code text, occurred_at timestamptz,
  status text, reason text, requested_by_platform_user_id uuid,
  reviewed_by_platform_user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, operations, tenancy
AS $$
BEGIN
  PERFORM platform.assert_dead_letter_recovery_context('list');
  RETURN QUERY
  SELECT recovery_rows.* FROM (
  SELECT 'recoverable'::text AS record_kind, outbox.id AS record_id,
         'system_email'::text AS queue_kind, outbox.id AS item_id,
         outbox.attempt_count AS attempt_count,
         left(COALESCE(outbox.last_error_code, 'delivery_failed'), 100) AS safe_error_code,
         COALESCE(outbox.processed_at, outbox.created_at) AS occurred_at,
         'dead_letter'::text AS status, NULL::text AS reason,
         NULL::uuid AS requested_by_platform_user_id,
         NULL::uuid AS reviewed_by_platform_user_id
  FROM operations.outbox outbox
  WHERE outbox.status = 'dead_letter'
    AND outbox.topic IN ('auth.verify_email', 'auth.recover_password', 'tenant.invitation', 'tenant.ownership_transfer')
    AND NOT EXISTS (
      SELECT 1 FROM platform.dead_letter_replay_requests request
      WHERE request.queue_kind = 'system_email' AND request.item_id = outbox.id
        AND request.status = 'requested'
    )
  UNION ALL
  SELECT 'recoverable', outbox.id, 'flowbot_email', outbox.id,
         outbox.attempt_count, left(COALESCE(outbox.last_error_code, 'delivery_failed'), 100),
         COALESCE(outbox.processed_at, outbox.created_at), 'dead_letter',
         NULL, NULL, NULL
  FROM tenancy.outbox outbox
  WHERE outbox.status = 'dead_letter' AND outbox.topic = 'flowbot.merchant_email.requested'
    AND NOT EXISTS (
      SELECT 1 FROM platform.dead_letter_replay_requests request
      WHERE request.queue_kind = 'flowbot_email' AND request.item_id = outbox.id
        AND request.status = 'requested'
    )
  UNION ALL
  SELECT 'recoverable', outbox.id, 'ai_chat_email', outbox.id,
         outbox.attempt_count, left(COALESCE(outbox.last_error_code, 'delivery_failed'), 100),
         COALESCE(outbox.processed_at, outbox.created_at), 'dead_letter',
         NULL, NULL, NULL
  FROM tenancy.outbox outbox
  WHERE outbox.status = 'dead_letter' AND outbox.topic = 'ai_chat.merchant_email.requested'
    AND NOT EXISTS (
      SELECT 1 FROM platform.dead_letter_replay_requests request
      WHERE request.queue_kind = 'ai_chat_email' AND request.item_id = outbox.id
        AND request.status = 'requested'
    )
  UNION ALL
  SELECT 'request', request.id, request.queue_kind, request.item_id,
         request.expected_attempt_count, NULL, request.requested_at, request.status,
         request.reason, request.requested_by_platform_user_id, request.reviewed_by_platform_user_id
  FROM platform.dead_letter_replay_requests request
  ) recovery_rows
  ORDER BY recovery_rows.occurred_at DESC, recovery_rows.record_id DESC
  LIMIT 500;
END
$$;

CREATE OR REPLACE FUNCTION platform.request_dead_letter_replay(
  target_queue_kind text, target_item_id uuid, target_attempt_count integer, target_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, operations, tenancy
AS $$
DECLARE actor_id uuid; request_id uuid; source_exists boolean;
BEGIN
  actor_id := platform.assert_dead_letter_recovery_context('request');
  IF target_queue_kind NOT IN ('system_email', 'flowbot_email', 'ai_chat_email')
     OR char_length(btrim(target_reason)) NOT BETWEEN 12 AND 500 THEN
    RETURN NULL;
  END IF;
  IF target_queue_kind = 'system_email' THEN
    SELECT EXISTS (SELECT 1 FROM operations.outbox WHERE id = target_item_id
      AND status = 'dead_letter' AND attempt_count = target_attempt_count
      AND topic IN ('auth.verify_email', 'auth.recover_password', 'tenant.invitation', 'tenant.ownership_transfer'))
      INTO source_exists;
  ELSE
    SELECT EXISTS (SELECT 1 FROM tenancy.outbox WHERE id = target_item_id
      AND status = 'dead_letter' AND attempt_count = target_attempt_count
      AND topic = CASE target_queue_kind WHEN 'flowbot_email' THEN 'flowbot.merchant_email.requested'
        ELSE 'ai_chat.merchant_email.requested' END)
      INTO source_exists;
  END IF;
  IF NOT source_exists THEN RETURN NULL; END IF;
  INSERT INTO platform.dead_letter_replay_requests (
    queue_kind, item_id, expected_attempt_count, reason, requested_by_platform_user_id
  ) VALUES (target_queue_kind, target_item_id, target_attempt_count, btrim(target_reason), actor_id)
  ON CONFLICT (queue_kind, item_id) WHERE status = 'requested' DO NOTHING
  RETURNING id INTO request_id;
  IF request_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO platform.audit_logs (
    actor_platform_user_id, action, target_type, target_id, request_id, reason, result, metadata
  ) VALUES (
    actor_id, 'dead_letter_replay.requested', 'dead_letter_replay_request', request_id::text,
    COALESCE(NULLIF(current_setting('app.request_id', true), ''), request_id::text), btrim(target_reason),
    'succeeded', jsonb_build_object('queueKind', target_queue_kind, 'itemId', target_item_id,
      'attemptCount', target_attempt_count)
  );
  RETURN request_id;
END
$$;

CREATE OR REPLACE FUNCTION platform.review_dead_letter_replay(
  target_request_id uuid, decision text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, operations, tenancy
AS $$
DECLARE actor_id uuid; request_record platform.dead_letter_replay_requests%ROWTYPE; changed integer;
BEGIN
  actor_id := platform.assert_dead_letter_recovery_context(CASE WHEN decision = 'reject' THEN 'reject' ELSE 'approve' END);
  IF decision NOT IN ('approve', 'reject') THEN RETURN 'not_reviewable'; END IF;
  SELECT * INTO request_record FROM platform.dead_letter_replay_requests
  WHERE id = target_request_id AND status = 'requested' FOR UPDATE;
  IF NOT FOUND OR request_record.requested_by_platform_user_id = actor_id THEN RETURN 'not_reviewable'; END IF;
  IF decision = 'reject' THEN
    UPDATE platform.dead_letter_replay_requests SET status = 'rejected',
      reviewed_by_platform_user_id = actor_id, reviewed_at = now() WHERE id = target_request_id;
    INSERT INTO platform.audit_logs (actor_platform_user_id, action, target_type, target_id, request_id, result, metadata)
    VALUES (actor_id, 'dead_letter_replay.rejected', 'dead_letter_replay_request', target_request_id::text,
      COALESCE(NULLIF(current_setting('app.request_id', true), ''), target_request_id::text), 'succeeded',
      jsonb_build_object('queueKind', request_record.queue_kind, 'itemId', request_record.item_id));
    RETURN 'rejected';
  END IF;
  IF request_record.queue_kind = 'system_email' THEN
    UPDATE operations.outbox SET status = 'failed', available_at = now(), locked_at = NULL,
      processed_at = NULL, last_error_code = 'reviewed_replay'
    WHERE id = request_record.item_id AND status = 'dead_letter'
      AND attempt_count = request_record.expected_attempt_count
      AND topic IN ('auth.verify_email', 'auth.recover_password', 'tenant.invitation', 'tenant.ownership_transfer');
  ELSE
    UPDATE tenancy.outbox SET status = 'failed', available_at = now(), locked_at = NULL,
      processed_at = NULL, last_error_code = 'reviewed_replay'
    WHERE id = request_record.item_id AND status = 'dead_letter'
      AND attempt_count = request_record.expected_attempt_count
      AND topic = CASE request_record.queue_kind WHEN 'flowbot_email' THEN 'flowbot.merchant_email.requested'
        ELSE 'ai_chat.merchant_email.requested' END;
  END IF;
  GET DIAGNOSTICS changed = ROW_COUNT;
  UPDATE platform.dead_letter_replay_requests SET
    status = CASE WHEN changed = 1 THEN 'applied' ELSE 'invalidated' END,
    reviewed_by_platform_user_id = actor_id, reviewed_at = now(),
    applied_at = CASE WHEN changed = 1 THEN now() ELSE NULL END
  WHERE id = target_request_id;
  INSERT INTO platform.audit_logs (actor_platform_user_id, action, target_type, target_id, request_id, result, metadata)
  VALUES (actor_id, CASE WHEN changed = 1 THEN 'dead_letter_replay.applied' ELSE 'dead_letter_replay.invalidated' END,
    'dead_letter_replay_request', target_request_id::text,
    COALESCE(NULLIF(current_setting('app.request_id', true), ''), target_request_id::text),
    CASE WHEN changed = 1 THEN 'succeeded' ELSE 'failed' END,
    jsonb_build_object('queueKind', request_record.queue_kind, 'itemId', request_record.item_id,
      'attemptCount', request_record.expected_attempt_count));
  RETURN CASE WHEN changed = 1 THEN 'applied' ELSE 'invalidated' END;
END
$$;

REVOKE ALL ON platform.dead_letter_replay_requests FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.assert_dead_letter_recovery_context(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.dead_letter_recovery_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.request_dead_letter_replay(text, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.review_dead_letter_replay(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.dead_letter_recovery_overview() TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.request_dead_letter_replay(text, uuid, integer, text) TO djay_platform;
GRANT EXECUTE ON FUNCTION platform.review_dead_letter_replay(uuid, text) TO djay_platform;
