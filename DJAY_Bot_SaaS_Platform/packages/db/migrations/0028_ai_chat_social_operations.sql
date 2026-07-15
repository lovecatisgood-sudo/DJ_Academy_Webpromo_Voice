CREATE FUNCTION platform.ai_social_health_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, platform, tenancy
AS $$
DECLARE result jsonb;
BEGIN
  IF session_user <> 'djay_platform' THEN
    RAISE EXCEPTION 'Platform operations context required';
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'channel', scope.channel,
    'activeConnections', (
      SELECT count(*)::int FROM tenancy.ai_social_connections connection
      WHERE connection.channel = scope.channel AND connection.status = 'active'
    ),
    'reauthorizationRequired', (
      SELECT count(*)::int FROM tenancy.ai_social_connections connection
      WHERE connection.channel = scope.channel AND connection.status = 'reauthorization_required'
    ),
    'queuedInbound', (
      SELECT count(*)::int FROM tenancy.outbox item
      WHERE item.topic = 'ai_chat.social.inbound.received'
        AND item.payload->>'channel' = scope.channel
        AND item.status IN ('pending', 'processing', 'failed')
    ),
    'oldestInboundQueueSeconds', COALESCE((
      SELECT GREATEST(0, floor(extract(epoch FROM (now() - min(item.created_at)))))::bigint
      FROM tenancy.outbox item
      WHERE item.topic = 'ai_chat.social.inbound.received'
        AND item.payload->>'channel' = scope.channel
        AND item.status IN ('pending', 'processing', 'failed')
    ), 0),
    'deadLetterInbound', (
      SELECT count(*)::int FROM tenancy.outbox item
      WHERE item.topic = 'ai_chat.social.inbound.received'
        AND item.payload->>'channel' = scope.channel AND item.status = 'dead_letter'
    ),
    'queuedDeliveries', (
      SELECT count(*)::int FROM tenancy.ai_social_outbound_deliveries delivery
      WHERE delivery.channel = scope.channel AND delivery.status IN ('pending', 'processing', 'failed')
    ),
    'oldestDeliveryQueueSeconds', COALESCE((
      SELECT GREATEST(0, floor(extract(epoch FROM (now() - min(delivery.created_at)))))::bigint
      FROM tenancy.ai_social_outbound_deliveries delivery
      WHERE delivery.channel = scope.channel AND delivery.status IN ('pending', 'processing', 'failed')
    ), 0),
    'deadLetterDeliveries', (
      SELECT count(*)::int FROM tenancy.ai_social_outbound_deliveries delivery
      WHERE delivery.channel = scope.channel AND delivery.status = 'dead_letter'
    ),
    'serviceWindowClosed24h', (
      SELECT count(*)::int FROM tenancy.ai_social_outbound_deliveries delivery
      WHERE delivery.channel = scope.channel
        AND delivery.safe_error_code = 'social_service_window_closed'
        AND delivery.completed_at >= now() - interval '24 hours'
    ),
    'attemptedQuantity24h', (
      SELECT COALESCE(sum(event.attempted_quantity), 0)::int
      FROM tenancy.ai_social_channel_quantity_events event
      WHERE event.channel = scope.channel AND event.occurred_at >= now() - interval '24 hours'
    ),
    'failedAttempts24h', (
      SELECT count(*)::int FROM tenancy.ai_social_channel_quantity_events event
      WHERE event.channel = scope.channel AND event.outcome = 'failed'
        AND event.occurred_at >= now() - interval '24 hours'
    )
  ) ORDER BY scope.ordinal)
  INTO result
  FROM (VALUES (1, 'line'::text), (2, 'whatsapp'::text), (3, 'messenger'::text)) scope(ordinal, channel);
  RETURN COALESCE(result, '[]'::jsonb);
END
$$;

REVOKE ALL ON FUNCTION platform.ai_social_health_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.ai_social_health_summary() TO djay_platform;
