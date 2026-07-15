CREATE OR REPLACE FUNCTION tenancy.sync_flowbot_execution(
  target_session_hash bytea,
  target_key_hash bytea,
  request_origin text,
  after_sequence integer
)
RETURNS TABLE (
  execution_status text,
  automation_mode text,
  last_message_sequence integer,
  messages_json jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF octet_length(target_session_hash) <> 32 OR octet_length(target_key_hash) <> 32
     OR after_sequence < 0 OR after_sequence > 2147483646 THEN
    RAISE EXCEPTION 'invalid_runtime_credential';
  END IF;

  RETURN QUERY
  SELECT execution.status,
         conversation.automation_mode,
         conversation.next_sequence - 1,
         COALESCE(
           jsonb_agg(
             CASE
               WHEN message.actor_type = 'flowbot'
                    AND message.content_json->>'type' IN ('text', 'media', 'options', 'form', 'system')
                    AND jsonb_typeof(message.content_json->'content') = 'object'
                 THEN jsonb_build_object(
                   'sequence', message.sequence,
                   'message', jsonb_build_object(
                     'type', message.content_json->>'type',
                     'nodeId', COALESCE(message.content_json->>'nodeId', '00000000-0000-4000-8000-000000000000'),
                     'content', message.content_json->'content'
                   )
                 )
               ELSE jsonb_build_object(
                 'sequence', message.sequence,
                 'message', jsonb_build_object(
                   'type', 'text',
                   'nodeId', '00000000-0000-4000-8000-000000000000',
                   'content', jsonb_build_object(
                     'text', left(COALESCE(message.content_json->>'text', ''), 4000)
                   )
                 )
               )
               END
             ORDER BY message.sequence
           ) FILTER (WHERE message.id IS NOT NULL),
           '[]'::jsonb
         )
  FROM tenancy.flow_executions execution
  JOIN tenancy.flow_deployments deployment
    ON deployment.tenant_id = execution.tenant_id
    AND deployment.id = execution.deployment_id
  JOIN tenancy.conversations conversation
    ON conversation.tenant_id = execution.tenant_id
    AND conversation.id = execution.conversation_id
  LEFT JOIN tenancy.messages message
    ON message.tenant_id = conversation.tenant_id
    AND message.conversation_id = conversation.id
    AND message.sequence > after_sequence
    AND message.direction = 'outbound'
    AND message.actor_type IN ('flowbot', 'human', 'system')
  WHERE execution.session_token_hash = target_session_hash
    AND deployment.deployment_key_hash = target_key_hash
    AND execution.expires_at > now()
    AND execution.status NOT IN ('failed', 'expired')
    AND deployment.status = 'active'
    AND tenancy.flowbot_origin_allowed(deployment.allowed_origins, request_origin)
  GROUP BY execution.status, conversation.automation_mode, conversation.next_sequence;
END
$$;

REVOKE ALL ON FUNCTION tenancy.sync_flowbot_execution(bytea, bytea, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.sync_flowbot_execution(bytea, bytea, text, integer) TO djay_flowbot_runtime;
